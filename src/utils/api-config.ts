/** Public build-time endpoints; production static hosting has no implicit API. */
export const API_BASE_URL = (import.meta.env.PUBLIC_API_BASE_URL?.trim() ||
	(import.meta.env.DEV ? "http://localhost:3001/api/v1" : "")).replace(/\/+$/, "");
export const API_ENABLED = API_BASE_URL.length > 0;
export const API_UNAVAILABLE_MESSAGE = "本站尚未连接在线服务，登录、留言和后台管理暂不可用。";

export function apiUrl(path: string): URL {
	if (!API_ENABLED) throw new Error(API_UNAVAILABLE_MESSAGE);
	return new URL(`${API_BASE_URL}${path}`, typeof window === "undefined" ? "http://localhost" : window.location.origin);
}
