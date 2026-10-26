import {readFile,mkdir,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {detectImageMime} from '../shared/media.mjs';
const policy=JSON.parse(await readFile(new URL('./asset-integrity-baseline.json',import.meta.url),'utf8'));
/** @type {Map<string,string>} */
const publicAliases=new Map(policy.aliases.filter(/** @param {{path:string}} a */ a=>a.path.startsWith('public/')).map(/** @param {{path:string,canonical:string}} a */ a=>[a.path.slice(6),a.canonical.slice(6)]));

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
/** Preserve the original content-hashed avatar URL for cached HTML. @param {string} output */
export async function preserveBundledAssetAliases(output){
 for(const alias of policy.bundleAliases){
  const bytes=await readFile(new URL('../'+alias.source,import.meta.url));
  const expected=policy.originals.find(/** @param {{path:string}} a */ a=>a.path===alias.source);
  if(!expected||createHash('sha256').update(bytes).digest('hex')!==expected.sha256)throw new Error('Legacy bundle source changed: '+alias.source);
  const target=path.resolve(output,alias.output),root=path.resolve(output);
  if(!target.startsWith(root+path.sep))throw new Error('Invalid legacy asset target');
  const current=await readFile(target).catch(()=>null);
  if(current&&!current.equals(bytes))throw new Error('Legacy bundle collision: '+alias.output);
  if(!current){await mkdir(path.dirname(target),{recursive:true});await copyFile(new URL('../'+alias.source,import.meta.url),target);}
 }
}
