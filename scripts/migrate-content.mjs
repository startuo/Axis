import MarkdownIt from "markdown-it";
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
// Defaults to a local inventory. --apply requires an explicit destination and admin session.
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { parseDocument } from "yaml";
import anime from "../src/data/anime.ts";
import { getDiaryList } from "../src/data/diary.ts";
const entries = [],
	assets = new Map();
async function files(dir) {
	const result = [];
	for (const e of await readdir(dir, { withFileTypes: true })) {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) result.push(...(await files(p)));
		else result.push(p);
	}
	return result;
}
async function normalizeAsset(source, base) {
	if (!source || source.startsWith("http") || source.startsWith("/"))
		return source;
	const absolute = path.resolve(base, source),
		root = path.resolve("src");
	if (!absolute.startsWith(root + path.sep))
		throw new Error("Asset escapes source directory: " + source);
	const bytes = await readFile(absolute),
		hash = createHash("sha256").update(bytes).digest("hex");
	const dest = "/imported/" + hash + path.extname(absolute);
	assets.set(dest, { source: absolute, sha256: hash });
	return dest;
}
for (const file of await files("src/content/posts")) {
	if (!file.endsWith(".md")) continue;
	const source = await readFile(file, "utf8");
	const match = source.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
	if (!match) throw new Error("Missing Front Matter: " + file);
	const doc = parseDocument(match[1]);
	if (doc.errors.length) throw new Error("Invalid Front Matter: " + file);
	const meta = doc.toJS({ maxAliasCount: 20 }),
		slug = path
			.relative("src/content/posts", file)
			.replaceAll("\\", "/")
			.replace(/\.md$/, "");
	let content = source.slice(match[0].length);
	for (const image of imageSources(content)) {
		const normalized = await normalizeAsset(image, path.dirname(file));
		content = content.replaceAll(image, normalized);
	}
	const url = meta.permalink
		? "/" + meta.permalink.replace(/^\/+|\/+$/g, "") + "/"
		: "/posts/" + (meta.alias || slug).replace(/^\/+|\/+$/g, "") + "/";
	entries.push({
		kind: "posts",
		slug,
		sourceKey: "markdown:" + file.replaceAll("\\", "/"),
		aliases: ["/posts/" + slug + "/"],
		publish: !meta.draft,
		data: {
			...meta,
			title: meta.title,
			content,
			description: meta.description ?? "",
			image: await normalizeAsset(meta.image ?? "", path.dirname(file)),
			published: new Date(meta.published).toISOString(),
			url,
		},
	});
}
for (const [i, a] of anime.entries())
	entries.push({
		kind: "anime",
		slug: "anime-" + (i + 1),
		sourceKey: "anime:" + a.title,
		publish: true,
		data: {
			...a,
			content: "",
			image: a.cover,
			published: a.startDate
				? new Date(a.startDate).toISOString()
				: new Date().toISOString(),
			tags: a.genre,
		},
	});
for (const d of getDiaryList())
	entries.push({
		kind: "diary",
		slug: String(d.id),
		sourceKey: "diary:" + d.id,
		publish: true,
		data: { ...d, title: d.content.slice(0, 50), published: d.date },
	});
for (const folder of await readdir("public/images/albums", {
	withFileTypes: true,
})) {
	if (!folder.isDirectory()) continue;
	const dir = "public/images/albums/" + folder.name;
	let info;
	try {
		info = JSON.parse(await readFile(dir + "/info.json", "utf8"));
	} catch {
		continue;
	}
	const photos =
		info.mode === "external"
			? info.photos
			: (await files(dir))
					.filter(
						(f) =>
							/\.(jpg|jpeg|png|webp|gif|avif)$/i.test(f) &&
							!f.endsWith("cover.jpg"),
					)
					.map((f) => ({
						src:
							"/" +
							f.replaceAll("\\", "/").replace(/^public\//, ""),
						title: path.basename(f),
						alt: "",
					}));
	entries.push({
		kind: "albums",
		slug: folder.name,
		sourceKey: "album:" + folder.name,
		publish: !info.hidden,
		data: {
			...info,
			title: info.title ?? folder.name,
			image:
				info.mode === "external"
					? info.cover
					: "/images/albums/" + folder.name + "/cover.jpg",
			published: info.date
				? new Date(info.date).toISOString()
				: new Date().toISOString(),
			photos,
		},
	});
}
const paths = new Set();
for (const e of entries.filter((e) => e.kind === "posts")) {
	if (paths.has(e.data.url))
		throw new Error("Duplicate canonical URL: " + e.data.url);
	paths.add(e.data.url);
	if (e.data.encrypted)
		throw new Error(
			"Encrypted article requires separate migration: " + e.slug,
		);
}
await mkdir(".axis", { recursive: true });
const inventory = {
	createdAt: new Date().toISOString(),
	entries,
	assets: Object.fromEntries(assets),
};
await writeFile(".axis/migration.json", JSON.stringify(inventory, null, 2));
console.log(
	JSON.stringify({
		mode: process.argv.includes("--apply") ? "apply" : "dry-run",
		counts: Object.fromEntries(
			["posts", "anime", "diary", "albums"].map((k) => [
				k,
				entries.filter((e) => e.kind === k).length,
			]),
		),
		localAssets: assets.size,
		inventory: ".axis/migration.json",
	}),
);
if (process.argv.includes("--apply")) {
	const base = process.env.AXIS_MIGRATION_URL,
		token = process.env.AXIS_ADMIN_TOKEN;
	if (!base || !token)
		throw new Error("AXIS_MIGRATION_URL and AXIS_ADMIN_TOKEN are required");
	const request = async (route, method, data) => {
		let r;
		try {
			r = await fetch(new URL("/api/v1" + route, base), {
				method,
				signal: AbortSignal.timeout(30000),
				headers: {
					Authorization: "Bearer " + token,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(data),
			});
		} catch (error) {
			error.retryable = true;
			throw error;
		}
		let result;
		try {
			result = await r.json();
		} catch {
			const error = new Error("Invalid response: " + r.status);
			error.retryable = r.ok || r.status === 429 || r.status >= 500;
			throw error;
		}
		if (!r.ok) {
			const error = new Error(result.message ?? r.status);
			error.retryable = r.status === 429 || r.status >= 500;
			throw error;
		}
		return result;
	};
	// Assets become immutable public files in the next deployment; copy only explicitly inventoried files.
	for (const [dest, asset] of assets) {
		await mkdir(path.dirname("public" + dest), { recursive: true });
		await writeFile("public" + dest, await readFile(asset.source));
	}
	for (const entry of entries) {
		for (let attempt = 0; ; attempt++) {
			try {
				const result = await request(
					"/content/manage/" + entry.kind,
					"POST",
					entry,
				);
				if (
					entry.publish &&
					(!result.existing ||
						(result.status === "DRAFT" && result.version === 1))
				)
					await request(
						`/content/manage/${entry.kind}/${result.id}/publish`,
						"POST",
						{ version: result.version },
					);
				console.log(
					result.existing ? "unchanged" : "imported",
					entry.sourceKey,
				);
				break;
			} catch (error) {
				if (!error.retryable || attempt >= 2) throw error;
				// Restart at sourceKey lookup: never blindly repeat a versioned publish.
				console.log("retrying", entry.sourceKey);
				await new Promise((resolve) => setTimeout(resolve, 2000));
			}
		}
	}
}
