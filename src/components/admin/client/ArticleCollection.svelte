<script lang="ts">
	interface ArticleCard {
		id: string;
		title: string;
		summary: string;
		cover: string;
		time: string;
		category: string;
	}

	export let eyebrow = "Library";
	export let title = "";
	export let description = "";
	export let articles: ArticleCard[] = [];
	export let actionLabel = "查看";
</script>

<section class="client-panel" aria-labelledby="client-article-collection-title">
	<div class="panel-heading">
		<p class="eyebrow">{eyebrow}</p>
		<h2 id="client-article-collection-title">{title}</h2>
		<p>{description}</p>
	</div>
	<div class="article-card-grid">
		{#each articles as article}
			<article>
				<img src={article.cover} alt="" loading="lazy" />
				<div>
					<span>{article.category}</span>
					<h3>{article.title}</h3>
					<p>{article.summary}</p>
					<footer>
						<time>{article.time}</time>
						<button type="button">{actionLabel}</button>
					</footer>
				</div>
			</article>
		{/each}
	</div>
</section>
