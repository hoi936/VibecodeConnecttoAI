// Build a self-contained Windows x64 ZIP from WSL. No user data is copied.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version;
const name = `CodeBridge-${version}-win-x64`;
const dist = path.join(root, 'dist');
const cache = path.join(dist, '.cache');
const archives = [
  {
    file: 'node-v22.23.3-win-x64.zip',
    url: 'https://nodejs.org/download/release/v22.23.3/node-v22.23.3-win-x64.zip',
    sha256: '2b0ff57b049cda1bbcea2240eec20467018713c1efe1f7360c2681859b90ed71'
  },
  {
    file: 'tunnel-client-runtime-v0.0.16-windows-amd64.zip',
    url: 'https://github.com/openai/tunnel-client/releases/download/v0.0.16/tunnel-client-runtime-v0.0.16-windows-amd64.zip',
    sha256: '639fdfe10d91c672d8f8a49386ebf39acaac4e560a88134735b1739a02ddb82d'
  },
  {
    file: 'cloudflared-windows-amd64.exe',
    url: 'https://github.com/cloudflare/cloudflared/releases/download/2026.10.0/cloudflared-windows-amd64.exe',
    sha256: '86aee4017b26625cee8484c113558f48effa4cd47f7aa05fcf425604e5d2b23c'
  }
];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error || result.status !== 0) throw new Error(`${command} thất bại: ${result.error?.message || result.status}`);
}
async function sha256(file) { return createHash('sha256').update(await readFile(file)).digest('hex'); }
async function getArchive(spec) {
  const target = path.join(cache, spec.file);
  if (!existsSync(target) || await sha256(target) !== spec.sha256) {
    console.log(`Tải ${spec.file}...`);
    await rm(target, { force: true });
    run('curl', ['-fsSL', '--retry', '3', '--connect-timeout', '20', '-o', target, spec.url]);
  }
  if (await sha256(target) !== spec.sha256) throw new Error(`SHA-256 không khớp: ${spec.file}`);
  return target;
}
async function copy(source, target) { await cp(path.join(root, source), target, { recursive: true }); }
async function assertNoNativeModules(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, item.name);
    if (item.isDirectory()) await assertNoNativeModules(file);
    else if (item.name.endsWith('.node')) throw new Error(`Module native không thể đóng gói chéo: ${file}`);
  }
}
if (!existsSync('/proc/version') || !existsSync('/mnt/c/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe'))
  throw new Error('Hãy chạy lệnh build này trong WSL trên Windows có .NET Framework compiler.');
if (!existsSync(path.join(root, 'upstream/mcp-servers/src/filesystem/dist/index.js')))
  throw new Error('Chạy npm run setup và npm run build trước khi đóng gói.');
await mkdir(cache, { recursive: true });
const [nodeZip, tunnelZip, cloudflared] = await Promise.all(archives.map(getArchive));
const temp = await mkdtemp(path.join(os.tmpdir(), 'codebridge-win-'));
const stage = path.join(temp, name);
try {
  await mkdir(stage, { recursive: true });
  await copy('src', path.join(stage, 'src'));
  await copy('public', path.join(stage, 'public'));
  await mkdir(path.join(stage, 'scripts'), { recursive: true });
  for (const file of ['gemini-tunnel.mjs', 'provider-tunnel.mjs'])
    await copy(path.join('scripts', file), path.join(stage, 'scripts', file));
  await copy('docs', path.join(stage, 'docs'));
  await copy('package.json', path.join(stage, 'package.json'));
  await copy('package-lock.json', path.join(stage, 'package-lock.json'));
  await copy('README.md', path.join(stage, 'README.md'));
  await mkdir(path.join(stage, 'demo-project'), { recursive: true });
  await copy('packaging/demo-index.html', path.join(stage, 'demo-project/index.html'));
  const fsSource = 'upstream/mcp-servers/src/filesystem';
  const fsDest = path.join(stage, fsSource);
  await mkdir(fsDest, { recursive: true });
  for (const file of ['dist', 'package.json', 'package-lock.json'])
    await copy(path.join(fsSource, file), path.join(fsDest, file));
  await copy('upstream/mcp-servers/LICENSE', path.join(stage, 'upstream/mcp-servers/LICENSE'));
  console.log('Cài dependencies production...');
  run('npm', ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', '--workspaces=false'], { cwd: stage });
  run('npm', ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', '--workspaces=false'], { cwd: fsDest });
  await assertNoNativeModules(path.join(stage, 'node_modules'));
  await assertNoNativeModules(path.join(fsDest, 'node_modules'));

  const runtime = path.join(stage, 'runtime');
  await mkdir(runtime, { recursive: true });
  const extract = String.raw`import sys,zipfile,os,shutil
with zipfile.ZipFile(sys.argv[1]) as z:
 for source,target in [('node-v22.23.3-win-x64/node.exe','node.exe'),('node-v22.23.3-win-x64/LICENSE','NODE_LICENSE')]:
  with z.open(source) as inp, open(os.path.join(sys.argv[2],target),'wb') as out: shutil.copyfileobj(inp,out)
with zipfile.ZipFile(sys.argv[3]) as z:
 for item in z.infolist():
  if item.is_dir(): continue
  target=os.path.join(sys.argv[2],os.path.basename(item.filename))
  with z.open(item) as inp, open(target,'wb') as out: shutil.copyfileobj(inp,out)
`;
  run('python3', ['-c', extract, nodeZip, runtime, tunnelZip]);
  await cp(cloudflared, path.join(runtime, 'cloudflared.exe'));
  // The OpenAI archive contains its own LICENSE/NOTICE. Add attribution for Cloudflare.
  await copy('packaging/APACHE-2.0.txt', path.join(runtime, 'CLOUDFLARED_LICENSE.txt'));
  await writeFile(path.join(runtime, 'CLOUDFLARED_SOURCE.txt'), 'cloudflared 2026.10.0, Apache-2.0\nhttps://github.com/cloudflare/cloudflared/releases/tag/2026.10.0\nhttps://github.com/cloudflare/cloudflared/blob/2026.10.0/LICENSE\n');
  const binary = path.join(runtime, 'tunnel-client-runtime.exe');
  if (!existsSync(binary)) throw new Error('OpenAI archive thiếu tunnel-client-runtime.exe');

  const launcher = path.join(root, 'packaging/CodeBridgeLauncher.cs');
  const exe = path.join(stage, 'CodeBridge.exe');
  const windowsPath = file => {
    const p = spawnSync('wslpath', ['-w', file], { encoding: 'utf8' });
    if (p.status !== 0) throw new Error(`Không chuyển được đường dẫn Windows: ${file}`);
    return p.stdout.trim();
  };
  run('/mnt/c/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe', ['/nologo', '/target:exe', '/out:' + windowsPath(exe), windowsPath(launcher)]);
  const lines = [];
  for (const file of ['CodeBridge.exe', 'runtime/node.exe', 'runtime/tunnel-client-runtime.exe', 'runtime/cloudflared.exe'])
    lines.push(`${await sha256(path.join(stage, file))}  ${file}`);
  await writeFile(path.join(stage, 'SHA256SUMS.txt'), lines.join('\n') + '\n');
  await writeFile(path.join(stage, 'START-GEMINI-TUNNEL.cmd'), '@echo off\r\ncd /d "%~dp0"\r\n"%~dp0runtime\\node.exe" scripts\\gemini-tunnel.mjs\r\npause\r\n');
  for (const provider of ['CLAUDE', 'GROK'])
    await writeFile(path.join(stage, `START-${provider}-TUNNEL.cmd`), `@echo off\r\ncd /d "%~dp0"\r\n"%~dp0runtime\\node.exe" scripts\\provider-tunnel.mjs ${provider.toLowerCase()}\r\npause\r\n`);
  await writeFile(path.join(stage, 'BAT_DAU_TAI_DAY.txt'), [
    'CODE BRIDGE — WINDOWS X64 PORTABLE',
    '',
    '1. Giai nen TOAN BO file ZIP vao mot thu muc tren may (khong chay truc tiep trong ZIP).',
    '2. Bam dup CodeBridge.exe. Giu cua so chuong trinh mo trong khi su dung.',
    '3. Trinh duyet se mo http://127.0.0.1:3213/. Chon Du an & file de doi thu muc lam viec.',
    '4. ChatGPT: can Tunnel ID va Runtime API Key cua tai khoan du dieu kien.',
    '5. Gemini/Claude/Grok: bam Tao URL va ket noi tren giao dien, cho URL MCP /mcp hien ra, roi copy vao website AI.',
    '6. VS Code/Codex va Antigravity: mo cac muc IDE trong dashboard de them cong cu MCP local.',
    '7. Du lieu cau hinh o %LOCALAPPDATA%\\CodeBridge; khong xoa neu muon giu workspace va ket noi.',
    '8. Quick Tunnel doi URL khi mo lai. Voi URL HTTPS co dinh, quyen OAuth con han duoc khoi phuc; tunnel ben ngoai can chay lai.',
    '',
    'Chi su dung file tai ve tu nguon ban tin cay. CodeBridge.exe chua duoc ky so.',
    'Huong dan day du: README.md va docs\\.',
    ''
  ].join('\r\n'));
  const archive = path.join(dist, `${name}.zip`);
  const zipScript = String.raw`import os,sys,zipfile
stage,output=sys.argv[1:]
with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED,compresslevel=6,allowZip64=True) as z:
 for base,dirs,files in os.walk(stage):
  dirs[:]=sorted(d for d in dirs if d != '.bin')
  for file in sorted(files):
   source=os.path.join(base,file)
   z.write(source,os.path.relpath(source,os.path.dirname(stage)))
`;
  run('python3', ['-c', zipScript, stage, archive]);
  console.log(`Đã tạo ${archive}`);
  const archiveHash = await sha256(archive);
  await writeFile(`${archive}.sha256`, `${archiveHash}  ${path.basename(archive)}\n`);
  console.log(`SHA-256 ZIP: ${archiveHash}`);
} finally {
  await rm(temp, { recursive: true, force: true });
}
