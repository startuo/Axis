export type ClientRouteKey =
	| "overview"
	| "profile"
	| "messages"
	| "favorites"
	| "comments"
	| "history";

export interface ClientMenuItem {
	key: ClientRouteKey;
	label: string;
	description: string;
	href: string;
	icon: string;
}

export const CLIENT_ROUTE_BASE = "/user";

export const clientMenuItems: ClientMenuItem[] = [
	{
		key: "overview",
		label: "仪表盘",
		description: "账户总览",
		href: `${CLIENT_ROUTE_BASE}/overview`,
		icon: "⌁",
	},
	{
		key: "profile",
		label: "个人资料",
		description: "头像与偏好",
		href: `${CLIENT_ROUTE_BASE}/profile`,
		icon: "◉",
	},
	{
		key: "messages",
		label: "弹幕留言",
		description: "发送留言弹幕",
		href: `${CLIENT_ROUTE_BASE}/messages`,
		icon: "✦",
	},
	{
		key: "favorites",
		label: "我的收藏",
		description: "收藏文章",
		href: `${CLIENT_ROUTE_BASE}/favorites`,
		icon: "♡",
	},
	{
		key: "comments",
		label: "评论记录",
		description: "互动历史",
		href: `${CLIENT_ROUTE_BASE}/comments`,
		icon: "☰",
	},
	{
		key: "history",
		label: "阅读历史",
		description: "浏览足迹",
		href: `${CLIENT_ROUTE_BASE}/history`,
		icon: "◷",
	},
];

export function normalizeClientRoute(
	value: string | undefined | null,
): ClientRouteKey {
	const segment = value
		?.replace(/^\/+|\/+$/g, "")
		.split("/")
		.filter(Boolean)
		.at(-1);
	if (segment === "dashboard") {
		return "overview";
	}

	const match = clientMenuItems.find((item) => item.key === segment);

	return match?.key ?? "overview";
}

export function getClientHref(route: ClientRouteKey) {
	return (
		clientMenuItems.find((item) => item.key === route)?.href ??
		`${CLIENT_ROUTE_BASE}/overview`
	);
}
