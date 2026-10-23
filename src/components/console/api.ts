import { apiUrl } from "../../utils/api-config";
import { uploadOriginal, type UploadedMedia } from "../../../shared/media.mjs";
export type Kind = "posts" | "anime" | "diary" | "albums";
export interface EntryData {
	title: string;
	content: string;
	description: string;
	image: string;
	tags: string[];
	published: string;
	category?: string;
	url?: string;
	order?: number;
	status?: string;
	progress?: number;
	totalEpisodes?: number;
	rating?: number;
	link?: string;
	mood?: string;
	location?: string;
	images?: string[];
	photos?: { src: string; alt: string; title: string }[];
	layout?: string;
	[key: string]: unknown;
}
export interface Entry {
	id: string;
	kind: Kind;
	slug: string;
	version: number;
	status: string;
	dirty: boolean;
	data: EntryData;
	updatedAt: string;
}
export interface PublicEntry extends EntryData {
	id: string;
	slug: string;
	kind: Kind;
}
export interface Media extends UploadedMedia {
	refs?: number;
	variantWarnings?: string[];
}
export const TOKEN_KEY = "star_blog_auth_token";
export function token() {
	return (
		localStorage.getItem(TOKEN_KEY) ??
		localStorage.getItem("star_blog_admin_token") ??
		""
	);
}
export async function api<T>(
	path: string,
	method = "GET",
	data?: unknown,
): Promise<T> {
	const response = await fetch(apiUrl(path), {
		method,
		headers: {
			Authorization: `Bearer ${token()}`,
			...(data !== undefined
				? { "Content-Type": "application/json" }
				: {}),
		},
		body: data === undefined ? undefined : JSON.stringify(data),
	});
	const payload = await response.json().catch(() => null);
	if (!response.ok)
		throw new Error(payload?.message ?? `请求失败 (${response.status})`);
	return payload;
}
export async function upload(file: File): Promise<Media> {
	const data = await uploadOriginal(file, apiUrl("/media"), token());
	const warnings: string[] = [];
	let bitmap: ImageBitmap | null = null;
	try {
		bitmap = await createImageBitmap(new Blob([file], { type: data.type }));
		if (bitmap.width * bitmap.height > 40000000) {
			warnings.push("原图已上传，图片尺寸较大，未生成预览图，可继续使用原图。");
		} else for (const [variant, width, label] of [
			["display", 1600, "展示图"], ["thumb", 400, "缩略图"],
		] as const) {
			const canvas = document.createElement("canvas");
			try {
				const scale = Math.min(1, width / bitmap.width);
				canvas.width = Math.round(bitmap.width * scale);
				canvas.height = Math.round(bitmap.height * scale);
				const context = canvas.getContext("2d");
				if (!context) throw new Error("Canvas unavailable");
				context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
				const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", 0.85));
				if (!blob) throw new Error("Image encoding failed");
				const response = await fetch(apiUrl(`/media/${data.id}/variants/${variant}`), {
					method: "POST",
					headers: { Authorization: `Bearer ${token()}`, "Content-Type": blob.type },
					body: blob,
				});
				if (!response.ok) throw new Error(`HTTP ${response.status}`);
			} catch (error) {
				const reason = error instanceof Error ? error.message : String(error);
				warnings.push(`原图已上传，${label}生成失败（${reason}），可继续使用原图。`);
			} finally {
				canvas.width = canvas.height = 0;
			}
		}
	} catch {
		warnings.push("原图已上传，浏览器未能生成预览图，可继续使用原图。");
	} finally {
		bitmap?.close();
	}
	return warnings.length ? { ...data, variantWarnings: warnings } : data;
}
export const labels: Record<Kind, string> = {
	posts: "文章",
	anime: "追番",
	diary: "日记",
	albums: "相册",
};
export function blank(kind: Kind): EntryData {
	return {
		title: "",
		content: kind === "posts" ? "# 开始写作\n\n" : "",
		description: "",
		image: "",
		tags: [],
		published: new Date().toISOString(),
		category: "",
		order: 0,
		status: "watching",
		progress: 0,
		totalEpisodes: 0,
		rating: 0,
		link: "",
		mood: "",
		location: "",
		images: [],
		photos: [],
		layout: "grid",
	};
}
