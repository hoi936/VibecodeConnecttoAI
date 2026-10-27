import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createChatgptWebManager } from '../src/chatgpt-web-manager.mjs';
import { bunPath } from '../src/chatgpt-web-runtime.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
test('real embedded worker reports readiness, rejects unauthenticated start and closes cleanly', { skip: !existsSync(bunPath(root)), timeout: 40000 }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'codebridge-web-manager-'));
  const manager = createChatgptWebManager({ root, dataDir: directory });
  const before = process.env.BRIDGE_CODEX_HOME;
  process.env.BRIDGE_CODEX_HOME = path.join(directory, 'codex');
  async function done() {
    const deadline = Date.now() + 25000;
    while (manager.status().busy && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(manager.status().busy, false);
  }
  try {
    manager.run('prepare'); await done();
    assert.equal(manager.status().loggedIn, false);
    assert.equal(manager.status().connectorName, 'Codex Code Bridge');
    manager.run('start'); await done();
    assert.match(manager.status().error, /đăng nhập/i);
    assert.equal(manager.status().running, false);
    assert.equal(existsSync(path.join(directory, 'codex', 'config.toml')), false);
    assert.throws(() => manager.run('arbitrary-command'), /không hợp lệ/);
  } finally {
    await manager.close();
    if (before === undefined) delete process.env.BRIDGE_CODEX_HOME; else process.env.BRIDGE_CODEX_HOME = before;
    await rm(directory, { recursive: true, force: true });
  }
});
