import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

function configuredBaseUrl(config) {
  for (const line of config.split(/\r?\n/)) {
    if (/^\s*\[/.test(line)) break;
    const match = /^\s*openai_base_url\s*=\s*(["'])(.*?)\1\s*(?:#.*)?$/.exec(line);
    if (match) return match[2];
  }
  return '';
}

export async function codexWebStatus({ codexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), fetcher = fetch } = {}) {
  const result = { state: 'not_configured', modelCount: 0, models: [], baseUrl: '' };
  let config;
  try { config = await readFile(path.join(codexHome, 'config.toml'), 'utf8'); }
  catch { return result; }
  const raw = configuredBaseUrl(config);
  if (!raw) return result;
  let url;
  try { url = new URL(raw); } catch { return { ...result, state: 'invalid_url' }; }
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    return { ...result, state: 'other_provider' };
  }
  result.baseUrl = url.origin;
  try {
    const response = await fetcher(new URL('/v1/models', url), { signal: AbortSignal.timeout(1800) });
    if (!response.ok) return { ...result, state: 'unavailable' };
    const catalog = await response.json();
    const items = Array.isArray(catalog?.data) ? catalog.data : Array.isArray(catalog?.models) ? catalog.models : [];
    const names = items.map(item => item?.slug || item?.id || item?.model).filter(name => typeof name === 'string' && name.startsWith('chatgpt-web/'));
    return { ...result, state: names.length ? 'ready' : 'no_web_models', modelCount: names.length, models: names };
  } catch { return { ...result, state: 'unavailable' }; }
}
