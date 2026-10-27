import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareChatgptWeb, ensureBun } from '../src/chatgpt-web-runtime.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await prepareChatgptWeb({ root, progress: console.log });
for (const target of process.argv.slice(2)) {
  const [platform, arch] = target.split('/');
  await ensureBun({ root, platform, arch, progress: console.log });
}
