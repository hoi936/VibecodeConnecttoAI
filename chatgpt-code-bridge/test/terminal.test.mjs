import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canUseTerminal, createTerminalRunner } from '../src/terminal.mjs';

test('terminal requires both system and connection approval', () => {
  const profiles = new Set(['approved-profile']);
  assert.equal(canUseTerminal(false, undefined, profiles), false);
  assert.equal(canUseTerminal(true, undefined, profiles), true);
  assert.equal(canUseTerminal(true, { provider: 'chatgpt', id: 'approved-profile' }, profiles), true);
  assert.equal(canUseTerminal(true, { provider: 'chatgpt', id: 'other-profile' }, profiles), false);
  assert.equal(canUseTerminal(true, { provider: 'chatgpt' }, profiles), false);
  assert.equal(canUseTerminal(true, { provider: 'gemini', allowTerminal: true }, profiles), true);
  assert.equal(canUseTerminal(true, { provider: 'gemini', allowTerminal: false }, profiles), false);
});

test('terminal runner returns output, limits runtime and output', async () => {
  const runner = createTerminalRunner();
  const ok = await runner.run({ command: 'echo hello' }, process.cwd());
  assert.equal(ok.isError, false);
  assert.match(ok.content[0].text, /Exit code: 0\nhello/);
  await assert.rejects(runner.run({ command: '', timeoutMs: 1000 }, process.cwd()), /Lệnh cần/);
  await assert.rejects(runner.run({ command: 'echo hi', timeoutMs: 30001 }, process.cwd()), /timeoutMs/);
  const timed = await runner.run({ command: process.platform === 'win32' ? 'ping -n 5 127.0.0.1 >nul' : 'sleep 5', timeoutMs: 1000 }, process.cwd());
  assert.equal(timed.isError, true);
  assert.match(timed.content[0].text, /Timed out/);
  if (process.platform !== 'win32') {
    const truncated = await runner.run({ command: 'yes x | head -c 70000' }, process.cwd());
    assert.equal(truncated.isError, true);
    assert.match(truncated.content[0].text, /Output limit reached/);
  }
});
