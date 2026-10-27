import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { codexWebStatus } from '../src/codex-web-status.mjs';

async function home(config) {
  const directory = await mkdtemp(path.join(tmpdir(), 'bridge-codex-web-'));
  await mkdir(directory, { recursive: true });
  if (config !== undefined) await writeFile(path.join(directory, 'config.toml'), config);
  return directory;
}

test('reports ChatGPT Web models from a local Codex Responses bridge', async () => {
  const codexHome = await home('openai_base_url = "http://127.0.0.1:5361"\n[mcp_servers.code_bridge]\nurl = "http://127.0.0.1:3213/mcp"\n');
  const calls = [];
  const result = await codexWebStatus({ codexHome, fetcher: async url => {
    calls.push(String(url));
    return { ok: true, json: async () => ({ models: [{ slug: 'gpt-6-sol' }, { slug: 'chatgpt-web/gpt-6-sol' }] }) };
  } });
  assert.equal(result.state, 'ready');
  assert.deepEqual(result.models, ['chatgpt-web/gpt-6-sol']);
  assert.deepEqual(calls, ['http://127.0.0.1:5361/v1/models']);
});

test('does not probe an external or nested provider URL', async () => {
  let calls = 0;
  const fetcher = async () => { calls++; throw new Error('unexpected'); };
  assert.equal((await codexWebStatus({ codexHome: await home('openai_base_url = "https://example.com"\n'), fetcher })).state, 'other_provider');
  assert.equal((await codexWebStatus({ codexHome: await home('[model_providers.other]\nopenai_base_url = "http://localhost:5361"\n'), fetcher })).state, 'not_configured');
  assert.equal(calls, 0);
});
