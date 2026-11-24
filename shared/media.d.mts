export type ImageMime =
	| "image/jpeg"
	| "image/png"
	| "image/webp"
	| "image/gif"
	| "image/avif";
export const IMAGE_MIME_TYPES: ImageMime[];
export function detectImageMime(bytes: Uint8Array): ImageMime | null;
export interface UploadedMedia {
	id: string;
	name: string;
	url: string;
	type: ImageMime;
	size: number;
}
export function uploadOriginal(
	file: File,
	endpoint: string | URL,
	token?: string,
): Promise<UploadedMedia>;
