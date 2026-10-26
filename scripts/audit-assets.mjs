// Read-only asset gate. Legacy exceptions are individual, byte-pinned aliases.
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,readdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import ts from 'typescript';
import MarkdownIt from 'markdown-it';
import {detectImageMime} from '../shared/media.mjs';

/** @typedef {{path:string,sha256:string,size:number,format?:string,width?:number,height?:number}} Original */
/** @typedef {{path:string,canonical:string,reason:string}} Alias */
/** @typedef {{originals:Original[],aliases:Alias[]}} Policy */
/** @typedef {{code:string,path:string,message:string}} Finding */
/** @typedef {Original & {extension:string,mismatch:boolean,references:{source:string,line:number,kind:string}[]}} ImageRow */
const imageExtension=/\.(png|jpe?g|webp|gif|avif|svg|tiff?|bmp|ico)$/i;
const fontExtension=/\.(ttf|otf|woff2?)$/i;
const textExtension=/\.(astro|svelte|[cm]?[jt]sx?|css|json|mdx?|ya?ml|html)$/i;
const sha256=/** @param {Buffer} bytes */ bytes=>createHash('sha256').update(bytes).digest('hex');

/** @param {{root?:string,files?:string[],policy?:Policy,budgetBytes?:number}} [options] */
export async function auditAssets(options={}){
 const root=path.resolve(options.root||process.cwd());
 /** @type {Policy} */
 const policy=options.policy??JSON.parse(await readFile(new URL('./asset-integrity-baseline.json',import.meta.url),'utf8'));
 const files=[...new Set(options.files??execFileSync('git',['ls-files','-z','--cached','--others','--exclude-standard'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean))].sort();
 /** @type {Finding[]} */ const errors=[];
 /** @type {Finding[]} */ const warnings=[];
 /** @type {ImageRow[]} */ const images=[];
 /** @type {Map<string,Original>} */ const assets=new Map();
 /** @type {Map<string,string>} */ const texts=new Map();
 const aliases=new Map(policy.aliases.map(a=>[a.path,a]));
 /** @param {string} relative */
 function resolve(relative){
  const result=path.resolve(root,relative);
  if(result!==root&&!result.startsWith(root+path.sep))throw new Error('Asset path escapes repository: '+relative);
  return result;
 }
 /** @type {Map<string,boolean>} */ const existence=new Map();
 /** Check actual spelling as well as existence, including on Windows. @param {string} relative */
 async function exactExists(relative){
  if(existence.has(relative))return existence.get(relative);
  let dir=root,found=true;
  for(const part of path.relative(root,resolve(relative)).split(path.sep)){
   /** @type {string[]} */ const entries=await readdir(dir).catch(()=>[]);
   if(!entries.includes(part)){found=false;break;}
   dir=path.join(dir,part);
  }
  if(found)found=(await stat(dir).catch(()=>null))?.isFile()??false;
  existence.set(relative,found);return found;
 }
 for(const file of files){
  let bytes;try{bytes=await readFile(resolve(file));}catch(error){if(/** @type {NodeJS.ErrnoException} */(error).code==='ENOENT')continue;throw error;}
  if(textExtension.test(file))texts.set(file,bytes.toString('utf8'));
  const mime=detectImageMime(bytes);
  if(!mime&&!imageExtension.test(file)&&!fontExtension.test(file))continue;
  const row={path:file,sha256:sha256(bytes),size:bytes.length};
  if(fontExtension.test(file)&&!mime){assets.set(file,row);continue;}
  try{
   const meta=await sharp(bytes,{animated:true}).metadata();
   const format=mime?.split('/')[1]||meta.format;
   const extension=path.extname(file).slice(1).toLowerCase();
   const expected=extension==='jpg'?'jpeg':extension==='tif'?'tiff':extension;
   const image={...row,format,width:meta.width,height:meta.height,extension,mismatch:format!==expected,references:[]};
   images.push(image);assets.set(file,image);
   if(image.mismatch&&!aliases.has(file))errors.push({code:'FORMAT_MISMATCH',path:file,message:`.${extension} contains ${format}`});
   if(bytes.length>(options.budgetBytes??2*1024*1024)||(meta.width??0)*(meta.height??0)>16_000_000)warnings.push({code:'RESOURCE_BUDGET',path:file,message:`${bytes.length} bytes; ${meta.width}x${meta.height}; original preserved`});
  }catch(error){errors.push({code:'INVALID_IMAGE',path:file,message:String(error)});}
 }
 for(const original of policy.originals){
  const current=assets.get(original.path);
  if(!current)errors.push({code:'MISSING_ORIGINAL',path:original.path,message:'Pinned original is missing'});
  else if(['sha256','size','format','width','height'].some(key=>original[/** @type {keyof Original} */(key)]!==undefined&&original[/** @type {keyof Original} */(key)]!==current[/** @type {keyof Original} */(key)]))errors.push({code:'ORIGINAL_CHANGED',path:original.path,message:'Pinned original bytes, dimensions or format changed'});
 }
 for(const alias of policy.aliases){
  const legacy=assets.get(alias.path),canonical=assets.get(alias.canonical);
  if(!alias.reason||!legacy||!canonical||legacy.sha256!==canonical.sha256)errors.push({code:'ALIAS_CHANGED',path:alias.path,message:'Legacy alias requires a reason and an identical canonical asset: '+alias.canonical});
  if(canonical&&images.find(i=>i.path===alias.canonical)?.mismatch)errors.push({code:'INVALID_CANONICAL',path:alias.canonical,message:'Canonical extension must match the image format'});
 }
 const quoted=/(?:["'`])([^"'`\r\n]*?\.(?:png|jpe?g|webp|gif|avif|svg|ico|ttf|otf|woff2?)(?:[?#][^"'`\s]*)?)(?:["'`])/gi;
 const markdown=new MarkdownIt();
 for(const [source,content] of texts){
  const lines=content.split(/\r?\n/);
  for(const image of images){
   const names=[image.path,image.path.replace(/^public/,''),image.path.replace(/^src\//,''),path.posix.basename(image.path)];
   lines.forEach((line,index)=>{const direct=names.slice(0,-1).some(name=>line.includes(name));if(direct||line.includes(names.at(-1)??''))image.references.push({source,line:index+1,kind:direct?'literal':'basename-candidate'});});
  }
  // Documentation and negative test fixtures remain inventory evidence, not live source references.
  if(!/^(src|public)\//.test(source)||/(^|\/)README\.md$/i.test(source))continue;
  /** @type {{value:string,offset:number}[]} */ const references=[];
  if(/\.mdx?$/.test(source)){
   /** @param {import('markdown-it/lib/token.mjs').default[]} tokens */
   const walk=tokens=>{for(const token of tokens){if(token.type==='image')references.push({value:token.attrGet('src')??'',offset:0});if(token.children)walk(token.children);}};
   walk(markdown.parse(content,{}));
   const frontmatter=content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
   for(const match of frontmatter?.[1].matchAll(/^\s*(?:image|cover|thumbnail):\s*["']?([^"'\s]+)["']?\s*$/gm)??[])references.push({value:match[1],offset:0});
  }else if(/\.(?:[cm]?[jt]sx?|svelte|astro)$/.test(source)){
   const chunks=/\.svelte$/.test(source)?[...content.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]):/\.astro$/.test(source)?[content.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1]??'',...[...content.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1])]:[content];
   for(const chunk of chunks){
    const tree=ts.createSourceFile(source,chunk,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
    /** @param {import('typescript').Node} node */
    const walk=node=>{if(ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node))references.push({value:node.text,offset:0});ts.forEachChild(node,walk);};walk(tree);
   }
   if(/\.(?:svelte|astro)$/.test(source))for(const match of content.matchAll(/(?:src|href|poster)=["']([^"']+)["']/g))references.push({value:match[1],offset:match.index});
  }else references.push(...[...content.replace(/\/\*[\s\S]*?\*\//g,'').matchAll(quoted)].map(m=>({value:m[1],offset:m.index})));
  const styles=/\.css$/.test(source)?[content]:/\.(svelte|astro)$/.test(source)?[...content.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]):[];
  const styleReferences=new Set();
  for(const style of styles)for(const match of style.replace(/\/\*[\s\S]*?\*\//g,'').matchAll(/url\(\s*(?:"([^"]+)"|'([^']+)'|([^\s)]+))\s*\)/gi)){const value=match[1]||match[2]||match[3];styleReferences.add(value);references.push({value,offset:0});}
  for(const {value,offset} of new Map(references.map(r=>[r.value,r])).values()){
   if(!imageExtension.test(value.split(/[?#]/)[0])&&!fontExtension.test(value.split(/[?#]/)[0]))continue;
   if(/^\.[a-z0-9]+$/i.test(value))continue; // Extension lists are not resource URLs.
   if(/^(https?:|data:|blob:|#)/i.test(value)||/[${}*]/.test(value))continue;
   if(/^\s*(\/\/|\*|<!--)/.test(content.slice(content.lastIndexOf('\n',offset)+1,offset)))continue;
   let reference;try{reference=decodeURIComponent(value.split(/[?#]/)[0]);}catch{errors.push({code:'MISSING_REFERENCE',path:source,message:'Invalid URL encoding: '+value});continue;}
   let target;
   if(reference.startsWith('/_astro/')||reference.startsWith('/og/'))continue; // Generated routes are checked against build output.
   if(reference.startsWith('/'))target='public'+reference;
   else if(reference.startsWith('@assets/'))target='src/assets/'+reference.slice(8);
   else if(reference.startsWith('@/'))target='src/'+reference.slice(2);
   else if(reference.startsWith('assets/'))target=await exactExists('src/'+reference)?'src/'+reference:'public/'+reference;
   else if(reference.startsWith('./public/'))target=reference.slice(2);
   else if(fontExtension.test(reference)&&source==='src/config.ts')target='public/assets/font/'+reference;
   else if(reference.startsWith('.')||styleReferences.has(value)||/\.(?:mdx?|css)$/.test(source)||(source.startsWith('public/')&&/\.(json|html)$/.test(source)))target=path.posix.normalize(path.posix.join(path.posix.dirname(source),reference));
   else continue;
   if(!await exactExists(target))errors.push({code:'MISSING_REFERENCE',path:source,message:`${value} -> ${target}`});
  }
 }
 return {root,scope:'git tracked and unignored files; signature scan includes disguised extensions',filesScanned:files.length,textFiles:texts.size,images,fonts:[...assets.values()].filter(a=>fontExtension.test(a.path)),legacyAliases:policy.aliases,errors,warnings};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),unknown=args.filter((v,i)=>v!=='--json'&&args[i-1]!=='--json');
 if(unknown.length||args.at(-1)==='--json')throw new Error('Usage: node scripts/audit-assets.mjs [--json report.json]');
 const result=await auditAssets();
 const output=args.indexOf('--json');if(output>=0)await writeFile(args[output+1],JSON.stringify(result,null,2));
 console.log(`Asset audit: ${result.images.length} images, ${result.fonts.length} fonts, ${result.legacyAliases.length} pinned legacy aliases; ${result.errors.length} errors, ${result.warnings.length} budget warnings.`);
 for(const row of result.errors)console.error(`${row.code} ${row.path}: ${row.message}`);
 for(const row of result.warnings.slice(0,8))console.warn(`${row.code} ${row.path}: ${row.message}`);
 if(result.warnings.length>8)console.warn(`... ${result.warnings.length-8} more budget warnings; no assets modified.`);
 if(result.errors.length)process.exitCode=1;
}
