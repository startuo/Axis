import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import ts from 'typescript';

test('current full-font policy explicitly disables compression and the real CLI changes no font files',async()=>{
 const source=await readFile('src/config.ts','utf8'),tree=ts.createSourceFile('config.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
 let config;
 const visit=node=>{if(ts.isVariableDeclaration(node)&&node.name.getText(tree)==='siteConfig')config=node.initializer;ts.forEachChild(node,visit);};visit(tree);
 const property=(object,name)=>object.properties.find(p=>ts.isPropertyAssignment(p)&&p.name.getText(tree)===name)?.initializer;
 const font=property(config,'font');assert.ok(font&&ts.isObjectLiteralExpression(font));
 for(const name of ['asciiFont','cjkFont']){
  const entry=property(font,name);assert.equal(property(entry,'enableCompress').kind,ts.SyntaxKind.FalseKeyword,`${name} must stay explicitly disabled until a separate font-coverage review`);
  const local=property(entry,'localFonts');assert.ok(ts.isArrayLiteralExpression(local)&&local.elements.length>0);
 }
 async function snapshot(root){
  const info=await stat(root).catch(()=>null);if(!info)return [];
  const rows=[];for(const e of await readdir(root,{withFileTypes:true})){const p=path.join(root,e.name);if(e.isDirectory())rows.push(...await snapshot(p));else rows.push({path:p,sha256:createHash('sha256').update(await readFile(p)).digest('hex')});}return rows.sort((a,b)=>a.path.localeCompare(b.path));
 }
 const roots=['public/assets/font','public/fonts'];
 const before=await Promise.all(roots.map(snapshot)),css=await readFile('src/styles/fonts.css','utf8');
 const result=spawnSync(process.execPath,['scripts/compress-fonts.js'],{encoding:'utf8',timeout:60000});
 assert.equal(result.status,0,result.stderr||result.stdout);assert.match(result.stdout,/No fonts to compress/);
 assert.deepEqual(await Promise.all(roots.map(snapshot)),before);assert.equal(await readFile('src/styles/fonts.css','utf8'),css);assert.match(css,/\.ttf/);
});
