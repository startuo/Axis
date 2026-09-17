import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { contentPath, validateMarkdown, contentService } from '../content.mjs';

const path='src/content/posts/test.md';
const source='---\ntitle: 测试\npublished: 2026-09-17\ntags: [测试]\n---\n# 正文\n';
const sha='a'.repeat(40);
function github({status=200,mode='100644',currentSha=sha}={}) {
  const calls=[];
  const request=async(url,options)=>{
    calls.push({url,options});
    if(status!==200) return Response.json({message:'secret should not escape'},{status});
    if(url.includes('/git/trees/')) return Response.json({tree:[{path,type:'blob',mode,sha:currentSha,size:100},{path:'.env',type:'blob',mode:'100644'}]});
    if(options.method==='PUT') return Response.json({content:{sha:'b'.repeat(40)},commit:{sha:'c'.repeat(40)}});
    return Response.json({path,type:'file',encoding:'base64',size:100,sha:currentSha,content:Buffer.from(source).toString('base64')});
  };
  return {calls,request};
}
test('content path cannot escape Markdown directory or edit code',()=>{
  for(const path of ['.env','src/content/../workers/index.mjs','src/content/posts/../../.env','src/content//a.md','src/content/a.mdx','src/content/./a.md','src/content/a\\b.md']) assert.throws(()=>contentPath(path));
  assert.equal(contentPath('src/content/posts/中文.md'),'src/content/posts/中文.md');
});
test('validates required metadata, invalid YAML and size without rewriting source',()=>{
  validateMarkdown(path,source);
  for(const invalid of ['# no YAML',source.replace('2026-09-17','invalid'),source.replace('tags: [测试]','tags: 123'),source.replace('title: 测试','title: [bad]'),source+'x'.repeat(200000)]) assert.throws(()=>validateMarkdown(path,invalid));
});
test('all existing Markdown files are accepted without metadata loss',()=>{
  function visit(dir){for(const e of readdirSync(dir,{withFileTypes:true})){const p=dir+'/'+e.name;if(e.isDirectory())visit(p);else if(p.endsWith('.md'))validateMarkdown(p,readFileSync(p,'utf8'));}}
  visit('src/content');
});
test('only regular Markdown files are listed and missing token makes saves fail closed',async()=>{
  const mock=github();const service=contentService({},mock.request);
  assert.equal((await service.list()).items.length,1);
  assert.equal((await service.read(path)).source,source);
  await assert.rejects(service.save({path,sha,source}),e=>e.status===503);
  assert.equal(mock.calls.some(c=>c.options.method==='PUT'),false);
  const symlink=contentService({GITHUB_TOKEN:'test-only'},github({mode:'120000'}).request);
  await assert.rejects(symlink.read(path),e=>e.status===400);
});
test('save preserves UTF-8 and uses fixed repo, SHA, branch; stale content never overwrites',async()=>{
  const mock=github();const service=contentService({GITHUB_TOKEN:'test-only'},mock.request);
  const next=source+'新内容 🌟';
  const result=await service.save({path,sha,source:next,repository:'attacker/repo',branch:'other'});
  assert.match(result.commitUrl,/github.com\/startuo\/Axis\/commit\//);
  const call=mock.calls.find(c=>c.options.method==='PUT');const body=JSON.parse(call.options.body);
  assert.equal(body.branch,'main');assert.equal(body.sha,sha);assert.equal(Buffer.from(body.content,'base64').toString(),next);
  assert.equal(call.options.redirect,'error');assert.equal(call.options.headers.Authorization,'Bearer test-only');
  const stale=github({currentSha:'d'.repeat(40)});
  await assert.rejects(contentService({GITHUB_TOKEN:'test-only'},stale.request).save({path,sha,source:next}),e=>e.status===409);
  assert.equal(stale.calls.some(c=>c.options.method==='PUT'),false);
});
test('no-op save makes no commit, and GitHub failures never expose upstream messages',async()=>{
  const mock=github();assert.equal((await contentService({GITHUB_TOKEN:'test-only'},mock.request).save({path,sha,source})).unchanged,true);
  assert.equal(mock.calls.some(c=>c.options.method==='PUT'),false);
  for(const status of [401,403,404,409,422,500]) await assert.rejects(contentService({},github({status}).request).list(),e=>!e.message.includes('secret'));
});
