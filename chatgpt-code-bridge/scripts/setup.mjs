import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' && command === 'npm' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} thất bại (${result.status}).`);
}
mkdirSync(path.join(root, 'upstream'), { recursive: true });
for (const [name, url, revision] of [
  ['mcp-servers', 'https://github.com/modelcontextprotocol/servers.git', '956d36f8a148908b2e2394669ef5ae1f1230c9e9'],
  ['tunnel-client', 'https://github.com/openai/tunnel-client.git', 'b91e6c992dfd33e5c5ea94b00449c527c110851e']
]) {
  const dir = path.join(root, 'upstream', name);
  if (!existsSync(path.join(dir, '.git'))) {
    run('git', ['clone', url, dir]);
    run('git', ['checkout', '--detach', revision], dir);
  }
}
run('npm', ['install', '--workspaces=false'], path.join(root, 'upstream/mcp-servers/src/filesystem'));
run('npm', ['run', 'build']);
console.log('Build hoàn tất. Tiếp theo: npm run setup:tunnel rồi npm start.');
