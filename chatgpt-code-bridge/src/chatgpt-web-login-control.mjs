import { spawn } from 'node:child_process';

// Give Chrome a normal window-close on Windows so it can flush the login profile.
export async function closeLoginBrowser(browser) {
  if (process.platform !== 'win32') return browser.kill();
  if (!Number.isSafeInteger(browser.pid) || browser.pid < 1) return false;
  return new Promise(resolve => {
    const command = `(Get-Process -Id ${browser.pid} -ErrorAction SilentlyContinue).CloseMainWindow()`;
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    let output = '';
    child.stdout.on('data', chunk => { output = (output + chunk).slice(-100); });
    child.once('error', () => resolve(browser.kill()));
    child.once('exit', () => resolve(/true/i.test(output) || browser.kill()));
  });
}

// Controls only the Chrome child opened for this login, never the user's other browsers.
/** @returns {Promise<number>} */
export function waitForLoginBrowser(browser, { continuation, signal, onReady = () => {}, stopTimeoutMs = 5000, requestClose = closeLoginBrowser }) {
  return new Promise((resolve, reject) => {
    let settled = false, continuing = false, stopping = false, timer;
    const finish = (error, code = 0) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      browser.off('spawn', onReady);
      browser.off('error', failed);
      browser.off('exit', exited);
      signal.removeEventListener('abort', cancelled);
      error ? reject(error) : resolve(code);
    };
    const failed = error => finish(error);
    const exited = (code, exitSignal) => {
      if (signal.aborted) finish(signal.reason || new Error('Đã hủy đăng nhập.'));
      else if (continuing) finish(null);
      else if (exitSignal) finish(new Error(`Cửa sổ đăng nhập đã dừng (${exitSignal}). Hãy thử lại.`));
      else finish(null, code ?? 1);
    };
    const stop = () => {
      if (settled || stopping) return;
      stopping = true;
      if (browser.exitCode !== null || browser.signalCode !== null) { exited(browser.exitCode, browser.signalCode); return; }
      timer = setTimeout(() => {
        if (settled) return;
        browser.kill('SIGKILL');
        timer = setTimeout(() => finish(new Error('Không dừng được tiến trình đăng nhập. Hãy đóng cửa sổ Chrome riêng.')), stopTimeoutMs);
      }, stopTimeoutMs);
      void Promise.resolve().then(() => requestClose(browser)).then(closed => {
        if (!closed && !settled) finish(new Error('Không đóng được cửa sổ đăng nhập. Hãy đóng cửa sổ Chrome riêng rồi thử lại.'));
      }, failed);
    };
    const cancelled = () => stop();
    browser.once('spawn', onReady);
    browser.once('error', failed);
    browser.once('exit', exited);
    signal.addEventListener('abort', cancelled, { once: true });
    void continuation.then(() => { if (!settled) { continuing = true; stop(); } }, failed);
    if (signal.aborted) cancelled();
  });
}
