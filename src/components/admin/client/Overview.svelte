<script lang="ts">
	import type { ClientRouteKey } from "../client-routes";

	interface DashboardStat {
		label: string;
		value: number;
		hint: string;
		route: ClientRouteKey;
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

	export let username = "STAR";
	export let stats: DashboardStat[] = [];
	export let favoriteArticles: ArticleCard[] = [];
	export let commentItems: CommentItem[] = [];
	export let historyArticles: ArticleCard[] = [];
	export let onSelectTab: (tab: ClientRouteKey) => void = () => {};

	$: today = new Date();
	$: monthTitle = today.toLocaleDateString("zh-CN", {
		year: "numeric",
		month: "long",
	});
	$: dayLabel = today.toLocaleDateString("zh-CN", {
		weekday: "long",
		month: "2-digit",
		day: "2-digit",
	});
</script>

<section class="client-panel overview-panel" aria-labelledby="client-overview-title">
	<div class="panel-heading">
		<p class="eyebrow">Overview</p>
		<h2 id="client-overview-title">欢迎回来，{username}</h2>
		<p>这里统一承载评论、收藏、阅读历史、个人资料和弹幕留言能力。</p>
	</div>

	<div class="overview-stats" aria-label="账户核心指标">
		{#each stats as stat}
			<button type="button" class="overview-stat" onclick={() => onSelectTab(stat.route)}>
				<span>{stat.label}</span>
				<strong>{stat.value}</strong>
				<small>{stat.hint}</small>
			</button>
		{/each}
	</div>

	<div class="overview-content-grid">
		<div class="overview-main-column">
			<article class="dashboard-widget recent-comments">
				<header>
					<p class="eyebrow">Recent</p>
					<h3>最近评论</h3>
				</header>
				<div class="preview-list">
					{#each commentItems.slice(0, 3) as comment}
						<button type="button" onclick={() => onSelectTab("comments")}>
							<span>{comment.article}</span>
							<strong>{comment.content}</strong>
							<small>{comment.status} · {comment.time}</small>
						</button>
					{/each}
				</div>
			</article>

			<article class="dashboard-widget latest-favorites">
				<header>
					<p class="eyebrow">Library</p>
					<h3>最新收藏</h3>
				</header>
				<div class="favorite-preview-grid">
					{#each favoriteArticles.slice(0, 2) as article}
						<button type="button" onclick={() => onSelectTab("favorites")}>
							<img src={article.cover} alt="" loading="lazy" />
							<span>{article.category}</span>
							<strong>{article.title}</strong>
							<small>{article.time}</small>
						</button>
					{/each}
				</div>
			</article>
		</div>

		<aside class="overview-side-column">
			<article class="dashboard-widget compact-widget">
				<p class="eyebrow">Today</p>
				<h3>{monthTitle}</h3>
				<strong>{dayLabel}</strong>
				<div class="mini-calendar" aria-hidden="true">
					{#each Array.from({ length: 7 }, (_, index) => index + 1) as day}
						<span class:active={day === today.getDay() || (today.getDay() === 0 && day === 7)}>
							{day}
						</span>
					{/each}
				</div>
			</article>

			<article class="dashboard-widget compact-widget">
				<p class="eyebrow">Quick Actions</p>
				<h3>快捷入口</h3>
				<div class="quick-actions">
					<button type="button" onclick={() => onSelectTab("messages")}>发送弹幕</button>
					<button type="button" onclick={() => onSelectTab("profile")}>编辑资料</button>
					<button type="button" onclick={() => onSelectTab("history")}>阅读足迹</button>
				</div>
			</article>

			<article class="dashboard-widget compact-widget">
				<p class="eyebrow">Security</p>
				<h3>账号安全</h3>
				<div class="security-status">
					<span></span>
					<strong>会话有效</strong>
					<small>登录令牌已保存在本地设备。</small>
				</div>
			</article>
		</aside>
	</div>
</section>
