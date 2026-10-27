import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Browser } from '../vendor/chatgpt-web/node_modules/playwright-core/index.mjs';
import { atomicWriteFile, type AppConfig } from '../vendor/chatgpt-web/src/config';
import { loginVerificationMarkerPath, sanitizeBrowserLoginStorageState, type BrowserLoginResult } from '../vendor/chatgpt-web/src/browser-login';
import { CHATGPT_NEW_CHAT_URL, CHATGPT_COMPOSER_SELECTOR, assertAuthenticatedChatGptPage, detectChatGptAccountCapabilities } from '../vendor/chatgpt-web/src/chatgpt-session';
import { waitForLoginBrowser } from './chatgpt-web-login-control.mjs';

export async function readLoginEndpoint(file: string, signal: AbortSignal): Promise<string> {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    signal.throwIfAborted();
    try {
      const [port, endpoint] = (await readFile(file, 'utf8')).trim().split(/\r?\n/);
      if (!/^\d+$/.test(port) || Number(port) < 1024 || Number(port) > 65535 || !/^\/devtools\/browser\/[\w-]+$/.test(endpoint)) throw new Error('invalid endpoint');
      return `ws://127.0.0.1:${port}${endpoint}`;
    } catch {}
    await Bun.sleep(100);
  }
  throw new Error('Không mở được kênh xác minh cửa sổ Chrome riêng. Bấm Hủy đăng nhập rồi thử lại.');
}

export async function loginToChatGpt(config: AppConfig, options: {
  signal: AbortSignal; continuation: Promise<void>; onReady: () => void; onVerifying: () => void;
}): Promise<BrowserLoginResult> {
  const { signal } = options;
  signal.throwIfAborted();
  if (!existsSync(config.chromeExecutablePath)) throw new Error('Chưa tìm thấy Google Chrome. Cài Chrome rồi mở lại Code Bridge.');
  const profileDir = path.join(path.dirname(config.storageStatePath), 'login-profile');
  await mkdir(profileDir, { recursive: true, mode: 0o700 });
  const endpointFile = path.join(profileDir, 'DevToolsActivePort');
  await rm(endpointFile, { force: true });
  const child = spawn(config.chromeExecutablePath, [
    `--user-data-dir=${profileDir}`, '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1',
    '--new-window', '--disable-background-mode', '--no-first-run', '--no-default-browser-check',
    '--restore-last-session', CHATGPT_NEW_CHAT_URL
  ], { stdio: 'ignore', env: process.env });
  const local = new AbortController();
  const lifetime = AbortSignal.any([signal, local.signal]);
  let closeAfterCapture!: () => void;
  const closeReady = new Promise<void>(resolve => { closeAfterCapture = resolve; });
  const closed = waitForLoginBrowser(child, { continuation: closeReady, signal: lifetime, onReady: options.onReady });
  // Attach rejection handling immediately, including when Chrome fails before Continue.
  const earlyClose = closed.then(() => { throw new Error('Cửa sổ đăng nhập đã đóng trước khi lưu phiên. Bấm Đăng nhập lại, sau đó dùng Đã đăng nhập, tiếp tục.'); });
  void earlyClose.catch(() => {});
  let browser: Browser | undefined;
  const cancel = () => { void browser?.close().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    await Promise.race([options.continuation, earlyClose]);
    signal.throwIfAborted();
    options.onVerifying();
    const endpoint = await readLoginEndpoint(endpointFile, signal);
    browser = await chromium.connectOverCDP(endpoint, { timeout: 20000 });
    signal.throwIfAborted();
    const context = browser.contexts()[0];
    if (!context) throw new Error('Không tìm thấy phiên Chrome đang đăng nhập. Hãy thử lại.');
    let page = context.pages().find(page => { try { return new URL(page.url()).hostname === 'chatgpt.com'; } catch { return false; } });
    if (!page) { page = await context.newPage(); await page.goto(CHATGPT_NEW_CHAT_URL, { waitUntil: 'domcontentloaded', timeout: 60000 }); }
    try { await page.locator(CHATGPT_COMPOSER_SELECTOR).filter({ visible: true }).first().waitFor({ state: 'visible', timeout: 30000 }); }
    catch { throw new Error('Chưa thấy ô chat ChatGPT. Hãy hoàn tất đăng nhập hoặc xác minh trình duyệt trong cửa sổ riêng rồi thử lại.'); }
    await assertAuthenticatedChatGptPage(page);
    const authenticated = await page.evaluate(async () => {
      try {
        const response = await fetch('/api/auth/session', { credentials: 'same-origin' });
        const session = await response.json();
        return response.ok && Boolean(session.user) && typeof session.accessToken === 'string' && session.accessToken.length > 0;
      } catch { return false; }
    });
    if (!authenticated) throw new Error('ChatGPT chưa xác nhận tài khoản đã đăng nhập. Đăng nhập trong cửa sổ riêng rồi bấm tiếp tục.');
    const capabilities = await detectChatGptAccountCapabilities(page, { signal });
    const state = sanitizeBrowserLoginStorageState(await context.storageState());
    signal.throwIfAborted();
    if (!state.cookies.length) throw new Error('Không lưu được phiên ChatGPT từ cửa sổ đăng nhập. Hãy thử lại.');
    const accountSurfaceUrl = page.url();
    // Capture and validate while the authenticated browser is still alive. Closing first
    // loses session-only cookies on some Windows Chrome installations.
    closeAfterCapture();
    await closed;
    signal.throwIfAborted();
    atomicWriteFile(config.storageStatePath, JSON.stringify(state) + '\n');
    atomicWriteFile(loginVerificationMarkerPath(config.storageStatePath), JSON.stringify({ version: 1, authenticated: true, verifiedAt: new Date().toISOString(), ...capabilities }) + '\n');
    return { storageStatePath: config.storageStatePath, accountSurfaceUrl, solAvailable: capabilities.solAvailable, extraHighAvailable: capabilities.extraHighAvailable === true, proAvailable: capabilities.proAvailable };
  } finally {
    signal.removeEventListener('abort', cancel);
    local.abort(new Error('Kết thúc phiên đăng nhập.'));
    await closed.catch(() => {});
    await browser?.close().catch(() => {});
  }
}
