import site from "../dist/_worker.js/index.js";
import api from "./index.mjs";
export default {
	fetch(request, env, ctx) {
		const path = new URL(request.url).pathname;
		// 显式阻断 Astro 运行时图像优化端点，消除线上可达面（配合 passthrough 配置）
		if (path === "/_image" || path.startsWith("/_image/"))
			return new Response("Not found", {
				status: 404,
				headers: { "Cache-Control": "no-store" },
			});
		if (path.startsWith("/api/v1/") || path.startsWith("/media/"))
			return api.fetch(request, env, ctx);
		if (
			/\.(?:js|mjs|css|map|png|jpg|jpeg|webp|gif|svg|avif|ico|woff2?|ttf|otf|mp4|webm|mp3|pdf)$/i.test(
				path,
			)
		)
			return env.ASSETS.fetch(request);
		return site.fetch(request, env, ctx);
	},
	scheduled(event, env, ctx) {
		ctx.waitUntil(api.scheduled(event, env));
	},
};
