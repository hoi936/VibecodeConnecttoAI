// Build portable macOS app bundles on Linux or macOS; DMG creation requires macOS.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmod, cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version;
const dist = path.join(root, 'dist');
const cache = path.join(dist, '.cache');
const specs = {
  arm64: {
    node: ['node-v22.23.3-darwin-arm64.tar.gz', '23b25245dcfb9af7262f8ff142e9e2e0af025368117329e7a7458a51e5922f53', 'https://nodejs.org/download/release/v22.23.3/'],
    tunnel: ['tunnel-client-runtime-v0.0.16-darwin-arm64.zip', '81d230a289ae1b1416738d8150bc879d88a29e8749bb659047a7ef90dfc4acbe', 'https://github.com/openai/tunnel-client/releases/download/v0.0.16/'],
    cloudflared: ['cloudflared-darwin-arm64.tgz', 'a2f79ff7b9420aa537d74af239f376da170bbabeb529aec416002adac6a72e70', 'https://github.com/cloudflare/cloudflared/releases/download/2026.10.0/'],
    cloudflaredBinary: '72edfd3eea463aef4d5cb89e2e209cecb048cc756c2b01915de2e0ad7cb39830'
  },
  x64: {
    node: ['node-v22.23.3-darwin-x64.tar.gz', '8a677b0219178efd6eb0e475457c4afb452b521a92f6e67845a73bd85727f2a8', 'https://nodejs.org/download/release/v22.23.3/'],
    tunnel: ['tunnel-client-runtime-v0.0.16-darwin-amd64.zip', 'bfd4a63a523ef9e585bbc71d1c008d099fb7560fc419d3dbb24db6f88d3c94ee', 'https://github.com/openai/tunnel-client/releases/download/v0.0.16/'],
    cloudflared: ['cloudflared-darwin-amd64.tgz', '903845b81828c8cb3c5d13d816a2de71c06a3da5785469df8eb0e1b736d92f9f', 'https://github.com/cloudflare/cloudflared/releases/download/2026.10.0/'],
    cloudflaredBinary: '0560c9ab7281ac3f746055323623ed23bc0405b6dab9400474020cba33a978da'
  }
};
const archArgument = process.argv.find(arg => arg.startsWith('--arch='))?.slice(7) || 'all';
if (!['all', 'arm64', 'x64'].includes(archArgument)) throw new Error('Dùng --arch=arm64, --arch=x64 hoặc --arch=all.');
const architectures = archArgument === 'all' ? ['arm64', 'x64'] : [archArgument];
if (!existsSync(path.join(root, 'upstream/mcp-servers/src/filesystem/dist/index.js')))
  throw new Error('Chạy npm run setup và npm run build trước khi đóng gói.');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error || result.status !== 0) throw new Error(`${command} thất bại: ${result.error?.message || result.status}`);
}
async function sha256(file) { return createHash('sha256').update(await readFile(file)).digest('hex'); }
async function archive(spec) {
  const [file, expected, base] = spec;
  const target = path.join(cache, file);
  if (!existsSync(target) || await sha256(target) !== expected) {
    await rm(target, { force: true });
    console.log(`Tải ${file}...`);
    run('curl', ['-fsSL', '--retry', '3', '--connect-timeout', '20', '-o', target, base + file]);
  }
  if (await sha256(target) !== expected) throw new Error(`SHA-256 không khớp: ${file}`);
  return target;
}
async function copy(source, target) { await cp(path.join(root, source), target, { recursive: true }); }
async function assertNoNativeModules(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, item.name);
    if (item.isDirectory()) await assertNoNativeModules(file);
    else if (item.name.endsWith('.node')) throw new Error(`Module native chưa được đóng gói cho Mac: ${file}`);
  }
}
async function build(arch) {
  const spec = specs[arch];
  const [nodeArchive, tunnelArchive, cloudArchive] = await Promise.all([archive(spec.node), archive(spec.tunnel), archive(spec.cloudflared)]);
  const name = `CodeBridge-${version}-mac-${arch}`;
  const temp = await mkdtemp(path.join(os.tmpdir(), `codebridge-mac-${arch}-`));
  const app = path.join(temp, 'CodeBridge.app');
  const contents = path.join(app, 'Contents');
  const appRoot = path.join(contents, 'Resources', 'app');
  try {
    await mkdir(path.join(contents, 'MacOS'), { recursive: true });
    await mkdir(appRoot, { recursive: true });
    await copy('src', path.join(appRoot, 'src'));
    await copy('public', path.join(appRoot, 'public'));
    await copy('docs', path.join(appRoot, 'docs'));
    for (const file of ['package.json', 'package-lock.json', 'README.md']) await copy(file, path.join(appRoot, file));
    await mkdir(path.join(appRoot, 'demo-project'), { recursive: true });
    await copy('demo-project/index.html', path.join(appRoot, 'demo-project/index.html'));
    const fsSource = 'upstream/mcp-servers/src/filesystem';
    const fsDest = path.join(appRoot, fsSource);
    await mkdir(fsDest, { recursive: true });
    for (const file of ['dist', 'package.json', 'package-lock.json']) await copy(path.join(fsSource, file), path.join(fsDest, file));
    await copy('upstream/mcp-servers/LICENSE', path.join(appRoot, 'upstream/mcp-servers/LICENSE'));
    console.log(`Cài dependencies production cho ${arch}...`);
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const npmArgs = ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', '--workspaces=false'];
    run(npm, npmArgs, { cwd: appRoot });
    run(npm, npmArgs, { cwd: fsDest });
    await assertNoNativeModules(path.join(appRoot, 'node_modules'));
    await assertNoNativeModules(path.join(fsDest, 'node_modules'));

    const runtime = path.join(appRoot, 'runtime');
    const nodeExtract = path.join(temp, 'node-extract');
    await mkdir(runtime);
    await mkdir(nodeExtract);
    const nodePrefix = `node-v22.23.3-darwin-${arch}`;
    run('tar', ['-xzf', nodeArchive, '-C', nodeExtract, `${nodePrefix}/bin/node`, `${nodePrefix}/LICENSE`]);
    await cp(path.join(nodeExtract, nodePrefix, 'bin/node'), path.join(runtime, 'node'));
    await cp(path.join(nodeExtract, nodePrefix, 'LICENSE'), path.join(runtime, 'NODE_LICENSE'));
    run('unzip', ['-q', tunnelArchive, '-d', runtime]);
    run('tar', ['-xzf', cloudArchive, '-C', runtime, 'cloudflared']);
    if (await sha256(path.join(runtime, 'cloudflared')) !== spec.cloudflaredBinary) throw new Error('SHA-256 binary cloudflared không khớp.');
    await copy('packaging/APACHE-2.0.txt', path.join(runtime, 'CLOUDFLARED_LICENSE.txt'));
    await writeFile(path.join(runtime, 'CLOUDFLARED_SOURCE.txt'), 'cloudflared 2026.10.0, Apache-2.0\nhttps://github.com/cloudflare/cloudflared/releases/tag/2026.10.0\nhttps://github.com/cloudflare/cloudflared/blob/2026.10.0/LICENSE\n');
    for (const file of ['node', 'tunnel-client-runtime', 'cloudflared']) {
      if (!existsSync(path.join(runtime, file))) throw new Error(`Gói ${arch} thiếu runtime/${file}.`);
      await chmod(path.join(runtime, file), 0o755);
    }
    const launcher = path.join(contents, 'MacOS', 'CodeBridge');
    const runner = path.join(appRoot, 'start-mac.command');
    run(process.env.GO_BINARY || 'go', ['build', '-trimpath', '-ldflags=-s -w', '-o', launcher, 'packaging/mac/launcher.go'], {
      cwd: root, env: { ...process.env, GOOS: 'darwin', GOARCH: arch === 'x64' ? 'amd64' : 'arm64', CGO_ENABLED: '0', GOTOOLCHAIN: 'local' }
    });
    await copy('packaging/mac/start-mac.command', runner);
    await chmod(launcher, 0o755);
    await chmod(runner, 0o755);
    const info = (await readFile(path.join(root, 'packaging/mac/Info.plist.template'), 'utf8')).replaceAll('__VERSION__', version);
    await writeFile(path.join(contents, 'Info.plist'), info);
    const sums = [];
    for (const file of ['runtime/node', 'runtime/tunnel-client-runtime', 'runtime/cloudflared']) sums.push(`${await sha256(path.join(appRoot, file))}  ${file}`);
    await writeFile(path.join(appRoot, 'SHA256SUMS.txt'), sums.join('\n') + '\n');

    const zip = path.join(dist, `${name}.app.zip`);
    if (process.platform === 'darwin') run('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, zip]);
    else {
      const zipScript = String.raw`import os,sys,zipfile
app,output=sys.argv[1:]
with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED,compresslevel=6,allowZip64=True) as z:
 for base,dirs,files in os.walk(app):
  dirs.sort()
  for file in sorted(files):
   source=os.path.join(base,file)
   z.write(source,os.path.relpath(source,os.path.dirname(app)))
`;
      run('python3', ['-c', zipScript, app, zip]);
    }
    await writeFile(`${zip}.sha256`, `${await sha256(zip)}  ${path.basename(zip)}\n`);
    console.log(`Đã tạo ${zip}`);
    if (process.platform === 'darwin') {
      const dmgRoot = path.join(temp, 'dmg');
      await mkdir(dmgRoot);
      await cp(app, path.join(dmgRoot, 'CodeBridge.app'), { recursive: true });
      await symlink('/Applications', path.join(dmgRoot, 'Applications'));
      const dmg = path.join(dist, `${name}.dmg`);
      run('hdiutil', ['create', '-volname', 'Code Bridge', '-srcfolder', dmgRoot, '-format', 'UDZO', '-ov', dmg]);
      await writeFile(`${dmg}.sha256`, `${await sha256(dmg)}  ${path.basename(dmg)}\n`);
      console.log(`Đã tạo ${dmg}`);
    } else console.log('DMG cần hdiutil trên macOS; gói .app.zip đã sẵn sàng để giải nén trên Mac.');
  } finally { await rm(temp, { recursive: true, force: true }); }
}

await mkdir(cache, { recursive: true });
for (const arch of architectures) await build(arch);
