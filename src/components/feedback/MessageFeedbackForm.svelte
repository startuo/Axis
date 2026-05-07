<script lang="ts">
	import { onDestroy } from "svelte";
	import {
		submitFeedbackMessage,
		type FeedbackMessagePayload,
	} from "./feedback-api";

	export let token = "";

	const MAX_LENGTH = 50;
	const palette = ["#fb78ad", "#ffb86c", "#8be9fd", "#b7f071", "#c792ea", "#f8f8f2"];

	let text = "";
	let color = palette[0];
	let submitting = false;
	let submitLocked = false;
	let notice = "";
	let error = "";
	let lastPayload: FeedbackMessagePayload | null = null;
	let lockTimer: number | undefined;

	onDestroy(() => {
		window.clearTimeout(lockTimer);
	});

	$: remaining = MAX_LENGTH - text.length;
	$: canSubmit =
		token.length > 0 &&
		text.trim().length > 0 &&
		remaining >= 0 &&
		!submitting &&
		!submitLocked;

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		error = "";
		notice = "";

		const normalizedText = text.trim();
		if (!normalizedText) {
			error = "请输入留言内容。";
			return;
		}

		if (normalizedText.length > MAX_LENGTH) {
			error = `留言最多 ${MAX_LENGTH} 字。`;
			return;
		}

		submitting = true;
		submitLocked = true;
		try {
			const payload: FeedbackMessagePayload = {
				id: crypto.randomUUID?.() ?? `feedback-${Date.now()}`,
				text: normalizedText,
				color,
				timestamp: Date.now(),
			};

			lastPayload = payload;
			await submitFeedbackMessage(token, payload);
			text = "";
			notice = "留言已提交，审核通过后会出现在留言弹幕墙。";
		} catch (caughtError) {
			error = caughtError instanceof Error ? caughtError.message : "留言提交失败，请稍后再试。";
		} finally {
			submitting = false;
			window.clearTimeout(lockTimer);
			lockTimer = window.setTimeout(() => {
				submitLocked = false;
			}, 850);
		}
	}
</script>

<section class="feedback-card" aria-labelledby="feedback-title">
	<div class="feedback-copy">
		<p class="eyebrow">Message Wall</p>
		<h2 id="feedback-title">弹幕留言</h2>
		<p>写一句想留在博客归档页的话。提交后会进入审核队列，通过后才公开展示。</p>
	</div>

	<form class="feedback-form" onsubmit={handleSubmit}>
		<label>
			<span>留言内容</span>
			<textarea
				bind:value={text}
				maxlength={MAX_LENGTH}
				placeholder="最多 50 字，审核通过后会变成留言弹幕"
				rows="3"
			></textarea>
		</label>

		<div class="form-meta">
			<div class="palette" aria-label="选择弹幕颜色">
				{#each palette as item}
					<button
						type="button"
						class:active={color === item}
						aria-label={`选择颜色 ${item}`}
						style={`--swatch:${item}`}
						onclick={() => (color = item)}
					></button>
				{/each}
				<label class="native-color">
					<span>自定义</span>
					<input bind:value={color} type="color" />
				</label>
			</div>
			<span class:danger={remaining < 8}>{remaining} 字</span>
		</div>

		{#if notice}
			<p class="form-notice">{notice}</p>
		{/if}

		{#if error}
			<p class="form-error">{error}</p>
		{/if}

		{#if lastPayload}
			<pre class="payload-preview">{JSON.stringify(lastPayload, null, 2)}</pre>
		{/if}

		<button class="submit-feedback" type="submit" disabled={!canSubmit}>
			{submitting ? "提交中..." : "提交留言"}
		</button>
	</form>
</section>

<style>
	.feedback-card {
		display: grid;
		grid-template-columns: minmax(0, 0.8fr) minmax(18rem, 1fr);
		gap: 1rem;
		border: 1px solid var(--admin-border);
		border-radius: 2rem;
		background: var(--admin-panel-bg);
		box-shadow: 0 18px 45px rgba(0, 0, 0, 0.12);
		padding: clamp(1.2rem, 3vw, 2rem);
		backdrop-filter: blur(18px);
	}

	.feedback-copy p:not(.eyebrow) {
		margin-top: 0.75rem;
		color: var(--admin-muted);
		line-height: 1.7;
	}

	.feedback-form {
		display: grid;
		gap: 0.9rem;
	}

	.feedback-form textarea {
		min-height: 6.5rem;
		resize: vertical;
	}

	.form-meta {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		align-items: center;
		color: var(--admin-muted);
		font-size: 0.85rem;
	}

	.palette {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
		align-items: center;
	}

	.palette > button {
		width: 1.65rem;
		height: 1.65rem;
		border: 2px solid transparent;
		border-radius: 999px;
		background: var(--swatch);
		box-shadow: 0 0 0 1px var(--admin-border);
	}

	.palette > button.active {
		border-color: var(--admin-text-strong);
		box-shadow:
			0 0 0 2px var(--admin-primary-soft),
			0 0 18px color-mix(in oklch, var(--swatch) 50%, transparent);
	}

	.native-color {
		display: inline-flex;
		gap: 0.4rem;
		align-items: center;
		color: var(--admin-muted);
	}

	.native-color input {
		width: 2rem;
		height: 2rem;
		border: 0;
		border-radius: 999px;
		background: transparent;
		padding: 0;
	}

	.danger {
		color: #d85858;
	}

	.form-notice,
	.form-error {
		border-radius: 0.95rem;
		margin: 0;
		padding: 0.75rem 0.9rem;
		line-height: 1.55;
	}

	.form-notice {
		border: 1px solid color-mix(in oklch, var(--primary) 28%, transparent);
		background: var(--admin-primary-soft);
		color: var(--primary);
	}

	.form-error {
		border: 1px solid rgba(255, 145, 122, 0.28);
		background: rgba(255, 92, 92, 0.12);
		color: #c7432c;
	}

	.payload-preview {
		max-height: 8rem;
		overflow: auto;
		border: 1px dashed var(--admin-border);
		border-radius: 0.95rem;
		background: var(--admin-subtle-bg);
		color: var(--admin-muted-strong);
		font-size: 0.78rem;
		line-height: 1.55;
		margin: 0;
		padding: 0.75rem 0.9rem;
		white-space: pre-wrap;
	}

	.submit-feedback {
		justify-self: flex-start;
		border-radius: 999px;
		background: linear-gradient(135deg, var(--primary), color-mix(in oklch, var(--primary) 70%, white));
		color: var(--deep-text);
		font-weight: 900;
		padding: 0.85rem 1.15rem;
	}

	.submit-feedback:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}

	@media (max-width: 760px) {
		.feedback-card {
			grid-template-columns: 1fr;
			border-radius: 1.35rem;
		}

		.form-meta {
			align-items: flex-start;
			flex-direction: column;
		}
	}
</style>
