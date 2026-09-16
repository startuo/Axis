<script lang="ts">
	import { API_ENABLED } from "../../utils/api-config";
	import { onDestroy, onMount, tick } from "svelte";
	import InteractiveMascot from "./InteractiveMascot.svelte";
	import {
		clearAdminUserInfo,
		setAdminUserInfo,
		userAvatarUrl,
	} from "./admin-session-store";
	import ClientConsole from "./ClientConsole.svelte";
	import {
		listAdminFeedbackMessages,
		updateFeedbackMessageStatus,
		type AdminFeedbackMessage,
		type FeedbackStatus,
	} from "../feedback/feedback-api";
	import {
		getDashboardSnapshot,
		createArticle,
		deleteArticle,
		emptyDashboardSnapshot,
		getMe,
		getPublicArticle,
		listAdminArticles,
		login,
		register,
		updateArticle,
		type AdminArticle,
		type AdminUser,
		type ArticleMutation,
		type ArticleStatus,
		type DashboardSnapshot,
	} from "./admin-api";

	const TOKEN_KEY = "star_blog_auth_token";
	const LEGACY_ADMIN_TOKEN_KEY = "star_blog_admin_token";
	const visitorId = `admin-preview-${crypto.randomUUID?.() ?? Date.now()}`;
	const feedbackStatusOptions: Array<FeedbackStatus | "ALL"> = [
		"PENDING",
		"APPROVED",
		"REJECTED",
		"ALL",
	];

	interface ArticleFormState {
		id?: string;
		title: string;
		slug: string;
		summary: string;
		content: string;
		coverImage: string;
		category: string;
		tagsText: string;
		status: ArticleStatus;
		publishedAt: string;
	}

	const emptyArticleForm = (): ArticleFormState => ({
		title: "",
		slug: "",
		summary: "",
		content: "# New Article\n\nWrite something worth publishing.",
		coverImage: "",
		category: "",
		tagsText: "",
		status: "DRAFT",
		publishedAt: "",
	});

	let booting = true;
	let token = "";
	let user: AdminUser | null = null;
	let authMode: "login" | "register" = "login";
	let loginForm = {
		account: "",
		password: "",
	};
	let registerForm = {
		username: "",
		email: "",
		password: "",
		confirmPassword: "",
	};
	let authLoading = false;
	let globalError = "";
	let toast = "";
	let mascotCovering = false;
	let mascotTyping = false;
	let loginPasswordVisible = false;
	let registerPasswordVisible = false;
	let loginFormElement: HTMLFormElement;
	let registerFormElement: HTMLFormElement;
	let authPanelHeight = 0;

	let dashboard: DashboardSnapshot = emptyDashboardSnapshot();
	let lastDashboardReason = "waiting";
	let socketState: "idle" | "connecting" | "connected" | "error" = "idle";
	let dashboardTimer: ReturnType<typeof setTimeout> | null = null;
	let dashboardAbort: AbortController | null = null;

	let articles: AdminArticle[] = [];
	let articlesLoading = false;
	let filters = {
		page: 1,
		pageSize: 12,
		status: "ALL" as ArticleStatus | "ALL",
		keyword: "",
	};
	let meta = {
		page: 1,
		pageSize: 12,
		total: 0,
		totalPages: 1,
	};
	let feedbackMessages: AdminFeedbackMessage[] = [];
	let feedbackLoading = false;
	let feedbackStatusFilter: FeedbackStatus | "ALL" = "PENDING";
	let moderatingFeedbackId = "";

	let editorOpen = false;
	let editorMode: "create" | "edit" = "create";
	let articleForm = emptyArticleForm();
	let savingArticle = false;
	let deletingArticleId = "";
	let previewingArticleId = "";
	let avatarLoadFailed = false;
	let lastAvatarUrl = "";

	$: isAdmin = user?.role === "ADMIN";
	$: isUser = user?.role === "USER";
	$: if ($userAvatarUrl !== lastAvatarUrl) {
		lastAvatarUrl = $userAvatarUrl;
		avatarLoadFailed = false;
	}
	$: activeAvatarUrl = avatarLoadFailed ? "" : $userAvatarUrl;
	$: activePasswordLength =
		authMode === "login"
			? loginForm.password.length
			: Math.max(registerForm.password.length, registerForm.confirmPassword.length);
	$: activePasswordVisible =
		authMode === "login" ? loginPasswordVisible : registerPasswordVisible;
	$: registerValidationMessage = getRegisterValidationMessage(
		registerForm.username,
		registerForm.email,
		registerForm.password,
		registerForm.confirmPassword,
	);
	$: canRegister = registerValidationMessage === "";
	$: if (!booting && !user) {
		authMode;
		globalError;
		authLoading;
		void syncAuthPanelHeight();
	}
	$: publishedCount = articles.filter((article) => article.status === "PUBLISHED").length;
	$: draftCount = articles.filter((article) => article.status === "DRAFT").length;
	$: categoryCount = new Set(articles.map((article) => article.category).filter(Boolean)).size;
	$: tagCount = new Set(articles.flatMap((article) => article.tags)).size;
	$: totalWords = articles.reduce((sum, article) => sum + article.content.length, 0);
	$: hasPreviousPage = meta.page > 1;
	$: hasNextPage = meta.page < meta.totalPages;
	$: socketStatusLabel =
		socketState === "connected"
			? "每 30 秒更新"
			: socketState === "connecting"
				? "连接中"
				: socketState === "error"
					? "连接异常"
					: "未连接";

	onMount(async () => {
		const storedToken =
			localStorage.getItem(TOKEN_KEY) ?? localStorage.getItem(LEGACY_ADMIN_TOKEN_KEY);
		if (!storedToken) {
			booting = false;
			return;
		}

		token = storedToken;
		await restoreSession(storedToken);
		booting = false;
	});

	onDestroy(() => {
		disconnectDashboard();
	});

	onMount(() => {
		const handleResize = () => {
			void syncAuthPanelHeight();
		};

		window.addEventListener("resize", handleResize, { passive: true });
		return () => {
			window.removeEventListener("resize", handleResize);
		};
	});

	async function syncAuthPanelHeight() {
		await tick();
		const activeForm = authMode === "login" ? loginFormElement : registerFormElement;
		if (!activeForm) {
			return;
		}

		authPanelHeight = activeForm.scrollHeight;
	}

	function switchAuthMode(nextMode: "login" | "register") {
		if (authMode === nextMode) {
			return;
		}

		authMode = nextMode;
		globalError = "";
		mascotTyping = false;
		mascotCovering = false;
		void syncAuthPanelHeight();
	}

	function enterPasswordMode() {
		mascotTyping = false;
		mascotCovering = true;
	}

	function leavePasswordMode() {
		mascotCovering = false;
	}

	async function restoreSession(storedToken: string) {
		try {
			const currentUser = await getMe(storedToken);
			token = storedToken;
			user = currentUser;
			setAdminUserInfo(currentUser);
			localStorage.setItem(TOKEN_KEY, storedToken);

			if (currentUser.role === "ADMIN") {
				await loadArticles(1);
				await loadFeedbackMessages();
				connectDashboard(storedToken);
			}
		} catch (error) {
			clearSession();
			globalError = getErrorMessage(error);
		}
	}

	async function handleLogin(event: SubmitEvent) {
		event.preventDefault();
		authLoading = true;
		globalError = "";

		try {
			const response = await login(loginForm.account, loginForm.password);
			await enterSession(response.accessToken, response.user);
			showToast(response.user.role === "ADMIN" ? "管理员登录成功。" : "欢迎回来，客户端后台已打开。");
		} catch (error) {
			globalError = getErrorMessage(error);
		} finally {
			authLoading = false;
		}
	}

	async function handleRegister(event: SubmitEvent) {
		event.preventDefault();
		authLoading = true;
		globalError = "";

		const validationMessage = getRegisterValidationMessage(
			registerForm.username,
			registerForm.email,
			registerForm.password,
			registerForm.confirmPassword,
		);
		if (validationMessage) {
			globalError = validationMessage;
			authLoading = false;
			return;
		}

		try {
			const response = await register(
				registerForm.username,
				registerForm.email,
				registerForm.password,
			);
			await enterSession(response.accessToken, response.user);
			showToast("注册成功，客户端后台已为你预留。");
		} catch (error) {
			globalError = getErrorMessage(error);
		} finally {
			authLoading = false;
		}
	}

	async function enterSession(accessToken: string, currentUser: AdminUser) {
		token = accessToken;
		user = currentUser;
		setAdminUserInfo(currentUser);
		localStorage.setItem(TOKEN_KEY, accessToken);
		localStorage.removeItem(LEGACY_ADMIN_TOKEN_KEY);

		if (currentUser.role === "ADMIN") {
			await loadArticles(1);
			await loadFeedbackMessages();
			connectDashboard(accessToken);
			return;
		}

		articles = [];
		feedbackMessages = [];
		dashboard = emptyDashboardSnapshot();
		disconnectDashboard();
		if (window.location.pathname === "/admin" || window.location.pathname.startsWith("/admin/")) {
			window.history.replaceState({ clientRoute: "overview" }, "", "/user/overview");
		}
	}

	function clearSession() {
		localStorage.removeItem(TOKEN_KEY);
		localStorage.removeItem(LEGACY_ADMIN_TOKEN_KEY);
		token = "";
		user = null;
		clearAdminUserInfo();
		articles = [];
		feedbackMessages = [];
		dashboard = emptyDashboardSnapshot();
		disconnectDashboard();
	}

	function logout() {
		clearSession();
		if (window.location.pathname.startsWith("/user")) {
			window.history.replaceState({}, "", "/admin");
		}
		showToast("已退出登录。");
	}

	function connectDashboard(accessToken: string) {
		disconnectDashboard();
		if (!API_ENABLED) return;
		socketState = "connecting";
		const controller = new AbortController();
		dashboardAbort = controller;
		async function refresh() {
			try {
				if (!document.hidden) {
					const snapshot = await getDashboardSnapshot(accessToken, controller.signal);
					if (controller.signal.aborted) return;
					dashboard = snapshot;
					socketState = "connected";
					lastDashboardReason = "定时刷新";
				}
			} catch {
				if (!controller.signal.aborted) socketState = "error";
			} finally {
				if (!controller.signal.aborted) dashboardTimer = setTimeout(refresh, 30000);
			}
		}
		void refresh();
	}

	function disconnectDashboard() {
		dashboardAbort?.abort();
		dashboardAbort = null;
		if (dashboardTimer) clearTimeout(dashboardTimer);
		dashboardTimer = null;
		socketState = "idle";
	}

	async function loadArticles(page = filters.page) {
		if (!token || user?.role !== "ADMIN") {
			return;
		}

		articlesLoading = true;
		globalError = "";

		try {
			const result = await listAdminArticles(token, {
				...filters,
				page,
			});
			articles = result.items;
			meta = {
				...result.meta,
				totalPages: Math.max(result.meta.totalPages, 1),
			};
			filters.page = result.meta.page;
		} catch (error) {
			globalError = getErrorMessage(error);
		} finally {
			articlesLoading = false;
		}
	}

	async function loadFeedbackMessages() {
		if (!token || user?.role !== "ADMIN") {
			return;
		}

		feedbackLoading = true;
		globalError = "";

		try {
			const result = await listAdminFeedbackMessages(token, {
				page: 1,
				pageSize: 24,
				status: feedbackStatusFilter,
			});
			feedbackMessages = result.items;
		} catch (error) {
			globalError = getErrorMessage(error);
		} finally {
			feedbackLoading = false;
		}
	}

	async function changeFeedbackFilter(status: FeedbackStatus | "ALL") {
		feedbackStatusFilter = status;
		await loadFeedbackMessages();
	}

	async function moderateFeedback(message: AdminFeedbackMessage, status: FeedbackStatus) {
		if (!token) {
			return;
		}

		moderatingFeedbackId = message.id;
		globalError = "";

		try {
			await updateFeedbackMessageStatus(token, message.id, status);
			showToast(status === "APPROVED" ? "留言已通过审核。" : "留言状态已更新。");
			await loadFeedbackMessages();
		} catch (error) {
			globalError = getErrorMessage(error);
		} finally {
			moderatingFeedbackId = "";
		}
	}

	function applyFilters(event: SubmitEvent) {
		event.preventDefault();
		void loadArticles(1);
	}

	function resetFilters() {
		filters = {
			page: 1,
			pageSize: 12,
			status: "ALL",
			keyword: "",
		};
		void loadArticles(1);
	}

	function openCreateEditor() {
		editorMode = "create";
		articleForm = emptyArticleForm();
		editorOpen = true;
	}

	function openEditEditor(article: AdminArticle) {
		editorMode = "edit";
		articleForm = {
			id: article.id,
			title: article.title,
			slug: article.slug,
			summary: article.summary,
			content: article.content,
			coverImage: article.coverImage ?? "",
			category: article.category ?? "",
			tagsText: article.tags.join(", "),
			status: article.status,
			publishedAt: toDateTimeLocal(article.publishedAt),
		};
		editorOpen = true;
	}

	function closeEditor() {
		if (savingArticle) {
			return;
		}

		editorOpen = false;
		articleForm = emptyArticleForm();
	}

	async function submitArticle(event: SubmitEvent) {
		event.preventDefault();
		if (!token || !canSubmitArticle()) {
			return;
		}

		savingArticle = true;
		globalError = "";

		try {
			const payload = buildArticlePayload();

			if (editorMode === "edit" && articleForm.id) {
				await updateArticle(token, articleForm.id, payload);
				showToast("文章已更新。");
			} else {
				await createArticle(token, {
					...payload,
					title: articleForm.title.trim(),
					summary: articleForm.summary.trim(),
					content: articleForm.content,
				});
				showToast("文章已创建。");
			}

			editorOpen = false;
			await loadArticles(editorMode === "create" ? 1 : filters.page);
		} catch (error) {
			globalError = getErrorMessage(error);
		} finally {
			savingArticle = false;
		}
	}

	async function toggleArticleStatus(article: AdminArticle) {
		if (!token) {
			return;
		}

		const nextStatus: ArticleStatus =
			article.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED";

		try {
			await updateArticle(token, article.id, { status: nextStatus });
			showToast(nextStatus === "PUBLISHED" ? "文章已发布。" : "文章已转为草稿。");
			await loadArticles(filters.page);
		} catch (error) {
			globalError = getErrorMessage(error);
		}
	}

	async function removeArticle(article: AdminArticle) {
		if (!token || !confirm(`确认删除《${article.title}》？该操作不可恢复。`)) {
			return;
		}

		deletingArticleId = article.id;
		globalError = "";

		try {
			await deleteArticle(token, article.id);
			showToast("文章已删除。");
			await loadArticles(articles.length === 1 ? Math.max(1, filters.page - 1) : filters.page);
		} catch (error) {
			globalError = getErrorMessage(error);
		} finally {
			deletingArticleId = "";
		}
	}

	async function simulateArticleView(article: AdminArticle) {
		if (article.status !== "PUBLISHED") {
			showToast("草稿文章不会出现在公开详情接口，请先发布。");
			return;
		}

		previewingArticleId = article.id;
		globalError = "";

		try {
			await getPublicArticle(article.slug, visitorId);
			showToast("已记录一次公开阅读，统计将在下次刷新时更新。");
			await loadArticles(filters.page);
		} catch (error) {
			globalError = getErrorMessage(error);
		} finally {
			previewingArticleId = "";
		}
	}

	function buildArticlePayload(): ArticleMutation {
		const payload: ArticleMutation = {
			title: articleForm.title.trim(),
			summary: articleForm.summary.trim(),
			content: articleForm.content,
			tags: parseTags(articleForm.tagsText),
			status: articleForm.status,
		};

		if (articleForm.slug.trim()) {
			payload.slug = articleForm.slug.trim();
		}

		if (articleForm.coverImage.trim()) {
			payload.coverImage = articleForm.coverImage.trim();
		}

		if (articleForm.category.trim()) {
			payload.category = articleForm.category.trim();
		}

		if (articleForm.status === "PUBLISHED" && articleForm.publishedAt) {
			payload.publishedAt = new Date(articleForm.publishedAt).toISOString();
		}

		return payload;
	}

	function canSubmitArticle() {
		return (
			articleForm.title.trim().length > 0 &&
			articleForm.summary.trim().length > 0 &&
			articleForm.content.trim().length > 0
		);
	}

	function getRegisterValidationMessage(
		rawUsername: string,
		rawEmail: string,
		password: string,
		confirmPassword: string,
	) {
		const username = rawUsername.trim();
		const email = rawEmail.trim();

		if (username.length < 3 || username.length > 50) {
			return "用户名需要 3-50 位。";
		}

		if (!/^[\p{L}\p{N}_-]+$/u.test(username)) {
			return "用户名只能包含中文、英文、数字、下划线或短横线。";
		}

		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			return "请输入有效邮箱地址。";
		}

		if (password.length < 8 || password.length > 128) {
			return "密码需要 8-128 位。";
		}

		if (password !== confirmPassword) {
			return "两次输入的密码不一致。";
		}

		return "";
	}

	function parseTags(value: string) {
		return value
			.split(",")
			.map((item) => item.trim())
			.filter(Boolean)
			.slice(0, 20);
	}

	function toDateTimeLocal(value: string | null) {
		if (!value) {
			return "";
		}

		const date = new Date(value);
		const pad = (input: number) => String(input).padStart(2, "0");
		return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
	}

	function formatDate(value: string | null) {
		if (!value) {
			return "未发布";
		}

		return new Intl.DateTimeFormat("zh-CN", {
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
		}).format(new Date(value));
	}

	function formatNumber(value: number) {
		return new Intl.NumberFormat("zh-CN").format(value);
	}

	function statusLabel(status: ArticleStatus) {
		return status === "PUBLISHED" ? "已发布" : "草稿";
	}

	function feedbackStatusLabel(status: FeedbackStatus | "ALL") {
		if (status === "APPROVED") {
			return "已通过";
		}

		if (status === "REJECTED") {
			return "已拒绝";
		}

		if (status === "PENDING") {
			return "待审核";
		}

		return "全部";
	}

	function getErrorMessage(error: unknown) {
		return error instanceof Error ? error.message : "发生未知错误。";
	}

	function showToast(message: string) {
		toast = message;
		window.setTimeout(() => {
			if (toast === message) {
				toast = "";
			}
		}, 2600);
	}

	function getUserInitial(currentUser: AdminUser | null) {
		const source = currentUser?.username || currentUser?.email || "S";
		return source.trim().charAt(0).toUpperCase() || "S";
	}

	function handleAvatarError() {
		avatarLoadFailed = true;
	}

	function prefetchBlogHome() {
		if (document.querySelector('link[data-star-admin-prefetch="home"]')) {
			return;
		}

		const link = document.createElement("link");
		link.rel = "prefetch";
		link.as = "document";
		link.href = "/";
		link.setAttribute("data-star-admin-prefetch", "home");
		document.head.appendChild(link);
	}
</script>

<svelte:head>
	<title>STAR's Blog Console</title>
</svelte:head>

<main class="admin-shell">
	<div class="ambient ambient-one"></div>
	<div class="ambient ambient-two"></div>

	{#if booting}
		<section class="boot-card">
			<div class="loader"></div>
			<p>正在恢复博客会话...</p>
		</section>
	{:else if !user}
		<section class="portal-layout">
			<div class="welcome-panel login-visual-panel">
				<p class="eyebrow">STAR'S BLOG</p>
				<h1>欢迎来到我的博客</h1>
				<p class="brand-copy">
					这里是博客入口和后台通道。管理员登录后进入管理驾驶舱，普通用户登录或注册后进入客户端后台，后续会扩展评论、收藏和个人互动数据。
				</p>
				<div class="login-mascot-showcase">
					<InteractiveMascot
						isTyping={mascotTyping}
						isPasswordFocused={mascotCovering}
						passwordLength={activePasswordLength}
						passwordVisible={activePasswordVisible}
					/>
				</div>

			</div>

			<div class="auth-card">
				<div class="auth-tabs" role="tablist" aria-label="登录注册切换">
					<button
						type="button"
						class:active={authMode === "login"}
						onclick={() => switchAuthMode("login")}
					>
						登录
					</button>
					<button
						type="button"
						class:active={authMode === "register"}
						onclick={() => switchAuthMode("register")}
					>
						注册
					</button>
				</div>

				<div class="auth-mascot-inline">
					<InteractiveMascot
						isTyping={mascotTyping}
						isPasswordFocused={mascotCovering}
						passwordLength={activePasswordLength}
						passwordVisible={activePasswordVisible}
					/>
				</div>

				<div class="auth-panel-shell" style={`--auth-panel-height:${authPanelHeight}px`}>
					<form
						bind:this={loginFormElement}
						class:active={authMode === "login"}
						class="auth-form auth-panel"
						aria-hidden={authMode !== "login"}
						inert={authMode !== "login"}
						onsubmit={handleLogin}
					>
						<div>
							<p class="eyebrow">Welcome Back</p>
							<h2>登录博客账户</h2>
							<p>管理员账户会进入驾驶舱，普通用户会进入客户端后台。</p>
						</div>

						<label>
							<span>账号 / 邮箱</span>
							<input
								bind:value={loginForm.account}
								autocomplete="username"
								onfocus={() => (mascotTyping = true)}
								onblur={() => (mascotTyping = false)}
							/>
						</label>

						<label>
							<span>密码</span>
							<div class="password-control">
								<input
									type={loginPasswordVisible ? "text" : "password"}
									bind:value={loginForm.password}
									autocomplete="current-password"
									onpointerdown={enterPasswordMode}
									onfocus={enterPasswordMode}
									oninput={enterPasswordMode}
									onblur={leavePasswordMode}
								/>
								<button
									type="button"
									aria-label={loginPasswordVisible ? "隐藏密码" : "显示密码"}
									onmousedown={(event) => event.preventDefault()}
									onclick={() => (loginPasswordVisible = !loginPasswordVisible)}
								>
									{loginPasswordVisible ? "隐藏" : "显示"}
								</button>
							</div>
						</label>

						{#if globalError}
							<div class="alert error">{globalError}</div>
						{/if}

						<button class="primary-action" type="submit" disabled={authLoading}>
							{authLoading ? "登录中..." : "进入博客后台"}
						</button>
					</form>
					<form
						bind:this={registerFormElement}
						class:active={authMode === "register"}
						class="auth-form auth-panel"
						aria-hidden={authMode !== "register"}
						inert={authMode !== "register"}
						onsubmit={handleRegister}
					>
						<div>
							<p class="eyebrow">New Reader</p>
							<h2>注册用户账户</h2>
							<p>普通用户注册后进入客户端后台，暂时展示预留模块。</p>
						</div>

						<label>
							<span>用户名</span>
							<input
								bind:value={registerForm.username}
								autocomplete="username"
								onfocus={() => (mascotTyping = true)}
								onblur={() => (mascotTyping = false)}
							/>
						</label>

						<label>
							<span>邮箱</span>
							<input
								type="email"
								bind:value={registerForm.email}
								autocomplete="email"
								onfocus={() => (mascotTyping = true)}
								onblur={() => (mascotTyping = false)}
							/>
						</label>

						<label>
							<span>密码</span>
							<div class="password-control">
								<input
									type={registerPasswordVisible ? "text" : "password"}
									bind:value={registerForm.password}
									autocomplete="new-password"
									onpointerdown={enterPasswordMode}
									onfocus={enterPasswordMode}
									oninput={enterPasswordMode}
									onblur={leavePasswordMode}
								/>
								<button
									type="button"
									aria-label={registerPasswordVisible ? "隐藏密码" : "显示密码"}
									onmousedown={(event) => event.preventDefault()}
									onclick={() => (registerPasswordVisible = !registerPasswordVisible)}
								>
									{registerPasswordVisible ? "隐藏" : "显示"}
								</button>
							</div>
						</label>

						<label>
							<span>确认密码</span>
							<input
								type={registerPasswordVisible ? "text" : "password"}
								bind:value={registerForm.confirmPassword}
								autocomplete="new-password"
								onpointerdown={enterPasswordMode}
								onfocus={enterPasswordMode}
								oninput={enterPasswordMode}
								onblur={leavePasswordMode}
							/>
						</label>

						{#if globalError}
							<div class="alert error">{globalError}</div>
						{:else if registerValidationMessage && (registerForm.username || registerForm.email || registerForm.password || registerForm.confirmPassword)}
							<div class="alert hint">{registerValidationMessage}</div>
						{/if}

						<button
							class="primary-action"
							type="submit"
							disabled={authLoading || !canRegister}
							title={!canRegister ? registerValidationMessage : undefined}
						>
							{authLoading ? "注册中..." : canRegister ? "创建用户后台" : "请完善注册信息"}
						</button>
					</form>
				</div>
			</div>
		</section>
	{:else if isUser}
		<ClientConsole {token} {user} onLogout={logout} />
	{:else if isAdmin}
		<section class="workspace">
			<aside class="sidebar">
				<div class="logo-block">
					<div class="logo-avatar" aria-label={`${user.username} 的头像`}>
						{#if activeAvatarUrl}
							<img
								src={activeAvatarUrl}
								alt={`${user.username} 的头像`}
								onerror={handleAvatarError}
							/>
						{:else}
							<span>{getUserInitial(user)}</span>
						{/if}
					</div>
					<div>
						<strong>STAR Admin</strong>
						<span>管理驾驶舱</span>
					</div>
				</div>

				<nav>
					<a href="#dashboard">统计看板</a>
					<a href="#hot">热门文章</a>
					<a href="#articles">文章管理</a>
					<a href="#feedback">留言审核</a>
				</nav>

				<div class="sidebar-footer">
					<a
						class="return-blog-link"
						href="/"
						onpointerenter={prefetchBlogHome}
						onfocus={prefetchBlogHome}
					>
						<span aria-hidden="true">←</span>
						返回博客首页
					</a>

					<div class="operator-card">
						<span>当前管理员</span>
						<strong>{user.username}</strong>
						<small>{user.email}</small>
						<button type="button" onclick={logout}>退出登录</button>
					</div>
				</div>
			</aside>

			<div class="content">
				<header class="topbar">
					<div>
						<p class="eyebrow">Dashboard</p>
						<h1>博客管理驾驶舱</h1>
					</div>
					<div class="topbar-actions">
						<span class:connected={socketState === "connected"} class="socket-pill">
							{socketStatusLabel}
						</span>
						<button type="button" onclick={() => loadArticles(filters.page)}>
							刷新文章
						</button>
						<button class="primary-action compact" type="button" onclick={openCreateEditor}>
							新建文章
						</button>
					</div>
				</header>

				{#if globalError}
					<div class="alert error dashboard-alert">{globalError}</div>
				{/if}

				<section class="dashboard-map" id="dashboard">
					<div class="metric-grid" aria-label="统计数据看板">
						<article class="metric-card featured">
							<span>在线人数</span>
							<strong>{formatNumber(dashboard.onlineVisitors)}</strong>
							<small>最近 90 秒活跃 IP</small>
						</article>
						<article class="metric-card">
							<span>今日 PV</span>
							<strong>{formatNumber(dashboard.todayPageViews)}</strong>
							<small>文章详情访问次数</small>
						</article>
						<article class="metric-card">
							<span>今日 UV</span>
							<strong>{formatNumber(dashboard.todayUniqueVisitors)}</strong>
							<small>按每日 IP 摘要去重</small>
						</article>
						<article class="metric-card">
							<span>新增阅读</span>
							<strong>{formatNumber(dashboard.todayNewReadCount)}</strong>
							<small>最近事件：{lastDashboardReason}</small>
						</article>
					</div>

					<aside class="side-stat-stack">
						<article class="stat-card">
							<p class="eyebrow">Site Stats</p>
							<h2>站点统计</h2>
							<div><span>文章</span><strong>{formatNumber(meta.total)}</strong></div>
							<div><span>分类</span><strong>{formatNumber(categoryCount)}</strong></div>
							<div><span>标签</span><strong>{formatNumber(tagCount)}</strong></div>
							<div><span>当前页字数</span><strong>{formatNumber(totalWords)}</strong></div>
						</article>
						<article class="stat-card calendar-card">
							<p class="eyebrow">Today</p>
							<h2>2026 年 4 月</h2>
							<div class="calendar-grid">
								<span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span>
								<span></span><span></span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span>
								<span>6</span><span>7</span><span>8</span><span>9</span><span>10</span><span>11</span><span>12</span>
								<span>13</span><span>14</span><span>15</span><span>16</span><span>17</span><span>18</span><span>19</span>
								<span>20</span><span>21</span><span>22</span><span>23</span><span>24</span><strong>25</strong><span>26</span>
							</div>
						</article>
					</aside>
				</section>

				<section class="panel-grid">
					<article class="glass-panel hot-panel" id="hot">
						<div class="panel-heading">
							<div>
								<p class="eyebrow">Top 5</p>
								<h2>今日热门文章</h2>
							</div>
							<span>{dashboard.generatedAt ? formatDate(dashboard.generatedAt) : "等待数据"}</span>
						</div>

						{#if dashboard.hotArticles.length === 0}
							<div class="empty-state">
								<strong>暂无热门数据</strong>
								<p>点击文章列表里的“模拟阅读”即可触发 PV/UV 与热门榜刷新。</p>
							</div>
						{:else}
							<div class="hot-list">
								{#each dashboard.hotArticles as article, index}
									<div class="hot-item">
										<span>{index + 1}</span>
										<div>
											<strong>{article.title}</strong>
											<small>/{article.slug}</small>
										</div>
										<b>{formatNumber(article.todayViewCount)}</b>
									</div>
								{/each}
							</div>
						{/if}
					</article>

					<article class="glass-panel article-health">
						<div class="panel-heading">
							<div>
								<p class="eyebrow">Content</p>
								<h2>内容状态</h2>
							</div>
						</div>
						<div class="status-split">
							<div>
								<span>当前页已发布</span>
								<strong>{publishedCount}</strong>
							</div>
							<div>
								<span>当前页草稿</span>
								<strong>{draftCount}</strong>
							</div>
						</div>
						<p>
							这里管理在线数据库文章；现有 Markdown 文章仍由 Git 构建发布。
						</p>
					</article>
				</section>

				<section class="glass-panel article-panel" id="articles">
					<div class="panel-heading article-heading">
						<div>
							<p class="eyebrow">Article CRUD</p>
							<h2>文章管理</h2>
						</div>
						<form class="filter-form" onsubmit={applyFilters}>
							<input
								placeholder="搜索标题或摘要"
								bind:value={filters.keyword}
							/>
							<select bind:value={filters.status}>
								<option value="ALL">全部状态</option>
								<option value="PUBLISHED">已发布</option>
								<option value="DRAFT">草稿</option>
							</select>
							<button type="submit">筛选</button>
							<button type="button" class="ghost" onclick={resetFilters}>重置</button>
						</form>
					</div>

					{#if articlesLoading}
						<div class="table-skeleton">
							<span></span><span></span><span></span>
						</div>
					{:else if articles.length === 0}
						<div class="empty-state">
							<strong>还没有文章</strong>
							<p>创建第一篇文章后，这里会展示标题、状态、阅读量和操作入口。</p>
							<button class="primary-action compact" type="button" onclick={openCreateEditor}>
								新建文章
							</button>
						</div>
					{:else}
						<div class="article-list">
							{#each articles as article}
								<article class="article-row">
									<div class="article-main">
										<div class="article-title-line">
											<span class:published={article.status === "PUBLISHED"} class="status-badge">
												{statusLabel(article.status)}
											</span>
											<h3>{article.title}</h3>
										</div>
										<p>{article.summary}</p>
										<div class="article-meta">
											<span>/{article.slug}</span>
											<span>{article.category ?? "未分类"}</span>
											<span>{formatNumber(article.viewCount)} views</span>
											<span>{formatDate(article.publishedAt ?? article.updatedAt)}</span>
										</div>
										{#if article.tags.length > 0}
											<div class="tag-list">
												{#each article.tags as tag}
													<span>{tag}</span>
												{/each}
											</div>
										{/if}
									</div>

									<div class="row-actions">
										<button type="button" onclick={() => simulateArticleView(article)} disabled={previewingArticleId === article.id}>
											{previewingArticleId === article.id ? "触发中" : "模拟阅读"}
										</button>
										<button type="button" onclick={() => toggleArticleStatus(article)}>
											{article.status === "PUBLISHED" ? "转草稿" : "发布"}
										</button>
										<button type="button" onclick={() => openEditEditor(article)}>编辑</button>
										<button
											type="button"
											class="danger"
											onclick={() => removeArticle(article)}
											disabled={deletingArticleId === article.id}
										>
											{deletingArticleId === article.id ? "删除中" : "删除"}
										</button>
									</div>
								</article>
							{/each}
						</div>
					{/if}

					<div class="pagination">
						<span>第 {meta.page} / {meta.totalPages} 页，共 {formatNumber(meta.total)} 篇</span>
						<div>
							<button type="button" disabled={!hasPreviousPage} onclick={() => loadArticles(meta.page - 1)}>
								上一页
							</button>
							<button type="button" disabled={!hasNextPage} onclick={() => loadArticles(meta.page + 1)}>
								下一页
							</button>
						</div>
					</div>
				</section>

				<section class="glass-panel feedback-panel" id="feedback">
					<div class="panel-heading article-heading">
						<div>
							<p class="eyebrow">Feedback Review</p>
							<h2>留言审核</h2>
						</div>
						<div class="feedback-filter">
							{#each feedbackStatusOptions as status}
								<button
									type="button"
									class:active={feedbackStatusFilter === status}
									onclick={() => void changeFeedbackFilter(status)}
								>
									{feedbackStatusLabel(status)}
								</button>
							{/each}
							<button type="button" onclick={() => void loadFeedbackMessages()}>
								刷新
							</button>
						</div>
					</div>

					{#if feedbackLoading}
						<div class="table-skeleton">
							<span></span><span></span>
						</div>
					{:else if feedbackMessages.length === 0}
						<div class="empty-state">
							<strong>暂无留言</strong>
							<p>普通用户在客户端后台提交留言后，会先进入待审核队列；通过后才会出现在留言弹幕墙。</p>
						</div>
					{:else}
						<div class="feedback-list">
							{#each feedbackMessages as message}
								<article class="feedback-row">
									<div class="feedback-dot" style={`--message-color:${message.color}`}></div>
									<div class="feedback-main">
										<div class="feedback-line">
											<strong>{message.text}</strong>
											<span>{feedbackStatusLabel(message.status)}</span>
										</div>
										<p>{message.author.username} · {message.author.email} · {formatDate(message.createdAt)}</p>
									</div>
									<div class="row-actions">
										<button
											type="button"
											disabled={message.status === "APPROVED" || moderatingFeedbackId === message.id}
											onclick={() => void moderateFeedback(message, "APPROVED")}
										>
											通过
										</button>
										<button
											type="button"
											class="danger"
											disabled={message.status === "REJECTED" || moderatingFeedbackId === message.id}
											onclick={() => void moderateFeedback(message, "REJECTED")}
										>
											拒绝
										</button>
									</div>
								</article>
							{/each}
						</div>
					{/if}
				</section>
			</div>
		</section>
	{/if}

	{#if editorOpen}
		<div class="modal-backdrop" role="presentation" onclick={closeEditor}>
			<form class="editor-modal" onsubmit={submitArticle} onclick={(event) => event.stopPropagation()}>
				<div class="modal-heading">
					<div>
						<p class="eyebrow">{editorMode === "create" ? "Create" : "Edit"}</p>
						<h2>{editorMode === "create" ? "新建文章" : "编辑文章"}</h2>
					</div>
					<button type="button" onclick={closeEditor} aria-label="关闭编辑器">×</button>
				</div>

				<div class="editor-grid">
					<label>
						<span>标题</span>
						<input bind:value={articleForm.title} required maxlength="255" />
					</label>
					<label>
						<span>Slug</span>
						<input bind:value={articleForm.slug} placeholder="留空则自动生成" />
					</label>
					<label>
						<span>分类</span>
						<input bind:value={articleForm.category} placeholder="Backend" />
					</label>
					<label>
						<span>标签</span>
						<input bind:value={articleForm.tagsText} placeholder="nestjs, redis, prisma" />
					</label>
					<label>
						<span>封面图</span>
						<input bind:value={articleForm.coverImage} placeholder="/images/cover.webp" />
					</label>
					<label>
						<span>状态</span>
						<select bind:value={articleForm.status}>
							<option value="DRAFT">草稿</option>
							<option value="PUBLISHED">已发布</option>
						</select>
					</label>
					<label>
						<span>发布时间</span>
						<input type="datetime-local" bind:value={articleForm.publishedAt} />
					</label>
				</div>

				<label>
					<span>摘要</span>
					<textarea rows="3" bind:value={articleForm.summary} required maxlength="500"></textarea>
				</label>

				<label>
					<span>Markdown 内容</span>
					<textarea class="content-editor" bind:value={articleForm.content} required></textarea>
				</label>

				<div class="modal-actions">
					<button type="button" onclick={closeEditor}>取消</button>
					<button class="primary-action compact" type="submit" disabled={!canSubmitArticle() || savingArticle}>
						{savingArticle ? "保存中..." : "保存文章"}
					</button>
				</div>
			</form>
		</div>
	{/if}

	{#if toast}
		<div class="toast">{toast}</div>
	{/if}
</main>

<style>
	:global(.admin-page-shell *) {
		box-sizing: border-box;
	}

	button,
	input,
	select,
	textarea {
		font: inherit;
	}

	button {
		border: 0;
		cursor: pointer;
	}

	button:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}

	input,
	select,
	textarea {
		width: 100%;
		border: 1px solid var(--admin-border);
		border-radius: 1rem;
		background: var(--admin-subtle-bg);
		color: var(--admin-text-strong);
		padding: 0.85rem 1rem;
		outline: none;
		transition:
			border-color 180ms ease,
			background 180ms ease,
			box-shadow 180ms ease;
	}

	input:focus,
	select:focus,
	textarea:focus {
		border-color: var(--primary);
		background: var(--admin-elevated-bg);
		box-shadow: 0 0 0 4px var(--admin-primary-soft);
	}

	option {
		color: var(--admin-text-strong);
		background: var(--card-bg);
	}

	label {
		display: grid;
		gap: 0.45rem;
		color: var(--admin-muted-strong);
		font-size: 0.85rem;
	}

	.admin-shell {
		--admin-text: rgba(0, 0, 0, 0.9);
		--admin-text-strong: rgba(0, 0, 0, 0.96);
		--admin-muted: rgba(0, 0, 0, 0.66);
		--admin-muted-strong: rgba(0, 0, 0, 0.75);
		--admin-muted-soft: rgba(0, 0, 0, 0.52);
		--admin-border: var(--line-divider);
		--admin-panel-bg: var(--card-bg-transparent);
		--admin-button-bg: var(--btn-regular-bg);
		--admin-button-bg-hover: var(--btn-regular-bg-hover);
		--admin-elevated-bg: rgba(255, 255, 255, 0.38);
		--admin-subtle-bg: rgba(0, 0, 0, 0.035);
		--admin-primary-soft: color-mix(in oklch, var(--primary) 18%, transparent);
		position: relative;
		width: 100%;
		color: var(--admin-text);
		font-family: "萝莉体 第二版", "Roboto", "Noto Sans SC", ui-rounded, sans-serif;
	}

	:global(:root.dark) .admin-shell {
		--admin-text: rgba(255, 255, 255, 0.9);
		--admin-text-strong: rgba(255, 255, 255, 0.96);
		--admin-muted: rgba(255, 255, 255, 0.66);
		--admin-muted-strong: rgba(255, 255, 255, 0.75);
		--admin-muted-soft: rgba(255, 255, 255, 0.52);
		--admin-elevated-bg: rgba(0, 0, 0, 0.16);
		--admin-subtle-bg: rgba(255, 255, 255, 0.055);
	}

	.ambient {
		position: absolute;
		z-index: 0;
		border-radius: 999px;
		filter: blur(22px);
		opacity: 0.65;
		pointer-events: none;
	}

	.ambient-one {
		top: -10rem;
		right: -7rem;
		width: 26rem;
		height: 26rem;
		background: var(--admin-primary-soft);
	}

	.ambient-two {
		bottom: -9rem;
		left: 12%;
		width: 24rem;
		height: 24rem;
		background: color-mix(in oklch, var(--primary) 12%, transparent);
	}

	.boot-card,
	.portal-layout,
	.workspace {
		position: relative;
		z-index: 1;
	}

	.boot-card {
		min-height: 26rem;
		display: grid;
		place-items: center;
		align-content: center;
		gap: 1rem;
		color: var(--admin-muted-strong);
	}

	.loader {
		width: 3rem;
		height: 3rem;
		border-radius: 999px;
		border: 3px solid var(--admin-border);
		border-top-color: var(--primary);
		animation: spin 850ms linear infinite;
	}

	.portal-layout {
		display: grid;
		grid-template-columns: minmax(0, 1.08fr) minmax(24rem, 0.62fr);
		gap: clamp(1rem, 2vw, 1.5rem);
		min-height: min(46rem, calc(100vh - 8rem));
		align-items: stretch;
	}

	.welcome-panel,
	.auth-card,
	.glass-panel,
	.sidebar,
	.metric-card,
	.stat-card,
	.editor-modal,
	.boot-card {
		border: 1px solid var(--admin-border);
		background: var(--admin-panel-bg);
		box-shadow: 0 18px 45px rgba(0, 0, 0, 0.12);
		backdrop-filter: blur(18px);
	}

	.welcome-panel,
	.auth-card {
		border-radius: 2rem;
		padding: clamp(1.5rem, 4vw, 3.5rem);
	}

	.welcome-panel {
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		overflow: hidden;
	}

	.login-visual-panel {
		gap: clamp(1rem, 2vw, 1.5rem);
		background:
			linear-gradient(145deg, rgba(255, 255, 255, 0.08), rgba(0, 0, 0, 0.05)),
			var(--admin-panel-bg);
	}

	.login-mascot-showcase {
		display: grid;
		place-items: center;
		width: 100%;
		min-height: clamp(18rem, 34vw, 27rem);
		border-radius: 1.8rem;
		background:
			radial-gradient(circle at 80% 10%, rgba(255, 255, 255, 0.14), transparent 24%),
			linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(0, 0, 0, 0.08));
		padding: clamp(0.6rem, 2vw, 1.25rem);
	}

	.welcome-panel::after {
		content: "";
		width: 24rem;
		height: 24rem;
		align-self: flex-end;
		margin: 2rem -7rem -8rem 0;
		border-radius: 38% 62% 51% 49%;
		background:
			linear-gradient(135deg, color-mix(in oklch, var(--primary) 58%, transparent), color-mix(in oklch, var(--primary) 12%, transparent)),
			radial-gradient(circle, rgba(255, 255, 255, 0.26), transparent 60%);
		animation: float 8s ease-in-out infinite;
	}

	.login-visual-panel::after {
		display: none;
	}

	.eyebrow {
		margin: 0 0 0.65rem;
		color: var(--primary);
		font-size: 0.72rem;
		font-weight: 800;
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}

	h1,
	h2,
	h3,
	p {
		margin: 0;
	}

	h1 {
		max-width: 48rem;
		font-size: 3.4rem;
		line-height: 1.05;
		letter-spacing: 0;
	}

	h2 {
		font-size: 1.85rem;
		letter-spacing: 0;
	}

	h3 {
		font-size: 1.05rem;
	}

	.brand-copy {
		max-width: 42rem;
		margin-top: 1.25rem;
		color: var(--admin-muted-strong);
		font-size: 1.08rem;
		line-height: 1.8;
	}

	.auth-card {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		justify-content: center;
		justify-self: center;
		width: min(100%, 34rem);
	}

	.auth-mascot-inline {
		display: none;
	}

	.auth-tabs {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.45rem;
		border-radius: 999px;
		background: var(--admin-subtle-bg);
		padding: 0.35rem;
	}

	.auth-tabs button {
		border-radius: 999px;
		background: transparent;
		color: var(--admin-muted);
		padding: 0.75rem 1rem;
		font-weight: 800;
	}

	.auth-tabs button.active {
		background: var(--admin-primary-soft);
		color: var(--primary);
	}

	.auth-form {
		display: grid;
		gap: 1rem;
	}

	.auth-panel-shell {
		position: relative;
		min-height: max(var(--auth-panel-height, 0px), 20rem);
		overflow: hidden;
		transition: min-height 500ms cubic-bezier(0.22, 1, 0.36, 1);
	}

	.auth-panel {
		position: absolute;
		inset: 0;
		width: 100%;
		opacity: 0;
		pointer-events: none;
		transform: translate3d(1.35rem, 0, 0) scale(0.985);
		transition:
			opacity 360ms ease,
			transform 500ms cubic-bezier(0.22, 1, 0.36, 1);
		will-change: opacity, transform;
	}

	.auth-panel.active {
		opacity: 1;
		pointer-events: auto;
		transform: translate3d(0, 0, 0) scale(1);
	}

	.auth-panel:not(.active) {
		transform: translate3d(-1.35rem, 0, 0) scale(0.985);
	}

	.auth-form p {
		color: var(--admin-muted);
		line-height: 1.65;
	}

	.password-control {
		position: relative;
	}

	.password-control input {
		padding-right: 4.9rem;
	}

	.password-control button {
		position: absolute;
		top: 50%;
		right: 0.45rem;
		border-radius: 999px;
		background: var(--admin-button-bg);
		color: var(--admin-muted-strong);
		padding: 0.45rem 0.65rem;
		font-size: 0.78rem;
		font-weight: 800;
		transform: translateY(-50%);
	}

	.password-control button:hover {
		background: var(--admin-button-bg-hover);
		color: var(--primary);
	}

	.primary-action {
		border-radius: 999px;
		background: linear-gradient(135deg, var(--primary), color-mix(in oklch, var(--primary) 70%, white));
		color: var(--deep-text);
		font-weight: 900;
		padding: 0.95rem 1.25rem;
		box-shadow: 0 14px 34px color-mix(in oklch, var(--primary) 22%, transparent);
		transition:
			transform 180ms ease,
			box-shadow 180ms ease;
	}

	.primary-action:hover {
		transform: translateY(-1px);
		box-shadow: 0 18px 42px color-mix(in oklch, var(--primary) 30%, transparent);
	}

	.primary-action.compact {
		padding: 0.75rem 1rem;
	}

	.alert {
		border-radius: 1rem;
		padding: 0.85rem 1rem;
	}

	.alert.error {
		border: 1px solid rgba(255, 145, 122, 0.28);
		background: rgba(255, 92, 92, 0.12);
		color: #c7432c;
	}

	.alert.hint {
		border: 1px solid color-mix(in oklch, var(--primary) 18%, transparent);
		background: color-mix(in oklch, var(--primary) 8%, transparent);
		color: var(--text-50);
	}

	:global(:root.dark) .alert.error {
		color: #ffd5ca;
	}

	.workspace {
		display: grid;
		grid-template-columns: minmax(14.5rem, 17rem) minmax(0, 1fr);
		gap: clamp(0.8rem, 1.5vw, 1.15rem);
		max-width: 106rem;
		margin: 0 auto;
	}

	.sidebar {
		position: sticky;
		top: 1.25rem;
		display: flex;
		flex-direction: column;
		height: calc(100vh - 2.5rem);
		border-radius: 1.7rem;
		padding: 1rem;
	}

	.logo-block {
		display: flex;
		align-items: center;
		gap: 0.85rem;
		padding: 0.65rem;
	}

	.logo-avatar {
		display: grid;
		place-items: center;
		flex: 0 0 auto;
		width: 3.25rem;
		height: 3.25rem;
		overflow: hidden;
		border: 2px solid color-mix(in oklch, var(--primary) 38%, transparent);
		border-radius: 999px;
		background:
			linear-gradient(135deg, var(--primary), color-mix(in oklch, var(--primary) 72%, white)),
			var(--admin-primary-soft);
		box-shadow:
			0 0 0 4px var(--admin-primary-soft),
			0 14px 32px color-mix(in oklch, var(--primary) 20%, transparent);
		color: #201118;
		font-size: 1.5rem;
		font-weight: 900;
	}

	.logo-avatar img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
		object-position: center;
	}

	.logo-avatar span {
		display: grid;
		place-items: center;
		width: 100%;
		height: 100%;
	}

	.logo-block strong,
	.logo-block span {
		display: block;
	}

	.logo-block span,
	.operator-card span,
	.operator-card small,
	.article-meta,
	.metric-card small {
		color: var(--admin-muted-soft);
	}

	nav {
		display: grid;
		gap: 0.55rem;
		margin-top: 1.2rem;
	}

	nav a,
	.return-blog-link,
	.operator-card button,
	.topbar-actions button,
	.filter-form button,
	.feedback-filter button,
	.row-actions button,
	.pagination button,
	.modal-actions button {
		border-radius: 0.95rem;
		background: var(--admin-button-bg);
		color: var(--admin-text);
		padding: 0.75rem 0.9rem;
		text-decoration: none;
		transition:
			background 180ms ease,
			color 180ms ease,
			transform 180ms ease;
	}

	nav a:hover,
	.return-blog-link:hover,
	.operator-card button:hover,
	.topbar-actions button:hover,
	.filter-form button:hover,
	.feedback-filter button:hover,
	.row-actions button:hover,
	.pagination button:hover,
	.modal-actions button:hover {
		background: var(--admin-button-bg-hover);
		color: var(--admin-text-strong);
		transform: translateY(-1px);
	}

	.sidebar-footer {
		display: grid;
		gap: 0.75rem;
		margin-top: auto;
	}

	.return-blog-link {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.45rem;
		border: 1px solid transparent;
		font-weight: 800;
	}

	.return-blog-link:hover {
		border-color: color-mix(in oklch, var(--primary) 28%, transparent);
		color: var(--primary);
	}

	.operator-card {
		display: grid;
		gap: 0.35rem;
		padding: 1rem;
		border-radius: 1.25rem;
		background: var(--admin-subtle-bg);
	}

	.operator-card button {
		margin-top: 0.6rem;
	}

	.content {
		display: grid;
		gap: 1rem;
		min-width: 0;
	}

	.topbar {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		align-items: center;
		padding: 0.4rem 0.2rem 0.8rem;
	}

	.topbar h1 {
		font-size: 2.55rem;
	}

	.topbar-actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 0.6rem;
	}

	.socket-pill {
		display: inline-flex;
		align-items: center;
		border: 1px solid var(--admin-border);
		border-radius: 999px;
		background: var(--admin-subtle-bg);
		color: var(--admin-muted);
		padding: 0.72rem 0.9rem;
	}

	.socket-pill.connected {
		border-color: color-mix(in oklch, var(--primary) 42%, transparent);
		background: var(--admin-primary-soft);
		color: var(--primary);
	}

	.dashboard-alert {
		margin-bottom: 0.25rem;
	}

	.dashboard-map {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(16rem, 22rem);
		gap: 1rem;
		align-items: start;
	}

	.metric-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
		gap: 1rem;
	}

	.metric-card {
		position: relative;
		overflow: hidden;
		min-height: 12rem;
		border-radius: 1.5rem;
		padding: 1.2rem;
	}

	.metric-card::after {
		content: "";
		position: absolute;
		right: -2.2rem;
		bottom: -2.4rem;
		width: 7rem;
		height: 7rem;
		border-radius: 999px;
		background: var(--admin-primary-soft);
	}

	.metric-card.featured {
		background: linear-gradient(135deg, color-mix(in oklch, var(--primary) 24%, transparent), var(--admin-panel-bg));
	}

	.metric-card span,
	.metric-card small {
		display: block;
	}

	.metric-card strong {
		display: block;
		margin: 0.7rem 0;
		font-size: 2.75rem;
		letter-spacing: 0;
	}

	.side-stat-stack {
		display: grid;
		gap: 1rem;
	}

	.stat-card {
		border-radius: 1.5rem;
		padding: 1.2rem;
	}

	.stat-card div:not(.calendar-grid) {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		margin-top: 1rem;
		color: var(--admin-muted-strong);
	}

	.stat-card strong {
		color: var(--admin-text-strong);
	}

	.calendar-grid {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 0.55rem;
		margin-top: 1rem;
		text-align: center;
		color: var(--admin-muted-strong);
	}

	.calendar-grid strong {
		border-radius: 0.65rem;
		background: var(--admin-primary-soft);
		color: var(--primary);
		padding: 0.25rem;
	}

	.panel-grid {
		display: grid;
		grid-template-columns: minmax(0, 1.55fr) minmax(18rem, 0.7fr);
		gap: 1rem;
	}

	.glass-panel {
		border-radius: 1.5rem;
		padding: 1.2rem;
	}

	.panel-heading {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		align-items: flex-start;
		margin-bottom: 1rem;
	}

	.panel-heading > span {
		color: var(--admin-muted-soft);
		font-size: 0.85rem;
	}

	.hot-list {
		display: grid;
		gap: 0.6rem;
	}

	.hot-item {
		display: grid;
		grid-template-columns: 2.5rem minmax(0, 1fr) auto;
		gap: 0.8rem;
		align-items: center;
		border-radius: 1rem;
		background: var(--admin-subtle-bg);
		padding: 0.85rem;
	}

	.hot-item > span {
		display: grid;
		place-items: center;
		width: 2.1rem;
		height: 2.1rem;
		border-radius: 0.75rem;
		background: var(--admin-primary-soft);
		color: var(--primary);
	}

	.hot-item strong,
	.hot-item small {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.hot-item small {
		color: var(--admin-muted-soft);
	}

	.status-split {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.8rem;
		margin-bottom: 1rem;
	}

	.status-split div {
		border-radius: 1rem;
		background: var(--admin-subtle-bg);
		padding: 1rem;
	}

	.status-split span,
	.status-split strong {
		display: block;
	}

	.status-split strong {
		margin-top: 0.3rem;
		font-size: 2.1rem;
	}

	.article-health p {
		color: var(--admin-muted);
		line-height: 1.7;
	}

	.article-heading {
		align-items: center;
	}

	.filter-form {
		display: grid;
		grid-template-columns: minmax(12rem, 1fr) 9rem auto auto;
		gap: 0.55rem;
		align-items: center;
	}

	.filter-form input,
	.filter-form select {
		padding: 0.72rem 0.85rem;
	}

	.filter-form .ghost,
	.row-actions .danger {
		background: var(--admin-subtle-bg);
	}

	.article-list {
		display: grid;
		gap: 0.8rem;
	}

	.feedback-filter,
	.feedback-list {
		display: grid;
		gap: 0.6rem;
	}

	.feedback-filter {
		grid-template-columns: repeat(5, auto);
		align-items: center;
	}

	.feedback-filter button {
		padding: 0.68rem 0.82rem;
	}

	.feedback-filter button.active {
		background: var(--admin-primary-soft);
		color: var(--primary);
	}

	.feedback-row {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		gap: 0.85rem;
		align-items: center;
		border: 1px solid var(--admin-border);
		border-radius: 1.2rem;
		background: var(--admin-subtle-bg);
		padding: 0.95rem;
	}

	.feedback-dot {
		width: 1.1rem;
		height: 1.1rem;
		border-radius: 999px;
		background: var(--message-color);
		box-shadow: 0 0 0 5px color-mix(in oklch, var(--message-color) 18%, transparent);
	}

	.feedback-main {
		min-width: 0;
	}

	.feedback-line {
		display: flex;
		flex-wrap: wrap;
		gap: 0.55rem;
		align-items: center;
	}

	.feedback-line strong {
		color: var(--admin-text-strong);
	}

	.feedback-line span {
		border-radius: 999px;
		background: var(--admin-button-bg);
		color: var(--admin-muted-strong);
		padding: 0.22rem 0.55rem;
		font-size: 0.76rem;
	}

	.feedback-main p {
		margin-top: 0.35rem;
		color: var(--admin-muted);
		font-size: 0.86rem;
	}

	.article-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 1rem;
		align-items: center;
		border: 1px solid var(--admin-border);
		border-radius: 1.25rem;
		background: var(--admin-subtle-bg);
		padding: 1rem;
		transition:
			border-color 180ms ease,
			background 180ms ease,
			transform 180ms ease;
	}

	.article-row:hover {
		border-color: color-mix(in oklch, var(--primary) 28%, transparent);
		background: var(--admin-elevated-bg);
		transform: translateY(-1px);
	}

	.article-main {
		min-width: 0;
	}

	.article-title-line {
		display: flex;
		gap: 0.7rem;
		align-items: center;
		min-width: 0;
	}

	.article-title-line h3 {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.status-badge {
		flex: 0 0 auto;
		border-radius: 999px;
		background: var(--admin-button-bg);
		color: var(--admin-muted-strong);
		padding: 0.28rem 0.58rem;
		font-size: 0.75rem;
	}

	.status-badge.published {
		background: var(--admin-primary-soft);
		color: var(--primary);
	}

	.article-main p {
		display: -webkit-box;
		margin-top: 0.5rem;
		overflow: hidden;
		color: var(--admin-muted);
		line-height: 1.6;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
	}

	.article-meta,
	.tag-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem 0.75rem;
		margin-top: 0.7rem;
		font-size: 0.82rem;
	}

	.tag-list span {
		border-radius: 999px;
		background: var(--admin-button-bg);
		color: var(--admin-muted-strong);
		padding: 0.28rem 0.55rem;
	}

	.row-actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 0.45rem;
		max-width: 20rem;
	}

	.row-actions button {
		padding: 0.65rem 0.75rem;
		font-size: 0.85rem;
	}

	.row-actions .danger:hover {
		background: rgba(255, 92, 92, 0.18);
		color: #c7432c;
	}

	:global(:root.dark) .row-actions .danger:hover {
		color: #ffd5ca;
	}

	.pagination {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		align-items: center;
		margin-top: 1rem;
		color: var(--admin-muted);
	}

	.pagination div {
		display: flex;
		gap: 0.5rem;
	}

	.empty-state,
	.table-skeleton {
		border: 1px dashed var(--admin-border);
		border-radius: 1.2rem;
		background: var(--admin-subtle-bg);
		padding: 1.2rem;
		text-align: center;
		color: var(--admin-muted);
	}

	.empty-state strong {
		display: block;
		color: var(--admin-text-strong);
	}

	.empty-state p {
		margin: 0.45rem auto 0;
		max-width: 30rem;
		line-height: 1.7;
	}

	.empty-state button {
		margin-top: 1rem;
	}

	.table-skeleton {
		display: grid;
		gap: 0.7rem;
	}

	.table-skeleton span {
		height: 4rem;
		border-radius: 1rem;
		background: linear-gradient(90deg, var(--admin-subtle-bg), var(--admin-elevated-bg), var(--admin-subtle-bg));
		background-size: 220% 100%;
		animation: shimmer 1.3s linear infinite;
	}

	.modal-backdrop {
		position: fixed;
		inset: 0;
		z-index: 20;
		display: grid;
		place-items: center;
		overflow-y: auto;
		background: rgba(0, 0, 0, 0.52);
		padding: 1rem;
	}

	.editor-modal {
		display: grid;
		gap: 1rem;
		width: min(62rem, 100%);
		max-height: calc(100vh - 2rem);
		overflow: auto;
		border-radius: 1.6rem;
		padding: 1.2rem;
	}

	.modal-heading,
	.modal-actions {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		align-items: center;
	}

	.modal-heading button {
		width: 2.5rem;
		height: 2.5rem;
		border-radius: 999px;
		background: var(--admin-button-bg);
		color: var(--admin-text);
		font-size: 1.4rem;
	}

	.editor-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.8rem;
	}

	.content-editor {
		min-height: 18rem;
		font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Consolas, monospace;
		line-height: 1.65;
	}

	.modal-actions {
		justify-content: flex-end;
	}

	.toast {
		position: fixed;
		right: 1.25rem;
		bottom: 1.25rem;
		z-index: 40;
		border: 1px solid color-mix(in oklch, var(--primary) 32%, transparent);
		border-radius: 999px;
		background: var(--float-panel-bg);
		box-shadow: 0 18px 52px rgba(0, 0, 0, 0.18);
		color: var(--admin-text-strong);
		padding: 0.85rem 1rem;
		backdrop-filter: blur(18px);
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@keyframes float {
		50% {
			transform: translate3d(-1.5rem, -1rem, 0) rotate(8deg);
		}
	}

	@keyframes shimmer {
		to {
			background-position: -220% 0;
		}
	}

	@media (max-width: 1320px) {
		.dashboard-map,
		.workspace {
			grid-template-columns: 1fr;
		}

		.sidebar {
			position: relative;
			top: 0;
			height: auto;
		}

		.sidebar,
		nav,
		.sidebar-footer,
		.operator-card {
			display: flex;
			flex-wrap: wrap;
			align-items: center;
		}

		.sidebar-footer {
			margin-top: 0;
			margin-left: auto;
			gap: 0.75rem;
		}

		.operator-card {
			margin-left: 0;
		}

		.side-stat-stack {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.topbar h1 {
			font-size: clamp(2rem, 5vw, 2.55rem);
		}

		.metric-card {
			min-height: 10rem;
		}
	}

	@media (max-width: 980px) {
		.portal-layout,
		.panel-grid,
		.article-row {
			grid-template-columns: 1fr;
		}

		.login-mascot-showcase {
			display: none;
		}

		.auth-mascot-inline {
			display: grid;
			place-items: center;
		}

		.metric-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.filter-form {
			grid-template-columns: 1fr 1fr;
		}

		.feedback-filter,
		.feedback-row {
			grid-template-columns: 1fr;
		}

		.row-actions {
			justify-content: flex-start;
			max-width: none;
		}
	}

	@media (max-width: 640px) {
		.admin-shell {
			padding: 0.75rem;
		}

		.portal-layout {
			min-height: auto;
		}

		.login-mascot-showcase {
			min-height: 14rem;
			padding: 0.5rem;
		}

		h1,
		.topbar h1 {
			font-size: 2rem;
		}

		h2 {
			font-size: 1.35rem;
		}

		.metric-grid,
		.side-stat-stack,
		.editor-grid,
		.filter-form {
			grid-template-columns: 1fr;
		}

		.welcome-panel,
		.auth-card,
		.glass-panel,
		.sidebar,
		.metric-card,
		.stat-card {
			border-radius: 1.25rem;
		}

		.topbar,
		.panel-heading,
		.pagination,
		.modal-heading,
		.modal-actions {
			align-items: stretch;
			flex-direction: column;
		}

		.topbar-actions,
		.pagination div {
			justify-content: stretch;
		}

		.topbar-actions button,
		.pagination button,
		.row-actions button,
		.sidebar-footer,
		.operator-card {
			width: 100%;
		}

		.article-title-line,
		.feedback-line {
			align-items: flex-start;
			flex-direction: column;
		}

		.metric-card {
			min-height: 8.5rem;
		}
	}
</style>
