import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from '../index.mjs';

import {setup} from './helpers.mjs';
test('health checks migrated database and static routing stays separate',async t=>{
  const {call,env}=setup(t);
  assert.equal((await call('/api/v1/health')).status,200);
  assert.equal((await call('/api/missing')).status,404);
  assert.equal(await (await worker.fetch(new Request('https://axis.test/'),env)).text(),'static');
});
test('registration cannot grant admin, stores only password hashes and signs a session',async t=>{
  const {call,sql}=setup(t);
  const r=await call('/api/v1/auth/register','POST',{username:'reader',email:'r@test.dev',password:'long-password',role:'ADMIN'});
  assert.equal(r.status,200); assert.equal(r.data.user.role,'USER'); assert.equal(r.data.user.passwordHash,undefined);
  assert.match(sql.prepare('SELECT passwordHash FROM users').get().passwordHash,/^pbkdf2-sha256/);
  assert.equal((await call('/api/v1/auth/me','GET',undefined,r.data.accessToken)).status,200);
  assert.equal((await call('/api/v1/auth/login','POST',{account:'r@test.dev',password:'long-password'})).status,200);
  assert.equal((await call('/api/v1/auth/login','POST',{account:'r@test.dev',password:'wrong-password'})).status,401);
});
test('anonymous, ordinary users and forged tokens cannot access admin endpoints',async t=>{
  const {call,register}=setup(t); const r=await register();
  for(const [token,status] of [[undefined,401],[r.accessToken,403],[r.accessToken+'x',401]]) {
    assert.equal((await call('/api/v1/articles/admin','GET',undefined,token)).status,status);
    assert.equal((await call('/api/v1/dashboard/snapshot','GET',undefined,token)).status,status);
    assert.equal((await call('/api/v1/content/admin','GET',undefined,token)).status,status);
    assert.equal((await call('/api/v1/content/admin','PUT',{path:'src/content/posts/test.md',source:'test'},token)).status,status);
  }
});
test('legacy article writes are closed after migrating to unified content',async t=>{
 const {call,admin}=setup(t);const token=await admin();
 assert.equal((await call('/api/v1/articles/admin','POST',{title:'x'},token)).status,410);
});

test('feedback is private until approved by an administrator',async t=>{
  const {call,register,admin}=setup(t); const token=await admin(); const reader=await register();
  const r=await call('/api/v1/feedback/messages','POST',{text:'留言',color:'#abcdef'},reader.accessToken);
  assert.equal(r.status,201); assert.equal(r.data.status,'PENDING');
  assert.equal((await call('/api/v1/feedback/messages/public')).data.length,0);
  const route='/api/v1/feedback/messages/admin/'+r.data.id+'/status';
  assert.equal((await call(route,'PATCH',{status:'APPROVED'},reader.accessToken)).status,403);
  assert.equal((await call(route,'PATCH',{status:'APPROVED'},token)).status,200);
  const messages=(await call('/api/v1/feedback/messages/public')).data;
  assert.equal(messages.length,1); assert.equal(messages[0].author,undefined);
});
test('invalid inputs and SQL injection cannot alter tables',async t=>{
  const {call,admin,sql}=setup(t); const token=await admin();
  assert.equal((await call('/api/v1/content/manage/posts','POST',{data:{title:'',content:'x'}},token)).status,400);
  assert.equal((await call('/api/v1/content/public/posts?page=-1')).status,400);
  assert.equal((await call('/api/v1/articles/public?keyword='+encodeURIComponent("'; DROP TABLE users; --"))).status,200);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM users').get().n,1);
  assert.equal((await call('/api/v1/auth/register','POST',{username:'x',email:'bad',password:'short'})).status,400);
});
test('auth rate limit survives requests; invalid JWT secret fails closed',async t=>{
  const {call,env}=setup(t);
  for(let i=0;i<10;i++) assert.equal((await call('/api/v1/auth/login','POST',{account:'missing',password:'long-password'})).status,401);
  assert.equal((await call('/api/v1/auth/login','POST',{account:'missing',password:'long-password'})).status,429);
  env.JWT_SECRET='short';
  assert.equal((await call('/api/v1/auth/me','GET',undefined,'fake')).status,503);
});
test('failed logins from an attacker IP do not lock out the admin from their own IP',async t=>{
  const {call,admin}=setup(t); await admin();
  for(let i=0;i<10;i++) assert.equal((await call('/api/v1/auth/login','POST',{account:'owner@test.dev',password:'wrong-password'},undefined,'198.51.100.10')).status,401);
  assert.equal((await call('/api/v1/auth/login','POST',{account:'owner@test.dev',password:'wrong-password'},undefined,'198.51.100.10')).status,429);
  const ok=await call('/api/v1/auth/login','POST',{account:'owner@test.dev',password:'long-password-123'},undefined,'203.0.113.5');
  assert.equal(ok.status,200);
  assert.equal(ok.data.expiresIn,'24h');
});
test('registration switch disables public signups cleanly',async t=>{
  const {call,env}=setup(t);
  env.ALLOW_REGISTRATION='false';
  assert.equal((await call('/api/v1/auth/config')).data.allowRegistration,false);
  assert.equal((await call('/api/v1/auth/session')).data.allowRegistration,false);
  assert.equal((await call('/api/v1/auth/register','POST',{username:'blocked',email:'b@test.dev',password:'long-password'})).status,403);
});
test('HttpOnly cookie session hides token in cookie mode, enforces same-origin CSRF, and clears on logout',async t=>{
  const {env,register}=setup(t); await register('cookieuser');
  const loginRes=await worker.fetch(new Request('https://axis.test/api/v1/auth/login',{
    method:'POST',
    headers:{'Content-Type':'application/json','X-Axis-Session-Mode':'cookie','CF-Connecting-IP':'203.0.113.8'},
    body:JSON.stringify({account:'cookieuser@test.dev',password:'long-password-123'}),
  }),env);
  assert.equal(loginRes.status,200);
  const loginData=await loginRes.json();
  assert.equal(loginData.accessToken,undefined);
  assert.equal(loginData.tokenType,'Cookie');
  const setCookie=loginRes.headers.get('set-cookie')||'';
  assert.match(setCookie,/axis_session=[^;]+/);
  assert.match(setCookie,/HttpOnly/);
  assert.match(setCookie,/SameSite=Strict/);
  assert.match(setCookie,/Secure/);
  const cookiePair=setCookie.split(';')[0];

  const sessRes=await worker.fetch(new Request('https://axis.test/api/v1/auth/session',{headers:{Cookie:cookiePair}}),env);
  assert.equal(sessRes.status,200);
  assert.equal((await sessRes.json()).authenticated,true);

  const crossOrigin=await worker.fetch(new Request('https://axis.test/api/v1/feedback/messages',{
    method:'POST',
    headers:{'Content-Type':'application/json',Cookie:cookiePair,Origin:'https://evil.example'},
    body:JSON.stringify({text:'hi',color:'#abcdef'}),
  }),env);
  assert.equal(crossOrigin.status,403);

  const noOrigin=await worker.fetch(new Request('https://axis.test/api/v1/feedback/messages',{
    method:'POST',
    headers:{'Content-Type':'application/json',Cookie:cookiePair},
    body:JSON.stringify({text:'hi',color:'#abcdef'}),
  }),env);
  assert.equal(noOrigin.status,403);

  const sameOrigin=await worker.fetch(new Request('https://axis.test/api/v1/feedback/messages',{
    method:'POST',
    headers:{'Content-Type':'application/json',Cookie:cookiePair,Origin:'https://axis.test','Sec-Fetch-Site':'same-origin'},
    body:JSON.stringify({text:'hi',color:'#abcdef'}),
  }),env);
  assert.equal(sameOrigin.status,201);

  const logoutRes=await worker.fetch(new Request('https://axis.test/api/v1/auth/logout',{
    method:'POST',
    headers:{Cookie:cookiePair,Origin:'https://axis.test','Sec-Fetch-Site':'same-origin'},
  }),env);
  assert.equal(logoutRes.status,200);
  assert.match(logoutRes.headers.get('set-cookie')||'',/Max-Age=0/);
});
test('revoking database role invalidates admin access even with an existing token',async t=>{
  const {call,admin,sql}=setup(t); const token=await admin();
  sql.prepare("UPDATE users SET role='USER'").run();
  assert.equal((await call('/api/v1/articles/admin','GET',undefined,token)).status,403);
});
test('duplicate registration, invalid dates, oversized bodies and nonexistent feedback',async t=>{
  const {call,register,admin}=setup(t); const token=await admin(); await register();
  assert.equal((await call('/api/v1/auth/register','POST',{username:'reader',email:'reader@test.dev',password:'long-password'})).status,409);
  assert.equal((await call('/api/v1/content/manage/posts','POST',{data:{title:'x',content:'x',published:'bad-date'}},token)).status,400);
  assert.equal((await call('/api/v1/content/manage/posts','POST',{data:{title:'x',content:'x'.repeat(270000)}},token)).status,413);
  assert.equal((await call('/api/v1/feedback/messages/admin/missing/status','PATCH',{status:'APPROVED'},token)).status,404);
});
test('scheduled cleanup removes expired operational data without deleting users',async t=>{
  const {env,sql,register}=setup(t); await register();
  sql.prepare('INSERT INTO visitors VALUES(?,?)').run('expired',0);
  sql.prepare('INSERT INTO rate_limits VALUES(?,?,?)').run('expired',1,0);
  await worker.scheduled({},env);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM visitors').get().n,0);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM rate_limits WHERE key=?').get('expired').n,0);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM users').get().n,1);
});
