import defaultProfileAvatar from "@assets/images/avatar.webp";
import { profileConfig } from "@/config";
import { derived, writable } from "svelte/store";
import type { AdminUser } from "./admin-api";

export type AdminUserInfo = AdminUser & {
	avatarUrl?: string | null;
};

interface AdminSessionState {
	userInfo: AdminUserInfo | null;
}

const importedProfileAvatar =
	typeof defaultProfileAvatar === "string"
		? defaultProfileAvatar
		: defaultProfileAvatar.src;

function normalizeAvatarUrl(value: string) {
	if (/^(https?:|data:|blob:|\/)/.test(value)) {
		return value;
	}

	if (value === profileConfig.avatar) {
		return importedProfileAvatar;
	}

	return `/${value.replace(/^public\//, "")}`;
}

function resolveAvatarUrl(userInfo: AdminUserInfo | null) {
	const userAvatar = userInfo?.avatarUrl?.trim();
	if (userAvatar) {
		return normalizeAvatarUrl(userAvatar);
	}

	const profileAvatar = profileConfig.avatar?.trim();
	if (profileAvatar) {
		return normalizeAvatarUrl(profileAvatar);
	}

	return importedProfileAvatar;
}

export const adminSessionStore = writable<AdminSessionState>({
	userInfo: null,
});

export const userInfo = derived(adminSessionStore, ($state) => $state.userInfo);

export const userAvatarUrl = derived(adminSessionStore, ($state) =>
	resolveAvatarUrl($state.userInfo),
);

export function setAdminUserInfo(userInfo: AdminUserInfo | null) {
	adminSessionStore.update((state) => ({
		...state,
		userInfo,
	}));
}

export function clearAdminUserInfo() {
	setAdminUserInfo(null);
}
