import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeKatex from "rehype-katex";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import rehypeRaw from "rehype-raw";
import { visit } from "unist-util-visit";

const schema = {
	...defaultSchema,
	tagNames: [...defaultSchema.tagNames, "iframe", "video", "source"],
	attributes: {
		...defaultSchema.attributes,
		iframe: [
			"src",
			"title",
			"width",
			"height",
			"allowFullScreen",
			"loading",
		],
		video: ["src", "controls", "poster"],
		source: ["src", "type"],
		code: [
			...(defaultSchema.attributes.code ?? []),
			["className", /^language-./, "math-inline", "math-display"],
		],
		div: [
			...(defaultSchema.attributes.div ?? []),
			["className", "math", "math-display"],
		],
	},
};
export async function renderMarkdown(source) {
	const headings = [];
	const processor = unified()
		.use(remarkParse)
		.use(remarkGfm)
		.use(remarkMath)
		.use(remarkRehype, { allowDangerousHtml: true })
		.use(rehypeRaw)
		.use(rehypeSanitize, schema)
		.use(
			() => (tree) =>
				visit(tree, "element", (node) => {
					if (node.tagName === "iframe") {
						const src = String(node.properties.src ?? "");
						try {
							const url = new URL(
								src.startsWith("//") ? "https:" + src : src,
							);
							if (
								url.protocol !== "https:" ||
								![
									"www.youtube.com",
									"www.youtube-nocookie.com",
									"player.bilibili.com",
								].includes(url.hostname)
							)
								throw new Error();
							node.properties.src = url.href;
							node.properties.loading = "lazy";
							node.properties.sandbox =
								"allow-scripts allow-same-origin allow-presentation";
						} catch {
							node.tagName = "span";
							node.properties = {};
							node.children = [];
						}
					}
				}),
		)
		.use(rehypeKatex, { strict: false, trust: false })
		.use(rehypeSlug)
		.use(
			() => (tree) =>
				visit(tree, "element", (node) => {
					if (/^h[1-6]$/.test(node.tagName)) {
						let text = "";
						visit(node, "text", (n) => {
							text += n.value;
						});
						headings.push({
							depth: Number(node.tagName[1]),
							slug: String(node.properties.id),
							text,
						});
					}
				}),
		)
		.use(rehypeStringify);
	const html = String(await processor.process(source ?? ""));
	const words = (source ?? "").replace(/\s/g, "").length;
	return {
		html,
		headings,
		remarkPluginFrontmatter: {
			words,
			minutes: Math.max(1, Math.ceil(words / 350)),
		},
	};
}
