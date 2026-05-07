<script lang="ts">
	import { marked } from "marked";
	import { onMount } from "svelte";
	import {
		getBackendArticle,
		type BackendArticle,
	} from "./backend-api";

	const VISITOR_KEY = "star_blog_visitor_id";

	let article: BackendArticle | null = null;
	let renderedContent = "";
	let loading = true;
	let error = "";
	let slug = "";

	onMount(() => {
		const params = new URLSearchParams(window.location.search);
		slug = params.get("slug") ?? "";
		void loadArticle();
	});

	async function loadArticle() {
		if (!slug) {
			error = "缺少文章 slug。";
			loading = false;
			return;
		}

		loading = true;
		error = "";

		try {
			const result = await getBackendArticle(slug, getVisitorId());
			article = result;
			renderedContent = renderMarkdown(result.content ?? "");
		} catch (err) {
			error = err instanceof Error ? err.message : "后端文章加载失败。";
		} finally {
			loading = false;
		}
	}

	function getVisitorId() {
		const existing = localStorage.getItem(VISITOR_KEY);
		if (existing) {
			return existing;
		}

		const id = `web-${crypto.randomUUID?.() ?? Date.now()}`;
		localStorage.setItem(VISITOR_KEY, id);
		return id;
	}

	function renderMarkdown(content: string) {
		const rawHtml = marked.parse(content, {
			async: false,
			breaks: true,
			gfm: true,
		}) as string;

		return sanitizeGeneratedHtml(rawHtml);
	}

	function sanitizeGeneratedHtml(input: string) {
		const template = document.createElement("template");
		template.innerHTML = input;

		const allowedTags = new Set([
			"A",
			"B",
			"BLOCKQUOTE",
			"BR",
			"CODE",
			"DEL",
			"EM",
			"H1",
			"H2",
			"H3",
			"H4",
			"H5",
			"H6",
			"HR",
			"I",
			"IMG",
			"LI",
			"OL",
			"P",
			"PRE",
			"STRONG",
			"TABLE",
			"TBODY",
			"TD",
			"TH",
			"THEAD",
			"TR",
			"UL",
		]);
		const allowedAttributes = new Set(["href", "src", "alt", "title", "target", "rel"]);

		template.content.querySelectorAll("*").forEach((node) => {
			if (!allowedTags.has(node.tagName)) {
				node.replaceWith(document.createTextNode(node.textContent ?? ""));
				return;
			}

			Array.from(node.attributes).forEach((attribute) => {
				if (!allowedAttributes.has(attribute.name)) {
					node.removeAttribute(attribute.name);
				}
			});

			if (node instanceof HTMLAnchorElement) {
				if (!isAllowedUrl(node.href)) {
					node.removeAttribute("href");
				}
				node.target = "_blank";
				node.rel = "noreferrer";
			}

			if (node instanceof HTMLImageElement && !isAllowedUrl(node.src)) {
				node.removeAttribute("src");
			}
		});

		return template.innerHTML;
	}

	function isAllowedUrl(value: string) {
		if (!value) {
			return false;
		}

		try {
			const url = new URL(value, window.location.origin);
			return ["http:", "https:", "mailto:"].includes(url.protocol);
		} catch {
			return false;
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
			hour: "2-digit",
			minute: "2-digit",
		}).format(new Date(value));
	}

	function formatNumber(value: number) {
		return new Intl.NumberFormat("zh-CN").format(value);
	}
</script>

<svelte:head>
	<title>{article?.title ?? "Backend Article"} | STAR's Blog</title>
</svelte:head>

{#if loading}
	<section class="card-base reader-state onload-animation">
		<div class="reader-loader"></div>
		<p>正在读取后端文章...</p>
	</section>
{:else if error}
	<section class="card-base reader-state onload-animation">
		<div>
			<p class="eyebrow">Backend Channel</p>
			<h1>文章暂不可用</h1>
			<p class="muted">{error}</p>
		</div>
		<a href="/">返回首页</a>
	</section>
{:else if article}
	<article class="card-base backend-reader onload-animation">
		<header class="reader-header">
			<a class="back-link" href="/">返回首页</a>
			<p class="eyebrow">Backend Channel</p>
			<h1>{article.title}</h1>
			<p class="summary">{article.summary}</p>
			<div class="meta-line">
				<span>{article.category ?? "Backend"}</span>
				<span>{formatDate(article.publishedAt ?? article.createdAt)}</span>
				<span>{article.author.username}</span>
				<span>{formatNumber(article.viewCount)} views</span>
			</div>
			{#if article.tags.length > 0}
				<div class="tag-list">
					{#each article.tags as tag}
						<span># {tag}</span>
					{/each}
				</div>
			{/if}
		</header>

		{#if article.coverImage}
			<img class="cover" src={article.coverImage} alt={article.title} />
		{/if}

		<div class="backend-markdown" aria-label="文章内容">
			{@html renderedContent}
		</div>
	</article>
{/if}

<style>
	.reader-state {
		display: grid;
		place-items: center;
		gap: 1rem;
		min-height: 24rem;
		padding: clamp(1.5rem, 4vw, 3rem);
		text-align: center;
	}

	.reader-state h1 {
		margin: 0;
		color: rgba(0, 0, 0, 0.9);
		font-size: 2rem;
	}

	:global(:root.dark) .reader-state h1 {
		color: rgba(255, 255, 255, 0.9);
	}

	.reader-loader {
		width: 3rem;
		height: 3rem;
		border: 3px solid var(--line-divider);
		border-top-color: var(--primary);
		border-radius: 999px;
		animation: spin 850ms linear infinite;
	}

	.reader-state a,
	.back-link {
		display: inline-flex;
		align-items: center;
		width: fit-content;
		border-radius: 999px;
		background: var(--btn-regular-bg);
		color: inherit;
		padding: 0.7rem 1rem;
		text-decoration: none;
		transition:
			background 180ms ease,
			transform 180ms ease;
	}

	.reader-state a:hover,
	.back-link:hover {
		background: var(--btn-regular-bg-hover);
		transform: translateY(-1px);
	}

	.backend-reader {
		display: grid;
		gap: 1.5rem;
		padding: clamp(1.5rem, 4vw, 3rem);
	}

	.reader-header {
		display: grid;
		gap: 0.8rem;
	}

	.eyebrow {
		margin: 0;
		color: var(--primary);
		font-size: 0.72rem;
		font-weight: 800;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	.reader-header h1 {
		margin: 0;
		color: rgba(0, 0, 0, 0.9);
		font-size: 2.6rem;
		line-height: 1.15;
		letter-spacing: 0;
	}

	:global(:root.dark) .reader-header h1 {
		color: rgba(255, 255, 255, 0.9);
	}

	.summary {
		max-width: 46rem;
		margin: 0;
		color: rgba(0, 0, 0, 0.65);
		font-size: 1rem;
		line-height: 1.8;
	}

	:global(:root.dark) .summary {
		color: rgba(255, 255, 255, 0.65);
	}

	.meta-line,
	.tag-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 0.75rem;
		color: rgba(0, 0, 0, 0.55);
		font-size: 0.86rem;
	}

	:global(:root.dark) .meta-line,
	:global(:root.dark) .tag-list {
		color: rgba(255, 255, 255, 0.55);
	}

	.tag-list span {
		border-radius: 999px;
		background: var(--btn-regular-bg);
		padding: 0.28rem 0.58rem;
	}

	.cover {
		width: 100%;
		max-height: 28rem;
		border-radius: calc(var(--radius-large) * 0.8);
		object-fit: cover;
	}

	.backend-markdown {
		color: rgba(0, 0, 0, 0.82);
		font-size: 1rem;
		line-height: 1.9;
	}

	:global(:root.dark) .backend-markdown {
		color: rgba(255, 255, 255, 0.82);
	}

	.backend-markdown :global(h1),
	.backend-markdown :global(h2),
	.backend-markdown :global(h3),
	.backend-markdown :global(h4) {
		margin: 1.6em 0 0.7em;
		color: rgba(0, 0, 0, 0.9);
		line-height: 1.25;
	}

	:global(:root.dark) .backend-markdown :global(h1),
	:global(:root.dark) .backend-markdown :global(h2),
	:global(:root.dark) .backend-markdown :global(h3),
	:global(:root.dark) .backend-markdown :global(h4) {
		color: rgba(255, 255, 255, 0.9);
	}

	.backend-markdown :global(p),
	.backend-markdown :global(ul),
	.backend-markdown :global(ol),
	.backend-markdown :global(blockquote),
	.backend-markdown :global(pre),
	.backend-markdown :global(table) {
		margin: 1em 0;
	}

	.backend-markdown :global(a) {
		color: var(--primary);
		text-decoration: underline;
		text-underline-offset: 0.2em;
	}

	.backend-markdown :global(blockquote) {
		border-left: 4px solid var(--primary);
		border-radius: 0.5rem;
		background: var(--btn-regular-bg);
		padding: 0.75rem 1rem;
	}

	.backend-markdown :global(code) {
		border-radius: 0.35rem;
		background: var(--inline-code-bg);
		color: var(--inline-code-color);
		padding: 0.1rem 0.35rem;
		font-family: "JetBrains Mono Variable", ui-monospace, SFMono-Regular, Consolas, monospace;
	}

	.backend-markdown :global(pre) {
		overflow: auto;
		border-radius: 0.75rem;
		background: var(--codeblock-bg);
		padding: 1rem;
	}

	.backend-markdown :global(pre code) {
		background: transparent;
		padding: 0;
	}

	.backend-markdown :global(img) {
		max-width: 100%;
		border-radius: 0.75rem;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (max-width: 640px) {
		.backend-reader {
			padding: 1.25rem;
		}

		.reader-header h1 {
			font-size: 2rem;
		}
	}
</style>
