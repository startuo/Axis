import {spawnSync} from 'node:child_process';
const output=process.env.AXIS_OUT_DIR||'dist';
const build=spawnSync(process.execPath,['node_modules/astro/astro.js','build'],{stdio:'inherit',env:process.env});
if(build.status!==0)process.exit(build.status??1);
const search=spawnSync(process.execPath,['node_modules/pagefind/lib/runner/bin.cjs','--site',output],{stdio:'inherit'});
process.exit(search.status??1);
