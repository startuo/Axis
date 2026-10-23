import { prepareImage } from "./image-ready";

const controllers = new WeakMap<HTMLElement, { destroy(): void }>();

export function initFullscreenWallpaper(root: HTMLElement) {
	const existing = controllers.get(root);
	if (existing) return existing;
	const events = new AbortController();
	const media = window.matchMedia("(min-width: 768px)");
	const groups = Array.from(root.querySelectorAll<HTMLElement>("[data-wallpaper-group]"));
	const allImages = Array.from(root.querySelectorAll<HTMLImageElement>("[data-carousel-item]"));
	const storageKey = "mizuki_wallpaper_index";
	const saved = Number.parseInt(sessionStorage.getItem(storageKey) || "0", 10);
	let currentIndex = Number.isFinite(saved) && saved >= 0 ? saved : 0;
	let images: HTMLImageElement[] = [];
	let timer: ReturnType<typeof setInterval> | null = null;
	let transitionTimer: ReturnType<typeof setTimeout> | null = null;
	let generation = 0, switching = false, destroyed = false;
	const visible = () => root.isConnected && !document.hidden &&
		document.body.classList.contains("wallpaper-transparent");
	const stop = () => {
		if (timer !== null) clearInterval(timer);
		timer = null;
		generation++;
		switching = false;
	};
	const releaseHints = () => {
		if (transitionTimer !== null) clearTimeout(transitionTimer);
		transitionTimer = null;
		for (const image of allImages) image.style.removeProperty("will-change");
	};
	async function next() {
		if (switching || images.length < 2) return;
		switching = true;
		const version = generation, nextIndex = (currentIndex + 1) % images.length;
		const ready = await prepareImage(images[nextIndex]);
		if (version !== generation || destroyed) return;
		switching = false;
		if (!visible() || !ready) return;
		releaseHints();
		images[currentIndex].style.willChange = "opacity";
		images[nextIndex].style.willChange = "opacity";
		images[currentIndex].style.opacity = "0";
		images[nextIndex].style.opacity = "1";
		currentIndex = nextIndex;
		sessionStorage.setItem(storageKey, String(currentIndex));
		transitionTimer = setTimeout(releaseHints, 1000); // Existing CSS crossfade duration.
	}
	function sync() {
		if (destroyed) return;
		if (!visible() || images.length < 2) { stop(); releaseHints(); }
		else if (timer === null) timer = setInterval(() => {
			if (!visible()) { sync(); return; }
			void next();
		}, Number(root.dataset.carouselInterval) * 1000);
	}
	function selectGroup() {
		stop(); releaseHints();
		images = Array.from(groups.find(g => g.dataset.wallpaperGroup === (media.matches ? "desktop" : "mobile"))
			?.querySelectorAll<HTMLImageElement>("[data-carousel-item]") || []);
		currentIndex = currentIndex < images.length ? currentIndex : 0;
		for (const group of groups) {
			const groupImages = group.querySelectorAll<HTMLImageElement>("[data-carousel-item]");
			groupImages.forEach((image, i) => { image.style.opacity = i === (currentIndex < groupImages.length ? currentIndex : 0) ? "1" : "0"; });
		}
		for (const image of images) void prepareImage(image);
		sync();
	}
	for (const image of allImages) image.loading = "eager";
	media.addEventListener("change", selectGroup, { signal: events.signal });
	document.addEventListener("visibilitychange", sync, { signal: events.signal });
	window.addEventListener("wallpaper-mode-applied", sync, { signal: events.signal });
	window.addEventListener("pagehide", stop, { signal: events.signal });
	window.addEventListener("pageshow", sync, { signal: events.signal });
	const controller = { destroy() {
		destroyed = true; stop(); releaseHints(); events.abort(); controllers.delete(root);
	} };
	controllers.set(root, controller);
	selectGroup();
	return controller;
}
