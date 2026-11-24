import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { parseDocument } from 'yaml';
import { renderMarkdown } from '../../shared/markdown.mjs';

test('Markdown preserves tables, math, headings, diagrams and trusted video without active HTML', async () => {
	const { html, headings } = await renderMarkdown('# 中文标题\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n$x^2$\n\n```mermaid\ngraph TD; A-->B\n```\n\n<script>alert(1)</script><img src="x" onerror="alert(1)"><a href="javascript:alert(1)">x</a>\n\n<iframe src="https://www.youtube.com/embed/test"></iframe><iframe src="https://evil.example/embed"></iframe>');
	assert.match(html, /<table>/);
	assert.match(html, /katex/);
	assert.match(html, /language-mermaid/);
	assert.equal(headings[0].text, '中文标题');
	assert.match(html, /www.youtube.com\/embed\/test/);
	assert.doesNotMatch(html, /<script|onerror|javascript:|evil.example/);
});

test('all Markdown posts in src/content/posts have valid YAML front matter and required fields', () => {
	function visit(dir) {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const full = `${dir}/${entry.name}`;
			if (entry.isDirectory()) visit(full);
			else if (full.endsWith('.md')) {
				const source = readFileSync(full, 'utf8');
				const match = source.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
				assert.ok(match, `Missing front matter: ${full}`);
				const doc = parseDocument(match[1]);
				assert.equal(doc.errors.length, 0, `Invalid YAML front matter: ${full}`);
				const data = doc.toJS({ maxAliasCount: 20 });
				assert.equal(typeof data?.title, 'string', `Missing title: ${full}`);
				assert.ok(data.title.trim().length > 0, `Empty title: ${full}`);
				assert.ok(Number.isFinite(Date.parse(String(data.published))), `Invalid published date: ${full}`);
			}
		}
	}
	visit('src/content/posts');
});
