import http from 'node:http';
import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

const MAX_BYTES = 256 * 1024;
const equal = (a, b) => typeof a === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const loopback = ip => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip);
export function createService({ pollMs = 20000, failureLimit = 10, failureWindowMs = 60000 } = {}) {
  let text = '', revision = 0, pairingCode = String(randomInt(10000000, 100000000));
  const epoch = randomBytes(16).toString('hex');
  const adminToken = randomBytes(32).toString('hex');
  const waiters = new Set(), failures = new Map(), clients = new Map();
  const snapshot = () => ({ text, revision: `${epoch}:${revision}` });
  function reply(res, status, value) {
    if (res.destroyed || res.writableEnded) return;
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(JSON.stringify(value));
  }
  function wake() { for (const finish of [...waiters]) finish(); }
  function authenticated(req, res) {
    const ip = req.socket.remoteAddress;
    const now = Date.now();
    for (const [key, entry] of failures) if (entry.until <= now) failures.delete(key);
    const attempt = failures.get(ip);
    if (attempt && attempt.count >= failureLimit) { reply(res, 429, { error: 'too_many_attempts' }); return false; }
    if (!equal(req.headers['x-pairing-code'], pairingCode)) {
      if (failures.size >= 2048 && !failures.has(ip)) { reply(res, 429, { error: 'too_many_attempts' }); return false; }
      failures.set(ip, { count: (attempt?.count ?? 0) + 1, until: attempt?.until ?? now + failureWindowMs });
      reply(res, 401, { error: 'invalid_pairing_code' }); return false;
    }
    failures.delete(ip); return true;
  }
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/' && req.method === 'GET') {
        if (!loopback(req.socket.remoteAddress)) return reply(res, 403, { error: 'local_only' });
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
          'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'", 'X-Content-Type-Options': 'nosniff' });
        return res.end(readFileSync(new URL('./index.html', import.meta.url)));
      }
      if (url.pathname === '/app.js' && req.method === 'GET') {
        if (!loopback(req.socket.remoteAddress)) return reply(res, 403, { error: 'local_only' });
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
        return res.end(readFileSync(new URL('./app.js', import.meta.url)));
      }
      if (url.pathname.startsWith('/admin/')) {
        if (!loopback(req.socket.remoteAddress) || !equal(req.headers['x-admin-token'], adminToken)) return reply(res, 403, { error: 'forbidden' });
        // Prevent browser-origin requests to a rebinding hostname or another website.
        const port = server.address().port;
        if (req.headers.host !== `127.0.0.1:${port}` || (req.headers.origin && req.headers.origin !== `http://127.0.0.1:${port}`)) return reply(res, 403, { error: 'invalid_origin' });
        if (url.pathname === '/admin/status' && req.method === 'GET') {
          const addresses = Object.values(networkInterfaces()).flat().filter(n => n && n.family === 'IPv4' && !n.internal).map(n => n.address);
          const now = Date.now();
          for (const [id, seen] of clients) if (now - seen > 45000) clients.delete(id);
          return reply(res, 200, { ...snapshot(), pairingCode, addresses, port, clients: clients.size });
        }
        if (url.pathname === '/admin/rotate' && req.method === 'POST') {
          const previousCode = pairingCode;
          do { pairingCode = String(randomInt(10000000, 100000000)); } while (pairingCode === previousCode);
          clients.clear(); wake();
          return reply(res, 200, { pairingCode });
        }
        if (url.pathname === '/admin/text' && req.method === 'PUT') {
          const chunks = []; let size = 0;
          for await (const chunk of req) {
            size += chunk.length;
            if (size > MAX_BYTES * 6 + 64) { reply(res, 413, { error: 'text_too_large' }); return; }
            chunks.push(chunk);
          }
          const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (typeof data.text !== 'string') return reply(res, 400, { error: 'text_required' });
          if (Buffer.byteLength(data.text, 'utf8') > MAX_BYTES) return reply(res, 413, { error: 'text_too_large' });
          if (text !== data.text) { text = data.text; revision++; wake(); }
          return reply(res, 200, snapshot());
        }
        return reply(res, 404, { error: 'not_found' });
      }
      if (url.pathname === '/v1/text' && req.method === 'GET') {
        if (!authenticated(req, res)) return;
        if (waiters.size >= 32) return reply(res, 503, { error: 'server_busy' });
        const client = req.headers['x-client-id'];
        if (typeof client !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(client)) return reply(res, 400, { error: 'client_id_required' });
        for (const [id, seen] of clients) if (Date.now() - seen > 45000) clients.delete(id);
        if (clients.size >= 128 && !clients.has(client)) return reply(res, 503, { error: 'server_busy' });
        clients.set(client, Date.now());
        if (url.searchParams.get('since') !== snapshot().revision) return reply(res, 200, snapshot());
        let timer;
        const finish = () => {
          clearTimeout(timer); waiters.delete(finish);
          if (!res.destroyed && authenticated(req, res)) { clients.set(client, Date.now()); reply(res, 200, snapshot()); }
        };
        waiters.add(finish);
        timer = setTimeout(finish, pollMs);
        res.on('close', () => { clearTimeout(timer); waiters.delete(finish); });
        return;
      }
      reply(res, 404, { error: 'not_found' });
    } catch { reply(res, 400, { error: 'bad_request' }); }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  return { server, adminToken, close: async () => {
    for (const finish of [...waiters]) finish();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  } };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.LANTEXT_PORT || 8765);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('LANTEXT_PORT must be 1024–65535');
  const service = createService();
  service.server.on('error', err => { console.error(`启动失败：${err.code}。检查端口是否占用。`); process.exitCode = 1; });
  service.server.listen(port, '0.0.0.0', () => {
    console.log(`LanText 已启动，端口 ${port}。关闭此窗口即可停止。`);
    const url = `http://127.0.0.1:${port}/#${service.adminToken}`;
    if (process.platform === 'win32' && !process.env.LANTEXT_NO_BROWSER) {
      const child = spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], { windowsHide: true, stdio: 'ignore' });
      child.on('error', () => console.error('无法打开浏览器，请重新启动。'));
    } else console.log('服务已运行。Windows 正常启动时会自动打开输入页面。');
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await service.close(); process.exit(0); });
}
