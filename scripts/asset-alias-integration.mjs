import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {assetPolicy,prepareAssetAliases,generateAssetAliases,createAssetAliasMiddleware} from './asset-aliases.mjs';

/** One hook covers Astro CLI, both deployment wrappers and custom outDir builds.
 * @returns {import('astro').AstroIntegration} */
export function assetAliasIntegration(){
 let root=fileURLToPath(new URL('../',import.meta.url));
 return {name:'axis-historical-assets',hooks:{
  'astro:config:setup':async({config,updateConfig,addWatchFile})=>{
   root=fileURLToPath(config.root);
   const rows=await prepareAssetAliases({root});
   addWatchFile(new URL('./asset-integrity-baseline.json',import.meta.url));
   const legacySources=rows.filter(r=>r.output===null);
   updateConfig({vite:{plugins:[{name:'axis-legacy-image-imports',enforce:'pre',
    /** @param {string} id @param {string|undefined} importer */
    resolveId(id,importer){
     if(id.startsWith('\0'))return null;
     const clean=id.split('?')[0],suffix=id.slice(clean.length);
     const absolute=path.isAbsolute(clean)?path.normalize(clean):importer?path.resolve(path.dirname(importer.split('?')[0]),clean):null;
     const row=legacySources.find(r=>r.url===clean||absolute===path.resolve(root,r.url.slice(1)));
     return row?path.resolve(root,row.source)+suffix:null;
    }
   }]}});
  },
  'astro:server:setup':async({server})=>{server.middlewares.use(await createAssetAliasMiddleware({root}));},
  'astro:build:done':async({dir,logger})=>{
   const rows=await generateAssetAliases(fileURLToPath(dir),{root,policy:assetPolicy});
   logger.info(`Verified ${rows.length} byte-identical historical asset URLs.`);
  }
 }};
}
