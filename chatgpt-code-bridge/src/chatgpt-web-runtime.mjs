import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { unzipSync } from 'fflate';

export const bunVersion = '1.4.0';
export const bunAssets = {
  'linux-x64': ['bun-linux-x64', '2d03fb5fb83ac8b567aca0a281b2ce1a1a19d488f56c2968d88c3f25e92fe452'],
  'win32-x64': ['bun-windows-x64', 'e6f093d39da486b20262ca8cdd5ed6a9e8bc9c2f275b78e6d3a0c5b28cc95901'],
  'darwin-x64': ['bun-darwin-x64', '1d0211b8f1dc991182344687ad15e72ee86f154845a5f7fa477994cd341dd9b0'],
  'darwin-arm64': ['bun-darwin-aarch64', 'c669e97f6164e1c96e0701748db98dfa77492908cbd8394c7557134a735de381']
};

export function bunPath(root, platform = process.platform, arch = process.arch) {
  return path.join(root, 'runtime', `chatgpt-web-${platform}-${arch}`, platform === 'win32' ? 'bun.exe' : 'bun');
}

export async function ensureBun({ root, platform = process.platform, arch = process.arch, fetcher = fetch, progress = () => {} }) {
  const spec = bunAssets[`${platform}-${arch}`];
  if (!spec) throw new Error(`Chưa có runtime ChatGPT Web cho ${platform}/${arch}.`);
  const target = bunPath(root, platform, arch);
  const manifest = target + '.sha256';
  if (existsSync(target) && existsSync(manifest)) {
    const actual = createHash('sha256').update(await readFile(target)).digest('hex');
    if (actual === (await readFile(manifest, 'utf8')).trim()) return target;
    throw new Error('Runtime ChatGPT Web đã thay đổi. Hãy xóa thư mục runtime/chatgpt-web tương ứng rồi chuẩn bị lại.');
  }
  progress('Đang tải bộ chạy ChatGPT Web…');
  const response = await fetcher(`https://github.com/oven-sh/bun/releases/download/bun-v${bunVersion}/${spec[0]}.zip`, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`Không tải được runtime ChatGPT Web (HTTP ${response.status}).`);
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 100 * 1024 * 1024) throw new Error('Gói runtime vượt quá kích thước cho phép.');
    chunks.push(chunk);
  }
  const archive = Buffer.concat(chunks);
  if (createHash('sha256').update(archive).digest('hex') !== spec[1]) throw new Error('SHA-256 runtime ChatGPT Web không khớp. Chưa chạy tệp tải về.');
  const entry = `${spec[0]}/${platform === 'win32' ? 'bun.exe' : 'bun'}`;
  const files = unzipSync(archive, { filter: file => file.name === entry });
  if (!files[entry]?.length) throw new Error('Gói runtime thiếu tệp thực thi.');
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = target + '.part';
  await writeFile(temporary, files[entry], { mode: 0o755 });
  if (platform !== 'win32') await chmod(temporary, 0o755);
  await rename(temporary, target);
  await writeFile(manifest, createHash('sha256').update(files[entry]).digest('hex') + '\n');
  return target;
}

export async function prepareChatgptWeb({ root, platform = process.platform, arch = process.arch, progress = () => {} }) {
  const executable = await ensureBun({ root, platform, arch, progress });
  const vendor = path.join(root, 'vendor', 'chatgpt-web');
  const lockHash = createHash('sha256').update(await readFile(path.join(vendor, 'bun.lock'))).digest('hex');
  const stamp = path.join(vendor, 'node_modules', '.codebridge-lock');
  let installed = false;
  try { installed = (await readFile(stamp, 'utf8')).trim() === lockHash; } catch {}
  if (installed) return executable;
  if (platform !== process.platform || arch !== process.arch) throw new Error('Hãy chuẩn bị dependencies trên máy build trước khi đóng gói cho hệ điều hành khác.');
  progress('Đang cài thành phần ChatGPT Web bên trong Code Bridge…');
  await new Promise((resolve, reject) => {
    const child = spawn(executable, ['install', '--production', '--frozen-lockfile', '--ignore-scripts'], { cwd: vendor, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let detail = '';
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { detail = (detail + chunk.toString()).slice(-1500); });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Không cài được thành phần ChatGPT Web: ${detail}`)));
  });
  await writeFile(stamp, lockHash + '\n');
  progress('ChatGPT Web đã sẵn sàng.');
  return executable;
}
