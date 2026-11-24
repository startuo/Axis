export const IMAGE_MIME_TYPES = [
	"image/jpeg",
	"image/png",
	"image/webp",
	"image/gif",
	"image/avif",
];

export function detectImageMime(bytes) {
	const matches = (offset, signature) =>
		bytes.length >= offset + signature.length &&
		signature.every((value, index) => bytes[offset + index] === value);
	const ascii = (offset, value) =>
		matches(
			offset,
			Array.from(value, (char) => char.charCodeAt(0)),
		);
	if (matches(0, [255, 216, 255])) return "image/jpeg";
	if (matches(0, [137, 80, 78, 71, 13, 10, 26, 10])) return "image/png";
	if (ascii(0, "GIF87a") || ascii(0, "GIF89a")) return "image/gif";
	if (ascii(0, "RIFF") && ascii(8, "WEBP")) return "image/webp";
	if (bytes.length >= 16 && ascii(4, "ftyp")) {
		const boxSize = new DataView(
			bytes.buffer,
			bytes.byteOffset,
			bytes.byteLength,
		).getUint32(0);
		if (boxSize >= 16) {
			if (ascii(8, "avif") || ascii(8, "avis")) return "image/avif";
			for (
				let offset = 16;
				offset + 4 <= Math.min(boxSize, bytes.length);
				offset += 4
			)
				if (ascii(offset, "avif") || ascii(offset, "avis"))
					return "image/avif";
		}
	}
	return null;
}

export async function uploadOriginal(file, endpoint, token = "") {
	let header;
	try {
		header = new Uint8Array(await file.slice(0, 64).arrayBuffer());
	} catch {
		throw new Error("无法读取所选图片，请重新选择文件后重试。");
	}
	const type = detectImageMime(header);
	if (!type)
		throw new Error(
			"无法识别图片格式，仅支持 JPEG、PNG、WebP、GIF、AVIF。",
		);
	let response;
	try {
		const headers = {
			"Content-Type": type,
			"X-File-Name": encodeURIComponent(file.name),
		};
		if (token) headers.Authorization = `Bearer ${token}`;
		response = await fetch(endpoint, {
			method: "POST",
			credentials: "same-origin",
			headers,
			body: file,
		});
	} catch (error) {
		console.error("图片上传请求失败", String(endpoint), error);
		throw new Error(
			"图片上传请求未完成，请检查网络连接后重新选择文件重试。",
			{ cause: error },
		);
	}
	const data = await response.json().catch(() => null);
	if (!response.ok)
		throw new Error(
			typeof data?.message === "string" && data.message
				? data.message
				: `图片上传失败（HTTP ${response.status}），请稍后重试。`,
		);
	if (
		!data ||
		typeof data.id !== "string" ||
		!data.id ||
		typeof data.url !== "string" ||
		!data.url ||
		typeof data.name !== "string" ||
		!IMAGE_MIME_TYPES.includes(data.type) ||
		!Number.isSafeInteger(data.size) ||
		data.size < 0
	)
		throw new Error(
			"上传服务返回的数据不完整或无法解析，无法获取图片链接。",
		);
	return data;
}
