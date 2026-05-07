<script lang="ts">
	interface CommentItem {
		id: string;
		article: string;
		content: string;
		time: string;
		status: string;
	}

	export let commentItems: CommentItem[] = [];
</script>

<section class="client-panel" aria-labelledby="client-comments-title">
	<div class="panel-heading">
		<p class="eyebrow">Comments</p>
		<h2 id="client-comments-title">评论记录</h2>
		<p>按时间线查看你的评论内容和审核状态。</p>
	</div>
	<div class="comment-timeline">
		{#each commentItems as comment}
			<article>
				<div class="timeline-dot"></div>
				<div>
					<div class="comment-meta">
						<a href="/posts/welcome/">《{comment.article}》</a>
						<span class:approved={comment.status === "已通过"}>{comment.status}</span>
					</div>
					<p>{comment.content}</p>
					<time>{comment.time}</time>
				</div>
			</article>
		{/each}
	</div>
</section>
