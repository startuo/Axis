import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep,posix,win32} from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {auditAssets} from './audit-assets.mjs';
import {canonicalPublicAsset,mirrorImageExtension,preserveBundledAssetAliases} from './asset-aliases.mjs';

async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'axis-asset-test-'));
 t.after(async()=>{if(!resolve(root).startsWith(resolve(tmpdir())+sep+'axis-asset-test-'))throw new Error('Unexpected fixture path');await rm(root,{recursive:true,force:true});});
 await mkdir(join(root,'public'),{recursive:true});
 const png=await sharp({create:{width:3,height:2,channels:4,background:'#abcdef80'}}).png().toBuffer();
 await writeFile(join(root,'public/picture.png'),png);
 return {root,png,hash:createHash('sha256').update(png).digest('hex')};
}
test('new mismatched image fails, even without an image extension',async t=>{
 const f=await fixture(t);await writeFile(join(f.root,'public/incorrect.webp'),f.png);
 await writeFile(join(f.root,'public/disguised.bin'),f.png);
 const result=await auditAssets({...f,files:['public/picture.png','public/incorrect.webp','public/disguised.bin'],policy:{originals:[],aliases:[]}});
 assert.equal(result.images.length,3);
 assert.equal(result.errors.filter(e=>e.code==='FORMAT_MISMATCH').length,2);
});
test('historical mapping is virtual and cannot hide changed canonical bytes',async t=>{
 const f=await fixture(t);
 const policy={originals:[{path:'public/old.webp',source:'public/picture.png',classification:'historical',sha256:f.hash,size:f.png.length,format:'png',width:3,height:2}],aliases:[{path:'public/old.webp',canonical:'public/picture.png',sha256:f.hash,reason:'Historical URL compatibility'}]};
 let result=await auditAssets({...f,files:['public/picture.png'],policy});assert.equal(result.errors.length,0);
 await writeFile(join(f.root,'public/picture.png'),Buffer.concat([f.png,Buffer.from('changed')]));
 result=await auditAssets({...f,files:['public/picture.png'],policy});
 assert.ok(result.errors.some(e=>e.code==='ORIGINAL_CHANGED'));
 assert.ok(result.errors.some(e=>e.code==='ALIAS_CHANGED'));
});
test('missing canonical reference and wrong path case are errors; encoded font path works',async t=>{
 const f=await fixture(t);await mkdir(join(f.root,'src/styles'),{recursive:true});await mkdir(join(f.root,'public/assets/font'),{recursive:true});
 await writeFile(join(f.root,'public/assets/font/中文.ttf'),Buffer.from('font fixture'));
 await writeFile(join(f.root,'src/styles/test.css'),'a{background:url("/picture.png")} @font-face{src:url("/assets/font/%E4%B8%AD%E6%96%87.ttf")}');
 let result=await auditAssets({...f,files:['public/picture.png','src/styles/test.css'],policy:{originals:[],aliases:[]}});assert.equal(result.errors.length,0);
 await writeFile(join(f.root,'src/styles/test.css'),'a{background:url("/Picture.png")} b{background:url("/missing.png")}');
 result=await auditAssets({...f,files:['public/picture.png','src/styles/test.css'],policy:{originals:[],aliases:[]}});
 assert.equal(result.errors.filter(e=>e.code==='MISSING_REFERENCE').length,2);
});
test('budget only warns; a canonical alias with different pixels fails',async t=>{
 const f=await fixture(t);
 const policy={originals:[{path:'public/old.webp',source:'public/picture.png',sha256:f.hash,size:f.png.length}],aliases:[{path:'public/old.webp',canonical:'public/picture.png',sha256:f.hash,reason:'Historical URL compatibility'}]};
 let result=await auditAssets({...f,files:['public/picture.png'],policy,budgetBytes:1});assert.equal(result.errors.length,0);assert.equal(result.warnings.length,1);
 const other=await sharp(f.png).negate().png().toBuffer();await writeFile(join(f.root,'public/picture.png'),other);
 result=await auditAssets({...f,files:['public/picture.png'],policy});assert.ok(result.errors.some(e=>e.code==='ALIAS_CHANGED'));
});
test('mirror canonical paths preserve URL suffixes and leave media/external contracts intact',()=>{
 assert.equal(canonicalPublicAsset('/assets/desktop-banner/1.webp?original=1#view'),'/assets/desktop-banner/1.jpg?original=1#view');
 assert.equal(canonicalPublicAsset('/media/01234567?variant=original'),'/media/01234567?variant=original');
 assert.equal(canonicalPublicAsset('https://example.com/assets/desktop-banner/1.webp'),'https://example.com/assets/desktop-banner/1.webp');
 assert.equal(canonicalPublicAsset('//example.com/image.webp'),'//example.com/image.webp');
});
test('downloaded image extension follows bytes and rejects HTML; bundled avatar alias stays identical',async t=>{
 const f=await fixture(t);assert.equal(mirrorImageExtension(f.png),'.png');
 assert.throws(()=>mirrorImageExtension(Buffer.from('<html>not an image</html>')),/signature/);
 const policy=JSON.parse(await readFile(new URL('./asset-integrity-baseline.json',import.meta.url)));
 for(const a of policy.aliases.filter(a=>a.path.startsWith('public/'))){const target=join(f.root,a.canonical.slice(7));await mkdir(resolve(target,'..'),{recursive:true});await writeFile(target,await readFile(new URL('../'+a.canonical,import.meta.url)));}
 await preserveBundledAssetAliases(f.root);
 assert.deepEqual(await readFile(join(f.root,'_astro/avatar.nWn5Mszy.webp')),await readFile(new URL('../src/assets/images/avatar.png',import.meta.url)));
 assert.deepEqual(await readFile(join(f.root,'_astro/avatar.nWn5Mszy_18wN4e.webp')),await readFile(new URL('../public/_astro/avatar.nWn5Mszy_18wN4e.webp',import.meta.url)));
 for(const a of policy.aliases.filter(a=>a.path.startsWith('public/')))assert.deepEqual(await readFile(join(f.root,a.path.slice(7))),await readFile(join(f.root,a.canonical.slice(7))));
});
test('bare Markdown images and CSS url() in stylesheets and components cannot hide missing references',async t=>{
 const f=await fixture(t);await mkdir(join(f.root,'src/styles'),{recursive:true});
 await writeFile(join(f.root,'src/post.md'),'![broken](missing.png)');
 await writeFile(join(f.root,'src/styles/test.css'),'a{background:url(/missing-css.png)}');
 await writeFile(join(f.root,'src/Example.astro'),'<style>a{background:url(missing-astro.png)}</style>');
 await writeFile(join(f.root,'src/Example.svelte'),'<style>a{background:url(missing-svelte.png)}</style>');
 const files=['public/picture.png','src/post.md','src/styles/test.css','src/Example.astro','src/Example.svelte'];
 const result=await auditAssets({...f,files,policy:{originals:[],aliases:[]}});
 assert.equal(result.errors.filter(e=>e.code==='MISSING_REFERENCE').length,4);
});
test('album migration excludes both cover filenames on Windows and POSIX',async()=>{
 const source=await readFile(new URL('./migrate-content.mjs',import.meta.url),'utf8');
 const block=source.slice(source.indexOf('const coverFile'),source.indexOf('entries.push',source.indexOf('const coverFile')));
 const predicate=block.match(/\.filter\(\s*\(f\)\s*=>\s*([\s\S]*?),\s*\)\s*\.map/)?.[1];assert.ok(predicate);
 for(const platform of [posix,win32]){
  const include=new Function('path','coverFile',`return f => ${predicate}`)(platform,'cover.png');
  assert.equal(include(platform.join('public','images','albums','AcgExample','cover.png')),false);
  assert.equal(include(platform.join('public','images','albums','AcgExample','cover.jpg')),false);
  assert.equal(include(platform.join('public','images','albums','AcgExample','1.webp')),true);
 }
});
test('Markdown can reference registered virtual legacy URLs but source duplicates fail',async t=>{
 const f=await fixture(t);await mkdir(join(f.root,'src'));await writeFile(join(f.root,'src/post.md'),'![old](/old.webp)');
 const policy={originals:[{path:'public/old.webp',source:'public/picture.png',classification:'historical',sha256:f.hash,size:f.png.length}],aliases:[{path:'public/old.webp',canonical:'public/picture.png',sha256:f.hash,reason:'Published Markdown URL'}]};
 let result=await auditAssets({...f,files:['public/picture.png','src/post.md'],policy});assert.deepEqual(result.errors,[]);
 await writeFile(join(f.root,'public/old.webp'),f.png);
 result=await auditAssets({...f,files:['public/picture.png','public/old.webp','src/post.md'],policy});
 assert.ok(result.errors.some(e=>e.code==='SOURCE_ALIAS_PRESENT'));assert.ok(result.errors.some(e=>e.code==='FORMAT_MISMATCH'));
});
test('content updates require explicit baseline review; classification cannot bypass historical SHA',async t=>{
 const f=await fixture(t),original={path:'public/picture.png',classification:'content',sha256:f.hash,size:f.png.length,format:'png',width:3,height:2};
 const next=await sharp(f.png).negate().png().toBuffer();await writeFile(join(f.root,'public/picture.png'),next);
 let policy={originals:[original],aliases:[]};let result=await auditAssets({...f,files:['public/picture.png'],policy});
 assert.ok(result.errors.some(e=>e.code==='ORIGINAL_CHANGED'&&e.message.includes('reviewed')));
 original.sha256=createHash('sha256').update(next).digest('hex');original.size=next.length;
 result=await auditAssets({...f,files:['public/picture.png'],policy});assert.deepEqual(result.errors,[]);
 policy={originals:[{...original,path:'public/old.webp',source:'public/picture.png'}],aliases:[{path:'public/old.webp',canonical:'public/picture.png',sha256:f.hash,reason:'History cannot follow content changes'}]};
 result=await auditAssets({...f,files:['public/picture.png'],policy});assert.ok(result.errors.some(e=>e.code==='ALIAS_CHANGED'));
});
