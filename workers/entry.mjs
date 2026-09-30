import site from "../dist/_worker.js/index.js";
import api from "./index.mjs";
export default {
	fetch(request, env, ctx) {
		const path = new URL(request.url).pathname;
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
