import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
// Reuse the YAML parser already installed by the site's YAML integration.
const require = createRequire(import.meta.resolve('@rollup/plugin-yaml'));
const YAML = require('js-yaml');

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(fs.readFileSync(new URL('./obsidian-manifest.json', import.meta.url), 'utf8'));
const args = process.argv.slice(2);
const sourceArg = args.indexOf('--source');
const source = sourceArg >= 0 ? args[sourceArg + 1] : process.env.OBSIDIAN_ARTICLES_DIR;
const check = args.includes('--check');
if (!source || !fs.existsSync(source)) {
  console.error('指定知识归纳目录：pnpm sync:obsidian --source "D:/.../知识归纳" [--check]');
  process.exit(1);
}
const outputDir = path.join(root, 'src/content/posts/obsidian');
if (fs.existsSync(outputDir) && fs.lstatSync(outputDir).isSymbolicLink()) throw new Error('同步目标不能是符号链接');
const names = new Map(manifest.map(entry => [entry.source.replace(/\.md$/, ''), entry.slug]));
const report = [];
const writes = [];
for (const entry of manifest) {
  if (!/^[a-z0-9-]+$/.test(entry.slug) || path.basename(entry.source) !== entry.source) throw new Error('清单路径无效');
  const input = fs.readFileSync(path.join(source, entry.source), 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const match = input.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  const metadata = match ? YAML.load(match[1], { schema: YAML.JSON_SCHEMA }) || {} : {};
  let body = match ? input.slice(match[0].length).trim() : input.trim();
  const title = String(metadata.title || body.match(/^#\s+(.+)$/m)?.[1] || entry.source.replace(/\.md$/, ''));
  const date = String(metadata.created || metadata.date_researched || '2026-09-14').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`日期无效：${entry.source}`);
  const unresolved = new Set();
  let fence = null;
  let removedTitle = false;
  body = body.split('\n').map(line => {
    const marker = line.match(/^\s*(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
      return line.replace(/^(\s*`{3,})cron\s*$/, '$1text');
    }
    if (fence) return line;
    if (/^#\s+/.test(line)) {
      if (!removedTitle) { removedTitle = true; return ''; }
      return `#${line}`; // 保留源文后续一级标题的内容
    }
    return line.replace(/(?<!\\)\$(?=\d)/g, '\\$').replace(/(!?)\[\[([^\]]+)\]\]/g, (_, embed, target) => {
      const [destination, ...labels] = target.replace(/\\\|/g, '|').split('|');
      const name = destination.split('#')[0].replace(/\.md$/, '');
      const label = (labels.join('|') || name).replace(/[\[\]]/g, '');
      const slug = names.get(name);
      if (slug && !embed) return `[${label}](/posts/obsidian/${slug}/)`;
      unresolved.add(name);
      return label;
    });
  }).join('\n').trim();
  // 发布副本仅将具体本机个人路径改成示例目录，源笔记不变。
  body = body.replace(/[A-Z]:[\\/]Users[\\/][^\s`<>"']+/g, '<本地用户目录>');
  const description = body.split('\n').map(line => line.replace(/^>\s*/, '').replace(/\*\*/g, '').trim())
    .find(line => line.length > 25 && !/^[#|`~\-!<]/.test(line))?.slice(0, 150) || `${title}：来自 Obsidian 知识沉淀的学习与实践整理。`;
  const image = `/images/obsidian/${entry.slug}.png`;
  const imageExists = fs.existsSync(path.join(root, 'public', image));
  const frontmatter = {
    title, published: new Date(`${date}T00:00:00Z`), updated: new Date(`${String(metadata.updated || date).slice(0, 10)}T00:00:00Z`),
    description, tags: Array.isArray(metadata.tags) ? metadata.tags.map(String) : ['知识沉淀'],
    category: entry.category, lang: 'zh_CN', draft: false,
    ...(imageExists ? { image } : {}),
  };
  const sourceNote = metadata.source ? `\n\n---\n\n原笔记来源：${String(metadata.source)}\n` : '\n';
  const result = `---\n${YAML.dump(frontmatter, { lineWidth: -1 })}---\n\n${body}${sourceNote}`;
  const dest = path.join(outputDir, `${entry.slug}.md`);
  const changed = !fs.existsSync(dest) || fs.readFileSync(dest, 'utf8') !== result;
  if (changed) writes.push([dest, result]);
  report.push({ source: entry.source, slug: entry.slug, title, sourceHash: createHash('sha256').update(input).digest('hex'), image: imageExists ? image : null, unresolvedLinks: [...unresolved] });
}
if (!check) {
  fs.mkdirSync(outputDir, { recursive: true });
  for (const [dest, body] of writes) fs.writeFileSync(dest, body);
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs/obsidian-sync-report.json'), JSON.stringify(report, null, 2) + '\n');
}
console.log(`${check ? '检查' : '同步'} ${report.length} 篇，${writes.length} 篇${check ? '待更新' : '更新'}，${report.filter(r => r.image).length} 张配图。`);
if (check && writes.length) process.exitCode = 1;
