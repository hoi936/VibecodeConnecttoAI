// This process owns the embedded MIT engine. Only structured, non-secret state
// crosses stdout; login state and runtime keys stay in Code Bridge's private home.
import { createInterface } from 'node:readline';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { defaultConfig, loadConfig, saveConfig, getConfigPath, getConfigDir, type AppConfig } from '../vendor/chatgpt-web/src/config';
import { browserLoginStateExists, inspectBrowserLoginCapabilities } from '../vendor/chatgpt-web/src/browser-login';
import { installCodexIntegration, inspectCodexIntegration, deactivateCodexIntegration, uninstallCodexIntegration } from '../vendor/chatgpt-web/src/codex-integration';
import { availableChatGptWebModelRoutes } from '../vendor/chatgpt-web/src/chatgpt-web-models';
import { startServer } from '../vendor/chatgpt-web/src/server';
import { createTunnelConfig, installTunnelClient, installRuntimeKeyBytes, connectTunnel, stopTunnel, tunnelStatus, waitForTunnelReady } from '../vendor/chatgpt-web/src/tunnel';
import { loginToChatGpt } from './chatgpt-web-login';

let config: AppConfig = existsSync(getConfigPath()) ? loadConfig() : defaultConfig();
let server: ReturnType<typeof startServer> | undefined;
let busy = false;
let loginController: AbortController | undefined;
let continueLogin: (() => void) | undefined;
let loginDone: Promise<void> | undefined;
config.port = Number(process.env.BRIDGE_WEB_PORT || '3216');
if (!Number.isInteger(config.port) || config.port < 1024 || config.port > 65535) throw new Error('BRIDGE_WEB_PORT phải là cổng từ 1024 đến 65535.');
if (process.env.BRIDGE_WEB_CHROME) config.chromeExecutablePath = process.env.BRIDGE_WEB_CHROME;
config.composerPredictionsEnabled = false;
config.subagentProtocol = 'native';
config.appName = 'Codex Code Bridge';
config.automaticAppName = config.appName;
config.runtimeCommand = [process.execPath, path.resolve(import.meta.dir, '../vendor/chatgpt-web/src/cli.ts'), '--home', getConfigDir()];

function emit(value: unknown) { process.stdout.write('CODEBRIDGE_WEB ' + JSON.stringify(value) + '\n'); }
function progress(message: string) { emit({ event: 'progress', message }); }
function status() {
  const integration = inspectCodexIntegration();
  const loggedIn = browserLoginStateExists(config);
  return {
    loggedIn, running: Boolean(server), mode: config.mode,
    browserAvailable: existsSync(config.chromeExecutablePath),
    browserPath: config.chromeExecutablePath,
    installed: integration.installed, active: integration.active,
    configPath: integration.configPath, integrationErrors: integration.errors,
    endpoint: `http://127.0.0.1:${config.port}/v1`, connectorName: config.appName,
    tunnelConfigured: Boolean(config.tunnel),
    models: loggedIn ? availableChatGptWebModelRoutes(config).filter(route => !route.legacy).map(route => ({ id: route.slug, name: route.displayName })) : []
  };
}
async function assertIdle() {
  if (!server) return;
  const response = await fetch(`http://127.0.0.1:${config.port}/healthz`, { signal: AbortSignal.timeout(3000) });
  const health = await response.json() as Record<string, number>;
  if (health.active_http_turns || health.active_browser_turns) throw new Error('Codex đang xử lý yêu cầu. Hãy chờ hoàn tất trước khi đổi kết nối.');
}
async function stopServer(force = false) {
  if (!server) return;
  if (!force) await assertIdle();
  if (config.mode === 'full' && config.tunnel) stopTunnel(config);
  const current = server;
  await fetch(`http://127.0.0.1:${config.port}/admin/shutdown`, {
    method: 'POST', headers: { Authorization: `Bearer ${config.controlToken}` }, signal: AbortSignal.timeout(5000)
  });
  // The upstream handler drains browser workers asynchronously before stopping.
  for (let i = 0; i < 200; i++) {
    try { await fetch(`http://127.0.0.1:${config.port}/healthz`, { signal: AbortSignal.timeout(200) }); }
    catch { break; }
    await Bun.sleep(50);
  }
  await current.stop(true);
  server = undefined;
}
async function start() {
  if (!browserLoginStateExists(config)) throw new Error('Hãy đăng nhập ChatGPT trong Code Bridge trước.');
  if (!server) {
    server = startServer(config);
    try {
      if (config.mode === 'full') {
        progress('Đang kết nối tunnel công cụ cho model Web…');
        connectTunnel(config);
        const ready = await waitForTunnelReady(config);
        if (!ready.ok) throw new Error(ready.detail);
      }
    } catch (error) { await stopServer(true).catch(() => {}); throw error; }
  }
  try { installCodexIntegration(config); }
  catch (error) { await stopServer(true).catch(() => {}); throw error; }
  saveConfig(config);
  return status();
}
async function action(name: string, body: Record<string, unknown>) {
  switch (name) {
    case 'status': return status();
    case 'login': {
      await assertIdle();
      if (server) throw new Error('Tạm dừng model Web trước khi đăng nhập lại.');
      loginController = new AbortController();
      const signal = loginController.signal;
      const continuation = new Promise<void>(resolve => { continueLogin = resolve; });
      let finish!: () => void;
      loginDone = new Promise<void>(resolve => { finish = resolve; });
      const timeout = setTimeout(() => loginController?.abort(new Error('Đăng nhập đã quá 10 phút. Bấm Đăng nhập ChatGPT để thử lại.')), 10 * 60000);
      progress('Đang mở cửa sổ Chrome riêng để đăng nhập ChatGPT…');
      try {
        const login = await loginToChatGpt(config, {
          signal, continuation,
          onReady: () => emit({ event: 'login-stage', phase: 'logging_in', message: 'Đăng nhập ChatGPT trong cửa sổ Chrome riêng. Khi thấy ô chat, quay lại đây bấm Đã đăng nhập, tiếp tục.' }),
          onVerifying: () => { continueLogin = undefined; emit({ event: 'login-stage', phase: 'verifying', message: 'Đang xác minh phiên và nhận diện model. Giữ các cửa sổ kiểm tra ChatGPT mở đến khi hoàn tất.' }); }
        });
        config = { ...config, solAvailable: login.solAvailable, extraHighAvailable: login.extraHighAvailable, proAvailable: login.proAvailable };
        saveConfig(config);
        return status();
      } catch (error) { if (signal.aborted) throw signal.reason; throw error; }
      finally { clearTimeout(timeout); loginController = undefined; continueLogin = undefined; finish(); loginDone = undefined; }
    }
    case 'continue-login':
      if (!continueLogin) throw new Error('Không có cửa sổ đăng nhập đang chờ tiếp tục.');
      continueLogin(); continueLogin = undefined;
      return {};
    case 'cancel-login':
      if (!loginController) throw new Error('Không có phiên đăng nhập đang chờ.');
      loginController.abort(new Error('Đã hủy đăng nhập. Có thể bấm Đăng nhập ChatGPT để thử lại.'));
      return {};
    case 'refresh-models': {
      await assertIdle();
      Object.assign(config, await inspectBrowserLoginCapabilities(config));
      saveConfig(config);
      return status();
    }
    case 'start': return start();
    case 'pause':
      await assertIdle();
      deactivateCodexIntegration();
      await stopServer();
      return status();
    case 'shutdown':
      loginController?.abort(new Error('Code Bridge đang đóng.'));
      if (loginDone) await loginDone;
      deactivateCodexIntegration({ forRuntimeRecovery: true });
      await stopServer(true);
      return status();
    case 'remove':
      await assertIdle();
      uninstallCodexIntegration();
      await stopServer();
      return status();
    case 'tools': {
      await assertIdle();
      if (!browserLoginStateExists(config)) throw new Error('Hãy đăng nhập ChatGPT trước khi cấp công cụ cho model Web.');
      if (typeof body.tunnelId !== 'string' || !/^tunnel_[a-f0-9]{32}$/.test(body.tunnelId)) throw new Error('Tunnel ID phải bắt đầu bằng tunnel_ và có 32 ký tự hex.');
      if (typeof body.apiKey !== 'string' || body.apiKey.length < 16 || body.apiKey.length > 4096 || /[\r\n]/.test(body.apiKey)) throw new Error('Nhập Runtime API Key hợp lệ.');
      await stopServer();
      progress('Đang chuẩn bị tunnel công cụ của Code Bridge…');
      const binaryPath = await installTunnelClient();
      const runtimeKeyFile = installRuntimeKeyBytes(body.apiKey);
      config.mode = 'full';
      config.tunnel = createTunnelConfig({ binaryPath, runtimeKeyFile, tunnelId: body.tunnelId, profileName: 'codebridge-codex-web', alias: 'codebridge-codex-web' });
      config.automaticTunnel = config.tunnel;
      saveConfig(config);
      return start();
    }
    case 'check-tunnel': return { ...status(), tunnel: config.mode === 'full' ? tunnelStatus(config) : null };
    default: throw new Error('Thao tác ChatGPT Web không hợp lệ.');
  }
}

emit({ event: 'ready', status: status() });
const reader = createInterface({ input: process.stdin });
reader.on('line', async line => {
  let message: { id: number; action: string; body?: Record<string, unknown> };
  try { message = JSON.parse(line); } catch { return; }
  const control = ['status', 'continue-login', 'cancel-login', 'shutdown'].includes(message.action);
  if (busy && !control) { emit({ id: message.id, error: 'Đang xử lý thao tác ChatGPT Web. Hãy chờ hoàn tất.' }); return; }
  if (!control) busy = true;
  try { emit({ id: message.id, result: await action(message.action, message.body || {}) }); }
  catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    emit({ id: message.id, error: detail.replace(/sk-[A-Za-z0-9_-]+/g, '[key]') });
  } finally { if (!control) busy = false; }
});
reader.once('close', () => { void action('shutdown', {}).finally(() => process.exit()); });
