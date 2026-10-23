/** Release unused media in Swup's inert parsed document, after it cloned main. */
export function releaseParsedMedia(parsed: Document | undefined): void {
	if (!parsed || parsed === document) return;
	for (const media of parsed.querySelectorAll<HTMLMediaElement>("audio,video")) {
		// These are discarded copies, never the live persistent player or article video.
		media.pause();
		media.disableRemotePlayback = true;
		media.srcObject = null;
		media.removeAttribute("src");
		for (const source of media.querySelectorAll("source")) source.removeAttribute("src");
		media.load();
		media.remove();
	}
}
