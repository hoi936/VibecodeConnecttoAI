import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { chmod, mkdir, rename, rm } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';
import path from 'node:path';

const release = '2026.10.0';
const assets = {
  'win32-x64': ['cloudflared-windows-amd64.exe', '86aee4017b26625cee8484c113558f48effa4cd47f7aa05fcf425604e5d2b23c'],
  'linux-x64': ['cloudflared-linux-amd64', 'd33ff2d14475178d2012c2c56beba87389ac5ded27649519f198a7d3134a99db'],
  'linux-arm64': ['cloudflared-linux-arm64', 'e6422b9d4f72d3194bc5a38676f13667c06666523217b842a877d72a80b5ac08']
};
const providers = { gemini: 3212, claude: 3214, grok: 3215 };
const quickUrl = /https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/i;

async function hashFile(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

export function createQuickTunnelManager({ root, dataDir, ports = providers, enable, disable, fetchImpl = fetch, spawnProcess = spawn, asset = assets[`${process.platform}-${process.arch}`] }) {
  const records = new Map();
  const progress = { downloaded: 0, total: 0 };
  let installing;
  function current(provider, record) { return records.get(provider) === record && record.state !== 'stopping' && record.state !== 'stopped'; }
  function publicStatus(provider) {
    const record = records.get(provider);
    return { state: record?.state || 'stopped', origin: record?.origin || '', endpoint: record?.origin ? `${record.origin}/mcp` : '', error: record?.error || '', downloaded: record?.state === 'installing' ? progress.downloaded : 0, total: record?.state === 'installing' ? progress.total : 0 };
  }
  function status() { return Object.fromEntries(Object.keys(ports).map(provider => [provider, publicStatus(provider)])); }
  async function ensureBinary() {
    if (!asset) throw new Error('Tự cài cloudflared chưa hỗ trợ hệ điều hành này. Dùng URL HTTPS riêng trong phần nâng cao.');
    const [file, expected] = asset;
    const bundled = path.join(root, 'runtime', process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
    if (existsSync(bundled) && await hashFile(bundled) === expected) return bundled;
    const targetDir = path.join(dataDir, 'runtime');
    const target = path.join(targetDir, process.platform === 'win32' ? `cloudflared-${release}.exe` : `cloudflared-${release}`);
    if (existsSync(target) && await hashFile(target) === expected) return target;
    if (installing) return installing;
    installing = (async () => {
      await mkdir(targetDir, { recursive: true });
      const url = `https://github.com/cloudflare/cloudflared/releases/download/${release}/${file}`;
      const response = await fetchImpl(url, { headers: { 'User-Agent': 'CodeBridge' }, signal: AbortSignal.timeout(120000) });
      if (!response.ok || !response.body) throw new Error(`Không tải được cloudflared từ bản phát hành chính thức (HTTP ${response.status}).`);
      progress.downloaded = 0;
      progress.total = Number(response.headers.get('content-length')) || 0;
      if (progress.total > 100 * 1024 * 1024) throw new Error('Tệp cloudflared vượt giới hạn kích thước.');
      const temp = `${target}.${process.pid}.tmp`;
      try {
        if (existsSync(target)) await rm(target, { force: true });
        const meter = new Transform({ transform(chunk, encoding, callback) {
          progress.downloaded += chunk.length;
          if (progress.downloaded > 100 * 1024 * 1024) callback(new Error('Tệp cloudflared vượt giới hạn kích thước.'));
          else callback(null, chunk);
        } });
        await pipeline(Readable.fromWeb(response.body), meter, createWriteStream(temp, { mode: 0o700 }));
        if (await hashFile(temp) !== expected) throw new Error('SHA-256 cloudflared không khớp bản phát hành chính thức.');
        if (process.platform !== 'win32') await chmod(temp, 0o700);
        await rename(temp, target);
        return target;
      } finally { await rm(temp, { force: true }); }
    })();
    try { return await installing; } finally { installing = undefined; }
  }
  function start(provider) {
    if (!(provider in ports)) throw new Error('Nhà cung cấp không hợp lệ.');
    const previous = records.get(provider);
    if (previous && ['installing', 'starting', 'ready'].includes(previous.state)) return publicStatus(provider);
    const record = { state: 'installing', origin: '', error: '', child: null, task: null };
    records.set(provider, record);
    record.task = (async () => {
      const binary = await ensureBinary();
      if (!current(provider, record)) return;
      record.state = 'starting';
      await new Promise((resolve, reject) => {
        const child = spawnProcess(binary, ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${ports[provider]}`, '--protocol', 'http2'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
        record.child = child;
        let output = '', matched = false, settled = false;
        const timer = setTimeout(() => fail(new Error('Tạo URL HTTPS quá lâu. Hãy kiểm tra mạng rồi thử lại.')), 90000);
        function finish() { clearTimeout(timer); settled = true; resolve(); }
        function fail(error) { if (settled) return; clearTimeout(timer); settled = true; reject(error); }
        function read(chunk) {
          output = (output + chunk.toString()).slice(-12000);
          const match = output.match(quickUrl);
          if (!match || matched) return;
          matched = true;
          const origin = match[0];
          enable(provider, origin).then(() => {
            if (!current(provider, record)) { disable(provider).catch(() => {}); return finish(); }
            record.origin = origin; record.state = 'ready'; finish();
          }, fail);
        }
        child.stdout?.on('data', read);
        child.stderr?.on('data', read);
        child.once('error', fail);
        child.once('exit', (code) => {
          if (!settled) return fail(new Error(`cloudflared đã dừng trước khi có URL HTTPS (mã ${code ?? '?'}).`));
          if (current(provider, record) && record.state === 'ready') {
            record.state = 'error'; record.error = 'Tunnel đã ngắt. Bấm Tạo lại URL để kết nối lại.';
            record.origin = '';
            disable(provider).catch(() => {});
          }
        });
      });
    })().catch(async error => {
      if (!current(provider, record)) return;
      record.state = 'error'; record.error = error.message;
      record.origin = '';
      if (record.child && record.child.exitCode === null) record.child.kill();
      await disable(provider).catch(() => {});
    });
    return publicStatus(provider);
  }
  async function stop(provider) {
    if (!(provider in ports)) throw new Error('Nhà cung cấp không hợp lệ.');
    const record = records.get(provider);
    if (!record || record.state === 'stopped') return publicStatus(provider);
    record.state = 'stopping';
    if (record.child && record.child.exitCode === null) record.child.kill();
    record.origin = '';
    await disable(provider);
    record.state = 'stopped'; record.error = '';
    return publicStatus(provider);
  }
  async function close() { await Promise.all(Object.keys(ports).map(stop)); }
  return { start, stop, close, status, ensureBinary };
}
