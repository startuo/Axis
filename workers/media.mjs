import {
	fail,
	json,
	now,
	day,
	stmt,
	rows,
	one,
	currentUser,
	limit,
} from "./core.mjs";
import { mediaStorage } from "./media-storage.mjs";
import { detectImageMime, IMAGE_MIME_TYPES } from "../shared/media.mjs";

const MEMBER_MEDIA_LIMIT = 2;
const MEMBER_MAX_BYTES = 512 * 1024;
const ADMIN_MAX_BYTES = 20 * 1024 * 1024;

export async function mediaRoutes(request, env, path) {
	if (!path.startsWith("/media")) return null;
	const storage = mediaStorage(env);
	if (!storage) fail(503, "媒体存储尚未配置");
	const user = await currentUser(request, env);
	const isAdmin = user.role === "ADMIN";
	if (path === "/media" && request.method === "GET") {
		if (!isAdmin) fail(403, "Administrator access required");
		return json({
			items: (
				await rows(
					env.DB,
					"SELECT m.*, (SELECT count(*) FROM media_refs r WHERE r.mediaId=m.id) refs FROM media m WHERE deletedAt IS NULL ORDER BY createdAt DESC LIMIT 100",
				)
			).map((m) => ({ ...m, url: "/media/" + m.id })),
		});
	}
	const variant = path.match(
		/^\/media\/([a-f0-9-]{36})\/variants\/(display|thumb)$/,
	);
	if ((path === "/media" || variant) && request.method === "POST") {
		if (
			variant &&
			!(await one(
				env.DB,
				"SELECT id FROM media WHERE id=? AND ownerId=? AND deletedAt IS NULL",
				variant[1],
				user.id,
			))
		)
			fail(403, "不能修改其他用户的图片");
		// 收紧普通用户上传配额与频率，防止 KV 额度滥用与公网图床盗用
		if (!isAdmin && !variant) {
			const owned = await one(
				env.DB,
				"SELECT COUNT(*) AS count FROM media WHERE ownerId=? AND deletedAt IS NULL",
				user.id,
			);
			if ((owned?.count ?? 0) >= MEMBER_MEDIA_LIMIT)
				fail(403, `普通用户最多保留 ${MEMBER_MEDIA_LIMIT} 张图片，请先更换或移除旧头像`);
			await limit(env.DB, "upload-member-global:" + day(), 30, 86400);
		}
		await limit(
			env.DB,
			(variant ? "variant:" : "upload:") + user.id,
			isAdmin ? (variant ? 60 : 20) : variant ? 6 : 3,
			3600,
		);
		const type = request.headers.get("content-type")?.split(";")[0];
		if (!IMAGE_MIME_TYPES.includes(type)) fail(415, "仅支持 JPEG、PNG、WebP、GIF、AVIF");
		const max = isAdmin ? ADMIN_MAX_BYTES : MEMBER_MAX_BYTES;
		const reader = request.body?.getReader();
		if (!reader) fail(400, "缺少图片");
		let size = 0;
		const chunks = [];
		for (;;) {
			const { value, done } = await reader.read();
			if (done) break;
			size += value.length;
			if (size > max) {
				await reader.cancel();
				fail(413, "图片超过上传限制");
			}
			chunks.push(value);
		}
		const bytes = new Uint8Array(size);
		let offset = 0;
		for (const c of chunks) {
			bytes.set(c, offset);
			offset += c.length;
		}
		const detected = detectImageMime(bytes.slice(0, 64));
		if (detected !== type) fail(400, "图片格式与文件内容不符");
		if (variant) {
			await storage.put(variant[1] + "/" + variant[2], bytes, {
				httpMetadata: { contentType: type },
			});
			return json({ ok: true });
		}
		const id = crypto.randomUUID();
		const name = (request.headers.get("x-file-name") ?? "image").slice(
			0,
			255,
		);
		await storage.put(id, bytes, { httpMetadata: { contentType: type } });
		try {
			await stmt(
				env.DB,
				"INSERT INTO media(id,ownerId,name,type,size,createdAt) VALUES(?,?,?,?,?,?)",
				id,
				user.id,
				name,
				type,
				size,
				now(),
			).run();
		} catch (e) {
			await storage.delete(id);
			throw e;
		}
		return json({ id, url: "/media/" + id, name, type, size }, 201);
	}
	const id = path.slice("/media/".length);
	if (request.method === "DELETE") {
		if (!isAdmin) fail(403, "Administrator access required");
		if (
			await one(
				env.DB,
				"SELECT mediaId FROM media_refs WHERE mediaId=? LIMIT 1",
				id,
			)
		)
			fail(409, "图片仍被内容引用");
		await stmt(
			env.DB,
			"UPDATE media SET deletedAt=? WHERE id=?",
			now(),
			id,
		).run();
		// Recoverable tombstone. Physical deletion is a separate maintenance operation.
		return json({ ok: true });
	}
	fail(405, "Method not allowed");
}
export async function serveMedia(request, env) {
	if (!["GET", "HEAD"].includes(request.method))
		return new Response("Method not allowed", { status: 405 });
	const id = new URL(request.url).pathname.slice("/media/".length);
	const storage = mediaStorage(env);
	if (!/^[a-f0-9-]{36}$/.test(id) || !storage)
		return new Response("Not found", { status: 404 });
	if (
		!(await one(
			env.DB,
			"SELECT id FROM media WHERE id=? AND deletedAt IS NULL",
			id,
		))
	)
		return new Response("Not found", { status: 404 });
	const variant = new URL(request.url).searchParams.get("variant");
	const object =
		(["display", "thumb"].includes(variant)
			? await storage.get(id + "/" + variant)
			: null) ?? (await storage.get(id));
	if (!object)
		return new Response("Media temporarily unavailable", {
			status: env.MEDIA_KV ? 503 : 404,
			headers: { "Cache-Control": "no-store", "Retry-After": "30" },
		});
	const headers = new Headers({
		"Cache-Control": "public,max-age=86400",
		"X-Content-Type-Options": "nosniff",
		"Content-Security-Policy": "default-src 'none'; sandbox",
		...(object.httpEtag ? { ETag: object.httpEtag } : {}),
	});
	object.writeHttpMetadata(headers);
	return new Response(request.method === "HEAD" ? null : object.body, {
		headers,
	});
}
