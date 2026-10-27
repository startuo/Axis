import MarkdownIt from "markdown-it";
import {EnvHttpProxyAgent,fetch as proxyFetch} from 'undici';
const proxyAgent=(process.env.HTTPS_PROXY||process.env.HTTP_PROXY)?new EnvHttpProxyAgent():undefined;
const markdown = new MarkdownIt();
function imageSources(content) {
	const images = [];
	const walk = (tokens) => {
		for (const token of tokens) {
			if (token.type === "image") images.push(token.attrGet("src"));
			if (token.children) walk(token.children);
		}
	};
	walk(markdown.parse(content, {}));
	return images;
}
import { readFile, writeFile, mkdir, copyFile, stat } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {canonicalPublicAsset,mirrorImageExtension} from './asset-aliases.mjs';
const origin =
	process.env.MAIN_SITE_URL || "https://axis.1669338073.workers.dev";
const file = process.argv[2] || ".mirror/snapshot.json";
const output = process.env.AXIS_OUT_DIR || "dist";
const snapshot = JSON.parse(await readFile(file, "utf8"));
if (!Number.isSafeInteger(snapshot.revision) || !Array.isArray(snapshot.posts))
	throw new Error("Invalid snapshot");
const root = path.resolve(".axis/mirror-media");
await mkdir(root, { recursive: true });
const urls = new Set();
function visit(value, key = "") {
	if (typeof value === "string") {
		if (
			["image", "src", "cover", "thumbnail", "avatarUrl"].includes(key) &&
			value
		)
			urls.add(value);
		if (key === "images" && value) urls.add(value);
		if (key === "content")
			for (const image of imageSources(value)) urls.add(image);
	} else if (Array.isArray(value)) value.forEach((v) => visit(v, key));
	else if (value && typeof value === "object")
		Object.entries(value).forEach(([k, v]) => visit(v, k));
}
visit(snapshot);
const replacements = new Map();
async function download(source) {
	let url = new URL(source, origin);
	for (let hops = 0; hops < 5; hops++) {
		if (
			url.protocol !== "https:" ||
			/^(localhost$|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[)/i.test(
				url.hostname,
			)
		)
			throw new Error("Unsupported asset origin: " + url.hostname);
		let response;
		for (let attempt = 0; attempt < 5; attempt++)
			try {
				response = await proxyFetch(url, {
					dispatcher:proxyAgent,
					redirect: "manual",
					signal: AbortSignal.timeout(60000),
				});
				if (response.status === 503 && url.origin === new URL(origin).origin && url.pathname.startsWith("/media/") && attempt < 4) {
					await response.body?.cancel();
					await new Promise(resolve => setTimeout(resolve, 30000));
					continue;
				}
				break;
			} catch (e) {
				if (attempt === 4)
					throw new Error("Image download failed: " + source, {
						cause: e,
					});
			}
		if ([301, 302, 303, 307, 308].includes(response.status)) {
			const next = response.headers.get("location");
			await response.body?.cancel();
			if (!next) throw new Error("Missing image redirect");
			url = new URL(next, url);
			continue;
		}
		return response;
	}
	throw new Error("Too many image redirects: " + source);
}
for (const source of urls) {
	if (!/^https?:\/\//.test(source) && !source.startsWith("/"))
		throw new Error("Unresolved image path: " + source);
	const hash = createHash("sha256").update(source).digest("hex");
	const target = path.join(root, hash);
	let bytes;
	// Existing bundled files are already independent of Cloudflare.
	if (source.startsWith("/") && !source.startsWith("/media/")) {
		const canonical = canonicalPublicAsset(source);
		const local = path.resolve("public", "." + decodeURIComponent(canonical.split(/[?#]/)[0]));
		if (!local.startsWith(path.resolve("public") + path.sep))
			throw new Error("Invalid asset path");
		try {
			await stat(local);
			if(canonical!==source)replacements.set(source,canonical);
			continue;
		} catch {}
	}
	console.log('Downloading mirror image:',source);
	const response = await download(source);
	if (
		!response.ok ||
		!response.headers.get("content-type")?.startsWith("image/")
	)
		throw new Error("Image download failed: " + source);
	const reader = response.body.getReader();
	let size = 0;
	const chunks = [];
	for (;;) {
		const { value, done } = await reader.read();
		if (done) break;
		size += value.length;
		if (size > 25 * 1024 * 1024) {
			await reader.cancel();
			throw new Error("Image exceeds 25 MB");
		}
		chunks.push(value);
	}
	bytes = Buffer.concat(chunks);
	const ext = mirrorImageExtension(bytes);
	await writeFile(target + ext, bytes);
	replacements.set(source, "/mirror-media/" + hash + ext);
}
function rewrite(value) {
	if (typeof value === "string") {
		for (const [a, b] of replacements) value = value.split(a).join(b);
		return value;
	}
	if (Array.isArray(value)) return value.map(rewrite);
	if (value && typeof value === "object")
		return Object.fromEntries(
			Object.entries(value).map(([k, v]) => [k, rewrite(v)]),
		);
	return value;
}
await mkdir(".axis", { recursive: true });
await writeFile(
	".axis/mirror-snapshot.json",
	JSON.stringify(rewrite(snapshot)),
);
const env = {
	...process.env,
	AXIS_TARGET: "mirror",
	AXIS_SNAPSHOT: path.resolve(".axis/mirror-snapshot.json"),
	PUBLIC_API_BASE_URL: "",
};
const build = spawnSync(
	process.execPath,
	["node_modules/astro/astro.js", "build"],
	{ stdio: "inherit", env },
);
if (build.status !== 0) process.exit(build.status ?? 1);
await mkdir(path.join(output, "mirror-media"), { recursive: true });
for (const url of replacements.values()) {
	if(!url.startsWith('/mirror-media/'))continue;
	const hash = url.split("/").pop();
	await copyFile(
		path.join(root, hash),
		path.join(output, "mirror-media", hash),
	);
}
await writeFile(
	path.join(output, "mirror-version.json"),
	JSON.stringify({
		revision: snapshot.revision,
		builtAt: new Date().toISOString(),
	}),
);
const search = spawnSync(
	process.execPath,
	["node_modules/pagefind/lib/runner/bin.cjs", "--site", output],
	{ stdio: "inherit" },
);
process.exit(search.status ?? 1);
