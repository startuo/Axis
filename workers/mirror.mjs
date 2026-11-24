import {
	fail,
	json,
	rows,
	one,
	stmt,
	now,
	currentUser,
	body,
} from "./core.mjs";
import { KINDS, publicEntry, publicationStatements } from "./entries.mjs";
import { fingerprint } from "./auth.mjs";
import { mediaStorage } from "./media-storage.mjs";

export async function buildSnapshot(env) {
	// D1 batch is transactional: the revision and content belong to the same database snapshot.
	const result = await env.DB.batch([
		stmt(env.DB, "SELECT revision FROM publication_state WHERE id=1"),
		stmt(
			env.DB,
			"SELECT * FROM entries WHERE published IS NOT NULL AND deletedAt IS NULL ORDER BY CAST(json_extract(published,'$.order') AS REAL),json_extract(published,'$.published') DESC,id",
		),
		stmt(
			env.DB,
			"SELECT id,text,color,createdAt FROM feedback_messages WHERE status='APPROVED' ORDER BY createdAt DESC LIMIT 100",
		),
		stmt(env.DB, "SELECT path,entryId FROM content_routes"),
	]);
	const revision = result[0].results[0].revision,
		entries = result[1].results.map(publicEntry);
	const snapshot = {
		revision,
		createdAt: now(),
		posts: [],
		anime: [],
		diary: [],
		albums: [],
		messages: result[2].results.map((m) => ({
			id: m.id,
			text: m.text,
			color: m.color,
			timestamp: Date.parse(m.createdAt),
		})),
		routes: result[3].results.filter((r) =>
			entries.some((e) => e.id === r.entryId),
		),
	};
	for (const kind of KINDS)
		snapshot[kind] = entries.filter((e) => e.kind === kind);
	return snapshot;
}
async function serviceAuth(request, env) {
	const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
	if (
		!env.MIRROR_TOKEN ||
		!token ||
		(await fingerprint(token)) !== (await fingerprint(env.MIRROR_TOKEN))
	)
		fail(401, "Invalid mirror credentials");
}
export async function mirrorRoutes(request, env, path) {
	if (!path.startsWith("/mirror")) return null;
	if (path === "/mirror/export") {
		if (request.method !== "GET") fail(405, "Method not allowed");
		await serviceAuth(request, env);
		const snapshot = await buildSnapshot(env);
		const storage = mediaStorage(env);
		if (!storage) fail(503, "媒体存储尚未配置");
		const key =
			"snapshots/" + snapshot.revision + "/" + crypto.randomUUID() + ".json";
		await storage.put(key, JSON.stringify(snapshot), {
			httpMetadata: { contentType: "application/json" },
		});
		await stmt(
			env.DB,
			"UPDATE mirror_jobs SET snapshotKey=?,status=?,updatedAt=? WHERE revision=?",
			key,
			"BUILDING",
			now(),
			snapshot.revision,
		).run();
		return json(snapshot);
	}
	if (path === "/mirror/complete" && request.method === "POST") {
		await serviceAuth(request, env);
		const input = await body(request);
		const revision = Number(input.revision);
		if (!Number.isSafeInteger(revision) || revision < 0)
			fail(400, "Invalid revision");
		let response;
		try {
			response = await fetch(
				new URL("/mirror-version.json", env.MIRROR_SITE_URL),
				{ cache: "no-store", signal: AbortSignal.timeout(15000) },
			);
		} catch {
			fail(409, "镜像站点暂时不可达，等待重试");
		}
		if (!response.ok) fail(409, "镜像站点尚未就绪");
		let deployed;
		try {
			deployed = await response.json();
		} catch {
			fail(409, "镜像版本文件尚未就绪");
		}
		if (!deployed || deployed.revision !== revision)
			fail(409, "镜像线上版本尚未匹配");
		await stmt(
			env.DB,
			"UPDATE mirror_jobs SET status='COMPLETE',error=NULL,updatedAt=? WHERE revision=?",
			now(),
			revision,
		).run();
		return json({ ok: true });
	}
	await currentUser(request, env, true);
	if (path === "/mirror/status" && request.method === "GET")
		return json({
			revision: (
				await one(
					env.DB,
					"SELECT revision FROM publication_state WHERE id=1",
				)
			).revision,
			configured: Boolean(
				env.MIRROR_TOKEN &&
					env.MIRROR_GITHUB_TOKEN &&
					env.MIRROR_REPOSITORY &&
					env.MIRROR_SITE_URL &&
					mediaStorage(env),
			),
			items: await rows(
				env.DB,
				"SELECT * FROM mirror_jobs ORDER BY revision DESC LIMIT 20",
			),
		});
	if (path === "/mirror/retry" && request.method === "POST") {
		await env.DB.batch(publicationStatements(env.DB));
		return json({ queued: true });
	}
	fail(404, "Not found");
}
export async function dispatchMirror(env) {
	if (!env.MIRROR_GITHUB_TOKEN || !env.MIRROR_REPOSITORY) return;
	const job = await one(
		env.DB,
		"SELECT * FROM mirror_jobs WHERE status='PENDING' OR (status='FAILED' AND attempts<5) OR (status IN ('DISPATCHED','BUILDING') AND attempts<5 AND updatedAt<?) ORDER BY revision DESC LIMIT 1",
		new Date(Date.now() - 30 * 60 * 1000).toISOString(),
	);
	if (!job) return;
	const repo = env.MIRROR_REPOSITORY;
	if (!/^[\w.-]+\/[\w.-]+$/.test(repo))
		throw new Error("Invalid MIRROR_REPOSITORY");
	try {
		const response = await fetch(
			`https://api.github.com/repos/${repo}/dispatches`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${env.MIRROR_GITHUB_TOKEN}`,
					Accept: "application/vnd.github+json",
					"User-Agent": "Axis-Mirror",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					event_type: "axis-mirror",
					client_payload: { revision: job.revision },
				}),
				signal: AbortSignal.timeout(15000),
			},
		);
		if (!response.ok)
			throw new Error("GitHub dispatch failed: " + response.status);
		await env.DB.batch([
			stmt(
				env.DB,
				"UPDATE mirror_jobs SET status='DISPATCHED',attempts=attempts+1,error=NULL,updatedAt=? WHERE revision=?",
				now(),
				job.revision,
			),
			stmt(
				env.DB,
				"UPDATE mirror_jobs SET status='SUPERSEDED',updatedAt=? WHERE revision<? AND status!='COMPLETE'",
				now(),
				job.revision,
			),
		]);
	} catch (e) {
		await stmt(
			env.DB,
			"UPDATE mirror_jobs SET status='FAILED',attempts=attempts+1,error=?,updatedAt=? WHERE revision=?",
			String(e.message).slice(0, 200),
			now(),
			job.revision,
		).run();
	}
}
