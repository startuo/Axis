import assert from "node:assert/strict";
const origin = process.env.AXIS_SMOKE_URL || "http://127.0.0.1:8787";
if (!["127.0.0.1", "localhost"].includes(new URL(origin).hostname))
	throw new Error("Smoke writes are restricted to localhost");
if (!process.env.AXIS_SMOKE_ACCOUNT || !process.env.AXIS_SMOKE_PASSWORD)
	throw new Error(
		"Set local fixture credentials AXIS_SMOKE_ACCOUNT and AXIS_SMOKE_PASSWORD",
	);
let token = "";
async function api(path, method = "GET", data) {
	const response = await fetch(origin + "/api/v1" + path, {
		method,
		headers: {
			"Content-Type": "application/json",
			Authorization: "Bearer " + token,
		},
		body: data === undefined ? undefined : JSON.stringify(data),
	});
	const result = await response.json();
	assert.ok(
		response.ok,
		`${path}: ${response.status} ${result.message ?? ""}`,
	);
	return result;
}
token = (
	await api("/auth/login", "POST", {
		account: process.env.AXIS_SMOKE_ACCOUNT,
		password: process.env.AXIS_SMOKE_PASSWORD,
	})
).accessToken;
const slug = "smoke-" + crypto.randomUUID(),
	title = "本地端到端 " + slug;
let entry = await api("/content/manage/posts", "POST", {
	slug,
	data: { title, content: "# 原始公开正文\n\n**即时同步**", tags: ["联调"] },
});
const route = "/content/manage/posts/" + entry.id;
try {
	entry = await api(route + "/publish", "POST", { version: entry.version });
	const read = async (path) => {
		const r = await fetch(origin + path);
		assert.equal(r.status, 200, path);
		return r.text();
	};
	assert.match(await read("/posts/" + slug + "/"), /原始公开正文/);
	assert.ok((await read("/")).includes(title));
	assert.ok((await read("/rss.xml")).includes(slug));
	assert.ok((await read("/sitemap.xml")).includes(slug));
	assert.equal(
		(await api("/content/public/posts?q=" + encodeURIComponent(title))).meta
			.total,
		1,
	);
	entry = await api(route, "PATCH", {
		version: entry.version,
		data: { ...entry.data, content: "# 未发布编辑稿" },
	});
	assert.doesNotMatch(await read("/posts/" + slug + "/"), /未发布编辑稿/);
	entry = await api(route + "/publish", "POST", { version: entry.version });
	assert.match(await read("/posts/" + slug + "/"), /未发布编辑稿/);
	const media = await fetch(origin + "/images/albums/AcgExample/cover.jpg");
	assert.equal(media.status, 200);
	assert.match(media.headers.get("content-type"), /^image\//);
	const missing = await fetch(origin + "/images/no-such-asset.png");
	assert.equal(missing.status, 404);
	const message = await api("/feedback/messages", "POST", {
		text: "smoke-" + slug.slice(-10),
		color: "#ffffff",
	});
	assert.ok(
		!(await api("/feedback/messages/public?limit=100")).some(
			(m) => m.id === message.id,
		),
	);
	await api("/feedback/messages/admin/" + message.id + "/status", "PATCH", {
		status: "APPROVED",
	});
	assert.ok(
		(await api("/feedback/messages/public?limit=100")).some(
			(m) => m.id === message.id,
		),
	);
	await api("/feedback/messages/admin/" + message.id + "/status", "PATCH", {
		status: "REJECTED",
	});
	assert.ok(
		!(await api("/feedback/messages/public?limit=100")).some(
			(m) => m.id === message.id,
		),
	);
	console.log(
		"PASS: publication, SSR, home, RSS, sitemap, search, draft isolation, asset MIME and moderation",
	);
} finally {
	await api(route, "DELETE", { version: entry.version });
}
assert.equal((await fetch(origin + "/posts/" + slug + "/")).status, 404);
console.log(
	"PASS: unpublished article is inaccessible; local fixture moved to recycle bin",
);
