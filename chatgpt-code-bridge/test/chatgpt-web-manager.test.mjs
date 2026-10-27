import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
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

test('cancel is accepted while the embedded worker is waiting for browser login and allows a retry', { skip: process.platform !== 'linux' || !existsSync(bunPath(root)), timeout: 40000 }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'codebridge-web-cancel-'));
  const fakeChrome = path.join(directory, 'chrome');
  await writeFile(fakeChrome, '#!/bin/sh\nexec sleep 60\n', { mode: 0o700 });
  const beforeHome = process.env.BRIDGE_CODEX_HOME, beforeChrome = process.env.BRIDGE_WEB_CHROME;
  process.env.BRIDGE_CODEX_HOME = path.join(directory, 'codex');
  process.env.BRIDGE_WEB_CHROME = fakeChrome;
  const manager = createChatgptWebManager({ root, dataDir: directory });
  async function waitFor(predicate) {
    const deadline = Date.now() + 15000;
    while (!predicate(manager.status()) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 30));
    assert.ok(predicate(manager.status()), JSON.stringify(manager.status()));
  }
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      manager.run('login');
      await waitFor(state => state.busy && state.message.includes('quay lại đây'));
      manager.run('cancel-login');
      await waitFor(state => !state.busy);
      assert.match(manager.status().error, /hủy đăng nhập/);
      assert.equal(manager.status().loggedIn, false);
    }
  } finally {
    await manager.close();
    if (beforeHome === undefined) delete process.env.BRIDGE_CODEX_HOME; else process.env.BRIDGE_CODEX_HOME = beforeHome;
    if (beforeChrome === undefined) delete process.env.BRIDGE_WEB_CHROME; else process.env.BRIDGE_WEB_CHROME = beforeChrome;
    await rm(directory, { recursive: true, force: true });
  }
});
