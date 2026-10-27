import {readFile,readdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {parse} from 'node-html-parser';
import {assetPolicy,verifyAssetAliases,canonicalPublicAsset} from './asset-aliases.mjs';

const [target,output='dist',snapshotPath]=process.argv.slice(2);
if(!['cloudflare','static','mirror'].includes(target))throw new Error('Usage: node scripts/build-smoke.mjs <cloudflare|static|mirror> [output] [snapshot]');
const root=path.resolve(output);
/** @type {string[]} */const failures=[];
/** @param {boolean} pass @param {string} message */
const check=(pass,message)=>{if(!pass)failures.push(message);};
/** @param {string} dir @returns {Promise<string[]>} */
async function files(dir){const out=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);out.push(...(e.isDirectory()?await files(p):[p]));}return out;}
const aliases=await verifyAssetAliases(root),all=await files(root),seen=new Set();
/** @param {string|undefined} url @param {string} relative */
async function reference(url,relative){
 if(!url||/^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(url))return;
 const pathname=decodeURIComponent(new URL(url,'http://local'+relative).pathname);
 if(seen.has(pathname))return;seen.add(pathname);
 const file=path.resolve(root,'.'+pathname),rel=path.relative(root,file);
 check(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel),'Resource escapes output: '+url);
 check((await stat(file).catch(()=>null))?.isFile()===true,'Missing built resource '+pathname);
}
for(const file of all.filter(f=>f.endsWith('.html'))){
 const html=await readFile(file,'utf8'),dom=parse(html),relative='/'+path.relative(root,file).split(path.sep).join('/');
 for(const el of dom.querySelectorAll('img,source,script[src],link[href],astro-island,video[poster],a[data-fancybox]')){
  for(const name of ['src','data-src','poster','component-url','renderer-url'])await reference(el.getAttribute(name),relative);
  if(target==='mirror')for(const name of ['src','data-src','poster']){const url=el.getAttribute(name);if(url)check(canonicalPublicAsset(url)===url,'Mirror retains old canonical reference '+url);}
  if(el.tagName==='LINK'&&/stylesheet|icon|preload|modulepreload/.test(el.getAttribute('rel')||''))await reference(el.getAttribute('href'),relative);
  if(el.hasAttribute('data-fancybox'))await reference(el.getAttribute('href'),relative);
  for(const part of el.getAttribute('srcset')?.split(',')||[])await reference(part.trim().split(/\s/)[0],relative);
 }
}
for(const file of all.filter(f=>f.endsWith('.css')))for(const m of (await readFile(file,'utf8')).matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/g))await reference(m[1],'/'+path.relative(root,file).split(path.sep).join('/'));
for(const font of assetPolicy.originals.filter(f=>/\.(ttf|woff2?)$/.test(f.path))){const b=await readFile(path.join(root,font.path.slice(7)));check(createHash('sha256').update(b).digest('hex')===font.sha256,'Font changed: '+font.path);}
if(target==='cloudflare')for(const file of ['_worker.js/index.js','.assetsignore','_routes.json'])check((await stat(path.join(root,file)).catch(()=>null))?.isFile()===true,'Missing SSR artifact '+file);
else{
 for(const file of ['index.html','pagefind/pagefind-entry.json','rss.xml','sitemap-index.xml'])check((await stat(path.join(root,file)).catch(()=>null))?.isFile()===true,'Missing static artifact '+file);
 check(!(await stat(path.join(root,'_worker.js')).catch(()=>null)),'Static build must not contain a Worker');
}
if(target==='mirror'){
 if(!snapshotPath)throw new Error('Mirror smoke requires its safe input snapshot');
 const snapshot=JSON.parse(await readFile(snapshotPath,'utf8')),version=JSON.parse(await readFile(path.join(root,'mirror-version.json'),'utf8'));
 check(version.revision===snapshot.revision&&Number.isFinite(Date.parse(version.builtAt)),'Mirror marker invalid');
 for(const post of snapshot.posts){
  const file=path.join(root,decodeURIComponent(post.url).replace(/^\//,''),'index.html'),html=await readFile(file,'utf8');
  check(html.includes(post.title)||html.includes(post.title.replaceAll('&','&amp;')),'Missing mirror post '+post.url);
  if(snapshotPath==='scripts/fixtures/asset-build-snapshot.json')check(parse(html).querySelector('.katex')!==null,'Offline fixture math was not rendered');
 }
 /** Derive expected URLs from this input and this output, never another build's temporary snapshot. @param {string} url */
 function builtImage(url){
  const canonical=canonicalPublicAsset(url);if(canonical!==url)return canonical;
  if(/^https?:\/\//.test(url)||url.startsWith('/media/')){
   const basename=createHash('sha256').update(url).digest('hex');
   const file=all.find(f=>path.relative(root,f).split(path.sep).join('/').startsWith('mirror-media/'+basename+'.'));
   check(!!file,'Missing downloaded mirror image '+url);
   return file?'/'+path.relative(root,file).split(path.sep).join('/'):url;
  }
  return url;
 }
 const albumIndex=parse(await readFile(path.join(root,'albums/index.html'),'utf8'));
 for(const album of snapshot.albums||[]){
  const dom=parse(await readFile(path.join(root,'albums',album.slug,'index.html'),'utf8'));
  const photos=dom.querySelectorAll('a[data-fancybox]').map(a=>a.getAttribute('data-src')||a.getAttribute('href'));
  check(JSON.stringify(photos)===JSON.stringify(album.photos.map(/** @param {{src:string}} p */p=>builtImage(p.src))),'Mirror album originals/order changed: '+album.slug);
  const cover=builtImage(album.image);
  check(albumIndex.querySelectorAll('img').some(i=>i.getAttribute('src')===cover||i.getAttribute('data-src')===cover),'Mirror album cover missing: '+album.slug);
 }
}
console.log(JSON.stringify({target,output,historicalURLs:aliases.length,html:all.filter(f=>f.endsWith('.html')).length,localResourceURLs:seen.size,failures}));
if(failures.length)process.exitCode=1;
