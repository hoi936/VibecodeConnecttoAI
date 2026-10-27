import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { bunPath, ensureBun, prepareChatgptWeb } from './chatgpt-web-runtime.mjs';

const actions = new Set(['prepare', 'login', 'start', 'pause', 'remove', 'refresh-models', 'tools', 'check-tunnel']);

export function createChatgptWebManager({ root, dataDir, log = () => {}, spawnChild = spawn, prepare = prepareChatgptWeb }) {
  const home = path.join(dataDir, 'chatgpt-web');
  const preferences = path.join(home, 'manager.json');
  let child, nextId = 0, starting, working = false, closing = false, enabled = false;
  let phase = 'idle', message = '', error = '', snapshot = {};
  const pending = new Map();
  const installed = () => existsSync(bunPath(root)) && existsSync(path.join(root, 'vendor/chatgpt-web/node_modules/.codebridge-lock'));
  const status = () => ({ ...snapshot, phase, message, error, busy: working, enabled, runtimeInstalled: installed() });
  async function savePreference(value) {
    enabled = value;
    await mkdir(home, { recursive: true, mode: 0o700 });
    await writeFile(preferences + '.part', JSON.stringify({ enabled }), { mode: 0o600 });
    await rename(preferences + '.part', preferences);
  }
  function request(action, body = {}, timeoutMs = 30000) {
    if (!child?.stdin?.writable) return Promise.reject(new Error('Bộ chạy ChatGPT Web chưa sẵn sàng.'));
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { pending.delete(id); reject(new Error('Thao tác ChatGPT Web quá thời gian. Hãy kiểm tra cửa sổ đăng nhập hoặc khởi động lại Code Bridge.')); }, timeoutMs);
      pending.set(id, { resolve, reject, timeout });
      child.stdin.write(JSON.stringify({ id, action, body }) + '\n', failure => {
        if (failure && pending.has(id)) { clearTimeout(timeout); pending.delete(id); reject(failure); }
      });
    });
  }
  async function ensureWorker() {
    if (child && snapshot.configPath) return;
    if (starting) return starting;
    starting = (async () => {
      if (!installed()) {
        phase = 'preparing';
        await prepare({ root, progress: value => { message = value; } });
      } else await ensureBun({ root });
      await mkdir(home, { recursive: true, mode: 0o700 });
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { child?.kill(); reject(new Error('Không khởi động được engine ChatGPT Web.')); }, 20000);
        let ready = false;
        child = spawnChild(bunPath(root), [path.join(root, 'src/chatgpt-web-worker.ts')], {
          cwd: root, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env, CODEX_CHATGPT_WEB_HOME: home, BRIDGE_WEB_PORT: process.env.BRIDGE_WEB_PORT || '3216',
            ...(process.env.BRIDGE_CODEX_HOME ? { CODEX_HOME: process.env.BRIDGE_CODEX_HOME } : {}) }
        });
        const reader = createInterface({ input: child.stdout });
        reader.on('line', line => {
          if (!line.startsWith('CODEBRIDGE_WEB ')) return;
          let event;
          try { event = JSON.parse(line.slice(15)); } catch { return; }
          if (event.event === 'ready') { snapshot = event.status; ready = true; clearTimeout(timeout); resolve(); }
          if (event.event === 'progress') message = event.message;
          if (event.id && pending.has(event.id)) {
            const item = pending.get(event.id); pending.delete(event.id); clearTimeout(item.timeout);
            if (event.error) item.reject(new Error(event.error));
            else { snapshot = { ...snapshot, ...event.result }; item.resolve(event.result); }
          }
        });
        child.stderr.resume(); // Raw engine logs can contain browser URLs; never publish them in the dashboard.
        child.once('error', failure => { clearTimeout(timeout); reject(failure); });
        child.once('exit', code => {
          clearTimeout(timeout); child = undefined; snapshot.running = false;
          for (const item of pending.values()) { clearTimeout(item.timeout); item.reject(new Error('Engine ChatGPT Web đã dừng.')); }
          pending.clear();
          if (!ready) reject(new Error(`Không nạp được engine ChatGPT Web (mã ${code}).`));
          else if (!closing) { phase = 'error'; error = 'Engine ChatGPT Web đã dừng. Bấm Kết nối lại để khởi động.'; }
        });
      });
    })();
    try { await starting; } finally { starting = undefined; }
  }
  function run(action, body = {}) {
    if (!actions.has(action)) throw new Error('Thao tác ChatGPT Web không hợp lệ.');
    if (working || closing) throw new Error('Đang xử lý thao tác ChatGPT Web. Hãy chờ hoàn tất.');
    working = true; error = ''; message = '';
    phase = ({ prepare: 'preparing', login: 'logging_in', start: 'starting', pause: 'stopping', remove: 'stopping', tools: 'starting' })[action] || 'checking';
    void (async () => {
      await ensureWorker();
      if (action !== 'prepare') await request(action, body, action === 'login' ? 20 * 60000 : action === 'tools' ? 5 * 60000 : 60000);
      if (action === 'start' || action === 'tools') await savePreference(true);
      if (action === 'pause' || action === 'remove') await savePreference(false);
      phase = snapshot.running ? 'running' : snapshot.loggedIn ? 'paused' : 'idle';
      message = action === 'login' ? 'Đã lưu phiên ChatGPT. Bấm Thêm model vào Codex để bắt đầu.'
        : action === 'start' || action === 'tools' ? 'Model Web đã kết nối. Mở lại phiên Codex để cập nhật menu model.'
        : action === 'pause' ? 'Đã tạm dừng; cấu hình Codex trước đó đã được khôi phục.' : '';
      log(`chatgpt-web:${action}`, true);
    })().catch(failure => {
      phase = 'error';
      error = String(failure.message || failure).replace(/sk-[A-Za-z0-9_-]+/g, '[key]');
      if (typeof body.apiKey === 'string') error = error.replaceAll(body.apiKey, '[key]');
      log(`chatgpt-web:${action}`, false);
    }).finally(() => { working = false; });
    return { ok: true };
  }
  async function restore() {
    try { enabled = JSON.parse(await readFile(preferences, 'utf8')).enabled === true; } catch {}
    if (!installed() || !existsSync(path.join(home, 'config.json'))) return;
    try {
      await ensureWorker();
      if (enabled) run('start');
      else phase = snapshot.loggedIn ? 'paused' : 'idle';
    } catch (failure) { phase = 'error'; error = failure.message; }
  }
  async function close() {
    closing = true;
    if (!child) return;
    try { await request('shutdown', {}, 15000); } catch {}
    const current = child;
    if (current) {
      current.stdin.end();
      await new Promise(resolve => {
        const timer = setTimeout(() => { current.kill(); resolve(); }, 3000);
        current.once('exit', () => { clearTimeout(timer); resolve(); });
      });
    }
  }
  return { status, run, restore, close };
}
