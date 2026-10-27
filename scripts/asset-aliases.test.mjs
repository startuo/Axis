import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink,stat,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import * as aliases from './asset-aliases.mjs';

async function fixture(t){
 const root=await mkdtemp(path.join(tmpdir(),'axis-alias-test-'));
 t.after(async()=>{if(!root.startsWith(path.join(tmpdir(),'axis-alias-test-')))throw new Error('Unsafe cleanup');await rm(root,{recursive:true,force:true});});
 const bytes=await sharp({create:{width:3,height:2,channels:4,background:'#abcdef80'}}).png().toBuffer();
 const sha256=createHash('sha256').update(bytes).digest('hex');
 await mkdir(path.join(root,'public'),{recursive:true});await writeFile(path.join(root,'public/picture.png'),bytes);
 const policy={originals:[{path:'public/old.webp',source:'public/picture.png',classification:'historical',sha256,size:bytes.length,format:'png',width:3,height:2}],aliases:[{path:'public/old.webp',canonical:'public/picture.png',sha256,reason:'Preserve published URL bytes'}],bundleAliases:[]};
 const output=path.join(root,'build');await mkdir(output);await writeFile(path.join(output,'picture.png'),bytes);
 return {root,output,policy,bytes,sha256};
}
test('canonical-only source generates byte-identical legacy output and verifies both URLs',async t=>{
 const f=await fixture(t);await aliases.generateAssetAliases(f.output,f);
 assert.deepEqual(await readFile(path.join(f.output,'old.webp')),f.bytes);
 assert.equal(await stat(path.join(f.root,'public/old.webp')).catch(()=>null),null);
 assert.equal((await aliases.verifyAssetAliases(f.output,f)).length,1);
 await aliases.generateAssetAliases(f.output,f); // Existing identical outputs are safe.
 await writeFile(path.join(f.output,'old.webp'),Buffer.from('corrupt'));
 await assert.rejects(()=>aliases.verifyAssetAliases(f.output,f),/bytes|hash|SHA/i);
});
test('wrong source hash and missing expected SHA fail before generating aliases',async t=>{
 const f=await fixture(t);f.policy.aliases[0].sha256='0'.repeat(64);
 await assert.rejects(()=>aliases.generateAssetAliases(f.output,f),/hash|SHA|baseline/i);
 assert.equal(await stat(path.join(f.output,'old.webp')).catch(()=>null),null);
 delete f.policy.aliases[0].sha256;
 await assert.rejects(()=>aliases.generateAssetAliases(f.output,f),/hash|SHA/i);
});
test('alias path traversal, absolute paths, Windows separators and duplicate paths fail',async t=>{
 const f=await fixture(t);
 for(const bad of ['public/../outside.webp','/outside.webp','C:/outside.webp','public\\old.webp']){
  const policy=structuredClone(f.policy);policy.aliases[0].path=bad;
  await assert.rejects(()=>aliases.generateAssetAliases(f.output,{...f,policy}),/path|relative|unsafe|invalid/i);
 }
 const policy=structuredClone(f.policy);policy.aliases.push({...policy.aliases[0]});
 await assert.rejects(()=>aliases.generateAssetAliases(f.output,{...f,policy}),/duplicate|conflict/i);
});
test('case-only aliases and target directory spelling conflict on every OS',async t=>{
 const f=await fixture(t);let policy=structuredClone(f.policy);
 policy.aliases.push({...policy.aliases[0],path:'public/Old.webp'});
 await assert.rejects(()=>aliases.generateAssetAliases(f.output,{...f,policy}),/case|duplicate|conflict/i);
 policy=structuredClone(f.policy);policy.aliases[0].path='public/assets/old.webp';policy.originals[0].path=policy.aliases[0].path;
 await mkdir(path.join(f.output,'Assets'));
 await assert.rejects(()=>aliases.generateAssetAliases(f.output,{...f,policy}),/case|conflict/i);
});
test('existing output collision is never overwritten, and output cannot target source folders',async t=>{
 const f=await fixture(t);await writeFile(path.join(f.output,'old.webp'),Buffer.from('other data'));
 await assert.rejects(()=>aliases.generateAssetAliases(f.output,f),/collision|conflict/i);
 assert.equal(await readFile(path.join(f.output,'old.webp'),'utf8'),'other data');
 for(const root of new Set([f.root,await realpath(f.root)]))for(const output of [root,path.join(root,'public'),path.join(root,'src'),path.join(root,'src','new-output')]){
  await assert.rejects(()=>aliases.generateAssetAliases(output,f),/source|output/i);
  assert.equal(await stat(path.join(output,'old.webp')).catch(()=>null),null,'Protected source folders must never receive aliases');
 }
});
test('source and destination directory links cannot escape the selected root',async t=>{
 const f=await fixture(t),other=await fixture(t);
 const kind=process.platform==='win32'?'junction':'dir';
 await symlink(other.root,path.join(f.root,'public','link'),kind);
 const policy=structuredClone(f.policy);policy.aliases[0].canonical='public/link/public/picture.png';policy.originals[0].source=policy.aliases[0].canonical;
 await assert.rejects(()=>aliases.generateAssetAliases(f.output,{...f,policy}),/symlink|link|escape/i);
 await symlink(other.root,path.join(f.output,'assets'),kind);
 const targetPolicy=structuredClone(f.policy);targetPolicy.aliases[0].path='public/assets/old.webp';targetPolicy.originals[0].path=targetPolicy.aliases[0].path;
 await assert.rejects(()=>aliases.generateAssetAliases(f.output,{...f,policy:targetPolicy}),/symlink|link|escape/i);
});
test('output root ancestors cannot redirect writes through a directory link',async t=>{
 const f=await fixture(t),other=await fixture(t);
 await symlink(other.root,path.join(f.root,'linked'),process.platform==='win32'?'junction':'dir');
 await aliases.generateAssetAliases(path.join(f.root,'linked','build'),f).then(()=>assert.fail('Output escaped through an ancestor link'),error=>assert.match(error.message,/symlink|link|escape/i));
 assert.equal(await stat(path.join(other.output,'old.webp')).catch(()=>null),null);
});
test('canonical extensions and canonical URL collisions cannot be hidden by valid hashes',async t=>{
 const f=await fixture(t);await writeFile(path.join(f.root,'public','wrong.jpg'),f.bytes);
 const wrong=structuredClone(f.policy);wrong.aliases[0].canonical='public/wrong.jpg';wrong.originals[0].source='public/wrong.jpg';
 await assert.rejects(()=>aliases.generateAssetAliases(f.output,{...f,policy:wrong}),/canonical|format/i);
 await writeFile(path.join(f.root,'public','other.png'),f.bytes);
 const collision=structuredClone(f.policy);collision.aliases.push({...collision.aliases[0],path:'public/picture.png',canonical:'public/other.png'});collision.originals.push({...collision.originals[0],path:'public/picture.png',source:'public/other.png'});
 await assert.rejects(()=>aliases.generateAssetAliases(f.output,{...f,policy:collision}),/canonical|conflict/i);
});
test('dev HTTP provides legacy bytes and intentional legacy MIME without source copies',async t=>{
 const f=await fixture(t),middleware=await aliases.createAssetAliasMiddleware(f);
 const server=createServer((req,res)=>middleware(req,res,()=>{res.writeHead(404);res.end();}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const origin='http://127.0.0.1:'+server.address().port;
 const response=await fetch(origin+'/old.webp?test=1');assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/webp');assert.deepEqual(Buffer.from(await response.arrayBuffer()),f.bytes);
 const head=await fetch(origin+'/old.webp',{method:'HEAD'});assert.equal(head.status,200);assert.equal(Number(head.headers.get('content-length')),f.bytes.length);assert.equal((await head.arrayBuffer()).byteLength,0);
 assert.equal((await fetch(origin+'/unregistered.webp')).status,404);
 assert.equal(await stat(path.join(f.root,'public/old.webp')).catch(()=>null),null);
});
