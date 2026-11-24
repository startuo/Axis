import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

test('sync preserves source and code, supports nested directories and fallback metadata, is repeatable and rejects traversal', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const fixture = fs.mkdtempSync(path.join(root, '.obsidian-fixture-'));
  try {
    fs.mkdirSync(path.join(fixture, 'scripts'));
    fs.mkdirSync(path.join(fixture, 'notes/sub'), { recursive: true });
    fs.copyFileSync(new URL('./sync-obsidian.mjs', import.meta.url), path.join(fixture, 'scripts/sync-obsidian.mjs'));
    fs.writeFileSync(path.join(fixture, 'scripts/obsidian-manifest.json'), JSON.stringify([
      { slug: 'first', source: 'sub/First.md', category: '测试' },
      { slug: 'second', source: 'Second.md', category: '测试', title: '第二篇标题', published: '2026-10-22', tags: ['paper'] },
    ]));
    const source = '---\ntitle: First\ncreated: 2026-07-08\ntags: [AI]\nsource: "参考 [[Second]]"\n---\n# First\n正文足够长，用来测试正文内容保持完整，链接和日期正常转换。\n[[Second|第二篇]] [[Missing|仅保留名称]]\n费用 $10/M 输入，$50/M 输出\n```markdown\n# Code heading\n[[Unchanged]]\n```\n# Another section\n';
    fs.writeFileSync(path.join(fixture, 'notes/sub/First.md'), source);
    fs.writeFileSync(path.join(fixture, 'notes/Second.md'), '# Second\n正文足够长用来验证无 Front Matter 时的回退字段。\n');
    const run = (...args) => spawnSync(process.execPath, [path.join(fixture, 'scripts/sync-obsidian.mjs'), '--source', path.join(fixture, 'notes'), ...args], { encoding: 'utf8' });
    assert.equal(run().status, 0);
    const output = path.join(fixture, 'src/content/posts/obsidian/first.md');
    const body = fs.readFileSync(output, 'utf8');
    assert.match(body, /published: 2026-07-08T/);
    assert.match(body, /\[第二篇\]\(\/posts\/obsidian\/second\/\)/);
    assert.match(body, /原笔记来源：参考 \[Second\]\(\/posts\/obsidian\/second\/\)/);
    assert.ok(!body.includes('[[Missing'));
    assert.ok(body.includes('\\$10/M'));
    assert.ok(body.includes('# Code heading\n[[Unchanged]]'));
    assert.ok(body.includes('## Another section'));
    const secondBody = fs.readFileSync(path.join(fixture, 'src/content/posts/obsidian/second.md'), 'utf8');
    assert.match(secondBody, /title: 第二篇标题/);
    assert.match(secondBody, /published: 2026-10-22T/);
    assert.equal(fs.readFileSync(path.join(fixture, 'notes/sub/First.md'), 'utf8'), source);
    assert.equal(run('--check').status, 0);
    fs.writeFileSync(path.join(fixture, 'notes/sub/First.md'), source + '\n更新\n');
    assert.equal(run('--check').status, 1);
    fs.unlinkSync(path.join(fixture, 'notes/Second.md'));
    assert.notEqual(run().status, 0);
    assert.equal(fs.readFileSync(output, 'utf8'), body);

    // 路径遍历必须被拒绝
    fs.writeFileSync(path.join(fixture, 'scripts/obsidian-manifest.json'), JSON.stringify([
      { slug: 'escape', source: '../outside.md', category: '测试' },
    ]));
    assert.notEqual(run().status, 0);
  } finally {
    if (!path.resolve(fixture).startsWith(path.resolve(root) + path.sep) || !path.basename(fixture).startsWith('.obsidian-fixture-')) throw new Error('Unsafe fixture cleanup');
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});
