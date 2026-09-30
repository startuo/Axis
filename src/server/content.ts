import { getCollection, type CollectionEntry } from "astro:content";
import { contentContext } from "./content-context.mjs";
import type { PublicEntry } from "../components/console/api";
export interface ContentSnapshot {
	posts: PublicEntry[];
	anime: PublicEntry[];
	diary: PublicEntry[];
	albums: PublicEntry[];
	messages: { id: string; text: string; color: string; timestamp: number }[];
	routes: { path: string; entryId: string }[];
	revision: number;
}
declare const __AXIS_SNAPSHOT__: ContentSnapshot | null;
export function snapshot(): ContentSnapshot | null {
	return contentContext.getStore()?.snapshot ?? __AXIS_SNAPSHOT__;
}
export function entryFromPost(post: PublicEntry): CollectionEntry<"posts"> {
	const entry = {
		id: post.slug,
		collection: "posts" as const,
		body: post.content,
		data: {
			title: post.title,
			published: new Date(post.published),
			updated: new Date(String(post.updated ?? post.published)),
			draft: false,
			description: post.description ?? "",
			image: post.image ?? "",
			tags: post.tags ?? [],
			category: String(post.category ?? ""),
			lang: String(post.lang ?? ""),
			pinned: Boolean(post.pinned),
			priority:
				typeof post.priority === "number" ? post.priority : undefined,
			comment: post.comment !== false,
			author: String(post.author ?? ""),
			sourceLink: String(post.sourceLink ?? ""),
			licenseName: String(post.licenseName ?? ""),
			licenseUrl: String(post.licenseUrl ?? ""),
			encrypted: false,
			password: "",
			prevTitle: "",
			prevSlug: "",
			nextTitle: "",
			nextSlug: "",
			alias: post.url?.startsWith("/posts/")
				? post.url.slice(7).replace(/\/$/, "")
				: undefined,
			permalink:
				post.url && !post.url.startsWith("/posts/")
					? post.url.replace(/^\/+|\/+$/g, "")
					: undefined,
		},
	};
	return entry;
}
export async function sourcePosts(): Promise<CollectionEntry<"posts">[]> {
	const data = snapshot();
	if (data) return data.posts.map(entryFromPost);
	return getCollection("posts", ({ data }) => !data.draft);
}
export function publicContent(
	kind: "anime" | "diary" | "albums",
): PublicEntry[] | null {
	return snapshot()?.[kind] ?? null;
}
export function findPostId(slug: string) {
	return snapshot()?.posts.find((p: PublicEntry) => p.slug === slug)?.id;
}
