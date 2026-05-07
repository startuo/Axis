<script lang="ts">
	import type { AdminUser } from "../admin-api";
	import type { AdminUserInfo } from "../admin-session-store";

	type PreferenceKey = "emailNotice" | "readingFootprint" | "weeklyDigest";

	interface ClientProfileDraft {
		nickname: string;
		bio: string;
		avatarUrl: string;
		preferences: Record<PreferenceKey, boolean>;
	}

	export let profile: ClientProfileDraft;
	export let user: AdminUser;
	export let currentUserInfo: AdminUserInfo | AdminUser;
	export let activeAvatarUrl = "";
	export let profileSavedNotice = "";
	export let getUserInitial: (currentUser: AdminUserInfo | AdminUser | null) => string;
	export let onSave: () => void;
	export let onAvatarUpload: (event: Event) => void;
	export let onTogglePreference: (key: PreferenceKey) => void;
</script>

<section class="client-panel profile-panel" aria-labelledby="client-profile-title">
	<div class="panel-heading">
		<p class="eyebrow">Profile</p>
		<h2 id="client-profile-title">个人资料</h2>
		<p>头像、昵称和偏好会同步更新到左侧边栏。</p>
	</div>

	<form class="profile-form" onsubmit={(event) => { event.preventDefault(); onSave(); }}>
		<div class="avatar-editor">
			<div class="avatar-preview">
				{#if profile.avatarUrl}
					<img src={profile.avatarUrl} alt="头像预览" />
				{:else if activeAvatarUrl}
					<img src={activeAvatarUrl} alt="头像预览" />
				{:else}
					<span>{getUserInitial(currentUserInfo)}</span>
				{/if}
			</div>
			<div>
				<strong>头像设置</strong>
				<p>支持本地图片预览，保存后立即同步侧边栏。</p>
				<label class="upload-button">
					上传头像
					<input type="file" accept="image/*" onchange={onAvatarUpload} />
				</label>
			</div>
		</div>

		<div class="form-grid">
			<label>
				<span>昵称</span>
				<input bind:value={profile.nickname} maxlength="32" />
			</label>
			<label>
				<span>邮箱</span>
				<input value={user.email} disabled />
			</label>
			<label class="wide">
				<span>个性签名</span>
				<textarea bind:value={profile.bio} rows="4" maxlength="160"></textarea>
			</label>
		</div>

		<div class="preference-list">
			<button type="button" onclick={() => onTogglePreference("emailNotice")}>
				<span>
					<strong>接收邮件通知</strong>
					<small>评论审核和重要更新提醒</small>
				</span>
				<i class:active={profile.preferences.emailNotice}></i>
			</button>
			<button type="button" onclick={() => onTogglePreference("readingFootprint")}>
				<span>
					<strong>开启阅读足迹</strong>
					<small>用于生成阅读历史和推荐</small>
				</span>
				<i class:active={profile.preferences.readingFootprint}></i>
			</button>
			<button type="button" onclick={() => onTogglePreference("weeklyDigest")}>
				<span>
					<strong>每周摘要</strong>
					<small>汇总收藏、评论和阅读记录</small>
				</span>
				<i class:active={profile.preferences.weeklyDigest}></i>
			</button>
		</div>

		{#if profileSavedNotice}
			<p class="save-notice">{profileSavedNotice}</p>
		{/if}

		<button class="client-primary" type="submit">保存更改</button>
	</form>
</section>
