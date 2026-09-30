import {
	fail,
	json,
	now,
	stmt,
	one,
	rows,
	body,
	text,
	integer,
	currentUser,
} from "./core.mjs";

export const KINDS = ["posts", "anime", "diary", "albums"];
export const publicEntry = (row) => ({
	...JSON.parse(row.published),
	id: row.id,
	kind: row.kind,
	slug: row.slug,
});
export const adminEntry = (row) => ({
	id: row.id,
	kind: row.kind,
	slug: row.slug,
	version: row.version,
	sourceKey: row.sourceKey,
	status: row.deletedAt ? "TRASH" : row.published ? "PUBLISHED" : "DRAFT",
	dirty: row.published !== row.draft,
	createdAt: row.createdAt,
	updatedAt: row.updatedAt,
	data: JSON.parse(row.draft),
});
export const publicationStatements = (db) => [
	stmt(db, "UPDATE publication_state SET revision=revision+1 WHERE id=1"),
	stmt(
		db,
		"INSERT INTO mirror_jobs(revision,createdAt,updatedAt) SELECT revision,?,? FROM publication_state WHERE id=1",
		now(),
		now(),
	),
];
export function canonicalPath(value) {
	if (
		typeof value !== "string" ||
		!value.startsWith("/") ||
		value.startsWith("//") ||
		/[?#\\\u0000-\u0020]/.test(value)
	)
		fail(400, "无效的文章链接");
	const segments = value.split("/").filter(Boolean);
	try {
		segments.forEach(decodeURIComponent);
	} catch {
		fail(400, "无效的文章链接");
	}
	if (
		segments.some(
			(s) =>
				s === "." ||
				s === ".." ||
				[".", ".."].includes(decodeURIComponent(s)) ||
				/[\/\\]/.test(decodeURIComponent(s)),
		)
	)
		fail(400, "无效的文章链接");
	if (
		[
			"api",
			"admin",
			"user",
			"media",
			"anime",
			"diary",
			"albums",
			"archive",
			"about",
			"friends",
			"message",
			"devices",
			"projects",
			"skills",
			"timeline",
			"rss",
			"atom",
			"404",
			"robots.txt",
			"rss.xml",
			"atom.xml",
			"sitemap.xml",
			"sitemap-index.xml",
		].includes(decodeURIComponent(segments[0] ?? "")) ||
		!segments.length
	)
		fail(400, "链接与系统页面冲突");
	if (segments.length > 1 && segments[0] !== "posts")
		fail(400, "多级文章链接必须位于 /posts/ 下");
	return "/" + segments.join("/") + "/";
}
function url(value) {
	if (!value) return "";
	return text(value, "图片或链接", 1, 1500) &&
		/^(https?:\/\/|\/(?!\/))/.test(value)
		? value
		: fail(400, "请使用 HTTPS 或站内链接");
}
function strings(value, max = 50) {
	if (!Array.isArray(value) || value.length > max) fail(400, "列表格式无效");
	return [...new Set(value.map((v) => text(v, "列表项", 1, 100)))];
}
export function validateEntry(kind, value, slug) {
	if (!value || typeof value !== "object" || Array.isArray(value))
		fail(400, "内容格式无效");
	const d = { ...value };
	d.title = text(d.title, "标题", 1, 255);
	d.content = text(d.content ?? "", "正文", 0, 200000, false);
	d.description = text(d.description ?? "", "简介", 0, 1000);
	d.tags = strings(d.tags ?? []);
	d.image = url(d.image ?? "");
	d.published = d.published || now();
	if (!Number.isFinite(Date.parse(d.published))) fail(400, "日期无效");
	d.published = new Date(d.published).toISOString();
	for (const key of ["mood", "location"])
		if (d[key] !== undefined) d[key] = text(d[key], key, 0, 255);
	d.order = Number(d.order ?? 0);
	if (!Number.isFinite(d.order)) fail(400, "排序值无效");
	if (kind === "posts") {
		if (!d.content.trim()) fail(400, "文章正文不能为空");
		if (d.encrypted || d.password)
			fail(400, "加密文章不能直接导入公开内容，请先单独处理");
		d.url = canonicalPath(d.url || "/posts/" + slug + "/");
		d.category = text(d.category ?? "", "分类", 0, 100);
	}
	if (kind === "anime") {
		if (!["watching", "completed", "planned"].includes(d.status))
			fail(400, "追番状态无效");
		for (const key of ["progress", "totalEpisodes"]) {
			d[key] = Number(d[key] ?? 0);
			if (!Number.isInteger(d[key]) || d[key] < 0) fail(400, "集数无效");
		}
		if (d.totalEpisodes && d.progress > d.totalEpisodes)
			fail(400, "观看进度不能超过总集数");
		d.rating = Number(d.rating ?? 0);
		if (!Number.isFinite(d.rating) || d.rating < 0 || d.rating > 10)
			fail(400, "评分范围为 0–10");
		d.link = url(d.link ?? "");
	}
	if (kind === "diary") {
		if (!Array.isArray(d.images ?? [])) fail(400, "图片列表格式无效");
		d.images = (d.images ?? []).map(url);
		if (d.images.length > 30) fail(400, "每篇日记最多 30 张图片");
	}
	if (kind === "albums") {
		if (!Array.isArray(d.photos) || d.photos.length > 500)
			fail(400, "相册最多 500 张图片");
		d.photos = d.photos.map((p) => ({
			src: url(p.src),
			alt: text(p.alt ?? "", "图片说明", 0, 500),
			title: text(p.title ?? "", "图片标题", 0, 255),
		}));
		if (!["grid", "masonry"].includes(d.layout ?? "grid"))
			fail(400, "相册布局无效");
	}
	return d;
}
export async function refreshMediaRefs(db, owner, values) {
	const refs = [
		...new Set(
			JSON.stringify(values).match(/\/media\/[a-f0-9-]{36}/g) ?? [],
		),
	].map((x) => x.slice(7));
	const queries = [stmt(db, "DELETE FROM media_refs WHERE owner=?", owner)];
	for (const id of refs) {
		if (
			!(await one(
				db,
				"SELECT id FROM media WHERE id=? AND deletedAt IS NULL",
				id,
			))
		)
			fail(400, "引用的上传图片不存在");
		queries.push(
			stmt(
				db,
				"INSERT INTO media_refs(mediaId,owner) VALUES(?,?)",
				id,
				owner,
			),
		);
	}
	return queries;
}
export async function publishedEntries(db, kind) {
	return (
		await rows(
			db,
			"SELECT * FROM entries WHERE kind=? AND published IS NOT NULL AND deletedAt IS NULL ORDER BY CAST(json_extract(published,'$.order') AS REAL), json_extract(published,'$.published') DESC,id",
			kind,
		)
	).map(publicEntry);
}
export async function entryRoutes(request, env, path, urlObj) {
	const match = path.match(
		/^\/content\/(public|manage)\/(posts|anime|diary|albums)(?:\/([^/]+))?(?:\/(publish|unpublish|restore))?$/,
	);
	if (!match) return null;
	const [, scope, kind, id, action] = match;
	if (scope === "public") {
		if (request.method !== "GET") fail(405, "Method not allowed");
		const all = await publishedEntries(env.DB, kind);
		if (id) {
			const item = all.find(
				(v) => v.id === id || v.slug === decodeURIComponent(id),
			);
			if (!item) fail(404, "内容不存在");
			return json(item);
		}
		const q = (urlObj.searchParams.get("q") ?? "")
			.trim()
			.slice(0, 100)
			.toLocaleLowerCase();
		const data = q
			? all.filter((v) =>
					[v.title, v.content, v.description, ...v.tags]
						.join(" ")
						.toLocaleLowerCase()
						.includes(q),
				)
			: all;
		const page = integer(urlObj.searchParams.get("page"), 1, 100000),
			pageSize = integer(urlObj.searchParams.get("pageSize"), 20, 100);
		return json({
			items: data.slice((page - 1) * pageSize, page * pageSize),
			meta: {
				page,
				pageSize,
				total: data.length,
				totalPages: Math.ceil(data.length / pageSize),
			},
		});
	}
	await currentUser(request, env, true);
	if (!id && request.method === "GET") {
		const page = integer(urlObj.searchParams.get("page"), 1, 100000),
			pageSize = integer(urlObj.searchParams.get("pageSize"), 30, 100);
		const trash = urlObj.searchParams.get("trash") === "true";
		const where = `kind=? AND deletedAt IS ${trash ? "NOT " : ""}NULL`;
		const { total } = await one(
			env.DB,
			"SELECT count(*) total FROM entries WHERE " + where,
			kind,
		);
		return json({
			items: (
				await rows(
					env.DB,
					"SELECT * FROM entries WHERE " +
						where +
						" ORDER BY updatedAt DESC LIMIT ? OFFSET ?",
					kind,
					pageSize,
					(page - 1) * pageSize,
				)
			).map(adminEntry),
			meta: {
				page,
				pageSize,
				total,
				totalPages: Math.ceil(total / pageSize),
			},
		});
	}
	if (!id && request.method === "POST") {
		const input = await body(request);
		const slug = text(input.slug ?? crypto.randomUUID(), "slug", 1, 255);
		if (
			!/^[\p{L}\p{N}_/-]+$/u.test(slug) ||
			slug.split("/").some((v) => !v || v === "." || v === "..")
		)
			fail(400, "slug 只能包含文字、数字、连字符及目录");
		const sourceKey = input.sourceKey
			? text(input.sourceKey, "来源", 1, 500)
			: null;
		if (sourceKey) {
			const previous = await one(
				env.DB,
				"SELECT * FROM entries WHERE sourceKey=?",
				sourceKey,
			);
			if (previous)
				return json({ ...adminEntry(previous), existing: true }, 200);
		}
		const data = validateEntry(kind, input.data, slug),
			newId = crypto.randomUUID(),
			date = now();
		const queries = [
			stmt(
				env.DB,
				"INSERT INTO entries(id,kind,slug,sourceKey,draft,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?)",
				newId,
				kind,
				slug,
				sourceKey,
				JSON.stringify(data),
				date,
				date,
			),
		];
		if (kind === "posts") {
			const paths = [
				...new Set([
					data.url,
					"/posts/" + slug + "/",
					...(input.aliases ?? []).map(canonicalPath),
				]),
			];
			for (const p of paths)
				queries.push(
					stmt(
						env.DB,
						"INSERT INTO content_routes(path,entryId) VALUES(?,?)",
						p,
						newId,
					),
				);
		}
		queries.push(
			...(await refreshMediaRefs(env.DB, "entry:" + newId, [data])),
		);
		await env.DB.batch(queries);
		return json(
			adminEntry(
				await one(env.DB, "SELECT * FROM entries WHERE id=?", newId),
			),
			201,
		);
	}
	const row = await one(
		env.DB,
		"SELECT * FROM entries WHERE id=? AND kind=?",
		id ?? "",
		kind,
	);
	if (!row) fail(404, "内容不存在");
	if (request.method === "GET") return json(adminEntry(row));
	const input = await body(request);
	if (input.version !== row.version)
		fail(409, "内容已被其他操作更新，请保留编辑稿并重新读取。");
	if (!["PATCH", "POST", "DELETE"].includes(request.method))
		fail(405, "Method not allowed");
	let data = JSON.parse(row.draft),
		published = row.published,
		deletedAt = row.deletedAt;
	if (action === "restore") deletedAt = null;
	else if (row.deletedAt) fail(409, "请先从回收站恢复");
	else if (action === "publish")
		published = JSON.stringify(validateEntry(kind, data, row.slug));
	else if (action === "unpublish") published = null;
	else if (request.method === "DELETE") {
		deletedAt = now();
		published = null;
	} else if (request.method === "PATCH")
		data = validateEntry(kind, input.data, row.slug);
	else fail(405, "操作无效");
	// Canonical URLs remain stable once assigned; migration/import can add aliases.
	if (kind === "posts" && data.url !== JSON.parse(row.draft).url)
		fail(400, "文章链接创建后保持固定");
	const refs = await refreshMediaRefs(env.DB, "entry:" + id, [
		data,
		published ? JSON.parse(published) : null,
	]);
	// CAS plus a guard aborts the whole batch if another writer wins between read and write.
	const queries = [
		stmt(
			env.DB,
			"UPDATE entries SET draft=?,published=?,deletedAt=?,version=version+1,updatedAt=? WHERE id=? AND version=?",
			JSON.stringify(data),
			published,
			deletedAt,
			now(),
			id,
			row.version,
		),
		stmt(env.DB, "INSERT INTO mutation_guard(value) VALUES(changes())"),
		stmt(env.DB, "DELETE FROM mutation_guard"),
		...refs,
	];
	if (
		published !== row.published ||
		(deletedAt !== row.deletedAt && row.published)
	)
		queries.push(...publicationStatements(env.DB));
	try {
		await env.DB.batch(queries);
	} catch (e) {
		if (String(e).includes("CHECK constraint"))
			fail(409, "内容版本已变化，请重新读取");
		throw e;
	}
	return json(
		adminEntry(await one(env.DB, "SELECT * FROM entries WHERE id=?", id)),
	);
}
