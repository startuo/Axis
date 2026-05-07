<script lang="ts">
	import { onMount } from "svelte";
	import {
		listBackendArticles,
		type BackendArticle,
	} from "./backend-api";

	let articles: BackendArticle[] = [];
	let loading = true;
	let error = "";

	onMount(() => {
		void loadArticles();
	});

	async function loadArticles() {
		loading = true;
		error = "";

		try {
			const result = await listBackendArticles({ page: 1, pageSize: 6 });
			articles = result.items;
		} catch (err) {
			error = err instanceof Error ? err.message : "后端文章加载失败。";
		} finally {
			loading = false;
		}
	}

	function formatDate(value: string | null) {
		if (!value) {
			return "未发布";
		}

		return new Intl.DateTimeFormat("zh-CN", {
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
		}).format(new Date(value));
	}

	function formatNumber(value: number) {
		return new Intl.NumberFormat("zh-CN").format(value);
	}

	function articleUrl(slug: string) {
		return `/backend-posts/?slug=${encodeURIComponent(slug)}`;
	}
</script>

{#if loading}
	<section class="card-base backend-feed backend-feed-state onload-animation">
		<div class="feed-loader"></div>
		<div>
			<p class="eyebrow">Backend Channel</p>
			<h2>正在连接后端文章...</h2>
		</div>
	</section>
{:else if error}
	<section class="card-base backend-feed backend-feed-state onload-animation">
		<div>
			<p class="eyebrow">Backend Channel</p>
			<h2>后端通道暂不可用</h2>
			<p class="muted">{error}</p>
		</div>
		<button type="button" onclick={loadArticles}>重新连接</button>
	</section>
{:else if articles.length > 0}
	<section class="card-base backend-feed onload-animation">
		<div class="feed-heading">
			<div>
				<p class="eyebrow">Backend Channel</p>
				<h2>后端发布文章</h2>
				<p>这里展示 NestJS + PostgreSQL 后端实时发布的内容，阅读详情会同步刷新 PV/UV。</p>
			</div>
			<a class="admin-link" href="/admin">进入 Admin</a>
		</div>

		<div class="feed-grid">
			{#each articles as article}
				<a class="backend-card" href={articleUrl(article.slug)}>
					{#if article.coverImage}
						<img src={article.coverImage} alt={article.title} loading="lazy" />
					{/if}
					<div class="backend-card-body">
						<div class="meta-line">
							<span>{article.category ?? "Backend"}</span>
							<span>{formatDate(article.publishedAt ?? article.createdAt)}</span>
							<span>{formatNumber(article.viewCount)} views</span>
						</div>
						<h3>{article.title}</h3>
						<p>{article.summary}</p>
						{#if article.tags.length > 0}
							<div class="tag-list" aria-label="文章标签">
								{#each article.tags.slice(0, 4) as tag}
									<span># {tag}</span>
								{/each}
							</div>
						{/if}
					</div>
				</a>
			{/each}
		</div>
	</section>
{/if}

<style>
	.backend-feed {
		display: grid;
		gap: 1.15rem;
		margin-bottom: 1rem;
		padding: clamp(1.25rem, 3vw, 2rem);
	}

	.backend-feed-state {
		grid-template-columns: auto minmax(0, 1fr);
		align-items: center;
	}

	.feed-heading {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		align-items: flex-start;
	}

	.feed-heading h2,
	.backend-feed-state h2 {
		margin: 0;
		color: rgba(0, 0, 0, 0.9);
		font-size: 1.8rem;
		letter-spacing: 0;
	}

	:global(:root.dark) .feed-heading h2,
	:global(:root.dark) .backend-feed-state h2 {
		color: rgba(255, 255, 255, 0.9);
	}

	.feed-heading p,
	.muted {
		margin: 0.35rem 0 0;
		color: rgba(0, 0, 0, 0.62);
		line-height: 1.7;
	}

	:global(:root.dark) .feed-heading p,
	:global(:root.dark) .muted {
		color: rgba(255, 255, 255, 0.62);
	}

	.eyebrow {
		margin: 0 0 0.45rem;
		color: var(--primary);
		font-size: 0.72rem;
		font-weight: 800;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	.admin-link,
	.backend-feed-state button {
		flex: 0 0 auto;
		border: 0;
		border-radius: 999px;
		background: var(--btn-regular-bg);
		color: inherit;
		padding: 0.75rem 1rem;
		text-decoration: none;
		cursor: pointer;
		transition:
			background 180ms ease,
			transform 180ms ease;
	}

	.admin-link:hover,
	.backend-feed-state button:hover {
		background: var(--btn-regular-bg-hover);
		transform: translateY(-1px);
	}

	.feed-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 1rem;
	}

	.backend-card {
		display: grid;
		overflow: hidden;
		border: 1px solid var(--line-divider);
		border-radius: calc(var(--radius-large) * 0.9);
		background: var(--card-bg);
		color: inherit;
		text-decoration: none;
		transition:
			border-color 180ms ease,
			transform 180ms ease,
			box-shadow 180ms ease;
	}

	.backend-card:hover {
		border-color: color-mix(in oklch, var(--primary) 42%, transparent);
		box-shadow: 0 16px 36px rgba(0, 0, 0, 0.1);
		transform: translateY(-2px);
	}

	.backend-card img {
		width: 100%;
		height: 10.5rem;
		object-fit: cover;
	}

	.backend-card-body {
		display: grid;
		gap: 0.65rem;
		padding: 1rem;
	}

	.backend-card h3 {
		margin: 0;
		color: rgba(0, 0, 0, 0.9);
		font-size: 1.15rem;
		line-height: 1.35;
	}

	:global(:root.dark) .backend-card h3 {
		color: rgba(255, 255, 255, 0.9);
	}

	.backend-card p {
		display: -webkit-box;
		margin: 0;
		overflow: hidden;
		color: rgba(0, 0, 0, 0.64);
		line-height: 1.65;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
	}

	:global(:root.dark) .backend-card p {
		color: rgba(255, 255, 255, 0.64);
	}

	.meta-line,
	.tag-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem 0.65rem;
		color: rgba(0, 0, 0, 0.52);
		font-size: 0.78rem;
	}

	:global(:root.dark) .meta-line,
	:global(:root.dark) .tag-list {
		color: rgba(255, 255, 255, 0.52);
	}

	.tag-list span {
		border-radius: 999px;
		background: var(--btn-regular-bg);
		padding: 0.25rem 0.5rem;
	}

	.feed-loader {
		width: 2.75rem;
		height: 2.75rem;
		border: 3px solid var(--line-divider);
		border-top-color: var(--primary);
		border-radius: 999px;
		animation: spin 850ms linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (max-width: 1024px) {
		.feed-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 640px) {
		.feed-heading,
		.backend-feed-state {
			grid-template-columns: 1fr;
			flex-direction: column;
		}

		.feed-grid {
			grid-template-columns: 1fr;
		}

		.feed-heading h2,
		.backend-feed-state h2 {
			font-size: 1.45rem;
		}

		.admin-link,
		.backend-feed-state button {
			width: 100%;
			text-align: center;
		}
	}
</style>
