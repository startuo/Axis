import { apiUrl } from "../../utils/api-config";
export type FeedbackStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface FeedbackMessagePayload {
	id: string;
	text: string;
	color: string;
	timestamp: number;
}

export interface FeedbackMessage {
	id: string;
	text: string;
	color: string;
	timestamp: number;
}

export interface AdminFeedbackMessage extends FeedbackMessage {
	status: FeedbackStatus;
	createdAt: string;
	updatedAt: string;
	author: {
		id: string;
		username: string;
		email: string;
	};
}

export interface PaginatedFeedbackMessages {
	items: AdminFeedbackMessage[];
	meta: {
		page: number;
		pageSize: number;
		total: number;
		totalPages: number;
	};
}

export interface AdminFeedbackQuery {
	page?: number;
	pageSize?: number;
	status?: FeedbackStatus | "ALL";
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
	if (payload && typeof payload === "object" && "message" in payload) {
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

export function submitFeedbackMessage(
	token: string,
	payload: FeedbackMessagePayload,
) {
	return request<AdminFeedbackMessage>("/feedback/messages", {
		token,
		method: "POST",
		body: JSON.stringify(payload),
	});
}

export function listPublicFeedbackMessages(limit = 80) {
	return request<FeedbackMessage[]>(
		`/feedback/messages/public?limit=${encodeURIComponent(String(limit))}`,
	);
}

export function listAdminFeedbackMessages(token: string, query: AdminFeedbackQuery = {}) {
	const params: Record<string, string | number | undefined> = {
		page: query.page ?? 1,
		pageSize: query.pageSize ?? 20,
	};

	if (query.status && query.status !== "ALL") {
		params.status = query.status;
	}

	return request<PaginatedFeedbackMessages>(
		`/feedback/messages/admin?${new URLSearchParams(
			Object.entries(params).reduce<Record<string, string>>((acc, [key, value]) => {
				if (value !== undefined) {
					acc[key] = String(value);
				}
				return acc;
			}, {}),
		).toString()}`,
		{ token },
	);
}

export function updateFeedbackMessageStatus(
	token: string,
	id: string,
	status: FeedbackStatus,
) {
	return request<AdminFeedbackMessage>(`/feedback/messages/admin/${id}/status`, {
		token,
		method: "PATCH",
		body: JSON.stringify({ status }),
	});
}
