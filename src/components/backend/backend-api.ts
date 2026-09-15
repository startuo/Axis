import { apiUrl } from "../../utils/api-config";
export interface BackendArticleAuthor {
	id: string;
	username: string;
}

export interface BackendArticle {
	id: string;
	title: string;
	slug: string;
	summary: string;
	content?: string;
	coverImage: string | null;
	category: string | null;
	tags: string[];
	viewCount: number;
	publishedAt: string | null;
	createdAt: string;
	updatedAt: string;
	author: BackendArticleAuthor;
}

export interface BackendArticleList {
	items: BackendArticle[];
	meta: {
		page: number;
		pageSize: number;
		total: number;
		totalPages: number;
	};
}

function buildUrl(path: string, query?: Record<string, string | number | undefined>) {
	const url = apiUrl(path);

	Object.entries(query ?? {}).forEach(([key, value]) => {
		if (value !== undefined && value !== "") {
			url.searchParams.set(key, String(value));
		}
	});

	return url.toString();
}

function normalizeErrorMessage(payload: unknown, fallback: string) {
	if (
		payload &&
		typeof payload === "object" &&
		"message" in payload
	) {
		const message = (payload as { message?: unknown }).message;
		if (Array.isArray(message)) {
			return message.join("; ");
		}

		if (typeof message === "string") {
			return message;
		}
	}

	return fallback;
}

async function request<T>(url: string, options: RequestInit = {}) {
	const response = await fetch(url, {
		...options,
		headers: {
			Accept: "application/json",
			...options.headers,
		},
	});
	const payload = await response.json().catch(() => null);

	if (!response.ok) {
		throw new Error(
			normalizeErrorMessage(payload, `Request failed with ${response.status}`),
		);
	}

	return payload as T;
}

export function listBackendArticles(query: {
	page?: number;
	pageSize?: number;
	keyword?: string;
	category?: string;
	tag?: string;
} = {}) {
	return request<BackendArticleList>(
		buildUrl("/articles/public", {
			page: query.page ?? 1,
			pageSize: query.pageSize ?? 6,
			keyword: query.keyword,
			category: query.category,
			tag: query.tag,
		}),
	);
}

export function getBackendArticle(slug: string, visitorId: string) {
	return request<BackendArticle>(
		buildUrl(`/articles/public/${encodeURIComponent(slug)}`, { visitorId }),
		{
			headers: {
				"x-visitor-id": visitorId,
			},
		},
	);
}
