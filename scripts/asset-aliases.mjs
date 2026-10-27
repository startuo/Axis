import {readFile,mkdir,writeFile,readdir,lstat,realpath} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {detectImageMime} from '../shared/media.mjs';
/** @typedef {{path:string,source?:string,classification?:'historical'|'content'|'immutable',sha256:string,size:number,format?:string,width?:number,height?:number}} Original */
/** @typedef {{path:string,canonical:string,sha256:string,reason:string}} Alias */
/** @typedef {{source:string,output:string,sha256:string,reason:string}} BundleAlias */
/** @typedef {{originals:Original[],aliases:Alias[],bundleAliases?:BundleAlias[]}} AssetPolicy */
/** @typedef {{root?:string,policy?:AssetPolicy}} AliasOptions */
/** @typedef {{source:string,url:string,output:string|null,sha256:string,size:number}} PlannedAlias */
/** @type {AssetPolicy} */
export const assetPolicy=JSON.parse(await readFile(new URL('./asset-integrity-baseline.json',import.meta.url),'utf8'));
const projectRoot=fileURLToPath(new URL('../',import.meta.url));
const digest=/** @param {Buffer} bytes */bytes=>createHash('sha256').update(bytes).digest('hex');
/** @type {Map<string,string>} */
const publicAliases=new Map(assetPolicy.aliases.filter(a=>a.path.startsWith('public/')).map(a=>[a.path.slice(6),a.canonical.slice(6)]));

/** Rewrite only known local public assets; media IDs and external URLs retain their contracts. @param {string} source */
export function canonicalPublicAsset(source){
 if(!source.startsWith('/')||source.startsWith('//'))return source;
 const pathname=source.split(/[?#]/)[0];
 return publicAliases.get(decodeURIComponent(pathname))?publicAliases.get(decodeURIComponent(pathname))+source.slice(pathname.length):source;
}
/** Choose downloaded filenames from bytes, never the response MIME. @param {Buffer} bytes */
export function mirrorImageExtension(bytes){
 const mime=detectImageMime(bytes);
 if(mime)return { 'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp','image/gif':'.gif','image/avif':'.avif'}[mime];
 if(/^\s*(?:<\?xml[\s\S]*?\?>\s*)?<svg[\s>]/i.test(bytes.toString('utf8')))return '.svg';
 throw new Error('Unsupported mirror image signature');
}
/** Paths in the manifest are portable repository-relative paths, never URLs. @param {string} value */
function portablePath(value){
 if(typeof value!=='string'||!value||path.posix.isAbsolute(value)||path.win32.isAbsolute(value)||/[\\\0:%?#]/.test(value)||value.split('/').some(p=>!p||p==='.'||p==='..'))throw new Error('Unsafe relative asset path: '+value);
 return value;
}
/** Reject spelling differences and directory links on Windows and Linux. @param {string} root @param {string} relative @param {boolean} [existing] */
async function safePath(root,relative,existing=false){
 portablePath(relative);let current=root;
 for(const segment of relative.split('/')){
  /** @type {string[]} */const names=await readdir(current).catch(error=>{if(error.code==='ENOENT')return [];throw error;});
  if(!names.includes(segment)&&names.some(n=>n.toLowerCase()===segment.toLowerCase()))throw new Error('Asset path case conflict: '+relative);
  current=path.join(current,segment);const info=await lstat(current).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
  if(info?.isSymbolicLink())throw new Error('Asset symlink/junction is not allowed: '+relative);
 }
 if(existing&&!(await lstat(current)).isFile())throw new Error('Asset source is not a file: '+relative);
 return current;
}
/** Validate the complete mapping before any output is written. @param {AliasOptions} [options] @returns {Promise<PlannedAlias[]>} */
export async function prepareAssetAliases(options={}){
 const root=await realpath(path.resolve(options.root||projectRoot)),policy=options.policy||assetPolicy;
 /** @type {PlannedAlias[]} */const rows=[];
 const urls=new Set();
 /** @param {string} url */const reserve=url=>{const key=url.toLowerCase();if(urls.has(key))throw new Error('Duplicate/case-conflicting alias URL: '+url);urls.add(key);};
 for(const a of policy.aliases){portablePath(a.path);portablePath(a.canonical);if(!/^(public|src\/assets)\//.test(a.path))throw new Error('Invalid alias path: '+a.path);reserve(a.path.startsWith('public/')?a.path.slice(6):'/'+a.path);}
 for(const a of policy.bundleAliases||[]){portablePath(a.source);portablePath(a.output);reserve('/'+a.output);}
 /** @param {string} source @param {string} expected @param {Original|undefined} original @param {string} reason */
 async function validate(source,expected,original,reason){
  if(!reason?.trim()||!expected||!/^[a-f0-9]{64}$/.test(expected)||!original||original.sha256!==expected)throw new Error('Alias requires a reason and matching immutable baseline SHA: '+source);
  const bytes=await readFile(await safePath(root,source,true));
  if(bytes.length!==original.size||digest(bytes)!==expected)throw new Error('Alias source bytes/SHA changed: '+source);
  const format=detectImageMime(bytes)?.split('/')[1],extension=path.extname(source).slice(1).toLowerCase();
  if(!format||(extension==='jpg'?'jpeg':extension)!==format)throw new Error('Canonical asset extension/format mismatch: '+source);
  return bytes.length;
 }
 for(const a of policy.aliases){
  const original=policy.originals.find(o=>o.path===a.path);
  if(original?.source!==a.canonical)throw new Error('Alias source does not match historical baseline: '+a.path);
  const size=await validate(a.canonical,a.sha256,original,a.reason);
  rows.push({source:a.canonical,url:a.path.startsWith('public/')?a.path.slice(6):'/'+a.path,output:a.path.startsWith('public/')?a.path.slice(7):null,sha256:a.sha256,size});
 }
 for(const a of policy.bundleAliases||[]){
  const original=policy.originals.find(o=>(o.source||o.path)===a.source);
  const size=await validate(a.source,a.sha256,original,a.reason);
  rows.push({source:a.source,url:'/'+a.output,output:a.output,sha256:a.sha256,size});
 }
 const canonicalURLs=new Set(rows.filter(r=>r.source.startsWith('public/')).map(r=>r.source.slice(6).toLowerCase()));
 for(const row of rows)if(canonicalURLs.has(row.url.toLowerCase())&&row.url!==row.source.slice(6))throw new Error('Alias conflicts with a canonical asset: '+row.url);
 return rows;
}
/** @param {string} output @param {string} root */
async function outputRoot(output,root){
 const result=path.resolve(output),source=path.resolve(root);
 const relative=path.relative(result,source);
 if(!relative||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative)))throw new Error('Output must not contain the source tree');
 for(const folder of ['public','src']){const rel=path.relative(path.join(source,folder),result);if(!rel||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel)))throw new Error('Output must not be a source folder');}
 const volume=path.parse(result).root;
 await safePath(volume,path.relative(volume,result).split(path.sep).join('/'));
 const info=await lstat(result).catch(error=>{if(error.code==='ENOENT')return null;throw error;});if(info?.isSymbolicLink())throw new Error('Output root cannot be a symlink');
 await mkdir(result,{recursive:true});return realpath(result);
}
/** Build-only copies preserve bytes; an existing different target is a hard failure. @param {string} output @param {AliasOptions} [options] */
export async function generateAssetAliases(output,options={}){
 const root=await realpath(path.resolve(options.root||projectRoot)),rows=await prepareAssetAliases({...options,root});
 const destination=await outputRoot(output,root);
 for(const row of rows.filter(r=>r.output)){
  const target=await safePath(destination,/** @type {string} */(row.output));
  const current=await readFile(target).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
  if(current&&(current.length!==row.size||digest(current)!==row.sha256))throw new Error('Legacy output collision: '+row.output);
 }
 for(const row of rows.filter(r=>r.output)){
  const target=await safePath(destination,/** @type {string} */(row.output));
  const current=await lstat(target).catch(()=>null);if(current)continue;
  const bytes=await readFile(await safePath(root,row.source,true));if(digest(bytes)!==row.sha256)throw new Error('Alias source SHA changed during build: '+row.source);
  await mkdir(path.dirname(target),{recursive:true});await writeFile(target,bytes,{flag:'wx'});
 }
 return verifyAssetAliases(output,options);
}
/** Post-build validation covers all old URLs plus the canonical public copies. @param {string} output @param {AliasOptions} [options] */
export async function verifyAssetAliases(output,options={}){
 const rows=await prepareAssetAliases(options),destination=await realpath(path.resolve(output));
 for(const row of rows.filter(r=>r.output)){
  for(const file of new Set([/** @type {string} */(row.output),...(row.source.startsWith('public/')?[row.source.slice(7)]:[])])){
   const bytes=await readFile(await safePath(destination,file,true));
   if(bytes.length!==row.size||digest(bytes)!==row.sha256)throw new Error('Built asset bytes/SHA mismatch: '+file);
  }
 }
 return rows.filter(r=>r.output);
}
/** Compatibility export for existing local tooling; now covers public aliases too. @param {string} output @param {AliasOptions} [options] */
export async function preserveBundledAssetAliases(output,options={}){return generateAssetAliases(output,options);}

/** No source files are generated by the dev server. @param {AliasOptions} [options] */
export async function createAssetAliasMiddleware(options={}){
 const root=await realpath(path.resolve(options.root||projectRoot)),rows=await prepareAssetAliases({...options,root});
 const byURL=new Map(rows.map(r=>[r.url,r]));
 const mime={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.avif':'image/avif','.gif':'image/gif','.ico':'image/x-icon'};
 /** @param {import('node:http').IncomingMessage} req @param {import('node:http').ServerResponse} res @param {(error?:Error)=>void} next */
 return async(req,res,next)=>{
  if(!['GET','HEAD'].includes(req.method||''))return next();
  let pathname;try{pathname=decodeURIComponent(new URL(req.url||'/','http://local').pathname);}catch{return next();}
  const row=byURL.get(pathname);if(!row)return next();
  if(pathname.startsWith('/src/')&&/[?&](import|url|raw)(?:[=&]|$)/.test(req.url||''))return next();
  try{
   const bytes=await readFile(await safePath(root,row.source,true));if(digest(bytes)!==row.sha256)throw new Error('Alias source SHA changed: '+row.source);
   res.writeHead(200,{'Content-Type':mime[/** @type {keyof typeof mime} */(path.extname(pathname))]||'application/octet-stream','Content-Length':bytes.length,'Cache-Control':'no-cache','ETag':'"'+row.sha256+'"'});res.end(req.method==='HEAD'?undefined:bytes);
  }catch(error){next(error instanceof Error?error:new Error(String(error)));}
 };
}
