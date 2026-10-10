import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { request } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = 'http://127.0.0.1:3220';

test('MCP HTTP, workspace boundaries, permissions and local UI', { timeout: 120000 }, async t => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'code-bridge-test-'));
  const workspace = path.join(temp, 'project');
  const stateDir = path.join(temp, 'state');
  await mkdir(workspace); await mkdir(stateDir);
  await writeFile(path.join(workspace, 'index.html'), '<h1>Hello</h1>');
  await writeFile(path.join(temp, 'outside.txt'), 'outside');
  await symlink(path.join(temp, 'outside.txt'), path.join(workspace, 'escape.txt'));
  await writeFile(path.join(stateDir, 'config.json'), JSON.stringify({ workspace, allowWrites: true, tunnelId: '' }));
  const child = spawn(process.execPath, ['src/server.mjs'], { cwd: root, env: { ...process.env, BRIDGE_PORT: '3220', BRIDGE_DATA_DIR: stateDir, GEMINI_GATEWAY_PORT: '3232' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', c => output += c); child.stderr.on('data', c => output += c);
  const mcp = new Client({ name: 'integration-test', version: '1.0.0' });
  t.after(async () => {
    await mcp.close().catch(() => {});
    if (child.exitCode === null) { child.kill('SIGTERM'); await new Promise(resolve => child.once('exit', resolve)); }
    await rm(temp, { recursive: true, force: true });
  });
  let healthy = false;
  for (let i = 0; i < 200; i++) {
    if (child.exitCode !== null) throw new Error(output);
    try { healthy = (await fetch(base + '/health')).ok; } catch {}
    if (healthy) break;
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  assert.ok(healthy, 'server startup: ' + output);
  const status = await (await fetch(base + '/api/status')).json();
  const headers = { 'Content-Type': 'application/json', 'X-Bridge-CSRF': status.csrf };
  async function post(route, body, extra = {}) { return fetch(base + route, { method: 'POST', headers: { ...headers, ...extra }, body: JSON.stringify(body) }); }
  await mcp.connect(new StreamableHTTPClientTransport(new URL(base + '/mcp')));
  await t.test('real tools discovery and read', async () => {
    assert.ok((await mcp.listTools()).tools.some(tool => tool.name === 'edit_file'));
    const result = await mcp.callTool({ name: 'read_text_file', arguments: { path: 'index.html' } });
    assert.equal(result.isError, undefined);
    assert.match(result.content[0].text, /Hello/);
  });
  await t.test('dry run then actual edit', async () => {
    const args = { path: 'index.html', edits: [{ oldText: 'Hello', newText: 'Xin chào' }], dryRun: true };
    const dry = await mcp.callTool({ name: 'edit_file', arguments: args });
    assert.ok(!dry.isError); assert.match(dry.content[0].text, /Xin chào/);
    assert.equal(await readFile(path.join(workspace, 'index.html'), 'utf8'), '<h1>Hello</h1>');
    const edited = await mcp.callTool({ name: 'edit_file', arguments: { ...args, dryRun: false } });
    assert.ok(!edited.isError);
    assert.equal(await readFile(path.join(workspace, 'index.html'), 'utf8'), '<h1>Xin chào</h1>');
  });
  await t.test('concurrent edits preserve both changes through the shared queue', async () => {
    await writeFile(path.join(workspace, 'parallel.txt'), 'left right');
    const results = await Promise.all([
      mcp.callTool({ name: 'edit_file', arguments: { path: 'parallel.txt', edits: [{ oldText: 'left', newText: 'LEFT' }] } }),
      mcp.callTool({ name: 'edit_file', arguments: { path: 'parallel.txt', edits: [{ oldText: 'right', newText: 'RIGHT' }] } })
    ]);
    assert.ok(results.every(result => !result.isError));
    assert.equal(await readFile(path.join(workspace, 'parallel.txt'), 'utf8'), 'LEFT RIGHT');
  });
  await t.test('outside path and symlink rejected', async () => {
    for (const value of ['../outside.txt', 'escape.txt']) {
      const result = await mcp.callTool({ name: 'read_text_file', arguments: { path: value } });
      assert.equal(result.isError, true);
    }
    assert.equal((await fetch(base + '/preview/escape.txt')).status, 403);
  });
  await t.test('readonly enforced on both UI and MCP', async () => {
    assert.equal((await post('/api/permissions', { allowWrites: false })).status, 200);
    const tools = (await mcp.listTools()).tools;
    assert.ok(tools.every(tool => tool.annotations.readOnlyHint === true));
    const denied = await mcp.callTool({ name: 'write_file', arguments: { path: 'new.txt', content: 'bad' } }).catch(error => error);
    assert.ok(denied instanceof Error || denied.isError);
    assert.equal((await post('/api/tool', { name: 'write_file', arguments: { path: 'new.txt', content: 'bad' } })).status, 400);
    await post('/api/permissions', { allowWrites: true });
  });
  await t.test('CSRF, Origin and DNS rebinding protections', async () => {
    assert.equal((await fetch(base + '/api/permissions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"allowWrites":true}' })).status, 403);
    assert.equal((await post('/api/permissions', { allowWrites: true }, { Origin: 'https://evil.example' })).status, 403);
    const reboundStatus = await new Promise((resolve, reject) => {
      const req = request(base + '/api/status', { headers: { Host: 'evil.example:3220' } }, res => { res.resume(); resolve(res.statusCode); });
      req.on('error', reject); req.end();
    });
    assert.equal(reboundStatus, 403);
    assert.equal((await post('/api/permissions', { allowWrites: true }, { Origin: base })).status, 200);
  });
  await t.test('UI, preview, and credential handling', async () => {
    assert.match(await (await fetch(base)).text(), /Code Bridge/);
    const preview = await fetch(base + '/preview/index.html');
    assert.equal(preview.status, 200); assert.match(preview.headers.get('content-security-policy'), /sandbox/);
    assert.match(await preview.text(), /Xin chào/);
    assert.equal((await post('/api/tunnel/start', { tunnelId: 'bad', apiKey: 'fake' })).status, 400);
    assert.ok(!(await readFile(path.join(stateDir, 'config.json'), 'utf8')).includes('apiKey'));
    assert.equal((await fetch(base + '/mcp')).status, 405);
  });
  await t.test('Gemini gateway routes actual MCP calls and preserves readonly consent', async () => {
    assert.equal((await post('/api/gemini/enable', { publicOrigin: 'https://integration.example.com' })).status, 400);
    assert.equal((await post('/api/mode', { mode: 'gemini' })).status, 200);
    assert.equal((await post('/api/tunnel/start', { tunnelId: 'tunnel_wrong_mode', apiKey: 'sk-test' })).status, 400);
    const blocked = await fetch(base + '/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(blocked.status, 400);
    const origin = 'https://integration.example.com', gateway = 'http://127.0.0.1:3232';
    assert.equal((await post('/api/gemini/enable', { publicOrigin: 'http://localhost' })).status, 400);
    assert.equal((await post('/api/gemini/enable', { publicOrigin: origin })).status, 200);
    await post('/api/permissions', { allowWrites: false });
    const registration = await (await fetch(gateway + '/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ redirect_uris: ['https://gemini.google.com/test-callback'], token_endpoint_auth_method: 'none', scope: 'mcp' }) })).json();
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const response = await fetch(gateway + '/authorize?' + new URLSearchParams({ client_id: registration.client_id, redirect_uri: registration.redirect_uris[0], response_type: 'code', code_challenge_method: 'S256', code_challenge: challenge, scope: 'mcp', resource: origin + '/mcp' }), { redirect: 'manual' });
    assert.equal(response.status, 302);
    const remoteStatus = await (await fetch(base + '/api/status')).json();
    const approval = remoteStatus.gemini.pending[0]; assert.ok(approval);
    assert.equal((await post('/api/gemini/approve', { id: approval.id })).status, 200);
    const callback = await fetch(gateway + new URL(response.headers.get('location')).pathname, { redirect: 'manual' });
    const code = new URL(callback.headers.get('location')).searchParams.get('code');
    const tokenResponse = await fetch(gateway + '/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: verifier, client_id: registration.client_id, redirect_uri: registration.redirect_uris[0] }) });
    assert.equal(tokenResponse.status, 200); const token = await tokenResponse.json();
    await post('/api/permissions', { allowWrites: true });
    const gemini = new Client({ name: 'gemini-compatible-test-client', version: '1.0.0' });
    try {
      await gemini.connect(new StreamableHTTPClientTransport(new URL(gateway + '/mcp'), { requestInit: { headers: { Authorization: `Bearer ${token.access_token}` } } }));
      assert.ok((await gemini.listTools()).tools.every(tool => tool.annotations.readOnlyHint === true));
      const read = await gemini.callTool({ name: 'read_text_file', arguments: { path: 'index.html' } }); assert.match(read.content[0].text, /Xin chào/);
      const denied = await gemini.callTool({ name: 'write_file', arguments: { path: 'should-not-exist.txt', content: 'bad' } }).catch(error => error);
      assert.ok(denied instanceof Error || denied.isError);
      const after = await (await fetch(base + '/api/status')).json(); assert.ok(after.events.some(event => event.action === 'gemini:read_text_file'));
      await post('/api/workspace', { path: workspace });
      const revoked = await fetch(gateway + '/mcp', { method: 'POST', headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' }, body: '{}' }); assert.equal(revoked.status, 401);
    } finally { await gemini.close(); await post('/api/mode', { mode: 'chatgpt' }); }
    const final = await (await fetch(base + '/api/status')).json();
    assert.equal(final.connectionMode, 'chatgpt'); assert.equal(final.gemini.enabled, false);
    assert.equal(final.summary.accountCount, null);
    assert.deepEqual(final.connections, []);
  });
});
