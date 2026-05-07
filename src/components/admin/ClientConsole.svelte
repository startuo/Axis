<script lang="ts">
	import { onDestroy, onMount } from "svelte";
	import { fade, fly } from "svelte/transition";
	import ArticleCollection from "./client/ArticleCollection.svelte";
	import CommentHistory from "./client/CommentHistory.svelte";
	import DanmakuManager from "./client/DanmakuManager.svelte";
	import Overview from "./client/Overview.svelte";
	import ProfileSettings from "./client/ProfileSettings.svelte";
	import {
		setAdminUserInfo,
		userAvatarUrl,
		userInfo,
		type AdminUserInfo,
	} from "./admin-session-store";
	import type { AdminUser } from "./admin-api";
	import {
		clientMenuItems,
		normalizeClientRoute,
		type ClientRouteKey,
	} from "./client-routes";

	export let token = "";
	export let user: AdminUser;
	export let onLogout: () => void;

	type PreferenceKey = "emailNotice" | "readingFootprint" | "weeklyDigest";

	interface ClientProfileDraft {
		nickname: string;
		bio: string;
		avatarUrl: string;
		preferences: Record<PreferenceKey, boolean>;
	}

	interface ArticleCard {
		id: string;
		title: string;
		summary: string;
		cover: string;
		time: string;
		category: string;
	}

	interface CommentItem {
		id: string;
		article: string;
		content: string;
		time: string;
		status: string;
	}

	const defaultProfile = (currentUser: AdminUser): ClientProfileDraft => ({
		nickname: currentUser.username,
		bio: "记录生活，分享成长。",
		avatarUrl: currentUser.avatarUrl ?? "",
		preferences: {
			emailNotice: true,
			readingFootprint: true,
			weeklyDigest: false,
		},
	});

	const favoriteArticles: ArticleCard[] = [
		{
			id: "fav-1",
			title: "Welcome to STAR's Blog",
			summary: "第一篇同步到后端的博客文章，后续收藏接口接入后将展示真实数据。",
			cover: "/assets/images/avatar.webp",
			time: "2026-04-25",
			category: "博客",
		},
		{
			id: "fav-2",
			title: "AI Agent Reality",
			summary: "关于 AI Agent 落地体验、自动化工作流和工具链思考。",
			cover: "/assets/images/avatar.webp",
			time: "2026-05-01",
			category: "AI",
		},
	];

	const historyArticles: ArticleCard[] = [
		{
			id: "his-1",
			title: "OpenClaw 使用思考",
			summary: "一次关于 Agent + Skill 工作流的实践记录。",
			cover: "/assets/images/avatar.webp",
			time: "刚刚阅读",
			category: "Agent",
		},
		{
			id: "his-2",
			title: "Markdown 与 Mermaid",
			summary: "博客写作中的 Markdown 扩展和图表能力。",
			cover: "/assets/images/avatar.webp",
			time: "昨天",
			category: "Markdown",
		},
	];

	const commentItems: CommentItem[] = [
		{
			id: "comment-1",
			article: "Welcome to STAR's Blog",
			content: "这套后台已经接入，后续评论系统会把真实记录写入这里。",
			time: "2026-05-05 15:28",
			status: "审核中",
		},
		{
			id: "comment-2",
			article: "AI Agent Reality",
			content: "收藏、评论、阅读历史接口完成后会替换当前示例数据。",
			time: "2026-05-04 22:10",
			status: "已通过",
		},
	];

	let activeTab: ClientRouteKey = "overview";
	let profile = defaultProfile(user);
	let avatarLoadFailed = false;
	let profileSavedNotice = "";
	let noticeTimer: number | undefined;

	$: currentUserInfo = $userInfo ?? user;
	$: activeAvatarUrl = avatarLoadFailed ? "" : $userAvatarUrl;
	$: activeMenuItem =
		clientMenuItems.find((item) => item.key === activeTab) ?? clientMenuItems[0];
	$: dashboardStats = [
		{
			label: "收藏文章",
			value: favoriteArticles.length,
			hint: "等待后端收藏接口接入",
			route: "favorites" as ClientRouteKey,
		},
		{
			label: "评论记录",
			value: commentItems.length,
			hint: "含审核中与已通过",
			route: "comments" as ClientRouteKey,
		},
		{
			label: "阅读足迹",
			value: historyArticles.length,
			hint: "开启足迹后自动记录",
			route: "history" as ClientRouteKey,
		},
		{
			label: "弹幕留言",
			value: 50,
			hint: "单条最多 50 字",
			route: "messages" as ClientRouteKey,
		},
	];

	onMount(() => {
		activeTab = normalizeClientRoute(window.location.pathname);
		loadLocalProfile();
	});

	onDestroy(() => {
		window.clearTimeout(noticeTimer);
	});

	function selectTab(tab: ClientRouteKey) {
		activeTab = tab;
	}

	function getProfileStorageKey(currentUser: AdminUser) {
		return `star_blog_client_profile:${currentUser.id}`;
	}

	function loadLocalProfile() {
		const saved = localStorage.getItem(getProfileStorageKey(user));
		if (!saved) {
			setAdminUserInfo({
				...user,
				username: profile.nickname,
				avatarUrl: profile.avatarUrl || user.avatarUrl,
			});
			return;
		}

		try {
			const parsed = JSON.parse(saved) as Partial<ClientProfileDraft>;
			const fallbackProfile = defaultProfile(user);
			profile = {
				...fallbackProfile,
				...parsed,
				preferences: {
					...fallbackProfile.preferences,
					...(parsed.preferences ?? {}),
				},
			};
			setAdminUserInfo({
				...user,
				username: profile.nickname || user.username,
				avatarUrl: profile.avatarUrl || user.avatarUrl,
			});
		} catch {
			localStorage.removeItem(getProfileStorageKey(user));
		}
	}

	function saveProfile() {
		const normalizedProfile: ClientProfileDraft = {
			...profile,
			nickname: profile.nickname.trim() || user.username,
			bio: profile.bio.trim(),
		};

		profile = normalizedProfile;
		localStorage.setItem(getProfileStorageKey(user), JSON.stringify(normalizedProfile));
		setAdminUserInfo({
			...user,
			username: normalizedProfile.nickname,
			avatarUrl: normalizedProfile.avatarUrl || user.avatarUrl,
		});
		avatarLoadFailed = false;
		profileSavedNotice = "个人资料已保存，侧边栏信息已同步更新。";
		window.clearTimeout(noticeTimer);
		noticeTimer = window.setTimeout(() => {
			profileSavedNotice = "";
		}, 2400);
	}

	function handleAvatarUpload(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = () => {
			profile = {
				...profile,
				avatarUrl: String(reader.result ?? ""),
			};
			avatarLoadFailed = false;
		};
		reader.readAsDataURL(file);
	}

	function togglePreference(key: PreferenceKey) {
		profile = {
			...profile,
			preferences: {
				...profile.preferences,
				[key]: !profile.preferences[key],
			},
		};
	}

	function getUserInitial(currentUser: AdminUserInfo | AdminUser | null) {
		const source = currentUser?.username || currentUser?.email || "S";
		return source.trim().charAt(0).toUpperCase() || "S";
	}

	function prefetchBlogHome() {
		if (document.querySelector('link[data-star-client-prefetch="home"]')) {
			return;
		}

		const link = document.createElement("link");
		link.rel = "prefetch";
		link.as = "document";
		link.href = "/";
		link.setAttribute("data-star-client-prefetch", "home");
		document.head.appendChild(link);
	}
</script>

<section class="client-workspace" aria-label="STAR 客户端后台">
	<aside class="client-sidebar">
		<div class="client-logo-block">
			<div class="client-avatar" aria-label={`${currentUserInfo.username} 的头像`}>
				{#if activeAvatarUrl}
					<img
						src={activeAvatarUrl}
						alt={`${currentUserInfo.username} 的头像`}
						onerror={() => (avatarLoadFailed = true)}
					/>
				{:else}
					<span>{getUserInitial(currentUserInfo)}</span>
				{/if}
			</div>
			<div>
				<strong>{currentUserInfo.username}</strong>
				<span>STAR Client</span>
			</div>
		</div>

		<nav class="client-nav" aria-label="客户端后台导航">
			{#each clientMenuItems as item}
				<button
					type="button"
					class:active={activeTab === item.key}
					aria-current={activeTab === item.key ? "page" : undefined}
					onclick={() => selectTab(item.key)}
				>
					<span class="nav-icon">{item.icon}</span>
					<span>
						<strong>{item.label}</strong>
						<small>{item.description}</small>
					</span>
				</button>
			{/each}
		</nav>

		<div class="client-sidebar-footer">
			<a
				class="return-blog-link"
				href="/"
				onpointerenter={prefetchBlogHome}
				onfocus={prefetchBlogHome}
			>
				<span aria-hidden="true">←</span>
				返回博客首页
			</a>

			<div class="client-operator-card">
				<span>当前用户</span>
				<strong>{currentUserInfo.username}</strong>
				<small>{currentUserInfo.email}</small>
				<button type="button" onclick={onLogout}>退出登录</button>
			</div>
		</div>
	</aside>

	<div class="client-main">
		<header class="client-topbar">
			<div>
				<p class="eyebrow">Client Console</p>
				<h1>{activeMenuItem.label}</h1>
				<p>{activeMenuItem.description}</p>
			</div>
			<a class="topbar-home" href="/" onpointerenter={prefetchBlogHome} onfocus={prefetchBlogHome}>
				返回博客
			</a>
		</header>

		{#key activeTab}
			<div
				class="client-content-swap"
				in:fly={{ y: 10, duration: 200 }}
				out:fade={{ duration: 100 }}
			>
				{#if activeTab === "overview"}
					<Overview
						username={currentUserInfo.username}
						stats={dashboardStats}
						{favoriteArticles}
						{commentItems}
						{historyArticles}
						onSelectTab={selectTab}
					/>
				{:else if activeTab === "profile"}
					<ProfileSettings
						{profile}
						{user}
						{currentUserInfo}
						{activeAvatarUrl}
						{profileSavedNotice}
						{getUserInitial}
						onSave={saveProfile}
						onAvatarUpload={handleAvatarUpload}
						onTogglePreference={togglePreference}
					/>
				{:else if activeTab === "messages"}
					<DanmakuManager {token} />
				{:else if activeTab === "favorites"}
					<ArticleCollection
						title="我的收藏"
						description="后端收藏接口接入后，这里将展示真实收藏列表。"
						articles={favoriteArticles}
						actionLabel="取消收藏"
					/>
				{:else if activeTab === "history"}
					<ArticleCollection
						eyebrow="History"
						title="阅读历史"
						description="开启阅读足迹后，浏览过的文章会进入这里。"
						articles={historyArticles}
						actionLabel="删除记录"
					/>
				{:else if activeTab === "comments"}
					<CommentHistory {commentItems} />
				{/if}
			</div>
		{/key}
	</div>
</section>

<style>
	.client-workspace {
		position: relative;
		z-index: 1;
		display: grid;
		grid-template-columns: minmax(16rem, 20rem) minmax(0, 1fr);
		gap: clamp(1rem, 2vw, 1.5rem);
		min-height: calc(100vh - clamp(1.5rem, 4vw, 4rem));
	}

	.client-sidebar,
	.client-workspace :global(.client-panel),
	.client-workspace :global(.message-view .feedback-card) {
		border: 1px solid var(--admin-border);
		background: var(--admin-panel-bg);
		box-shadow: 0 18px 45px rgba(0, 0, 0, 0.12);
		backdrop-filter: blur(18px);
	}

	.client-sidebar {
		position: sticky;
		top: 0;
		display: flex;
		flex-direction: column;
		max-height: calc(100vh - clamp(1.5rem, 4vw, 4rem));
		border-radius: 2rem;
		padding: 1.25rem;
		overflow: hidden;
	}

	.client-logo-block {
		display: flex;
		gap: 0.85rem;
		align-items: center;
		padding: 0.55rem 0.35rem 1.2rem;
	}

	.client-logo-block strong,
	.client-operator-card strong {
		display: block;
		color: var(--admin-text-strong);
		font-weight: 900;
	}

	.client-logo-block span,
	.client-operator-card span,
	.client-operator-card small,
	.client-topbar p,
	.client-workspace :global(.panel-heading p),
	.client-workspace :global(.overview-stat span),
	.client-workspace :global(.overview-stat small) {
		color: var(--admin-muted);
	}

	.client-avatar,
	.client-workspace :global(.avatar-preview) {
		display: grid;
		place-items: center;
		flex: 0 0 auto;
		border-radius: 999px;
		background: linear-gradient(135deg, var(--primary), color-mix(in oklch, var(--primary) 48%, white));
		color: #170910;
		font-weight: 950;
		overflow: hidden;
	}

	.client-avatar {
		width: 3.25rem;
		height: 3.25rem;
	}

	.client-avatar img,
	.client-workspace :global(.avatar-preview img) {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.client-nav {
		display: grid;
		gap: 0.55rem;
		margin-top: 0.35rem;
		overflow-y: auto;
		padding-right: 0.15rem;
	}

	.client-nav button {
		display: flex;
		gap: 0.7rem;
		align-items: center;
		width: 100%;
		border: 0;
		border-radius: 1rem;
		background: transparent;
		color: var(--admin-text);
		padding: 0.8rem 0.85rem;
		text-align: left;
		transition:
			background 180ms ease,
			transform 180ms ease,
			color 180ms ease;
	}

	.client-nav button:hover,
	.client-nav button.active {
		background: var(--admin-primary-soft);
		color: var(--primary);
		transform: translateX(2px);
	}

	.nav-icon {
		display: grid;
		place-items: center;
		width: 2rem;
		height: 2rem;
		border-radius: 0.75rem;
		background: var(--admin-button-bg);
		font-weight: 900;
	}

	.client-nav strong,
	.client-nav small {
		display: block;
	}

	.client-nav small {
		color: var(--admin-muted);
		font-size: 0.76rem;
	}

	.client-sidebar-footer {
		display: grid;
		gap: 0.8rem;
		margin-top: auto;
		padding-top: 1rem;
	}

	.return-blog-link,
	.topbar-home,
	.client-operator-card button,
	.client-workspace :global(.article-card-grid button),
	.client-workspace :global(.upload-button),
	.client-workspace :global(.client-primary),
	.client-workspace :global(.quick-actions button) {
		border: 0;
		border-radius: 999px;
		font-weight: 900;
		text-decoration: none;
		transition:
			background 180ms ease,
			color 180ms ease,
			transform 180ms ease,
			box-shadow 180ms ease;
	}

	.return-blog-link,
	.topbar-home {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.45rem;
		background: var(--admin-button-bg);
		color: var(--admin-text);
		padding: 0.85rem 1rem;
	}

	.return-blog-link:hover,
	.topbar-home:hover {
		background: var(--admin-button-bg-hover);
		color: var(--primary);
	}

	.client-operator-card {
		display: grid;
		gap: 0.35rem;
		border-radius: 1.25rem;
		background: var(--admin-subtle-bg);
		padding: 1rem;
	}

	.client-operator-card button {
		margin-top: 0.6rem;
		background: color-mix(in oklch, var(--primary) 20%, transparent);
		color: var(--admin-text);
		padding: 0.75rem 1rem;
	}

	.client-main,
	.client-content-swap {
		display: grid;
		align-content: start;
		gap: 1rem;
		min-width: 0;
	}

	.client-topbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.client-topbar h1,
	.client-workspace :global(.panel-heading h2),
	.client-workspace :global(.dashboard-widget h3) {
		margin: 0;
		color: var(--admin-text-strong);
		font-weight: 950;
		letter-spacing: 0;
	}

	.client-topbar h1 {
		font-size: clamp(2rem, 4vw, 4rem);
	}

	.client-workspace :global(.client-panel) {
		border-radius: 2rem;
		padding: clamp(1.2rem, 3vw, 2rem);
	}

	.client-workspace :global(.panel-heading) {
		display: grid;
		gap: 0.45rem;
		margin-bottom: 1rem;
	}

	.client-workspace :global(.overview-stats) {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 0.9rem;
	}

	.client-workspace :global(.overview-stat),
	.client-workspace :global(.dashboard-widget) {
		position: relative;
		border: 1px solid var(--admin-border);
		border-radius: 1.35rem;
		background:
			radial-gradient(circle at 100% 100%, color-mix(in oklch, var(--primary) 22%, transparent), transparent 38%),
			var(--admin-subtle-bg);
		overflow: hidden;
	}

	.client-workspace :global(.overview-stat) {
		min-height: 9.5rem;
		padding: 1rem;
		color: var(--admin-text);
		text-align: left;
	}

	.client-workspace :global(.overview-stat strong) {
		display: block;
		margin: 1.1rem 0 0.5rem;
		color: var(--admin-text-strong);
		font-size: clamp(2rem, 4vw, 3.4rem);
		line-height: 1;
	}

	.client-workspace :global(.overview-content-grid) {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(18rem, 0.34fr);
		gap: 1rem;
		margin-top: 1rem;
	}

	.client-workspace :global(.overview-main-column),
	.client-workspace :global(.overview-side-column) {
		display: grid;
		gap: 1rem;
		align-content: start;
		min-width: 0;
	}

	.client-workspace :global(.dashboard-widget) {
		padding: 1rem;
	}

	.client-workspace :global(.preview-list),
	.client-workspace :global(.quick-actions) {
		display: grid;
		gap: 0.65rem;
		margin-top: 0.9rem;
	}

	.client-workspace :global(.preview-list button),
	.client-workspace :global(.favorite-preview-grid button) {
		border: 1px solid var(--admin-border);
		border-radius: 1rem;
		background: color-mix(in oklch, var(--admin-subtle-bg) 74%, transparent);
		color: var(--admin-text);
		padding: 0.85rem;
		text-align: left;
	}

	.client-workspace :global(.preview-list span),
	.client-workspace :global(.preview-list small),
	.client-workspace :global(.favorite-preview-grid span),
	.client-workspace :global(.favorite-preview-grid small) {
		display: block;
		color: var(--admin-muted);
	}

	.client-workspace :global(.preview-list strong),
	.client-workspace :global(.favorite-preview-grid strong) {
		display: block;
		margin: 0.25rem 0;
		color: var(--admin-text-strong);
	}

	.client-workspace :global(.favorite-preview-grid) {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.8rem;
		margin-top: 0.9rem;
	}

	.client-workspace :global(.favorite-preview-grid img) {
		width: 100%;
		height: 7rem;
		border-radius: 0.8rem;
		object-fit: cover;
	}

	.client-workspace :global(.compact-widget strong) {
		display: block;
		color: var(--admin-text-strong);
	}

	.client-workspace :global(.mini-calendar) {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 0.35rem;
		margin-top: 1rem;
	}

	.client-workspace :global(.mini-calendar span) {
		display: grid;
		place-items: center;
		aspect-ratio: 1;
		border-radius: 999px;
		color: var(--admin-muted);
		font-size: 0.8rem;
	}

	.client-workspace :global(.mini-calendar span.active) {
		background: var(--admin-primary-soft);
		color: var(--primary);
	}

	.client-workspace :global(.quick-actions button) {
		background: var(--admin-button-bg);
		color: var(--admin-text);
		padding: 0.7rem 0.9rem;
	}

	.client-workspace :global(.quick-actions button:hover) {
		background: var(--admin-button-bg-hover);
		color: var(--primary);
	}

	.client-workspace :global(.security-status) {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 0.35rem 0.7rem;
		align-items: center;
	}

	.client-workspace :global(.security-status span) {
		grid-row: span 2;
		width: 0.8rem;
		height: 0.8rem;
		border-radius: 999px;
		background: var(--primary);
		box-shadow: 0 0 0 0.35rem color-mix(in oklch, var(--primary) 18%, transparent);
	}

	.client-workspace :global(.security-status small) {
		color: var(--admin-muted);
	}

	.client-workspace :global(.profile-form) {
		display: grid;
		gap: 1rem;
	}

	.client-workspace :global(.avatar-editor) {
		display: flex;
		gap: 1rem;
		align-items: center;
		border: 1px solid var(--admin-border);
		border-radius: 1.35rem;
		background: var(--admin-subtle-bg);
		padding: 1rem;
	}

	.client-workspace :global(.avatar-preview) {
		width: 5.5rem;
		height: 5.5rem;
		font-size: 1.8rem;
	}

	.client-workspace :global(.upload-button) {
		position: relative;
		display: inline-flex;
		margin-top: 0.8rem;
		background: var(--admin-button-bg);
		color: var(--admin-text);
		padding: 0.7rem 1rem;
		cursor: pointer;
		overflow: hidden;
	}

	.client-workspace :global(.upload-button input) {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
	}

	.client-workspace :global(.form-grid) {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.9rem;
	}

	.client-workspace :global(.form-grid label) {
		display: grid;
		gap: 0.45rem;
	}

	.client-workspace :global(.form-grid .wide) {
		grid-column: 1 / -1;
	}

	.client-workspace :global(.form-grid span) {
		color: var(--admin-muted);
		font-size: 0.86rem;
		font-weight: 800;
	}

	.client-workspace :global(.form-grid input),
	.client-workspace :global(.form-grid textarea) {
		width: 100%;
		border: 1px solid var(--admin-border);
		border-radius: 1rem;
		background: var(--admin-subtle-bg);
		color: var(--admin-text);
		padding: 0.85rem 1rem;
		outline: none;
	}

	.client-workspace :global(.preference-list) {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.8rem;
	}

	.client-workspace :global(.preference-list button) {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.8rem;
		border: 1px solid var(--admin-border);
		border-radius: 1.2rem;
		background: var(--admin-subtle-bg);
		color: var(--admin-text);
		padding: 1rem;
		text-align: left;
	}

	.client-workspace :global(.preference-list small) {
		display: block;
		margin-top: 0.25rem;
		color: var(--admin-muted);
	}

	.client-workspace :global(.preference-list i) {
		position: relative;
		width: 2.9rem;
		height: 1.55rem;
		border-radius: 999px;
		background: var(--admin-button-bg);
		transition: background 180ms ease;
	}

	.client-workspace :global(.preference-list i::after) {
		content: "";
		position: absolute;
		top: 0.22rem;
		left: 0.24rem;
		width: 1.1rem;
		height: 1.1rem;
		border-radius: 999px;
		background: var(--admin-muted);
		transition:
			transform 180ms ease,
			background 180ms ease;
	}

	.client-workspace :global(.preference-list i.active) {
		background: color-mix(in oklch, var(--primary) 38%, transparent);
	}

	.client-workspace :global(.preference-list i.active::after) {
		transform: translateX(1.3rem);
		background: var(--primary);
	}

	.client-workspace :global(.save-notice) {
		border: 1px solid color-mix(in oklch, var(--primary) 28%, transparent);
		border-radius: 1rem;
		background: var(--admin-primary-soft);
		color: var(--primary);
		padding: 0.85rem 1rem;
	}

	.client-workspace :global(.client-primary) {
		justify-self: flex-start;
		background: linear-gradient(135deg, var(--primary), color-mix(in oklch, var(--primary) 70%, white));
		color: #170910;
		padding: 0.9rem 1.2rem;
		box-shadow: 0 14px 34px color-mix(in oklch, var(--primary) 22%, transparent);
	}

	.client-workspace :global(.message-view .feedback-card) {
		grid-template-columns: minmax(0, 0.72fr) minmax(18rem, 1fr);
	}

	.client-workspace :global(.article-card-grid) {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1rem;
	}

	.client-workspace :global(.article-card-grid article) {
		display: grid;
		grid-template-columns: 7rem minmax(0, 1fr);
		gap: 0.9rem;
		border: 1px solid var(--admin-border);
		border-radius: 1.35rem;
		background: var(--admin-subtle-bg);
		padding: 0.8rem;
	}

	.client-workspace :global(.article-card-grid img) {
		width: 100%;
		height: 100%;
		min-height: 8rem;
		border-radius: 1rem;
		object-fit: cover;
	}

	.client-workspace :global(.article-card-grid h3) {
		margin: 0.3rem 0;
		color: var(--admin-text-strong);
	}

	.client-workspace :global(.article-card-grid span),
	.client-workspace :global(.article-card-grid p),
	.client-workspace :global(.article-card-grid time) {
		color: var(--admin-muted);
	}

	.client-workspace :global(.article-card-grid footer) {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.8rem;
		margin-top: 0.8rem;
	}

	.client-workspace :global(.article-card-grid button) {
		background: var(--admin-button-bg);
		color: var(--admin-text);
		padding: 0.55rem 0.75rem;
	}

	.client-workspace :global(.comment-timeline) {
		display: grid;
		gap: 1rem;
	}

	.client-workspace :global(.comment-timeline article) {
		display: grid;
		grid-template-columns: 1.2rem minmax(0, 1fr);
		gap: 0.75rem;
		border: 1px solid var(--admin-border);
		border-radius: 1.2rem;
		background: var(--admin-subtle-bg);
		padding: 1rem;
	}

	.client-workspace :global(.timeline-dot) {
		width: 0.75rem;
		height: 0.75rem;
		margin-top: 0.35rem;
		border-radius: 999px;
		background: var(--primary);
		box-shadow: 0 0 0 0.35rem color-mix(in oklch, var(--primary) 18%, transparent);
	}

	.client-workspace :global(.comment-meta) {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.client-workspace :global(.comment-meta a) {
		color: var(--admin-text-strong);
		font-weight: 900;
		text-decoration: none;
	}

	.client-workspace :global(.comment-meta span) {
		border-radius: 999px;
		background: rgba(255, 184, 108, 0.16);
		color: #ffb86c;
		padding: 0.3rem 0.65rem;
		font-size: 0.78rem;
		font-weight: 900;
	}

	.client-workspace :global(.comment-meta span.approved) {
		background: color-mix(in oklch, var(--primary) 18%, transparent);
		color: var(--primary);
	}

	.client-workspace :global(.comment-timeline p) {
		margin: 0.55rem 0;
		color: var(--admin-text);
	}

	.client-workspace :global(.comment-timeline time) {
		color: var(--admin-muted);
		font-size: 0.82rem;
	}

	@media (max-width: 1180px) {
		.client-workspace {
			grid-template-columns: 15.5rem minmax(0, 1fr);
		}

		.client-workspace :global(.overview-content-grid) {
			grid-template-columns: 1fr;
		}

		.client-workspace :global(.preference-list),
		.client-workspace :global(.article-card-grid) {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 860px) {
		.client-workspace {
			grid-template-columns: 1fr;
		}

		.client-sidebar {
			position: relative;
			max-height: none;
			border-radius: 1.35rem;
		}

		.client-nav {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 620px) {
		.client-topbar,
		.client-workspace :global(.avatar-editor),
		.client-workspace :global(.comment-meta),
		.client-workspace :global(.article-card-grid footer) {
			align-items: flex-start;
			flex-direction: column;
		}

		.client-nav,
		.client-workspace :global(.favorite-preview-grid),
		.client-workspace :global(.form-grid),
		.client-workspace :global(.preference-list),
		.client-workspace :global(.article-card-grid) {
			grid-template-columns: 1fr;
		}

		.client-workspace :global(.article-card-grid article) {
			grid-template-columns: 1fr;
		}

		.client-workspace :global(.article-card-grid img) {
			height: 10rem;
		}
	}
</style>
