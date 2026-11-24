<script lang="ts">
	import { onDestroy, onMount, tick } from "svelte";
	import {
		getFeedbackSession,
		listPublicFeedbackMessages,
		submitFeedbackMessage,
		type FeedbackMessage,
		type FeedbackMessagePayload,
	} from "./feedback-api";

	type ActiveBullet = FeedbackMessage & {
		key: string;
		lane: number;
		duration: number;
		itemWidth: number;
		startX: number;
		topPercent: number;
	};

	const TOKEN_KEY = "star_blog_auth_token";
	const LEGACY_TOKEN_KEY = "star_blog_admin_token";
	const MAX_LENGTH = 50;
	const LANE_COUNT = 8;
	const MAX_ACTIVE_BULLETS = 32;
	const MIN_STAGE_WIDTH = 240;
	const MIN_STAGE_HEIGHT = 240;
	const SPEED_PX_PER_SECOND = 92;
	const palette = ["#fb78ad", "#8be9fd", "#ffb86c", "#b7f071", "#c792ea", "#f8f8f2"];

	let stageElement: HTMLDivElement;
	let authenticated = false;
	let text = "";
	let color = palette[0];
	let loading = true;
	let submitting = false;
	let submitLocked = false;
	let notice = "";
	let error = "";
	let messages: FeedbackMessage[] = [];
	let queue: FeedbackMessage[] = [];
	let activeBullets: ActiveBullet[] = [];
	let stageWidth = 0;
	let stageHeight = 0;
	let lastStageWidth = 0;
	let lastStageHeight = 0;
	let spawnTimer: number | undefined;
	let refreshTimer: number | undefined;
	let lockTimer: number | undefined;
	let resizeFrame: number | undefined;
	let cleanupResizeObserver: (() => void) | undefined;
	let cleanupRouteHandlers: (() => void) | undefined;
	let disposed = false;

	const playedIds = new Set<string>();
	const activeIds = new Set<string>();
	const laneNextAvailableAt = Array.from({ length: LANE_COUNT }, () => 0);

	$: remaining = MAX_LENGTH - text.length;
	$: canSubmit =
		authenticated &&
		text.trim().length > 0 &&
		remaining >= 0 &&
		!submitting &&
		!submitLocked;
	$: stageReady =
		stageWidth >= MIN_STAGE_WIDTH && stageHeight >= MIN_STAGE_HEIGHT;
	$: if (stageReady) {
		queueStageResize();
	}

	onMount(() => {
		disposed = false;
		localStorage.removeItem(TOKEN_KEY);
		localStorage.removeItem(LEGACY_TOKEN_KEY);
		void getFeedbackSession()
			.then((state) => {
				if (!disposed) authenticated = Boolean(state.authenticated);
			})
			.catch(() => {
				if (!disposed) authenticated = false;
			});

		cleanupRouteHandlers = setupRouteHandlers();
		void startPlayback();

		return () => {
			disposed = true;
			cleanupRouteHandlers?.();
			cleanupResizeObserver?.();
			clearTimers();
			clearResizeFrame();
			activeBullets = [];
			queue = [];
			activeIds.clear();
			playedIds.clear();
		};
	});

	onDestroy(() => {
		clearTimers();
		clearResizeFrame();
	});

	async function startPlayback() {
		await waitForStableLayout();
		if (disposed) return;

		cleanupResizeObserver = setupResizeObserver();
		handleStageResize(true);
		await loadMessages();
		if (disposed) return;

		refreshTimer = window.setInterval(() => { if (!document.hidden) void loadMessages(); }, 15000);
	}

	async function waitForStableLayout(frameCount = 2) {
		await tick();
		for (let index = 0; index < frameCount; index += 1) {
			await new Promise<void>((resolve) => {
				window.requestAnimationFrame(() => resolve());
			});
		}
	}

	function setupResizeObserver() {
		if (!stageElement || typeof ResizeObserver === "undefined") {
			return () => {};
		}

		const observer = new ResizeObserver(() => queueStageResize());
		observer.observe(stageElement);

		return () => observer.disconnect();
	}

	function setupRouteHandlers() {
 const refreshVisible=()=>{if(!document.hidden)void loadMessages();};
 document.addEventListener('visibilitychange',refreshVisible);
		const handleRouteChange = () => {
			void remeasureAfterRouteChange();
		};
		let swupHooksRegistered = registerSwupHooks(handleRouteChange);
		const handleSwupEnable = () => {
			if (!swupHooksRegistered) {
				swupHooksRegistered = registerSwupHooks(handleRouteChange);
			}
		};

		document.addEventListener("astro:page-load", handleRouteChange);
		document.addEventListener("astro:after-swap", handleRouteChange);
		document.addEventListener("swup:page:view", handleRouteChange);
		document.addEventListener("swup:contentReplaced", handleRouteChange);
		document.addEventListener("swup:enable", handleSwupEnable);

		return () => {
			document.removeEventListener('visibilitychange',refreshVisible);
 document.removeEventListener("astro:page-load", handleRouteChange);
			document.removeEventListener("astro:after-swap", handleRouteChange);
			document.removeEventListener("swup:page:view", handleRouteChange);
			document.removeEventListener("swup:contentReplaced", handleRouteChange);
			document.removeEventListener("swup:enable", handleSwupEnable);

			if (swupHooksRegistered) {
				unregisterSwupHooks(handleRouteChange);
				swupHooksRegistered = false;
			}
		};
	}

	type SwupLike = {
		hooks?: {
			on?: (eventName: string, callback: () => void) => void;
			off?: (eventName: string, callback: () => void) => void;
		};
	};

	function getSwup() {
		return (window as Window & { swup?: SwupLike }).swup;
	}

	function registerSwupHooks(callback: () => void) {
		const swup = getSwup();
		if (!swup?.hooks?.on) {
			return false;
		}

		swup.hooks.on("content:replace", callback);
		swup.hooks.on("page:view", callback);
		return true;
	}

	function unregisterSwupHooks(callback: () => void) {
		const swup = getSwup();
		if (!swup?.hooks?.off) {
			return;
		}

		swup.hooks.off("content:replace", callback);
		swup.hooks.off("page:view", callback);
	}

	async function remeasureAfterRouteChange() {
		await waitForStableLayout(3);
		if (disposed) return;

		handleStageResize(true);
	}

	function queueStageResize(force = false) {
		if (disposed || typeof window === "undefined") return;

		clearResizeFrame();
		resizeFrame = window.requestAnimationFrame(() => {
			resizeFrame = undefined;
			handleStageResize(force);
		});
	}

	function handleStageResize(force = false) {
		const { width, height } = getStageSize();
		if (width < MIN_STAGE_WIDTH || height < MIN_STAGE_HEIGHT) {
			return;
		}

		const widthChanged = Math.abs(width - lastStageWidth) > 4;
		const heightChanged = Math.abs(height - lastStageHeight) > 4;
		if (!force && !widthChanged && !heightChanged) {
			return;
		}

		lastStageWidth = width;
		lastStageHeight = height;
		resetBulletsForResize();
	}

	function getStageSize() {
		return {
			width: Math.round(stageElement?.clientWidth ?? stageWidth),
			height: Math.round(stageElement?.clientHeight ?? stageHeight),
		};
	}

	function getLaneLimit(height: number) {
		return Math.max(4, Math.min(LANE_COUNT, Math.floor((height - 132) / 58)));
	}

	function resetBulletsForResize() {
		activeBullets = [];
		activeIds.clear();
		laneNextAvailableAt.fill(0);
		syncPlaybackPool();

		if (spawnTimer !== undefined) {
			window.clearTimeout(spawnTimer);
			spawnTimer = undefined;
		}

		if (messages.length > 0) {
			scheduleNextLaunch(320, 900);
		}
	}

	async function loadMessages() {
		try {
			const nextMessages = normalizeMessages(await listPublicFeedbackMessages(100));
			if (disposed) return;

			messages = nextMessages;
			syncPlaybackPool();
			error = "";
			loading = false;
			scheduleNextLaunch();
		} catch (caughtError) {
			if (disposed) return;

			error = caughtError instanceof Error ? caughtError.message : "弹幕加载失败";
			loading = false;
		}
	}

	function normalizeMessages(source: FeedbackMessage[]) {
		const byId = new Map<string, FeedbackMessage>();
		source.forEach((message) => {
			if (message.id && message.text.trim()) {
				byId.set(message.id, message);
			}
		});

		return Array.from(byId.values());
	}

	function syncPlaybackPool() {
		const knownIds = new Set(messages.map((message) => message.id));

		Array.from(playedIds).forEach((id) => {
			if (!knownIds.has(id)) {
				playedIds.delete(id);
			}
		});

		Array.from(activeIds).forEach((id) => {
			if (!knownIds.has(id)) {
				activeIds.delete(id);
			}
		});

		queue = shuffle(
			messages.filter(
				(message) => !playedIds.has(message.id) && !activeIds.has(message.id),
			),
		);
	}

	function resetCycleIfSafe() {
		if (messages.length === 0) return false;
		if (playedIds.size < messages.length) return false;
		if (activeBullets.length > 0) return false;

		playedIds.clear();
		queue = shuffle(messages);
		return true;
	}

	function scheduleNextLaunch(minDelay = 1500, maxDelay = 3000) {
		if (disposed || spawnTimer !== undefined) {
			return;
		}

		const delay = randomBetween(minDelay, maxDelay);
		spawnTimer = window.setTimeout(() => {
			spawnTimer = undefined;
			launchNextBullet();
		}, delay);
	}

	function launchNextBullet() {
		if (disposed) return;

		const { width, height } = getStageSize();
		if (
			!stageElement ||
			messages.length === 0 ||
			width < MIN_STAGE_WIDTH ||
			height < MIN_STAGE_HEIGHT
		) {
			scheduleNextLaunch(500, 1100);
			return;
		}

		if (activeBullets.length >= MAX_ACTIVE_BULLETS) {
			scheduleNextLaunch(700, 1300);
			return;
		}

		if (queue.length === 0) {
			resetCycleIfSafe();
			scheduleNextLaunch();
			return;
		}

		const now = performance.now();
		const laneLimit = getLaneLimit(height);
		const lane = laneNextAvailableAt.findIndex(
			(availableAt, index) => index < laneLimit && now >= availableAt,
		);
		if (lane === -1) {
			scheduleNextLaunch(450, 900);
			return;
		}

		const message = dequeueMessage();
		if (!message) {
			resetCycleIfSafe();
			scheduleNextLaunch();
			return;
		}

		const itemWidth = estimateTextWidth(message.text);
		const startX = width + 48;
		const duration = Math.max(10, Math.min(26, (startX + itemWidth) / SPEED_PX_PER_SECOND));
		const baseTop = 8 + lane * (74 / Math.max(1, laneLimit - 1));
		const topPercent = Math.min(82, Math.max(8, baseTop + (Math.random() - 0.5) * 3));

		laneNextAvailableAt[lane] =
			now + ((itemWidth + 160) / SPEED_PX_PER_SECOND) * 1000;

		playedIds.add(message.id);
		activeIds.add(message.id);
		activeBullets = [
			...activeBullets,
			{
				...message,
				key: `${message.id}-${now.toFixed(1)}`,
				lane,
				duration: Number(duration.toFixed(2)),
				itemWidth,
				startX,
				topPercent: Number(topPercent.toFixed(2)),
			},
		];

		scheduleNextLaunch();
	}

	function dequeueMessage() {
		while (queue.length > 0) {
			const next = queue.shift();
			if (next && !playedIds.has(next.id) && !activeIds.has(next.id)) {
				queue = queue;
				return next;
			}
		}

		queue = [];
		return undefined;
	}

	function estimateTextWidth(value: string) {
		return Math.min(560, Math.max(132, value.length * 18 + 92));
	}

	function removeBullet(key: string) {
		const removed = activeBullets.find((bullet) => bullet.key === key);
		if (removed) {
			activeIds.delete(removed.id);
		}

		activeBullets = activeBullets.filter((bullet) => bullet.key !== key);

		if (queue.length === 0) {
			resetCycleIfSafe();
		}

		scheduleNextLaunch(900, 1800);
	}

	function shuffle<T>(items: T[]) {
		const result = [...items];
		for (let index = result.length - 1; index > 0; index -= 1) {
			const swapIndex = Math.floor(Math.random() * (index + 1));
			[result[index], result[swapIndex]] = [result[swapIndex], result[index]];
		}
		return result;
	}

	function randomBetween(min: number, max: number) {
		return Math.floor(Math.random() * (max - min + 1)) + min;
	}

	function clearTimers() {
		if (spawnTimer !== undefined) {
			window.clearTimeout(spawnTimer);
			spawnTimer = undefined;
		}

		if (refreshTimer !== undefined) {
			window.clearInterval(refreshTimer);
			refreshTimer = undefined;
		}

		if (lockTimer !== undefined) {
			window.clearTimeout(lockTimer);
			lockTimer = undefined;
		}
	}

	function clearResizeFrame() {
		if (resizeFrame !== undefined) {
			window.cancelAnimationFrame(resizeFrame);
			resizeFrame = undefined;
		}
	}

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		error = "";
		notice = "";

		const normalizedText = text.trim();
		if (!authenticated) {
			error = "请先登录博客账户，再发送弹幕留言。";
			return;
		}

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

			await submitFeedbackMessage(payload);
			text = "";
			notice = "留言已提交，审核通过后会出现在留言大屏。";
		} catch (caughtError) {
			error = caughtError instanceof Error ? caughtError.message : "留言提交失败，请稍后重试。";
		} finally {
			submitting = false;
			window.clearTimeout(lockTimer);
			lockTimer = window.setTimeout(() => {
				submitLocked = false;
			}, 850);
		}
	}
</script>

<section class="message-board" aria-labelledby="message-board-title">
	<div class="board-heading">
		<div>
			<p>Message Board</p>
			<h1 id="message-board-title">博客留言弹幕墙</h1>
		</div>
		<span>{messages.length > 0 ? `${messages.length} 条已审核` : "等待留言"}</span>
	</div>

	<div
		bind:this={stageElement}
		bind:clientWidth={stageWidth}
		bind:clientHeight={stageHeight}
		class="danmaku-stage"
		class:stage-ready={stageReady}
	>
		<div class="ambient ambient-one"></div>
		<div class="ambient ambient-two"></div>

		{#each activeBullets as bullet (bullet.key)}
			<span
				class="danmaku-bullet"
				style={`--top:${bullet.topPercent}%; --duration:${bullet.duration}s; --start-x:${bullet.startX}px; --item-width:${bullet.itemWidth}px; --color:${bullet.color};`}
				onanimationend={() => removeBullet(bullet.key)}
			>
				{bullet.text}
			</span>
		{/each}

		{#if loading}
			<div class="stage-state">正在加载已审核留言...</div>
		{:else if error && messages.length === 0}
			<div class="stage-state warning">{error}</div>
		{:else if messages.length === 0}
			<div class="stage-state">暂无公开留言。登录后发送，审核通过后会在这里滚动。</div>
		{/if}

		<form class="danmaku-launcher" onsubmit={handleSubmit}>
			<div class="launcher-input">
				<textarea
					bind:value={text}
					maxlength={MAX_LENGTH}
					rows="2"
					placeholder={authenticated ? "写一句 50 字内的弹幕留言" : "登录后即可发送留言"}
				></textarea>
				<div class="launcher-meta">
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
						<input bind:value={color} aria-label="自定义弹幕颜色" type="color" />
					</div>
					<strong class:danger={remaining < 8}>{remaining} 字</strong>
				</div>
			</div>

			<div class="launcher-actions">
				{#if !authenticated}
					<a href="/admin">登录</a>
				{/if}
				<button type="submit" disabled={!canSubmit}>
					{submitting ? "发送中" : submitLocked ? "稍等" : "发射"}
				</button>
			</div>
		</form>
	</div>

	{#if notice || (error && messages.length > 0)}
		<p class:error={!!error} class="panel-feedback">{notice || error}</p>
	{/if}
</section>

<style>
	.message-board {
		position: relative;
		display: grid;
		grid-template-rows: auto minmax(0, 1fr) auto;
		gap: 1rem;
		width: 100%;
		height: 100%;
		min-height: 0;
	}

	.board-heading {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		align-items: end;
		padding: 0 0.25rem;
	}

	.board-heading p,
	.board-heading h1 {
		margin: 0;
	}

	.board-heading p {
		color: var(--primary);
		font-size: 0.78rem;
		font-weight: 900;
		letter-spacing: 0.18em;
		text-transform: uppercase;
	}

	.board-heading h1 {
		margin-top: 0.35rem;
		color: var(--text-90);
		font-size: clamp(2rem, 3.2vw, 3.75rem);
		line-height: 1;
	}

	.board-heading span {
		flex: 0 0 auto;
		border: 1px solid color-mix(in oklch, var(--primary) 24%, transparent);
		border-radius: 999px;
		background: color-mix(in oklch, var(--primary) 12%, transparent);
		color: var(--primary);
		font-size: 0.86rem;
		font-weight: 900;
		padding: 0.55rem 0.9rem;
	}

	.danmaku-stage {
		position: relative;
		overflow: hidden;
		min-height: clamp(34rem, 66vh, 48rem);
		height: 100%;
		contain: layout paint;
		border: 1px solid color-mix(in oklch, var(--primary) 16%, transparent);
		border-radius: 1.5rem;
		background:
			linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px),
			linear-gradient(0deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px),
			radial-gradient(circle at 74% 18%, color-mix(in oklch, var(--primary) 22%, transparent), transparent 34%),
			radial-gradient(circle at 18% 78%, rgba(139, 233, 253, 0.12), transparent 32%),
			color-mix(in oklch, var(--card-bg) 88%, black);
		background-size: 42px 42px, 42px 42px, auto, auto, auto;
		box-shadow:
			inset 0 0 0 1px rgba(255, 255, 255, 0.04),
			0 28px 90px rgba(0, 0, 0, 0.32);
	}

	.danmaku-stage:not(.stage-ready) {
		min-height: 28rem;
	}

	.ambient {
		position: absolute;
		border-radius: 999px;
		filter: blur(18px);
		opacity: 0.7;
		pointer-events: none;
	}

	.ambient-one {
		top: 8%;
		right: 12%;
		width: 15rem;
		height: 15rem;
		background: color-mix(in oklch, var(--primary) 24%, transparent);
	}

	.ambient-two {
		bottom: 13%;
		left: 8%;
		width: 18rem;
		height: 18rem;
		background: rgba(139, 233, 253, 0.12);
	}

	.danmaku-bullet {
		position: absolute;
		top: var(--top);
		left: 0;
		z-index: 2;
		display: inline-flex;
		align-items: center;
		max-width: min(42rem, 82%);
		min-height: 2rem;
		white-space: nowrap;
		border: 1px solid color-mix(in oklch, var(--color) 52%, transparent);
		border-radius: 999px;
		background: color-mix(in oklch, var(--color) 15%, rgba(0, 0, 0, 0.32));
		box-shadow: 0 16px 34px rgba(0, 0, 0, 0.2);
		color: var(--color);
		font-size: clamp(0.95rem, 1.3vw, 1.2rem);
		font-weight: 900;
		line-height: 1;
		padding: 0.68rem 1rem;
		text-shadow:
			0 1px 4px rgba(0, 0, 0, 0.85),
			0 0 10px rgba(255, 255, 255, 0.22);
		transform: translate3d(var(--start-x), -50%, 0);
		animation: message-danmaku-fly var(--duration) linear forwards;
		will-change: transform;
	}

	.stage-state {
		position: absolute;
		inset: 0;
		z-index: 1;
		display: grid;
		place-items: center;
		padding: 2rem 2rem 8.5rem;
		color: var(--text-50);
		text-align: center;
		font-size: 1.05rem;
		line-height: 1.7;
	}

	.stage-state.warning {
		color: #ff9a8b;
	}

	.danmaku-launcher {
		position: absolute;
		right: max(1rem, 50% - 31rem);
		bottom: 1.2rem;
		left: max(1rem, 50% - 31rem);
		z-index: 5;
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 0.75rem;
		border: 1px solid color-mix(in oklch, var(--primary) 28%, transparent);
		border-radius: 1.35rem;
		background: color-mix(in oklch, var(--float-panel-bg) 84%, transparent);
		box-shadow: 0 20px 58px rgba(0, 0, 0, 0.28);
		padding: 0.78rem;
		backdrop-filter: blur(22px);
	}

	.launcher-input {
		display: grid;
		gap: 0.5rem;
		min-width: 0;
	}

	.launcher-input textarea {
		width: 100%;
		min-height: 3.5rem;
		resize: none;
		border: 1px solid var(--line-divider);
		border-radius: 0.95rem;
		background: color-mix(in oklch, var(--card-bg) 78%, transparent);
		color: var(--text-90);
		font-size: 0.92rem;
		line-height: 1.5;
		outline: none;
		padding: 0.68rem 0.8rem;
	}

	.launcher-input textarea:focus {
		border-color: color-mix(in oklch, var(--primary) 58%, transparent);
		box-shadow: 0 0 0 3px color-mix(in oklch, var(--primary) 14%, transparent);
	}

	.launcher-input textarea::placeholder {
		color: var(--text-30);
	}

	.launcher-meta,
	.palette,
	.launcher-actions {
		display: flex;
		gap: 0.45rem;
		align-items: center;
	}

	.launcher-meta {
		justify-content: space-between;
	}

	.palette {
		flex-wrap: wrap;
	}

	.palette button,
	.palette input {
		width: 1.42rem;
		height: 1.42rem;
		border: 2px solid transparent;
		border-radius: 999px;
		background: var(--swatch);
		padding: 0;
	}

	.palette button.active {
		border-color: var(--text-90);
		box-shadow: 0 0 0 2px color-mix(in oklch, var(--swatch) 30%, transparent);
	}

	.palette input {
		background: transparent;
	}

	.launcher-meta strong {
		color: var(--text-50);
		font-size: 0.78rem;
		white-space: nowrap;
	}

	.launcher-meta strong.danger {
		color: #ff9a8b;
	}

	.launcher-actions {
		flex-direction: column;
		justify-content: end;
		width: 5.4rem;
	}

	.launcher-actions a,
	.launcher-actions button {
		width: 100%;
		border-radius: 999px;
		font-size: 0.82rem;
		font-weight: 900;
		line-height: 1;
		padding: 0.78rem 0.82rem;
		text-align: center;
		text-decoration: none;
	}

	.launcher-actions a {
		background: var(--btn-regular-bg);
		color: var(--text-75);
	}

	.launcher-actions button {
		background: linear-gradient(135deg, var(--primary), color-mix(in oklch, var(--primary) 68%, white));
		color: var(--deep-text);
	}

	.launcher-actions button:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}

	.panel-feedback {
		margin: 0;
		border: 1px solid color-mix(in oklch, var(--primary) 26%, transparent);
		border-radius: 1rem;
		background: color-mix(in oklch, var(--primary) 10%, transparent);
		color: var(--primary);
		font-size: 0.9rem;
		line-height: 1.55;
		padding: 0.72rem 0.88rem;
	}

	.panel-feedback.error {
		border-color: rgba(255, 145, 122, 0.28);
		background: rgba(255, 92, 92, 0.12);
		color: #ff9a8b;
	}

	@keyframes message-danmaku-fly {
		to {
			transform: translate3d(calc(-1 * (var(--item-width) + 64px)), -50%, 0);
		}
	}

	@media (max-width: 1199px) {
		.board-heading h1 {
			font-size: clamp(2rem, 5vw, 3rem);
		}

		.danmaku-stage {
			min-height: clamp(32rem, 70vh, 44rem);
		}
	}

	@media (max-width: 767px) {
		.board-heading {
			align-items: start;
			flex-direction: column;
		}

		.danmaku-stage {
			min-height: 25rem;
			height: 25rem;
			border-radius: 1.35rem;
		}

		.danmaku-launcher {
			grid-template-columns: 1fr;
			right: 0.75rem;
			left: 0.75rem;
			bottom: 0.75rem;
		}

		.launcher-actions {
			flex-direction: row;
			width: auto;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.danmaku-bullet {
			animation-duration: calc(var(--duration) * 1.7);
		}
	}
</style>
