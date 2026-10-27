import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { bunPath } from '../src/chatgpt-web-runtime.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const result = spawnSync(bunPath(root), ['test', './test/chatgpt-web-engine.bun.ts'], { cwd: root, stdio: 'inherit' });
if (result.error) throw new Error(`Chạy npm run setup:chatgpt-web trước khi kiểm thử engine: ${result.error.message}`);
process.exitCode = result.status ?? 1;
