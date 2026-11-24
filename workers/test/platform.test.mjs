import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './helpers.mjs';
import {buildSnapshot} from '../mirror.mjs';
import worker from '../index.mjs';
import {validateEntry,publicEntry} from '../entries.mjs';
const draft={title:'中文标题',content:'# 正文\n\n即时发布中文搜索',tags:['测试'],description:'简介'};
test('canonical URLs reject reserved pages and malformed encoding; metadata cannot replace identity',()=>{
 for(const url of ['/admin/','/%61dmin/','/%ZZ/','/message/','/foo/bar/'])assert.throws(()=>validateEntry('posts',{...draft,url},'example'));
 assert.equal(publicEntry({id:'real',kind:'posts',slug:'real',published:JSON.stringify({id:'spoof',kind:'albums',slug:'spoof'})}).id,'real');
});
test('mirror completion requires matching deployed revision and service credentials',async t=>{
 const {call,admin,env,sql}=setup(t),token=await admin();env.MIRROR_TOKEN='local-service-token';env.MIRROR_SITE_URL='https://mirror.example';
 await call('/api/v1/mirror/retry','POST',{},token);
 assert.equal((await call('/api/v1/mirror/complete','POST',{revision:1},token)).status,401);
 const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);
 // 镜像站切版瞬间发生网络超时或返回非 JSON 错误页时，应返回可重试的 409 而非 503
 globalThis.fetch=async()=>{throw new DOMException('timeout','TimeoutError');};
 assert.equal((await call('/api/v1/mirror/complete','POST',{revision:1},env.MIRROR_TOKEN)).status,409);
 globalThis.fetch=async()=>new Response('<html>502 Bad Gateway</html>',{status:502,headers:{'Content-Type':'text/html'}});
 assert.equal((await call('/api/v1/mirror/complete','POST',{revision:1},env.MIRROR_TOKEN)).status,409);
 globalThis.fetch=async()=>new Response('<html>reloading</html>',{status:200,headers:{'Content-Type':'text/html'}});
 assert.equal((await call('/api/v1/mirror/complete','POST',{revision:1},env.MIRROR_TOKEN)).status,409);
 globalThis.fetch=async()=>Response.json({revision:0});
 assert.equal((await call('/api/v1/mirror/complete','POST',{revision:1},env.MIRROR_TOKEN)).status,409);
 assert.equal(sql.prepare('SELECT status FROM mirror_jobs WHERE revision=1').get().status,'PENDING');
 globalThis.fetch=async()=>Response.json({revision:1});
 assert.equal((await call('/api/v1/mirror/complete','POST',{revision:1},env.MIRROR_TOKEN)).status,200);
 assert.equal(sql.prepare('SELECT status FROM mirror_jobs WHERE revision=1').get().status,'COMPLETE');
});
test('draft, publication, unpublished edits, CAS conflict, trash and restore are isolated',async t=>{
 const {call,admin,env}=setup(t),token=await admin();
 let r=await call('/api/v1/content/manage/posts','POST',{slug:'nested/hello',data:draft},token);
 assert.equal(r.status,201);let entry=r.data;const route='/api/v1/content/manage/posts/'+entry.id;
 assert.equal((await buildSnapshot(env)).posts.length,0);
 r=await call(route+'/publish','POST',{version:entry.version},token);assert.equal(r.status,200);entry=r.data;
 assert.equal((await call('/api/v1/content/public/posts?q='+encodeURIComponent('中文搜索'))).data.meta.total,1);
 r=await call(route,'PATCH',{version:entry.version,data:{...draft,title:'尚未公开'}},token);assert.equal(r.status,200);
 assert.equal((await buildSnapshot(env)).posts[0].title,'中文标题');
 assert.equal((await call(route,'PATCH',{version:entry.version,data:draft},token)).status,409);entry=r.data;
 r=await call(route,'DELETE',{version:entry.version},token);assert.equal(r.status,200);entry=r.data;
 assert.equal((await buildSnapshot(env)).posts.length,0);
 r=await call(route+'/restore','POST',{version:entry.version},token);assert.equal(r.data.status,'DRAFT');
 assert.equal((await buildSnapshot(env)).posts.length,0);
});
test('idempotent import, URL collision, and role boundaries',async t=>{
 const {call,admin,register}=setup(t),token=await admin(),reader=await register();
 const input={slug:'hello',sourceKey:'markdown:hello.md',data:draft};
 const a=await call('/api/v1/content/manage/posts','POST',input,token);
 const b=await call('/api/v1/content/manage/posts','POST',input,token);
 assert.equal(a.data.id,b.data.id);assert.equal(b.data.existing,true);
 assert.equal((await call('/api/v1/content/manage/posts','POST',{slug:'other',data:{...draft,url:'/posts/hello/'}},token)).status,409);
 assert.equal((await call('/api/v1/content/manage/posts','GET',undefined,reader.accessToken)).status,403);
 assert.equal((await call('/api/v1/content/manage/posts','POST',{data:{...draft,url:'/admin/'}},token)).status,400);
});
test('public feed limit matches client, moderation queues mirror and never exposes author',async t=>{
 const {call,admin,register,env}=setup(t),token=await admin(),reader=await register();
 const message=(await call('/api/v1/feedback/messages','POST',{text:'审核后可见'},reader.accessToken)).data;
 assert.equal((await call('/api/v1/feedback/messages/public?limit=120')).status,400);
 assert.equal((await call('/api/v1/feedback/messages/public?limit=100')).status,200);
 await call('/api/v1/feedback/messages/admin/'+message.id+'/status','PATCH',{status:'APPROVED'},token);
 const snap=await buildSnapshot(env);assert.equal(snap.messages.length,1);assert.equal(snap.revision,1);assert.equal(snap.messages[0].author,undefined);
 await call('/api/v1/feedback/messages/admin/'+message.id+'/status','PATCH',{status:'REJECTED'},token);
 assert.equal((await buildSnapshot(env)).messages.length,0);
});
test('profile, favorites and reading history persist and remain private',async t=>{
 const {call,admin,register}=setup(t),token=await admin(),a=await register('alice'),b=await register('bob');
 let entry=(await call('/api/v1/content/manage/posts','POST',{data:draft},token)).data;
 await call('/api/v1/content/manage/posts/'+entry.id+'/publish','POST',{version:entry.version},token);
 await call('/api/v1/me/profile','PATCH',{nickname:'Alice',bio:'hello',readingHistory:false},a.accessToken);
 assert.equal((await call('/api/v1/me/profile','GET',undefined,a.accessToken)).data.nickname,'Alice');
 assert.notEqual((await call('/api/v1/me/profile','GET',undefined,b.accessToken)).data.nickname,'Alice');
 await call('/api/v1/me/favorites/'+entry.id,'PUT',undefined,a.accessToken);
 assert.equal((await call('/api/v1/me/favorites','GET',undefined,a.accessToken)).data.items.length,1);
 assert.equal((await call('/api/v1/me/favorites','GET',undefined,b.accessToken)).data.items.length,0);
 await call('/api/v1/me/history/'+entry.id,'PUT',undefined,a.accessToken);
 assert.equal((await call('/api/v1/me/history','GET',undefined,a.accessToken)).data.items.length,0);
});
test('all personal content kinds publish into the same snapshot',async t=>{
 const {call,admin,env}=setup(t),token=await admin();
 for(const [kind,data] of [['anime',{...draft,status:'watching',progress:2,totalEpisodes:12,rating:9}],['diary',{...draft,images:[]}],['albums',{...draft,photos:[]}]]){
  const r=await call('/api/v1/content/manage/'+kind,'POST',{data},token);assert.equal(r.status,201);
  assert.equal((await call(`/api/v1/content/manage/${kind}/${r.data.id}/publish`,'POST',{version:1},token)).status,200);
  assert.equal((await buildSnapshot(env))[kind].length,1);
 }
});
test('uploads validate signatures and referenced media cannot be removed',async t=>{
 const {call,admin,env}=setup(t),token=await admin(),objects=new Map();
 env.MEDIA={put:async(k,v)=>objects.set(k,v),delete:async k=>objects.delete(k)};
 const upload=async(bytes)=>worker.fetch(new Request('https://axis.test/api/v1/media',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'image/png'},body:bytes}),env);
 assert.equal((await upload(new TextEncoder().encode('<svg/>'))).status,400);
 const response=await upload(new Uint8Array([137,80,78,71,13,10,26,10]));assert.equal(response.status,201);const media=await response.json();
 await call('/api/v1/content/manage/posts','POST',{data:{...draft,image:media.url}},token);
 assert.equal((await call('/api/v1/media/'+media.id,'DELETE',undefined,token)).status,409);
});
