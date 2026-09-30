import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.mjs';
import worker from '../index.mjs';
import { mediaStorage } from '../media-storage.mjs';

function kvMock() {
  const values = new Map();
  return { values,
    async put(key, value, options) { values.set(key, { bytes: new Uint8Array(value), ...options }); },
    async getWithMetadata(key) { const v=values.get(key); return { value:v ? new Response(v.bytes).body : null, metadata:v?.metadata }; },
    async delete(key) { values.delete(key); },
  };
}

test('KV preserves original bytes, metadata, HEAD and recoverable media deletion', async t => {
  const {env,admin,call}=setup(t), token=await admin(); env.MEDIA_KV=kvMock();
  const bytes=new Uint8Array([137,80,78,71,13,10,26,10,0,255]);
  const response=await worker.fetch(new Request('https://axis.test/api/v1/media',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'image/png'},body:bytes}),env);
  assert.equal(response.status,201); const {id,url}=await response.json();
  let read=await worker.fetch(new Request('https://axis.test'+url+'?variant=thumb'),env);
  assert.equal(read.status,200); assert.equal(read.headers.get('content-type'),'image/png');
  assert.match(read.headers.get('etag'),/^"[a-f0-9]{64}"$/);
  assert.deepEqual(new Uint8Array(await read.arrayBuffer()),bytes);
  read=await worker.fetch(new Request('https://axis.test'+url,{method:'HEAD'}),env);
  assert.equal(read.status,200); assert.equal(await read.text(),'');
  const stored=env.MEDIA_KV.values.get(id); env.MEDIA_KV.values.delete(id);
  read=await worker.fetch(new Request('https://axis.test'+url),env);
  assert.equal(read.status,503); assert.equal(read.headers.get('cache-control'),'no-store');
  env.MEDIA_KV.values.set(id,stored);
  assert.equal((await call('/api/v1/media/'+id,'DELETE',undefined,token)).status,200);
  assert.equal((await worker.fetch(new Request('https://axis.test'+url),env)).status,404);
  assert.equal(env.MEDIA_KV.values.has(id),true);
});

test('KV snapshot export is authenticated, uses unique archive keys and expires archives only', async t => {
  const {env,call}=setup(t); env.MEDIA_KV=kvMock();env.MIRROR_TOKEN='test-service-only';
  assert.equal((await call('/api/v1/mirror/export')).status,401);
  for(let i=0;i<2;i++)assert.equal((await call('/api/v1/mirror/export','GET',undefined,env.MIRROR_TOKEN)).status,200);
  assert.equal(env.MEDIA_KV.values.size,2);
  for(const [key,value] of env.MEDIA_KV.values) { assert.match(key,/^snapshots\/0\//);assert.equal(value.expirationTtl,30*86400);assert.equal(JSON.parse(new TextDecoder().decode(value.bytes)).revision,0); }
  await mediaStorage(env).put('image',new Uint8Array([1]),{httpMetadata:{contentType:'image/png'}});
  assert.equal(env.MEDIA_KV.values.get('image').expirationTtl,undefined);
});
