// Same media contract for KV deployments and optional R2 deployments.
export function mediaStorage(env) {
	if (!env.MEDIA_KV) return env.MEDIA ?? null;
	return {
		async put(key, value, options = {}) {
			const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
			const digest = await crypto.subtle.digest("SHA-256", bytes);
			const etag = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
			await env.MEDIA_KV.put(key, bytes, {
				metadata: { contentType: options.httpMetadata?.contentType || "application/octet-stream", etag },
				// Public snapshot history is also retained by Git; bound KV archive growth.
				...(key.startsWith("snapshots/") ? { expirationTtl: 30 * 86400 } : {}),
			});
		},
		async get(key) {
			const { value, metadata } = await env.MEDIA_KV.getWithMetadata(key, { type: "stream", cacheTtl: 30 });
			if (value === null) return null;
			return {
				body: value,
				httpEtag: metadata?.etag ? `"${metadata.etag}"` : undefined,
				writeHttpMetadata(headers) { headers.set("Content-Type", metadata?.contentType || "application/octet-stream"); },
			};
		},
		delete(key) { return env.MEDIA_KV.delete(key); },
	};
}
