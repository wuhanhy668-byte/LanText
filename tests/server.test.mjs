import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { networkInterfaces } from 'node:os';
import { createService } from '../windows/server.mjs';

async function fixture(t, options = {}) {
  const service = createService({ pollMs: 100, ...options });
  await new Promise(resolve => service.server.listen(0, '0.0.0.0', resolve));
  t.after(() => service.close());
  const base = `http://127.0.0.1:${service.server.address().port}`;
  const admin = async (path, method = 'GET', body) => fetch(`${base}/admin/${path}`, {
    method, headers: { 'X-Admin-Token': service.adminToken, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const state = await (await admin('status')).json();
  const read = (code = state.pairingCode, revision, signal) => fetch(`${base}/v1/text${revision ? `?since=${encodeURIComponent(revision)}` : ''}`, {
    headers: { 'X-Pairing-Code': code, 'X-Client-ID': 'test-ipad' }, signal
  });
  return { service, base, admin, state, read };
}

test('Chinese, multiline, emoji, edits and clear propagate', async t => {
  const f = await fixture(t);
  const first = await (await f.read()).json();
  assert.equal(first.text, '');
  for (const text of ['你好\n第二行 😀', '修改后的文字\n\n空行', '']) {
    assert.equal((await f.admin('text', 'PUT', { text })).status, 200);
    const result = await (await f.read()).json();
    assert.equal(result.text, text); assert.notEqual(result.revision, first.revision);
  }
});

test('long poll wakes immediately on change; idle heartbeat responds', async t => {
  const f = await fixture(t, { pollMs: 1000 });
  const first = await (await f.read()).json();
  const waiting = f.read(f.state.pairingCode, first.revision);
  await new Promise(resolve => setTimeout(resolve, 25));
  await f.admin('text', 'PUT', { text: '即时更新' });
  assert.equal((await (await waiting).json()).text, '即时更新');
  const current = await (await f.read()).json();
  assert.deepEqual(await (await f.read(f.state.pairingCode, current.revision)).json(), current);
});

test('reconnect gets latest text; restart uses a new revision epoch', async t => {
  const a = await fixture(t);
  const old = await (await a.read()).json();
  await a.admin('text', 'PUT', { text: '离线期间更新' });
  assert.equal((await (await a.read()).json()).text, '离线期间更新');
  const b = await fixture(t);
  const fresh = await (await b.read(b.state.pairingCode, old.revision)).json();
  assert.notEqual(fresh.revision, old.revision); assert.equal(fresh.text, '');
});

test('missing/wrong pairing code cannot read; remote clients cannot write', async t => {
  const f = await fixture(t);
  assert.equal((await f.read('')).status, 401);
  assert.equal((await f.read('00000000')).status, 401);
  assert.equal((await fetch(`${f.base}/admin/status`)).status, 403);
  assert.equal((await fetch(`${f.base}/admin/text`, { method: 'PUT', headers: { 'X-Admin-Token': f.state.pairingCode }, body: '{"text":"attack"}' })).status, 403);
});

test('pairing rotation revokes pending and new requests', async t => {
  const f = await fixture(t, { pollMs: 2000 });
  const first = await (await f.read()).json();
  const pending = f.read(f.state.pairingCode, first.revision);
  await new Promise(resolve => setTimeout(resolve, 25));
  const rotated = await (await f.admin('rotate', 'POST')).json();
  assert.equal((await pending).status, 401);
  assert.equal((await f.read()).status, 401);
  assert.equal((await f.read(rotated.pairingCode)).status, 200);
});

test('wrong pairing attempts are throttled and recover after window', async t => {
  const f = await fixture(t, { failureLimit: 2, failureWindowMs: 80 });
  assert.equal((await f.read('00000000')).status, 401);
  assert.equal((await f.read('00000000')).status, 401);
  assert.equal((await f.read()).status, 429);
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal((await f.read()).status, 200);
});

test('input size limit and malformed JSON do not change text', async t => {
  const f = await fixture(t);
  assert.equal((await f.admin('text', 'PUT', { text: '中'.repeat(90000) })).status, 413);
  assert.equal((await f.admin('text', 'PUT', { text: 123 })).status, 400);
  const malformed = await fetch(`${f.base}/admin/text`, { method: 'PUT', headers: { 'X-Admin-Token': f.service.adminToken }, body: '{' });
  assert.equal(malformed.status, 400);
  assert.equal((await (await f.read()).json()).text, '');
});

test('split UTF-8 request body preserves Chinese characters', async t => {
  const f = await fixture(t);
  const body = Buffer.from(JSON.stringify({ text: '中文😀' }));
  const result = await new Promise((resolve, reject) => {
    const req = http.request(`${f.base}/admin/text`, { method: 'PUT', headers: { 'X-Admin-Token': f.service.adminToken } }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', reject);
    const start = body.indexOf(Buffer.from('中')) + 1;
    req.write(body.subarray(0, start)); setTimeout(() => req.end(body.subarray(start)), 10);
  });
  assert.equal(result, 200);
  assert.equal((await (await f.read()).json()).text, '中文😀');
});

test('cross-origin and hostname-rebinding admin requests rejected', async t => {
  const f = await fixture(t);
  for (const headers of [{ Origin: 'https://evil.example' }, { Host: 'evil.example' }]) {
    const code = await new Promise((resolve, reject) => {
      const req = http.get(`${f.base}/admin/status`, { headers: { ...headers, 'X-Admin-Token': f.service.adminToken } }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
      req.on('error', reject);
    });
    assert.equal(code, 403);
  }
  assert.equal((await fetch(`${f.base}/admin/status`, { method: 'OPTIONS' })).status, 403);
});

test('cancelled polls release capacity and latest snapshot remains available', async t => {
  const f = await fixture(t, { pollMs: 2000 });
  const snapshot = await (await f.read()).json();
  const controller = new AbortController();
  const pending = f.read(f.state.pairingCode, snapshot.revision, controller.signal);
  await new Promise(resolve => setTimeout(resolve, 30)); controller.abort();
  await assert.rejects(pending);
  await f.admin('text', 'PUT', { text: '恢复' });
  assert.equal((await (await f.read()).json()).text, '恢复');
});

test('non-loopback LAN requests may read after pairing but cannot access editor/admin', async t => {
  const ip = Object.values(networkInterfaces()).flat().find(n => n?.family === 'IPv4' && !n.internal && !n.address.startsWith('169.254.'))?.address;
  if (!ip) { t.skip('No non-loopback IPv4 adapter'); return; }
  const f = await fixture(t);
  const remoteBase = `http://${ip}:${f.service.server.address().port}`;
  for (const route of ['/', '/app.js', '/admin/status']) {
    const result = await fetch(`${remoteBase}${route}`, { headers: { 'X-Admin-Token': f.service.adminToken }, signal: AbortSignal.timeout(5000) });
    assert.equal(result.status, 403);
  }
  const result = await fetch(`${remoteBase}/v1/text`, { headers: { 'X-Pairing-Code': f.state.pairingCode, 'X-Client-ID': 'lan-test' }, signal: AbortSignal.timeout(5000) });
  assert.equal(result.status, 200);
});
