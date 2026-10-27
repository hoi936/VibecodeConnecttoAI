import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { bunPath, ensureBun, prepareChatgptWeb } from '../src/chatgpt-web-runtime.mjs';

export async function packageChatgptWeb(root, destination, platform, arch) {
  await prepareChatgptWeb({ root, progress: console.log });
  await ensureBun({ root, platform, arch, progress: console.log });
  const vendor = path.join(root, 'vendor/chatgpt-web');
  const target = path.join(destination, 'vendor/chatgpt-web');
  await cp(vendor, target, { recursive: true, dereference: true });
  const sourceRuntime = bunPath(root, platform, arch);
  const targetRuntime = bunPath(destination, platform, arch);
  await mkdir(path.dirname(targetRuntime), { recursive: true });
  await cp(sourceRuntime, targetRuntime);
  await cp(sourceRuntime + '.sha256', targetRuntime + '.sha256');
  // Bun's dependencies are JavaScript/WASM. Reject accidental platform-specific modules.
  async function check(directory) {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, item.name);
      if (item.isDirectory()) await check(file);
      else if (item.name.endsWith('.node')) throw new Error(`Dependency ChatGPT Web native chưa được đóng gói cho ${platform}: ${file}`);
    }
  }
  await check(path.join(target, 'node_modules'));
  await writeFile(path.join(destination, 'CHATGPT_WEB_LICENSE.txt'), await readFile(path.join(vendor, 'LICENSE')));
}
