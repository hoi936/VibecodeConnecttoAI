import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createVscodeProxy } from '../src/vscode-proxy.mjs';
import { createAntigravityProxy } from '../src/antigravity-proxy.mjs';

test('IDE config exposes MCP tools without claiming to select a chat model', async t => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'bridge-vscode-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const proxy = createVscodeProxy({ getStatus: () => ({ workspace }) });
  const status = await proxy.status('http://127.0.0.1:3213');
  assert.equal(JSON.parse(status.vscodeSnippet).servers['code-bridge'].url, status.mcpEndpoint);
  assert.match(status.codexSnippet, /\[mcp_servers\.code_bridge\]/);
  assert.equal('models' in status, false);
  assert.equal('enabled' in status, false);
  const folder = path.join(workspace, '.vscode');
  await mkdir(folder);
  const file = path.join(folder, 'mcp.json');
  await writeFile(file, JSON.stringify({ servers: { existing: { type: 'stdio', command: 'echo' } } }));
  await proxy.configureWorkspace('http://127.0.0.1:3213');
  const config = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(config.servers.existing.command, 'echo');
  assert.equal(config.servers['code-bridge'].url, status.mcpEndpoint);
  assert.equal((await proxy.status('http://127.0.0.1:3213')).isConfigured, true);
});

test('Antigravity configuration adds MCP and preserves other servers', async t => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'bridge-ide-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const directory = path.join(workspace, '.agents');
  await mkdir(directory);
  const file = path.join(directory, 'mcp_config.json');
  await writeFile(file, JSON.stringify({ mcpServers: { existing: { command: 'echo' }, 'gemini-argon-bridge': { serverUrl: 'http://127.0.0.1:3210/api/antigravity/sse' } }, note: 'keep' }));
  const bridge = createAntigravityProxy({ getStatus: () => ({ workspace }), origin: 'http://127.0.0.1:3213' });
  assert.equal((await bridge.status()).isConfigured, false);
  await bridge.configureWorkspace();
  const config = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(config.mcpServers.existing.command, 'echo');
  assert.equal(config.mcpServers['gemini-argon-bridge'], undefined);
  assert.equal(config.mcpServers['code-bridge'].serverUrl, 'http://127.0.0.1:3213/mcp');
  assert.equal(config.note, 'keep');
  assert.equal((await bridge.status()).isConfigured, true);
  assert.equal('models' in await bridge.status(), false);
});

test('Antigravity configuration rejects a symlinked .agents directory', async t => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'bridge-ide-'));
  const outside = await mkdtemp(path.join(os.tmpdir(), 'bridge-outside-'));
  t.after(async () => { await rm(workspace, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); });
  await symlink(outside, path.join(workspace, '.agents'));
  const bridge = createAntigravityProxy({ getStatus: () => ({ workspace }), origin: 'http://127.0.0.1:3213' });
  await assert.rejects(() => bridge.configureWorkspace(), /liên kết/);
});
