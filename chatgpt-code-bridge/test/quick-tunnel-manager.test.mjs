import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createQuickTunnelManager } from '../src/quick-tunnel-manager.mjs';

class FakeChild extends EventEmitter {
  constructor() { super(); this.stdout = new PassThrough(); this.stderr = new PassThrough(); this.exitCode = null; }
  kill() { if (this.exitCode !== null) return; this.exitCode = 0; this.emit('exit', 0); }
}
async function until(check) {
  for (let i = 0; i < 100; i++) {
    if (check()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for tunnel state');
}

test('one click installs a verified binary, exposes MCP URL and stops only its provider', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'codebridge-quick-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const binary = Buffer.from('verified cloudflared fixture');
  const expected = createHash('sha256').update(binary).digest('hex');
  const downloads = [], children = [], enabled = [], disabled = [];
  const manager = createQuickTunnelManager({ root, dataDir: path.join(root, 'data'),
    ports: { gemini: 3232, claude: 3233 }, asset: ['cloudflared-test', expected],
    fetchImpl: async url => { downloads.push(url); return new Response(binary, { status: 200, headers: { 'content-length': String(binary.length) } }); },
    spawnProcess: (file, args) => {
      assert.match(file, /cloudflared-2026\.10\.0$/);
      assert.ok(args.includes('http://127.0.0.1:3232') || args.includes('http://127.0.0.1:3233'));
      const child = new FakeChild(); children.push(child);
      queueMicrotask(() => child.stderr.write('Your quick Tunnel has been created! Visit it at https://demo.trycloudflare.com'));
      return child;
    },
    enable: async (provider, origin) => { enabled.push([provider, origin]); },
    disable: async provider => { disabled.push(provider); }
  });
  manager.start('gemini');
  await until(() => manager.status().gemini.state === 'ready');
  assert.equal(manager.status().gemini.endpoint, 'https://demo.trycloudflare.com/mcp');
  manager.start('claude');
  await until(() => manager.status().claude.state === 'ready');
  assert.equal(downloads.length, 1);
  assert.deepEqual(enabled, [['gemini', 'https://demo.trycloudflare.com'], ['claude', 'https://demo.trycloudflare.com']]);
  await manager.stop('gemini');
  assert.equal(manager.status().gemini.state, 'stopped');
  assert.equal(manager.status().claude.state, 'ready');
  assert.deepEqual(disabled, ['gemini']);
  children[1].kill();
  await until(() => manager.status().claude.state === 'error');
  assert.match(manager.status().claude.error, /Tunnel đã ngắt/);
  await manager.close();
});

test('tampered download never launches a tunnel', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'codebridge-quick-bad-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  let launched = false;
  const manager = createQuickTunnelManager({ root, dataDir: path.join(root, 'data'), ports: { gemini: 3232 },
    asset: ['cloudflared-test', '0'.repeat(64)], fetchImpl: async () => new Response('wrong binary', { status: 200 }),
    spawnProcess: () => { launched = true; throw new Error('must not launch'); }, enable: async () => {}, disable: async () => {} });
  manager.start('gemini');
  await until(() => manager.status().gemini.state === 'error');
  assert.match(manager.status().gemini.error, /SHA-256/);
  assert.equal(launched, false);
});

test('stopping during installation cannot launch the tunnel later', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'codebridge-quick-cancel-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const binary = Buffer.from('verified cloudflared fixture');
  const expected = createHash('sha256').update(binary).digest('hex');
  let releaseDownload, launched = false;
  const download = new Promise(resolve => { releaseDownload = resolve; });
  const manager = createQuickTunnelManager({ root, dataDir: path.join(root, 'data'), ports: { gemini: 3232 },
    asset: ['cloudflared-test', expected], fetchImpl: () => download,
    spawnProcess: () => { launched = true; throw new Error('must not launch'); }, enable: async () => {}, disable: async () => {} });
  manager.start('gemini');
  await manager.stop('gemini');
  releaseDownload(new Response(binary, { status: 200 }));
  await manager.ensureBinary();
  assert.equal(launched, false);
  assert.equal(manager.status().gemini.state, 'stopped');
});
