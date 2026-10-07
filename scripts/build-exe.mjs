// Node 22 SEA: embeds the service and both browser assets into one Windows executable.
// Build-only dependency: postject 1.0.0-alpha.6. No dependency is needed at runtime.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';

if (process.platform !== 'win32') throw new Error('Run this build on Windows');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const build = resolve(root, 'build', 'exe');
mkdirSync(build, { recursive: true });
let source = readFileSync(resolve(root, 'windows/server.mjs'), 'utf8');
for (const [file, expression] of [
  ['index.html', "readFileSync(new URL('./index.html', import.meta.url))"],
  ['app.js', "readFileSync(new URL('./app.js', import.meta.url))"]
]) {
  if (!source.includes(expression)) throw new Error(`Asset embedding expression changed: ${file}`);
  source = source.replace(expression, JSON.stringify(readFileSync(resolve(root, 'windows', file), 'utf8')));
}
const mainGuard = 'if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {';
if (!source.includes(mainGuard)) throw new Error('Service entry point changed');
const selfTest = `
async function executableSelfTest() {
  const service = createService({ pollMs: 80 });
  await new Promise(resolve => service.server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + service.server.address().port;
  const assert = require('node:assert/strict');
  const admin = (path, method = 'GET', text) => fetch(base + '/admin/' + path, {
    method, headers: { 'X-Admin-Token': service.adminToken, 'Content-Type': 'application/json' },
    body: text === undefined ? undefined : JSON.stringify({ text })
  });
  try {
    assert.equal((await fetch(base + '/')).status, 200);
    assert.ok((await (await fetch(base + '/app.js')).text()).includes('compositionstart'));
    const state = await (await admin('status')).json();
    const read = code => fetch(base + '/v1/text', { headers: { 'X-Pairing-Code': code, 'X-Client-ID': 'exe-self-test' } });
    assert.equal((await read('00000000')).status, 401);
    const text = '中文第一行\\n第二行 😀';
    assert.equal((await admin('text', 'PUT', text)).status, 200);
    assert.equal((await (await read(state.pairingCode)).json()).text, text);
    await admin('text', 'PUT', '');
    assert.equal((await (await read(state.pairingCode)).json()).text, '');
    await admin('rotate', 'POST');
    assert.equal((await read(state.pairingCode)).status, 401);
    console.log('EXE self-test passed: embedded UI, UTF-8, edit, clear, pairing and revocation.');
  } finally { await service.close(); }
}
if (process.argv.includes('--self-test')) {
  executableSelfTest().catch(() => { console.error('EXE self-test failed'); process.exitCode = 1; });
} else if (true) {`;
source = source.replace(mainGuard, selfTest);
source = source.replace(/^export function /m, 'function ');
source = source.replace(/^import (.+) from '(node:[^']+)';$/gm, (_, names, module) => `const ${names} = require(${JSON.stringify(module)});`);
if (source.includes('import.meta') || /^import /m.test(source)) throw new Error('Unbundled ESM source');
writeFileSync(resolve(build, 'entry.cjs'), source);
writeFileSync(resolve(build, 'sea.json'), JSON.stringify({
  main: resolve(build, 'entry.cjs'), output: resolve(build, 'sea.blob'),
  disableExperimentalSEAWarning: true, useSnapshot: false, useCodeCache: false
}));
execFileSync(process.execPath, ['--experimental-sea-config', resolve(build, 'sea.json')], { stdio: 'inherit' });
const target = resolve(build, 'LanText.exe');
copyFileSync(process.execPath, target);
// Remove the original Node Authenticode signature: it does not sign our new application.
let pe = readFileSync(target);
const peOffset = pe.readUInt32LE(0x3c);
if (pe.toString('ascii', peOffset, peOffset + 4) !== 'PE\0\0') throw new Error('Invalid PE');
const optional = peOffset + 24;
const directory = optional + (pe.readUInt16LE(optional) === 0x20b ? 112 : 96);
const securityEntry = directory + 4 * 8;
const certificateOffset = pe.readUInt32LE(securityEntry);
const certificateSize = pe.readUInt32LE(securityEntry + 4);
pe.writeUInt32LE(0, securityEntry); pe.writeUInt32LE(0, securityEntry + 4);
pe.writeUInt32LE(0, optional + 64);
if (certificateOffset > 0 && certificateOffset + certificateSize === pe.length) pe = pe.subarray(0, certificateOffset);
writeFileSync(target, pe);
const cli = process.env.POSTJECT_CLI || resolve(root, 'build/tools/node_modules/postject/dist/cli.js');
execFileSync(process.execPath, [cli, target, 'NODE_SEA_BLOB', resolve(build, 'sea.blob'),
  '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'], { stdio: 'inherit' });
console.log(`Windows executable ready: ${target}`);
