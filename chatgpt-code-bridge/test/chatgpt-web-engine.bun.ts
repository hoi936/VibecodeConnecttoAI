import { test, expect } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultConfig } from '../vendor/chatgpt-web/src/config';
import { installCodexIntegration, deactivateCodexIntegration } from '../vendor/chatgpt-web/src/codex-integration';
import { modelsRequest } from '../vendor/chatgpt-web/src/server';

test('embedded engine installs and restores the Codex route without losing MCP configuration', () => {
  const folder = mkdtempSync(join(tmpdir(), 'codebridge-web-route-'));
  const originalHome = process.env.CODEX_HOME;
  const originalEngine = process.env.CODEX_CHATGPT_WEB_HOME;
  process.env.CODEX_HOME = join(folder, 'codex');
  process.env.CODEX_CHATGPT_WEB_HOME = join(folder, 'engine');
  mkdirSync(process.env.CODEX_HOME, { recursive: true });
  const file = join(process.env.CODEX_HOME, 'config.toml');
  const original = 'model = "existing-model"\n\n[mcp_servers.code_bridge]\nurl = "http://127.0.0.1:3213/mcp"\n';
  writeFileSync(file, original);
  try {
    const config = defaultConfig(); config.port = 3216; config.subagentProtocol = 'native';
    installCodexIntegration(config);
    const installed = readFileSync(file, 'utf8');
    expect(installed).toContain('openai_base_url = "http://127.0.0.1:3216/v1"');
    expect(installed).toContain('[mcp_servers.code_bridge]');
    deactivateCodexIntegration();
    expect(readFileSync(file, 'utf8')).toBe(original);
  } finally {
    if (originalHome === undefined) delete process.env.CODEX_HOME; else process.env.CODEX_HOME = originalHome;
    if (originalEngine === undefined) delete process.env.CODEX_CHATGPT_WEB_HOME; else process.env.CODEX_CHATGPT_WEB_HOME = originalEngine;
    rmSync(folder, { recursive: true, force: true });
  }
});

test('embedded model endpoint keeps the native catalog and appends only eligible Web model entries', async () => {
  const config = defaultConfig(); config.proAvailable = false; config.subagentProtocol = 'native';
  const response = await modelsRequest(new Request('http://127.0.0.1:3216/v1/models', { headers: { authorization: 'Bearer fixture' } }), config,
    async () => Response.json({ models: [{ slug: 'native-fixture', display_name: 'Native fixture', visibility: 'list', supported_reasoning_levels: [], context_window: 128000, priority: 1 }] }));
  expect(response.status).toBe(200);
  const catalog = await response.json();
  expect(catalog.models.some((m: {slug: string}) => m.slug === 'native-fixture')).toBe(true);
  expect(catalog.models.some((m: {slug: string}) => m.slug.startsWith('chatgpt-web/'))).toBe(true);
  expect(catalog.models.some((m: {display_name: string}) => /Pro \(Web\)/.test(m.display_name))).toBe(false);
});
