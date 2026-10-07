const token = location.hash.slice(1) || sessionStorage.getItem('lantextAdmin');
if (token) sessionStorage.setItem('lantextAdmin', token);
history.replaceState(null, '', '/');
const $ = id => document.getElementById(id);
const editor = $('text');
let initialized = false, composing = false, dirty = false, sending = false, timer;
function status(message, error = false) { $('status').textContent = message; $('status').className = error ? 'error' : ''; }
async function api(path, method = 'GET', body) {
  const res = await fetch(`/admin/${path}`, { method, headers: { 'X-Admin-Token': token || '', 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(res.status === 413 ? '文字超过 256 KiB，请缩短' : res.status === 403 ? '会话失效，请重新启动服务打开输入页面' : `服务错误 ${res.status}`);
  return res.json();
}
function count() { $('size').textContent = `${editor.value.length} 字符 · ${new TextEncoder().encode(editor.value).length} / 262144 字节`; }
async function send() {
  if (sending || composing || !dirty) return;
  sending = true; dirty = false; const value = editor.value;
  try { await api('text', 'PUT', { text: value }); status(dirty ? '同步中…' : '已同步到电脑服务'); }
  catch (err) { dirty = true; status(err.message, true); }
  finally { sending = false; if (dirty && !composing) { clearTimeout(timer); timer = setTimeout(send, 1000); } }
}
function changed() { dirty = true; count(); status('同步中…'); clearTimeout(timer); timer = setTimeout(send, 150); }
editor.addEventListener('input', changed);
editor.addEventListener('compositionstart', () => { composing = true; });
editor.addEventListener('compositionend', () => { composing = false; changed(); });
$('clear').onclick = () => { if (!initialized) return; editor.value = ''; changed(); };
$('rotate').onclick = async () => { try { const data = await api('rotate', 'POST'); $('code').textContent = data.pairingCode; status('配对码已更换'); } catch (err) { status(err.message, true); } };
async function refresh() {
  try {
    const data = await api('status');
    $('address').textContent = data.addresses.length ? data.addresses.map(ip => `${ip}:${data.port}`).join(' / ') : `未找到 Wi-Fi IPv4（端口 ${data.port}）`;
    $('code').textContent = data.pairingCode; $('clients').textContent = data.clients;
    if (!initialized) { editor.value = data.text; initialized = true; editor.disabled = false; count(); status('已连接，开始输入'); }
    if (dirty) send();
  } catch (err) { status(err.message, true); }
  setTimeout(refresh, 2000);
}
window.addEventListener('beforeunload', e => { if (dirty || sending) { e.preventDefault(); e.returnValue = ''; } });
refresh();
