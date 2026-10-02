import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { detectImageMime, uploadOriginal } from '../../shared/media.mjs';
import { setup } from './helpers.mjs';
import worker from '../index.mjs';

const image = sharp({ create: { width: 2, height: 3, channels: 3, background: '#b5cfb7' } });
const jpeg = await image.clone().jpeg().toBuffer();
const endpoint = 'https://axis.test/api/v1/media';

test('image MIME detection uses actual content for all supported formats', async () => {
	for (const [format, type] of [['jpeg', 'image/jpeg'], ['png', 'image/png'], ['webp', 'image/webp'], ['gif', 'image/gif'], ['avif', 'image/avif']]) {
		const bytes = await image.clone()[format]().toBuffer();
		assert.equal(detectImageMime(bytes.subarray(0, 64)), type);
	}
	for (const bytes of [new Uint8Array(), new Uint8Array([255, 216]), new Uint8Array([137, 80]), Buffer.from('not RIFFWEBP'), Buffer.from('<svg/>')])
		assert.equal(detectImageMime(bytes), null);
	const compatibleAvif = Buffer.from([0, 0, 0, 24, ...Buffer.from('ftypmif1'), 0, 0, 0, 0, ...Buffer.from('avifmif1')]);
	assert.equal(detectImageMime(compatibleAvif), 'image/avif');
});

test('renamed JPEG and missing or wrong file.type upload unchanged; backend rejects forged MIME', async t => {
	const { env, admin, sql } = setup(t), token = await admin(), objects = new Map();
	env.MEDIA_KV = {
		async put(key, bytes, options) { objects.set(key, { bytes: new Uint8Array(bytes), ...options }); },
		async getWithMetadata(key) { const item = objects.get(key); return { value: item ? new Response(item.bytes).body : null, metadata: item?.metadata }; },
		async delete(key) { objects.delete(key); },
	};
	const forged = await worker.fetch(new Request(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/webp' }, body: jpeg }), env);
	assert.equal(forged.status, 400);
	assert.equal(objects.size, 0);
	const requests = [];
	t.mock.method(globalThis, 'fetch', async (url, init) => {
		const request = new Request(url, init);
		requests.push({ type: request.headers.get('content-type'), name: decodeURIComponent(request.headers.get('x-file-name')), bytes: Buffer.from(await request.clone().arrayBuffer()) });
		return worker.fetch(request, env);
	});
	for (const type of ['image/webp', '', 'image/png']) {
		const file = new File([jpeg], '封面.webp', { type });
		const media = await uploadOriginal(file, endpoint, token);
		assert.equal(media.type, 'image/jpeg');
		assert.equal(media.size, jpeg.length);
		assert.equal(decodeURIComponent(media.name), file.name);
		const read = await worker.fetch(new Request('https://axis.test' + media.url), env);
		assert.equal(read.status, 200);
		assert.equal(read.headers.get('content-type'), 'image/jpeg');
		assert.deepEqual(Buffer.from(await read.arrayBuffer()), jpeg);
	}
	assert.equal(requests.length, 3);
	for (const request of requests) {
		assert.equal(request.type, 'image/jpeg');
		assert.equal(request.name, '封面.webp');
		assert.deepEqual(request.bytes, jpeg);
	}
	assert.equal(sql.prepare('SELECT count(*) AS n FROM media').get().n, 3);
});

test('unsupported and unreadable files fail before making an upload request', async t => {
	const fetch = t.mock.method(globalThis, 'fetch', () => { throw new Error('unexpected request'); });
	await assert.rejects(uploadOriginal(new File(['<svg/>'], 'fake.png', { type: 'image/png' }), endpoint, 'token'), /无法识别图片格式/);
	await assert.rejects(uploadOriginal({ slice: () => ({ arrayBuffer: async () => { throw new Error('file changed'); } }) }, endpoint, 'token'), /无法读取所选图片/);
	assert.equal(fetch.mock.callCount(), 0);
});

test('network failures have an actionable message and log only the endpoint and original error', async t => {
	const cause = new TypeError('Failed to fetch');
	t.mock.method(globalThis, 'fetch', async () => { throw cause; });
	const log = t.mock.method(console, 'error', () => {});
	await assert.rejects(uploadOriginal(new File([jpeg], 'cover.webp'), endpoint, 'private-token'), error => {
		assert.match(error.message, /图片上传请求未完成.*网络连接/);
		assert.equal(error.cause, cause);
		return true;
	});
	assert.deepEqual(log.mock.calls[0].arguments, ['图片上传请求失败', endpoint, cause]);
});

test('HTTP, non-JSON and malformed success responses remain understandable upload errors', async t => {
	const cases = [
		[() => Response.json({ message: 'Session expired' }, { status: 401 }), /Session expired/],
		[() => new Response('<html>upstream error</html>', { status: 503 }), /HTTP 503/],
		[() => new Response('<html>login</html>', { status: 200 }), /数据不完整或无法解析/],
		[() => Response.json({ id: 'missing-url' }, { status: 201 }), /无法获取图片链接/],
	];
	const fetch = t.mock.method(globalThis, 'fetch');
	for (const [response, message] of cases) {
		fetch.mock.mockImplementation(async () => response());
		await assert.rejects(uploadOriginal(new File([jpeg], 'cover.jpg'), endpoint, 'token'), message);
	}
});

test('media authentication and per-role upload size limits still apply', async t => {
	const { env, admin, register } = setup(t), token = await admin(), member = await register();
	env.MEDIA = { put: async () => { throw new Error('oversized uploads must not be stored'); } };
	const request = (body, token) => new Request(endpoint, { method: 'POST', headers: { 'Content-Type': 'image/jpeg', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body });
	assert.equal((await worker.fetch(request(jpeg), env)).status, 401);
	assert.equal((await worker.fetch(request(new Uint8Array(2 * 1024 * 1024 + 1), member.accessToken), env)).status, 413);
	assert.equal((await worker.fetch(request(new Uint8Array(20 * 1024 * 1024 + 1), token), env)).status, 413);
});
