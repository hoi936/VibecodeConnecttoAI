import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundled = path.join(root, 'runtime', process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
const cloudflared = existsSync(bundled) ? bundled : 'cloudflared';

const providers = {
  claude: { name: 'Claude', env: 'CLAUDE_GATEWAY_PORT', port: 3214 },
  grok: { name: 'Grok', env: 'GROK_GATEWAY_PORT', port: 3215 }
};
const provider = providers[process.argv[2]];
if (!provider) throw new Error('Chọn claude hoặc grok.');
const port = Number(process.env[provider.env] || provider.port);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error(`${provider.env} không hợp lệ.`);
console.log(`Tạo URL HTTPS tạm thời cho cổng MCP ${provider.name}: http://127.0.0.1:${port}`);
console.log(`Dán URL https://…trycloudflare.com vào mục ${provider.name} trong Code Bridge, rồi bấm Bật cổng.`);
console.log('Giữ terminal này mở. Ctrl+C để dừng URL public.');
const child = spawn(cloudflared, ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${port}`, '--protocol', 'http2'], { stdio: 'inherit', windowsHide: true });
child.on('error', () => { console.error('Không chạy được cloudflared. Cài từ https://developers.cloudflare.com/tunnel/downloads/ rồi thử lại.'); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 0; });
process.on('SIGINT', () => child.kill('SIGTERM'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
