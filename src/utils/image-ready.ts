// Reuse the DOM image and the browser cache; do not retain duplicate Image objects.
const readiness = new WeakMap<HTMLImageElement, Promise<boolean>>();

export function prepareImage(image: HTMLImageElement): Promise<boolean> {
	const existing = readiness.get(image);
	if (existing) return existing;
	image.loading = "eager";
	const ready = (async () => {
		try {
			await image.decode();
			return image.naturalWidth > 0;
		} catch {
			return false;
		}
	})();
	readiness.set(image, ready);
	void ready.then((loaded) => {
		if (!loaded) readiness.delete(image); // A later init can retry a failed resource.
	});
	return ready;
}

export async function prepareSlide(slide: Element): Promise<boolean> {
	const images = Array.from(slide.querySelectorAll<HTMLImageElement>("img"))
		.filter((image) => image.getClientRects().length > 0);
	return (await Promise.all(images.map(prepareImage))).every(Boolean);
}
