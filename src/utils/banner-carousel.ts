import { prepareSlide } from "./image-ready";

const controllers = new WeakMap<HTMLElement, { destroy(): void }>();

export function initBannerCarousel(root: HTMLElement, intervalSeconds: number) {
	const existing = controllers.get(root);
	if (existing) return existing;
	const events = new AbortController();
	const media = window.matchMedia("(min-width: 768px)");
	const allItems = Array.from(root.querySelectorAll<HTMLElement>(".carousel-item"));
	let items: HTMLElement[] = [];
	let currentIndex = 0;
	let timer: ReturnType<typeof setInterval> | null = null;
	let hovering = false;
	let touching = false;
	let startX = 0, startY = 0, swiping = false;
	let generation = 0;
	let switching = false;
	let destroyed = false;
	let active = false;

	const stop = () => {
		if (timer !== null) clearInterval(timer);
		timer = null;
	};
	const isVisible = () => root.isConnected && !document.hidden &&
		document.body.classList.contains("enable-banner") &&
		(window.innerWidth >= 1280 || document.body.classList.contains("is-home"));

	async function switchTo(index: number) {
		if (switching || destroyed || !items[index] || index === currentIndex) return;
		switching = true;
		const version = generation;
		const next = items[index];
		const ready = await prepareSlide(next);
		if (version !== generation || destroyed) return;
		switching = false;
		if (!ready || !isVisible()) return; // Keep the current image until the next one is decoded.
		const current = items[currentIndex];
		current.classList.remove("opacity-100", "scale-100");
		current.classList.add("opacity-0", "scale-110");
		next.classList.add("opacity-100", "scale-100");
		next.classList.remove("opacity-0", "scale-110");
		currentIndex = index;
	}

	function sync() {
		if (destroyed) return;
		const shouldRun = isVisible();
		if (active !== shouldRun) {
			generation++;
			switching = false;
			active = shouldRun;
			if (shouldRun) for (const item of items) void prepareSlide(item);
		}
		if (!shouldRun || hovering || touching || items.length < 2) stop();
		else if (timer === null) timer = setInterval(() => {
			if (!isVisible()) { sync(); return; }
			void switchTo((currentIndex + 1) % items.length);
		}, intervalSeconds * 1000);
	}

	function selectGroup() {
		generation++;
		switching = false;
		const selector = media.matches ? ".hidden.md\\:block" : ".block.md\\:hidden";
		items = allItems.filter((item) => item.querySelector(selector));
		currentIndex = Math.min(currentIndex, Math.max(0, items.length - 1));
		for (const item of allItems) {
			const selected = item === items[currentIndex];
			item.classList.toggle("opacity-100", selected);
			item.classList.toggle("scale-100", selected);
			item.classList.toggle("opacity-0", !selected);
			item.classList.toggle("scale-110", !selected);
		}
		// Keep the complete high-quality sequence prepared, including non-current slides.
		for (const item of items) void prepareSlide(item);
		sync();
	}
	// Preserve preloading on both platforms; decode the active platform ahead of display.
	for (const image of root.querySelectorAll<HTMLImageElement>("img")) image.loading = "eager";
	root.addEventListener("mouseenter", () => { hovering = true; sync(); }, { signal: events.signal });
	root.addEventListener("mouseleave", () => { hovering = false; sync(); }, { signal: events.signal });
	root.addEventListener("touchstart", (event) => {
		startX = event.touches[0].clientX;
		startY = event.touches[0].clientY;
		swiping = false;
		touching = true;
		sync();
	}, { passive: true, signal: events.signal });
	root.addEventListener("touchmove", (event) => {
		if (!touching) return;
		const dx = Math.abs(event.touches[0].clientX - startX);
		const dy = Math.abs(event.touches[0].clientY - startY);
		if (dx > dy && dx > 30) { swiping = true; event.preventDefault(); }
	}, { passive: false, signal: events.signal });
	root.addEventListener("touchend", (event) => {
		const dx = startX - event.changedTouches[0].clientX;
		if (swiping && Math.abs(dx) > 50 && items.length > 1)
			void switchTo((currentIndex + (dx > 0 ? 1 : items.length - 1)) % items.length);
		touching = false;
		swiping = false;
		sync();
	}, { passive: true, signal: events.signal });
	root.addEventListener("touchcancel", () => { touching = swiping = false; sync(); }, { signal: events.signal });
	media.addEventListener("change", selectGroup, { signal: events.signal });
	document.addEventListener("visibilitychange", sync, { signal: events.signal });
	document.addEventListener("swup:page:view", sync, { signal: events.signal });
	window.addEventListener("wallpaper-mode-applied", sync, { signal: events.signal });
	window.addEventListener("pagehide", stop, { signal: events.signal });
	window.addEventListener("pageshow", sync, { signal: events.signal });
	const controller = { destroy() {
		destroyed = true;
		generation++;
		stop();
		events.abort();
		controllers.delete(root);
	} };
	controllers.set(root, controller);
	selectGroup();
	return controller;
}
