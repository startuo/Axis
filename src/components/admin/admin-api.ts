import { io, type Socket } from "socket.io-client";

export type UserRole = "ADMIN" | "USER";
export type ArticleStatus = "DRAFT" | "PUBLISHED";

export interface AdminUser {
	id: string;
	username: string;
	email: string;
	role: UserRole;
	avatarUrl?: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface AuthResponse {
	accessToken: string;
	tokenType: "Bearer";
	expiresIn: string;
	user: AdminUser;
}

export interface ArticleAuthor {
	id: string;
	username: string;
}

export interface AdminArticle {
	id: string;
	title: string;
	slug: string;
	content: string;
	summary: string;
	coverImage: string | null;
	category: string | null;
	tags: string[];
	viewCount: number;
	status: ArticleStatus;
	publishedAt: string | null;
	createdAt: string;
	updatedAt: string;
	author: ArticleAuthor;
}

export interface PaginatedArticles {
	items: AdminArticle[];
	meta: {
		page: number;
		pageSize: number;
		total: number;
		totalPages: number;
	};
}

export interface ArticleMutation {
	title?: string;
	slug?: string;
	content?: string;
	summary?: string;
	coverImage?: string;
	category?: string;
	tags?: string[];
	status?: ArticleStatus;
	publishedAt?: string;
}

export interface DashboardSnapshotHotArticle {
	articleId: string;
	slug: string;
	title: string;
	todayViewCount: number;
	totalViewCount: number;
}

export interface DashboardSnapshot {
	onlineVisitors: number;
	todayPageViews: number;
	todayUniqueVisitors: number;
	todayNewReadCount: number;
	hotArticles: DashboardSnapshotHotArticle[];
	generatedAt: string;
}

export interface DashboardSnapshotEvent {
	reason: string;
	data: DashboardSnapshot;
}

export interface ArticleQuery {
	page: number;
	pageSize: number;
	status?: ArticleStatus | "ALL";
	keyword?: string;
}

const DEFAULT_API_BASE_URL = "http://localhost:3001/api/v1";
const DEFAULT_SOCKET_URL = "http://localhost:3001/dashboard";

export const API_BASE_URL =
	import.meta.env.PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL;
export const SOCKET_URL =
	import.meta.env.PUBLIC_SOCKET_URL ?? DEFAULT_SOCKET_URL;

function buildUrl(path: string, query?: Record<string, string | number | undefined>) {
	const url = new URL(`${API_BASE_URL}${path}`);

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

async function request<T>(
	path: string,
	options: RequestInit & { token?: string } = {},
): Promise<T> {
	const { token, headers, body, ...rest } = options;
	const response = await fetch(buildUrl(path), {
		...rest,
		body,
		headers: {
			Accept: "application/json",
			...(body ? { "Content-Type": "application/json" } : {}),
			...(token ? { Authorization: `Bearer ${token}` } : {}),
			...headers,
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

export function login(account: string, password: string) {
	return request<AuthResponse>("/auth/login", {
		method: "POST",
		body: JSON.stringify({ account, password }),
	});
}

export function register(username: string, email: string, password: string) {
	return request<AuthResponse>("/auth/register", {
		method: "POST",
		body: JSON.stringify({ username, email, password }),
	});
}

export function getMe(token: string) {
	return request<AdminUser>("/auth/me", { token });
}

export function listAdminArticles(token: string, query: ArticleQuery) {
	const params = new URLSearchParams({
		page: String(query.page),
		pageSize: String(query.pageSize),
	});

	if (query.status && query.status !== "ALL") {
		params.set("status", query.status);
	}

	if (query.keyword?.trim()) {
		params.set("keyword", query.keyword.trim());
	}

	return request<PaginatedArticles>(`/articles/admin?${params.toString()}`, {
		token,
	});
}

export function getAdminArticle(token: string, id: string) {
	return request<AdminArticle>(`/articles/admin/${id}`, { token });
}

export function createArticle(
	token: string,
	payload: ArticleMutation & { title: string; content: string; summary: string },
) {
	return request<AdminArticle>("/articles/admin", {
		token,
		method: "POST",
		body: JSON.stringify(payload),
	});
}

export function updateArticle(
	token: string,
	id: string,
	payload: ArticleMutation,
) {
	return request<AdminArticle>(`/articles/admin/${id}`, {
		token,
		method: "PATCH",
		body: JSON.stringify(payload),
	});
}

export function deleteArticle(token: string, id: string) {
	return request<{ id: string; title: string; slug: string; deleted: true }>(
		`/articles/admin/${id}`,
		{
			token,
			method: "DELETE",
		},
	);
}

export async function getPublicArticle(slug: string, visitorId: string) {
	const response = await fetch(buildUrl(`/articles/public/${slug}`, { visitorId }), {
		headers: {
			Accept: "application/json",
			"x-visitor-id": visitorId,
		},
	});
	const payload = await response.json().catch(() => null);

	if (!response.ok) {
		throw new Error(
			normalizeErrorMessage(payload, `Request failed with ${response.status}`),
		);
	}

	return payload as AdminArticle;
}

export function createAdminDashboardSocket(token: string): Socket {
	return io(SOCKET_URL, {
		auth: { token },
		query: { clientType: "admin" },
		transports: ["websocket", "polling"],
	});
}

export function emptyDashboardSnapshot(): DashboardSnapshot {
	return {
		onlineVisitors: 0,
		todayPageViews: 0,
		todayUniqueVisitors: 0,
		todayNewReadCount: 0,
		hotArticles: [],
		generatedAt: "",
	};
}
