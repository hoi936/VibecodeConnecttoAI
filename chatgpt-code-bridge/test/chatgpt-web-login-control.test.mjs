import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { waitForLoginBrowser } from '../src/chatgpt-web-login-control.mjs';

function browser() { return spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' }); }
test('continue closes the owned login child and advances even when it exits by signal', async () => {
  const child = browser();
  let proceed;
  const continuation = new Promise(resolve => { proceed = resolve; });
  try {
    const exit = await waitForLoginBrowser(child, { continuation, signal: new AbortController().signal, onReady: () => proceed(), requestClose: current => current.kill() });
    assert.equal(exit, 0);
    assert.ok(child.exitCode !== null || child.signalCode !== null);
  } finally { child.kill(); }
});
test('cancel aborts login and releases the process instead of leaving login busy forever', async () => {
  const child = browser(), controller = new AbortController();
  try {
    await assert.rejects(waitForLoginBrowser(child, {
      continuation: new Promise(() => {}), signal: controller.signal,
      onReady: () => controller.abort(new Error('user cancelled')),
      requestClose: current => current.kill()
    }), /user cancelled/);
    assert.ok(child.exitCode !== null || child.signalCode !== null);
  } finally { child.kill(); }
});
test('manual close can still complete login without pressing Continue', async () => {
  const child = spawn(process.execPath, ['-e', 'process.exit(0)'], { stdio: 'ignore' });
  const exit = await waitForLoginBrowser(child, { continuation: new Promise(() => {}), signal: new AbortController().signal });
  assert.equal(exit, 0);
});
