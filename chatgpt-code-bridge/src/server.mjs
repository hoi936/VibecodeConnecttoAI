import express from 'express';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { readFile, writeFile, mkdir, realpath, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { createTunnelManager } from './tunnel-manager.mjs';
import { createLegacyBridge } from './legacy-bridge.mjs';
import { createRemoteAccess } from './remote-access.mjs';
import { createQuickTunnelManager } from './quick-tunnel-manager.mjs';
import { canUseTerminal, createTerminalRunner, terminalTool } from './terminal.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.BRIDGE_PORT || 3210);
const origin = `http://127.0.0.1:${port}`;
const dataDir = process.env.BRIDGE_DATA_DIR || path.join(root, '.local');
const csrf = randomBytes(24).toString('hex');
await mkdir(dataDir, { recursive: true, mode: 0o700 });
let config = { workspace: path.join(root, 'demo-project'), allowWrites: true, tunnelId: '', chatgptProfiles: [] };
try { config = { ...config, ...JSON.parse(await readFile(path.join(dataDir, 'config.json'), 'utf8')) }; } catch (e) { if (e.code !== 'ENOENT') throw e; }
delete config.connectionMode; // Old versions stored an exclusive mode; both providers can now run together.
let client, tools = [], busy = 0, changing = false, connectionChanging = false, toolQueue = Promise.resolve();
let terminalEnabled = false; // Local, session-only choice. Never read from persisted config.
const terminalProfiles = new Set(), terminalRunner = createTerminalRunner();
const events = [];
function log(action, ok, detail = '') {
  events.unshift({ time: new Date().toISOString(), action, ok, detail });
  events.splice(100);
}
function availableTools(remoteAuth) {
  const files = tools.filter(t => (config.allowWrites && (!remoteAuth || remoteAuth.allowWrites)) || t.annotations?.readOnlyHint === true);
  return canUseTerminal(terminalEnabled, remoteAuth, terminalProfiles) ? [...files, terminalTool] : files;
}
async function connect(workspace) {
  const canonical = await realpath(workspace);
  if (!(await stat(canonical)).isDirectory() || path.dirname(canonical) === canonical) throw new Error('Chọn một thư mục dự án hợp lệ.');
  if (!existsSync(path.join(root, 'upstream/mcp-servers/src/filesystem/dist/index.js'))) throw new Error('Cần build Filesystem MCP trước: npm run build');
  const next = new Client({ name: 'local-code-bridge', version: '0.3.5' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(root, 'upstream/mcp-servers/src/filesystem/dist/index.js'), canonical], stderr: 'pipe' });
  let startupError = '';
  transport.stderr?.on('data', chunk => { startupError = (startupError + chunk.toString()).slice(-3000); });
  try {
    await next.connect(transport);
    const listed = await next.listTools();
    const old = client;
    client = next; tools = listed.tools; config.workspace = canonical;
    if (old) await old.close();
    log('workspace', true, canonical);
  } catch (e) { await next.close().catch(() => {}); throw new Error(`${e.message}${startupError ? '\n' + startupError : ''}`); }
}
async function saveConfig() { await writeFile(path.join(dataDir, 'config.json'), JSON.stringify(config, null, 2), { mode: 0o600 }); }
function normalizeArgs(args) {
  const result = { ...args };
  for (const key of ['path', 'source', 'destination']) if (typeof result[key] === 'string') result[key] = path.resolve(config.workspace, result[key]);
  if (Array.isArray(result.paths)) result.paths = result.paths.map(p => path.resolve(config.workspace, p));
  return result;
}
async function callTool(name, args = {}, remoteAuth) {
  if (busy >= 100) throw new Error('Hàng đợi công cụ đã đầy. Thử lại sau.');
  busy++;
  const run = toolQueue.then(async () => {
    if (changing || connectionChanging) throw new Error('Đang thay đổi cài đặt kết nối. Thử lại sau.');
    if (remoteAuth) {
      if (remoteAuth.workspace !== config.workspace) throw new Error('Workspace đã đổi. Cần kết nối lại.');
      if (remotes[remoteAuth.provider]) remotes[remoteAuth.provider].validateGrant(remoteAuth.grantId);
      else if (remoteAuth.id) tunnels.touch(remoteAuth.id);
    }
    if (!availableTools(remoteAuth).some(t => t.name === name)) throw new Error('Công cụ không có hoặc quyền tương ứng đang tắt.');
    const action = remoteAuth ? `${remoteAuth.provider}:${name}` : name;
    try {
      const result = name === terminalTool.name ? await terminalRunner.run(args, config.workspace) : await client.callTool({ name, arguments: normalizeArgs(args) });
      log(action, !result.isError, remoteAuth?.id || '');
      return result;
    } catch (e) { log(action, false); throw e; }
  });
  toolQueue = run.catch(() => {});
  try { return await run; } finally { busy--; }
}
function tunnelPath() { return path.join(root, 'runtime', process.platform === 'win32' ? 'tunnel-client-runtime.exe' : 'tunnel-client-runtime'); }
const tunnels = createTunnelManager({ binary: tunnelPath(), origin, cwd: root, profiles: config.chatgptProfiles, log });
const legacy = createLegacyBridge(process.env.BRIDGE_LEGACY_URL, origin);
await legacy.poll();
const remotes = Object.fromEntries(Object.entries({ gemini: ['GEMINI_GATEWAY_PORT', 3212], claude: ['CLAUDE_GATEWAY_PORT', 3214], grok: ['GROK_GATEWAY_PORT', 3215] }).map(([providerName, [envName, defaultPort]]) => [providerName, createRemoteAccess({ getContext: () => ({ workspace: config.workspace, allowWrites: config.allowWrites, allowTerminal: terminalEnabled }), handleMcp, log, providerName, port: Number(process.env[envName] || defaultPort), stateFile: path.join(dataDir, `oauth-${providerName}.json`) })]));
const quickTunnels = createQuickTunnelManager({ root, dataDir,
  ports: { gemini: Number(process.env.GEMINI_GATEWAY_PORT || 3212), claude: Number(process.env.CLAUDE_GATEWAY_PORT || 3214), grok: Number(process.env.GROK_GATEWAY_PORT || 3215) },
  enable: (name, origin) => connectionAction(async () => {
    await remotes[name].enable(origin);
    config[`${name}Origin`] = origin;
    await saveConfig();
    log(`${name}:quick-tunnel`, true, origin);
  }),
  disable: async name => {
    await remotes[name].disable();
    delete config[`${name}Origin`];
    await saveConfig();
  }
});
function connections() {
  const current = tunnels.list().map(p => ({ ...p, workspace: config.workspace, allowTerminal: terminalEnabled && terminalProfiles.has(p.id) }));
  const old = legacy.list().filter(p => p.state !== 'offline' || !current.some(t => t.tunnelId === p.tunnelId));
  return [...current, ...old, ...Object.values(remotes).flatMap(remote => remote.status().connections)];
}
function connectionSummary() {
  const all = connections(), now = Date.now();
  return { total: all.length, ready: all.filter(p => ['ready', 'authorized'].includes(p.state)).length,
    recent: all.filter(p => ['ready', 'authorized'].includes(p.state) && p.lastCallAt && now - Date.parse(p.lastCallAt) < 300000).length,
    pending: Object.values(remotes).reduce((count, remote) => count + remote.status().pending.length, 0), accountCount: null };
}
async function connectionAction(fn) {
  if (connectionChanging || changing || busy) throw new Error('Chờ thao tác hiện tại hoàn thành trước khi đổi kết nối.');
  connectionChanging = true;
  try { return await fn(); } finally { connectionChanging = false; }
}
const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  if (![ `127.0.0.1:${port}`, `localhost:${port}` ].includes(req.headers.host)) return res.status(403).json({ error: 'Host không được phép.' });
  const requestOrigin = `http://${req.headers.host}`;
  if (req.headers.origin && req.headers.origin !== requestOrigin) return res.status(403).json({ error: 'Origin không được phép.' });
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET' && req.headers['x-bridge-csrf'] !== csrf) return res.status(403).json({ error: 'Thiếu token bảo vệ thao tác local.' });
  }
  next();
});
app.use(express.json({ limit: '1mb' }));
app.get('/health', (req, res) => res.json({ ok: true, mcp: !!client, tunnel: connections().find(p => p.provider === 'chatgpt' && p.state === 'ready') ? 'ready' : 'stopped' }));
app.get('/api/status', (req, res) => res.json({ ...config, connectionMode: 'both', terminalEnabled, csrf, tools: availableTools(), events, tunnel: { state: tunnels.list()[0]?.state || 'stopped', error: tunnels.list()[0]?.error || '', installed: existsSync(tunnelPath()) }, ...Object.fromEntries(Object.entries(remotes).map(([name, remote]) => [name, remote.status()])), quickTunnels: quickTunnels.status(), connections: connections(), summary: connectionSummary(), endpoint: `${origin}/mcp` }));
app.post('/api/connections/check', async (req, res) => {
  await Promise.all([tunnels.poll(), legacy.poll()]);
  res.json({ ok: true, connections: connections(), summary: connectionSummary() });
});
app.post('/api/workspace', async (req, res) => {
  if (busy || changing || connectionChanging) return res.status(409).json({ error: 'Chờ thao tác MCP hoàn thành trước khi đổi workspace.' });
  changing = true;
  try {
    if (typeof req.body.path !== 'string' || !path.isAbsolute(req.body.path)) throw new Error('Nhập đường dẫn tuyệt đối đến dự án.');
    await connect(req.body.path);
    terminalProfiles.clear();
    for (const remote of Object.values(remotes)) remote.revokeAll();
    await saveConfig();
    res.json({ ok: true, workspace: config.workspace });
  } finally { changing = false; }
});
app.post('/api/permissions', async (req, res) => {
  if (busy || changing || connectionChanging) return res.status(409).json({ error: 'Chờ thao tác hiện tại hoàn thành.' });
  if (typeof req.body.allowWrites !== 'boolean') throw new Error('allowWrites phải là boolean.');
  config.allowWrites = req.body.allowWrites; await saveConfig(); res.json({ ok: true });
});
app.post('/api/terminal', (req, res) => {
  if ((changing || connectionChanging) && req.body.enabled) return res.status(409).json({ error: 'Chờ thao tác hiện tại hoàn thành trước khi bật terminal.' });
  if (typeof req.body.enabled !== 'boolean') throw new Error('enabled phải là boolean.');
  terminalEnabled = req.body.enabled;
  if (!terminalEnabled) { terminalProfiles.clear(); terminalRunner.stopAll(); }
  log('terminal:system', true, terminalEnabled ? 'enabled' : 'disabled');
  res.json({ ok: true, terminalEnabled });
});
app.post('/api/tunnel/terminal', (req, res) => {
  if ((busy || changing || connectionChanging) && req.body.enabled) return res.status(409).json({ error: 'Chờ lệnh hiện tại hoàn thành trước khi cấp quyền terminal.' });
  if (typeof req.body.enabled !== 'boolean') throw new Error('enabled phải là boolean.');
  if (!tunnels.list().some(p => p.id === req.body.id)) throw new Error('Không tìm thấy kết nối ChatGPT.');
  if (req.body.enabled && !terminalEnabled) throw new Error('Hãy bật quyền terminal trên máy trước.');
  if (req.body.enabled) terminalProfiles.add(req.body.id);
  else { terminalProfiles.delete(req.body.id); terminalRunner.stopAll(); }
  log('terminal:chatgpt', true, req.body.enabled ? 'enabled' : 'disabled');
  res.json({ ok: true });
});
app.post('/api/tool', async (req, res) => res.json(await callTool(req.body.name, req.body.arguments)));
// Keep the old endpoint harmless for clients that have not reloaded the dashboard yet.
app.post('/api/mode', (req, res) => res.json({ ok: true, mode: 'both' }));
for (const [name, remote] of Object.entries(remotes)) {
  app.post(`/api/${name}/quick-tunnel/start`, (req, res) => {
    if (remote.status().enabled && !['installing', 'starting', 'ready'].includes(quickTunnels.status()[name].state)) throw new Error('Cổng đang dùng URL HTTPS riêng. Hãy tắt cổng riêng trước khi tạo Quick Tunnel; thao tác đó sẽ thu hồi quyền OAuth hiện có.');
    res.json(quickTunnels.start(name));
  });
  app.post(`/api/${name}/quick-tunnel/stop`, async (req, res) => res.json(await quickTunnels.stop(name)));
  app.post(`/api/${name}/enable`, async (req, res) => res.json(await connectionAction(async () => {
    if (['installing', 'starting', 'ready'].includes(quickTunnels.status()[name].state)) throw new Error('Dừng URL tự động trước khi dùng URL HTTPS riêng.');
    const result = await remote.enable(req.body.publicOrigin);
    config[`${name}Origin`] = result.publicOrigin; await saveConfig(); return result;
  })));
  app.post(`/api/${name}/disable`, async (req, res) => res.json(await connectionAction(async () => { await quickTunnels.stop(name); await remote.disable(); delete config[`${name}Origin`]; await saveConfig(); return { ok: true }; })));
  app.post(`/api/${name}/approve`, (req, res) => { remote.approve(req.body.id, req.body.label, req.body.allowTerminal ?? false); res.json({ ok: true }); });
  app.post(`/api/${name}/deny`, (req, res) => { remote.deny(req.body.id); res.json({ ok: true }); });
  app.post(`/api/${name}/revoke`, (req, res) => { terminalRunner.stopAll(); if (req.body.id) remote.revoke(req.body.id); else remote.revokeAll(); res.json({ ok: true }); });
  app.post(`/api/${name}/rename`, (req, res) => { remote.rename(req.body.id, req.body.label); res.json({ ok: true }); });
  app.post(`/api/${name}/pause`, (req, res) => { terminalRunner.stopAll(); remote.pause(req.body.id); res.json({ ok: true }); });
  app.post(`/api/${name}/resume`, (req, res) => { remote.resume(req.body.id); res.json({ ok: true }); });
}
async function startTunnel(body) {
  await legacy.poll();
  if (legacy.list().some(p => p.tunnelId === body.tunnelId && !['stopped', 'offline'].includes(p.state))) throw new Error('Tunnel ID này có thể đang được phiên cũ sử dụng. Hãy kiểm tra hoặc dừng phiên cũ trước.');
  const result = await tunnels.start({ ...body, label: body.label || 'ChatGPT' });
  config.chatgptProfiles = tunnels.savedProfiles(); config.tunnelId = body.tunnelId; await saveConfig(); return result;
}
app.post('/api/tunnel/start', async (req, res) => res.json(await connectionAction(() => startTunnel(req.body))));
app.post('/api/tunnel/stop', async (req, res) => res.json(await connectionAction(async () => {
  if (req.body.id) terminalProfiles.delete(req.body.id); else terminalProfiles.clear();
  if (req.body.id === 'legacy-chatgpt') await legacy.stop();
  else if (req.body.id) await tunnels.stop(req.body.id);
  else await tunnels.stopAll();
  return { ok: true };
})));
app.post('/api/tunnel/remove', async (req, res) => res.json(await connectionAction(async () => {
  terminalProfiles.delete(req.body.id);
  await tunnels.remove(req.body.id); config.chatgptProfiles = tunnels.savedProfiles(); await saveConfig(); return { ok: true };
})));
let healthPolling = false;
const healthTimer = setInterval(async () => {
  if (healthPolling) return;
  healthPolling = true;
  try {
  await Promise.all([tunnels.poll(), legacy.poll()]);
  } catch (e) { log('connections:health', false, e.message); } finally { healthPolling = false; }
}, 2500);
healthTimer.unref();

async function handleMcp(req, res) {
  const remoteAuth = remotes[req.bridgeSource] ? { ...req.auth.extra, provider: req.bridgeSource } : { provider: 'chatgpt', id: req.params.id, workspace: config.workspace, allowWrites: true };
  if (connectionChanging) return res.status(409).json({ error: 'Đang thay đổi kết nối.' });
  if (remoteAuth.id) tunnels.touch(remoteAuth.id);
  const server = new Server({ name: 'Local Code Bridge', version: '0.3.5' }, { capabilities: { tools: {} }, instructions: `Work in the selected workspace. Paths may be relative to the workspace. Call list_allowed_directories first. Use edit_file dryRun before applying edits. If run_command is available, it runs on the local computer with the operating-system user's permissions; use it only when the task requires it.` });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: availableTools(remoteAuth) }));
  server.setRequestHandler(CallToolRequestSchema, async r => callTool(r.params.name, r.params.arguments, remoteAuth));
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on('close', () => { transport.close().catch(() => {}); server.close().catch(() => {}); });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}
app.post('/mcp', handleMcp);
app.post('/mcp/tunnels/:id', handleMcp);
app.all('/mcp', (req, res) => res.status(405).set('Allow', 'POST').end());
app.get('/preview/*path', async (req, res) => {
  const relative = (req.params.path || []).join('/') || 'index.html';
  if (relative.split('/').some(segment => segment.startsWith('.') || segment === 'node_modules')) return res.sendStatus(403);
  const target = await realpath(path.resolve(config.workspace, relative));
  if (!target.startsWith(config.workspace + path.sep)) return res.sendStatus(403);
  res.setHeader('Content-Security-Policy', "sandbox allow-scripts; default-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'none'");
  res.sendFile(target);
});
app.get('/preview', (req, res) => res.redirect('/preview/index.html'));
app.use('/api', (req, res) => res.status(404).json({ error: 'API này không có trong phiên Code Bridge đang chạy. Hãy cập nhật hoặc khởi động lại ứng dụng.' }));
app.use(express.static(path.join(root, 'public')));
app.use((err, req, res, next) => { if (res.headersSent) return next(err); res.status(400).json({ error: err.message }); });
await connect(config.workspace);
for (const [name, remote] of Object.entries(remotes)) {
  const saved = config[`${name}Origin`];
  if (typeof saved !== 'string' || !saved) continue;
  try {
    if (!new URL(saved).hostname.endsWith('.trycloudflare.com')) await remote.enable(saved);
  } catch (error) { log(`${name}:restore`, false, error.message); }
}
const httpServer = app.listen(port, '127.0.0.1', () => console.log(`Code Bridge: ${origin}\nMCP: ${origin}/mcp\nWorkspace: ${config.workspace}`));
async function shutdown() { clearInterval(healthTimer); terminalRunner.stopAll(); await tunnels.close(); await quickTunnels.close(); await Promise.all(Object.values(remotes).map(remote => remote.close())); await toolQueue; await client?.close(); httpServer.close(); }
process.on('SIGINT', () => shutdown().then(() => process.exit(0)));
process.on('SIGTERM', () => shutdown().then(() => process.exit(0)));
