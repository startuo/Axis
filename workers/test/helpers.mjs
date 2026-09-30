import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import worker from '../index.mjs';
// SQLite runs the actual migration and SQL; this adapter only supplies the D1 interface.
function database() {
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys=ON');
  for(const name of readdirSync(new URL('../migrations/',import.meta.url)).sort())sql.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
  const db = {
    prepare(query) {
      let args=[];
      return {
        bind(...values) { args=values; return this; },
        async first() { return sql.prepare(query).get(...args) ?? null; },
        async all() { return {results:sql.prepare(query).all(...args)}; },
        async run() { const s=sql.prepare(query);return s.columns().length?{results:s.all(...args)}:{meta:s.run(...args)}; },
      };
    },
    async batch(statements) {
      sql.exec('BEGIN');
      try { const result=[]; for(const s of statements) result.push(await s.run()); sql.exec('COMMIT'); return result; }
      catch(error) { sql.exec('ROLLBACK'); throw error; }
    },
  };
  return {db,sql};
}
export function setup(t) {
  const {db,sql}=database(); t.after(()=>sql.close());
  const env={DB:db,JWT_SECRET:'test-only-key-'+ 'x'.repeat(40),ASSETS:{fetch:async()=>new Response('static')}};
  const call=async(path,method='GET',data,token,ip='203.0.113.1')=> {
    const r=await worker.fetch(new Request('https://axis.test'+path,{method,headers:{'Content-Type':'application/json','CF-Connecting-IP':ip,...(token?{Authorization:'Bearer '+token}:{})},...(data!==undefined?{body:JSON.stringify(data)}:{})}),env);
    return {status:r.status,data:await r.json().catch(()=>null)};
  };
  const register=async(name='reader')=>(await call('/api/v1/auth/register','POST',{username:name,email:name+'@test.dev',password:'long-password-123'})).data;
  const admin=async()=> { const result=await register('owner'); sql.prepare("UPDATE users SET role='ADMIN' WHERE id=?").run(result.user.id); return result.accessToken; };
  return {sql,env,call,register,admin};
}
