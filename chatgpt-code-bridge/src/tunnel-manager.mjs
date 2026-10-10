import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

export function createTunnelManager({ binary, origin, cwd, profiles = [], log = () => {}, spawnProcess = spawn, allocatePort = freePort, fetchHealth = fetch, binaryExists = existsSync }) {
  const records = new Map();
  let closed = false;
  for (const p of profiles.slice(0, 12)) {
    if (typeof p.id === 'string' && /^[\w-]+$/.test(p.id) && /^tunnel_[\w-]+$/.test(p.tunnelId) && typeof p.label === 'string') records.set(p.id, { ...p, state: 'stopped', error: '', lastCallAt: null });
  }
  function list() {
    return [...records.values()].map(p => ({ id: p.id, provider: 'chatgpt', label: p.label, tunnelId: p.tunnelId, state: p.state, error: p.error, lastCallAt: p.lastCallAt, startedAt: p.startedAt || null }));
  }
  function savedProfiles() { return list().map(({ id, label, tunnelId }) => ({ id, label, tunnelId })); }
  async function start({ id, label, tunnelId, apiKey }) {
    if (closed) throw new Error('Bridge đang đóng.');
    if (typeof tunnelId !== 'string' || !/^tunnel_[\w-]+$/.test(tunnelId)) throw new Error('Tunnel ID không hợp lệ.');
    if (typeof apiKey !== 'string' || !/^sk-\S+$/.test(apiKey)) throw new Error('Runtime API Key không hợp lệ.');
    if (!binaryExists(binary)) throw new Error('Chưa cài runtime: chạy npm run setup:tunnel.');
    const name = typeof label === 'string' ? label.trim() : '';
    if (!name || name.length > 80) throw new Error('Đặt tên kết nối từ 1 đến 80 ký tự.');
    if (id && !records.has(id)) throw new Error('Không tìm thấy kết nối.');
    if ([...records.values()].some(p => p.tunnelId === tunnelId && p.id !== id)) throw new Error('Tunnel ID đã có trong danh sách. Chọn kết nối đó để kết nối lại.');
    if (!id && records.size >= 12) throw new Error('Tối đa 12 cấu hình ChatGPT trên bridge này. Xóa cấu hình cũ để thêm.');
    const entry = id ? records.get(id) : { id: randomUUID(), state: 'stopped', lastCallAt: null };
    if (entry.child || entry.state === 'starting') throw new Error('Kết nối đang chạy. Dừng trước khi kết nối lại.');
    Object.assign(entry, { label: name, tunnelId, state: 'starting', error: '', lastCallAt: null });
    records.set(entry.id, entry); // Reserve this Tunnel ID before awaiting a port.
    try {
      entry.healthPort = await allocatePort();
      if (closed || entry.state !== 'starting') throw new Error('Đã hủy kết nối.');
      const child = spawnProcess(binary, ['run', '--mcp.server-url', `${origin}/mcp/tunnels/${entry.id}`, '--health.listen-addr', `127.0.0.1:${entry.healthPort}`], {
        cwd, env: { ...process.env, CONTROL_PLANE_API_KEY: apiKey, CONTROL_PLANE_TUNNEL_ID: tunnelId }, stdio: ['ignore', 'pipe', 'pipe']
      });
      entry.child = child; entry.startedAt = new Date().toISOString();
      let output = '';
      const collect = chunk => { output = (output + chunk.toString()).slice(-4000); };
      child.stdout?.on('data', collect); child.stderr?.on('data', collect);
      child.on('error', () => { entry.error = 'Không khởi chạy được tunnel-client.'; entry.state = 'error'; entry.child = undefined; });
      child.on('exit', code => {
        const stopped = entry.state === 'stopping';
        entry.child = undefined; entry.state = stopped || code === 0 ? 'stopped' : 'error';
        if (entry.state === 'error') entry.error = output.split(apiKey).join('[hidden]') || `Tunnel thoát với mã ${code}`;
        log('chatgpt:stop', entry.state === 'stopped', entry.label);
      });
      log('chatgpt:start', true, entry.label);
      return list().find(p => p.id === entry.id);
    } catch (error) { entry.state = 'error'; entry.error = error.message; throw error; }
  }
  async function stop(id) {
    const entry = records.get(id);
    if (!entry) throw new Error('Không tìm thấy kết nối.');
    const child = entry.child;
    if (!child) { entry.state = 'stopped'; return; }
    entry.state = 'stopping';
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => child.kill('SIGKILL'), 8000);
      const deadline = setTimeout(() => { clearTimeout(timer); reject(new Error('Chưa dừng được tunnel. Chưa thể chuyển chế độ.')); }, 11000);
      child.once('exit', () => { clearTimeout(timer); clearTimeout(deadline); resolve(); });
      child.kill('SIGTERM');
    });
  }
  async function stopAll() { await Promise.all([...records.keys()].map(stop)); }
  async function remove(id) { await stop(id); records.delete(id); }
  function touch(id) {
    const entry = records.get(id);
    if (!entry?.child || entry.state === 'stopping') throw new Error('Kết nối đã dừng.');
    entry.lastCallAt = new Date().toISOString();
  }
  async function poll() {
    await Promise.all([...records.values()].map(async entry => {
      if (!entry.child || entry.state === 'stopping' || entry.polling) return;
      const child = entry.child; entry.polling = true;
      try {
        const response = await fetchHealth(`http://127.0.0.1:${entry.healthPort}/readyz`, { signal: AbortSignal.timeout(1500) });
        if (entry.child === child && entry.state !== 'stopping') entry.state = response.ok ? 'ready' : 'connecting';
      } catch { if (entry.child === child && entry.state !== 'stopping') entry.state = 'connecting'; }
      finally { entry.polling = false; }
    }));
  }
  return { list, savedProfiles, start, stop, stopAll, remove, touch, poll, async close() { closed = true; await stopAll(); } };
}
