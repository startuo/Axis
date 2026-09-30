import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderMarkdown} from '../../shared/markdown.mjs';
test('Markdown preserves tables, math, headings, diagrams and trusted video without active HTML',async()=>{
 const {html,headings}=await renderMarkdown('# 中文标题\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n$x^2$\n\n```mermaid\ngraph TD; A-->B\n```\n\n<script>alert(1)</script><img src="x" onerror="alert(1)"><a href="javascript:alert(1)">x</a>\n\n<iframe src="https://www.youtube.com/embed/test"></iframe><iframe src="https://evil.example/embed"></iframe>');
 assert.match(html,/<table>/);assert.match(html,/katex/);assert.match(html,/language-mermaid/);assert.equal(headings[0].text,'中文标题');
 assert.match(html,/www.youtube.com\/embed\/test/);assert.doesNotMatch(html,/<script|onerror|javascript:|evil.example/);
});
