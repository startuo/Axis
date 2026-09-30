import {readFileSync,readdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
// Astro Icon defaults to embedding every installed collection in SSR. Keep only
// literal icons referenced by source/config, including configurable navigation.
export function iconIncludes(){
 const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
 const sets=Object.keys({...pkg.dependencies,...pkg.devDependencies}).filter(name=>name.startsWith('@iconify-json/')).map(name=>name.slice(14));
 const include=Object.fromEntries(sets.map(name=>[name,new Set()]));
 const definitions=Object.fromEntries(sets.map(name=>[name,JSON.parse(readFileSync(require.resolve('@iconify-json/'+name+'/icons.json'),'utf8'))]));
 const walk=dir=>{for(const item of readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isDirectory())walk(file);else if(/\.(astro|svelte|[cm]?[jt]s)$/.test(file)){for(const match of readFileSync(file,'utf8').matchAll(/([a-z0-9-]+):([a-z0-9-]+)/g)){const [,set,name]=match;if(include[set]&&(definitions[set].icons[name]||definitions[set].aliases?.[name]))include[set].add(name);}}}};
 walk(fileURLToPath(new URL('../src/',import.meta.url)));
 return Object.fromEntries(Object.entries(include).map(([set,names])=>[set,[...names].sort()]));
}
