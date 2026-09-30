import { defineMiddleware } from "astro:middleware";
import worker from "../workers/index.mjs";
import { buildSnapshot } from "../workers/mirror.mjs";
import { contentContext } from "./server/content-context.mjs";
export const onRequest = defineMiddleware(async (context, next) => {
	if (__AXIS_TARGET__ !== "cloudflare" || context.isPrerendered)
		return next();
	const env = context.locals.runtime?.env;
	if (!env?.DB)
		return new Response("内容服务尚未配置。请完成 D1 迁移和绑定。", {
			status: 503,
		});
	if (
		context.url.pathname.startsWith("/api/v1/") ||
		context.url.pathname.startsWith("/media/")
	)
		return worker.fetch(context.request, env);
	if (
		context.url.pathname.startsWith("/admin") ||
		context.url.pathname.startsWith("/user")
	)
		return next();
	try {
		const data = await buildSnapshot(env);
		const response = await contentContext.run({ snapshot: data }, next);
		response.headers.set("Cache-Control", "no-store");
		return response;
	} catch (error) {
		console.error(
			"content_read_failed",
			error instanceof Error ? error.message : "unknown",
		);
		return new Response("内容暂时无法读取，请稍后重试。", {
			status: 503,
			headers: { "Cache-Control": "no-store" },
		});
	}
});
