import { mkdir, writeFile, chmod } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtime = path.join(root, 'runtime');
const os = { linux: 'linux', win32: 'windows', darwin: 'darwin' }[process.platform];
const arch = { x64: 'amd64', arm64: 'arm64' }[process.arch];
if (!os || !arch) throw new Error('Nền tảng chưa được hỗ trợ.');
async function download(url) { const response = await fetch(url, { headers: { 'User-Agent': 'local-code-bridge' }, signal: AbortSignal.timeout(60000) }); if (!response.ok) throw new Error(`Tải thất bại: HTTP ${response.status}`); return response; }
const release = await (await download('https://api.github.com/repos/openai/tunnel-client/releases/tags/v0.0.16')).json();
const name = `tunnel-client-runtime-v0.0.16-${os}-${arch}.zip`;
const asset = release.assets.find(a => a.name === name);
if (!asset?.digest?.startsWith('sha256:')) throw new Error('Không có checksum SHA-256 cho runtime chính thức.');
const bytes = Buffer.from(await (await download(asset.browser_download_url)).arrayBuffer());
if ('sha256:' + createHash('sha256').update(bytes).digest('hex') !== asset.digest) throw new Error('Checksum runtime không khớp.');
await mkdir(runtime, { recursive: true });
const zip = path.join(runtime, name);
await writeFile(zip, bytes);
const extraction = process.platform === 'win32'
  ? spawnSync('powershell.exe', ['-NoProfile', '-Command', "Expand-Archive -LiteralPath $env:BRIDGE_RUNTIME_ZIP -DestinationPath $env:BRIDGE_RUNTIME_DIR -Force"], { stdio: 'inherit', env: { ...process.env, BRIDGE_RUNTIME_ZIP: zip, BRIDGE_RUNTIME_DIR: runtime } })
  : spawnSync('unzip', ['-o', zip, '-d', runtime], { stdio: 'inherit' });
if (extraction.error || extraction.status !== 0) throw new Error('Không giải nén được runtime. Cần unzip trên Linux/macOS hoặc PowerShell trên Windows.');
if (process.platform !== 'win32') await chmod(path.join(runtime, 'tunnel-client-runtime'), 0o755);
console.log(`Đã cài runtime ${release.tag_name}, SHA-256 đã xác minh.`);
