import express from 'express';
import { randomBytes, createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { InvalidClientMetadataError, InvalidGrantError, InvalidScopeError, InvalidTargetError, InvalidTokenError, TooManyRequestsError } from '@modelcontextprotocol/sdk/server/auth/errors.js';

const nonce = () => randomBytes(32).toString('base64url');
const digest = value => createHash('sha256').update(value).digest('hex');
const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const now = () => Math.floor(Date.now() / 1000);

export function validatePublicOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/' || isIP(url.hostname.replace(/^\[|\]$/g, '')) || !url.hostname.includes('.') || /\.(localhost|local|internal)$/.test(url.hostname)) {
    throw new Error('Nhập URL HTTPS public gốc, ví dụ https://bridge.example.com, không thêm /mcp.');
  }
  return url.origin;
}

// This listener contains no administration routes. All user consent happens on the
// separate, CSRF-protected local dashboard. OAuth state is intentionally ephemeral.
export function createRemoteAccess({ getContext, handleMcp, log = () => {}, port = 3212, providerName = 'gemini' }) {
  if (!['gemini', 'claude', 'grok'].includes(providerName)) throw new Error('Nhà cung cấp MCP không hợp lệ.');
  const displayName = { gemini: 'Gemini', claude: 'Claude', grok: 'Grok' }[providerName];
  let listener, publicOrigin = '', enabled = false, lastCallAt = null;
  const clients = new Map(), pending = new Map(), codes = new Map(), tokens = new Map(), refreshTokens = new Map(), grants = new Map();
  function clean() {
    for (const map of [clients, pending, codes, tokens, refreshTokens, grants]) for (const [id, record] of map) if (record.expiresAt <= now()) map.delete(id);
  }
  function revokeAll() {
    for (const map of [pending, codes, tokens, refreshTokens, grants]) map.clear();
    lastCallAt = null;
    log(`${providerName}:revoke`, true);
  }
  function endpoint() { return publicOrigin + '/mcp'; }
  function checkResource(resource) { if (resource && resource.href !== endpoint()) throw new InvalidTargetError('Resource does not match this MCP server'); }
  function currentGrant(id) {
    clean();
    const grant = grants.get(id);
    if (!grant || grant.workspace !== getContext().workspace) throw new InvalidGrantError('Grant expired or workspace changed');
    return grant;
  }
  function tokenPair(grant) {
    clean();
    if (tokens.size >= 200 || refreshTokens.size >= 100) throw new TooManyRequestsError('Too many active tokens');
    const access = nonce(), refresh = nonce();
    tokens.set(digest(access), { grantId: grant.id, clientId: grant.clientId, expiresAt: now() + 900 });
    refreshTokens.set(digest(refresh), { grantId: grant.id, clientId: grant.clientId, expiresAt: grant.expiresAt });
    grant.authorizedAt ||= new Date().toISOString();
    return { access_token: access, token_type: 'Bearer', expires_in: 900, refresh_token: refresh, scope: 'mcp' };
  }
  const provider = {
    clientsStore: {
      getClient(id) { clean(); return clients.get(id)?.client; },
      registerClient(client) {
        clean();
        if (clients.size >= 100) throw new TooManyRequestsError('Too many registered clients');
        if (!client.redirect_uris?.length || client.redirect_uris.length > 12) throw new InvalidClientMetadataError('Provide 1–12 HTTPS redirect URIs');
        for (const uri of client.redirect_uris) {
          const url = new URL(uri);
          if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new InvalidClientMetadataError('Redirect URIs must use HTTPS');
        }
        if (client.client_name?.length > 100) throw new InvalidClientMetadataError('Client name is too long');
        if (client.scope && client.scope !== 'mcp') throw new InvalidClientMetadataError('Only the mcp scope is supported');
        const info = { ...client, client_id: client.client_id || nonce(), client_id_issued_at: now() };
        clients.set(info.client_id, { client: info, expiresAt: now() + 86400 });
        return info;
      }
    },
    async authorize(client, params, res) {
      clean(); checkResource(params.resource);
      if (params.scopes?.some(scope => scope !== 'mcp')) throw new InvalidScopeError('Only the mcp scope is supported');
      if (!/^[A-Za-z0-9_-]{43}$/.test(params.codeChallenge)) throw new InvalidGrantError('Invalid S256 challenge');
      if (pending.size >= 30) throw new TooManyRequestsError('Too many pending requests');
      const id = nonce(), browserTicket = nonce(), context = getContext();
      pending.set(id, { id, browserTicket, clientId: client.client_id, clientName: client.client_name || 'MCP client', params, workspace: context.workspace, allowWrites: context.allowWrites, status: 'pending', expiresAt: now() + 300 });
      // Browser ticket is deliberately absent from local status responses.
      res.redirect(302, `${publicOrigin}/connect/${id}/${browserTicket}`);
      log(`${providerName}:authorization-request`, true);
    },
    async challengeForAuthorizationCode(client, code) {
      clean(); const entry = codes.get(digest(code));
      if (!entry || entry.clientId !== client.client_id) throw new InvalidGrantError('Invalid authorization code');
      currentGrant(entry.grantId);
      return entry.challenge;
    },
    async exchangeAuthorizationCode(client, code, verifier, redirectUri, resource) {
      clean(); checkResource(resource);
      const entry = codes.get(digest(code));
      if (!entry || entry.clientId !== client.client_id || redirectUri !== entry.redirectUri) throw new InvalidGrantError('Invalid code or redirect URI');
      const grant = currentGrant(entry.grantId);
      codes.delete(digest(code));
      return tokenPair(grant);
    },
    async exchangeRefreshToken(client, token, scopes, resource) {
      clean(); checkResource(resource);
      if (scopes?.some(s => s !== 'mcp')) throw new InvalidScopeError('Invalid scope');
      const key = digest(token), entry = refreshTokens.get(key);
      if (!entry || entry.clientId !== client.client_id) throw new InvalidGrantError('Invalid refresh token');
      const grant = currentGrant(entry.grantId);
      refreshTokens.delete(key);
      return tokenPair(grant);
    },
    async verifyAccessToken(token) {
      clean(); const entry = tokens.get(digest(token));
      if (!entry || !enabled) throw new InvalidTokenError('Invalid or expired access token');
      let grant;
      try { grant = currentGrant(entry.grantId); } catch { throw new InvalidTokenError('Grant expired or workspace changed'); }
      return { token, clientId: entry.clientId, scopes: ['mcp'], expiresAt: entry.expiresAt, resource: endpoint(), extra: { workspace: grant.workspace, allowWrites: grant.allowWrites, grantId: grant.id } };
    },
    async revokeToken(client, request) {
      const key = digest(request.token), entry = tokens.get(key) || refreshTokens.get(key);
      if (entry?.clientId === client.client_id) {
        grants.delete(entry.grantId);
        for (const map of [tokens, refreshTokens]) for (const [id, record] of map) if (record.grantId === entry.grantId) map.delete(id);
      }
    }
  };
  function status() {
    clean();
    const connections = [...grants.values()].filter(g => g.authorizedAt && g.workspace === getContext().workspace).map(g => ({ id: g.id, provider: providerName, label: g.label, clientName: g.clientName, state: 'authorized', workspace: g.workspace, allowWrites: g.allowWrites && getContext().allowWrites, startedAt: g.authorizedAt, lastCallAt: g.lastCallAt || null, expiresAt: g.expiresAt }));
    return { enabled, publicOrigin, endpoint: publicOrigin ? endpoint() : '', localTarget: `http://127.0.0.1:${port}`, lastCallAt, grantedCount: connections.length, connections,
      pending: [...pending.values()].filter(p => p.status === 'pending').map(p => ({ id: p.id, clientName: p.clientName, redirectUri: p.params.redirectUri, workspace: p.workspace, allowWrites: p.allowWrites, expiresAt: p.expiresAt })) };
  }
  function approve(id, label) {
    clean(); const entry = pending.get(id), context = getContext();
    if (!entry || entry.status !== 'pending' || entry.workspace !== context.workspace) throw new Error('Yêu cầu hết hạn hoặc workspace đã đổi.');
    if (grants.size >= 30) throw new Error('Đã đạt giới hạn kết nối. Hãy thu hồi các kết nối cũ.');
    entry.allowWrites = entry.allowWrites && context.allowWrites;
    entry.label = label === undefined || label === '' ? entry.clientName : checkedLabel(label);
    entry.status = 'approved';
    log(`${providerName}:approve`, true);
  }
  function deny(id) { const entry = pending.get(id); if (entry) entry.status = 'denied'; }
  function checkedLabel(label) { if (typeof label !== 'string' || !label.trim() || label.trim().length > 80) throw new Error('Tên kết nối cần từ 1 đến 80 ký tự.'); return label.trim(); }
  function rename(id, label) { currentGrant(id).label = checkedLabel(label); }
  function revoke(id) {
    grants.delete(id);
    for (const map of [tokens, refreshTokens, codes]) for (const [key, entry] of map) if (entry.grantId === id) map.delete(key);
    log(`${providerName}:revoke-one`, true);
  }
  async function disable() {
    enabled = false; revokeAll(); clients.clear();
    const server = listener; listener = undefined;
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    publicOrigin = '';
  }
  async function enable(value) {
    const checked = validatePublicOrigin(value);
    if (enabled && checked === publicOrigin) return status();
    await disable(); publicOrigin = checked;
    const app = express(); app.disable('x-powered-by');
    app.use((req, res, next) => {
      // Reverse proxies may preserve the public host or rewrite it to loopback.
      const allowedHosts = [new URL(publicOrigin).host, `127.0.0.1:${port}`, `localhost:${port}`];
      if (!allowedHosts.includes(req.headers.host)) return res.sendStatus(403);
      res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY' });
      next();
    });
    app.use((req, res, next) => {
      // Log only fixed OAuth route names and status codes. Never log query strings,
      // credentials, authorization codes or browser tickets.
      const route = req.path;
      if (['/mcp', '/register', '/authorize', '/token', '/.well-known/oauth-authorization-server', '/.well-known/oauth-protected-resource/mcp'].includes(route)) {
        res.once('finish', () => log(`${providerName}:oauth-http`, res.statusCode < 400 || (route === '/mcp' && res.statusCode === 401), `${req.method} ${route} ${res.statusCode}`));
      }
      next();
    });
    app.use(express.json({ limit: '1mb' }));
    app.use(express.urlencoded({ extended: false, limit: '16kb' }));
    // The SDK's registration rate limiter rejects Cloudflare's X-Forwarded-For
    // unless Express trusts the proxy. Registration is already bounded by the
    // short-lived client store above, and this listener only accepts loopback.
    app.use(mcpAuthRouter({ provider, issuerUrl: new URL(publicOrigin), resourceServerUrl: new URL(endpoint()), scopesSupported: ['mcp'], resourceName: 'Code Bridge Workspace', clientRegistrationOptions: { rateLimit: false } }));
    app.get('/connect/:id/:ticket', (req, res) => {
      clean(); const entry = pending.get(req.params.id);
      if (!entry || entry.browserTicket !== req.params.ticket) return res.status(410).send(`Yêu cầu không tồn tại hoặc đã hết hạn. Kết nối lại từ ${displayName}.`);
      if (entry.workspace !== getContext().workspace) { pending.delete(entry.id); return res.status(410).send('Workspace đã thay đổi. Kết nối lại.'); }
      if (entry.status === 'approved' || entry.status === 'denied') {
        const redirect = new URL(entry.params.redirectUri);
        if (entry.params.state !== undefined) redirect.searchParams.set('state', entry.params.state);
        if (entry.status === 'denied') redirect.searchParams.set('error', 'access_denied');
        else {
          if (grants.size >= 30) { pending.delete(entry.id); return res.status(429).send('Đã đạt giới hạn kết nối. Thu hồi kết nối cũ rồi thử lại.'); }
          const grant = { id: nonce(), clientId: entry.clientId, clientName: entry.clientName, label: entry.label, workspace: entry.workspace, allowWrites: entry.allowWrites, expiresAt: now() + 8 * 3600 };
          grants.set(grant.id, grant);
          const code = nonce();
          codes.set(digest(code), { clientId: entry.clientId, grantId: grant.id, challenge: entry.params.codeChallenge, redirectUri: entry.params.redirectUri, expiresAt: now() + 60 });
          redirect.searchParams.set('code', code);
        }
        pending.delete(entry.id);
        return res.redirect(302, redirect.href);
      }
      res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; form-action 'none'");
      res.type('html').send(`<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="3"><title>Duyệt kết nối Code Bridge</title><style>body{font:16px/1.8 system-ui;max-width:640px;margin:12vh auto;padding:24px;background:#f4f6f2;color:#173d30}code{overflow-wrap:anywhere}article{padding:28px;background:white;border-radius:18px}</style><article><h1>Duyệt kết nối trên máy của bạn</h1><p>Mở Code Bridge local → ${displayName} Web → Yêu cầu kết nối. Đối chiếu mã và địa chỉ trả về, rồi bấm Cho phép.</p><p>Mã yêu cầu: <code>${escapeHtml(entry.id.slice(0, 10))}</code></p><p>Ứng dụng tự khai báo: ${escapeHtml(entry.clientName)}</p><p>Địa chỉ trả về: <code>${escapeHtml(entry.params.redirectUri)}</code></p><p>Giữ trang này mở. Trang sẽ tự quay lại sau khi bạn duyệt.</p></article></html>`);
    });
    const auth = requireBearerAuth({ verifier: provider, requiredScopes: ['mcp'], expectedResource: endpoint(), resourceMetadataUrl: publicOrigin + '/.well-known/oauth-protected-resource/mcp' });
    app.post('/mcp', auth, async (req, res) => { lastCallAt = new Date().toISOString(); currentGrant(req.auth.extra.grantId).lastCallAt = lastCallAt; req.bridgeSource = providerName; await handleMcp(req, res); });
    app.all('/mcp', auth, (req, res) => res.status(405).set('Allow', 'POST').end());
    app.use((req, res) => res.sendStatus(404));
    app.use((err, req, res, next) => { if (res.headersSent) return next(err); res.status(400).json({ error: 'invalid_request' }); });
    try {
      listener = await new Promise((resolve, reject) => { const server = app.listen(port, '127.0.0.1', () => resolve(server)); server.on('error', reject); });
      enabled = true;
      log(`${providerName}:gateway-enabled`, true, publicOrigin);
    } catch (e) { publicOrigin = ''; throw e; }
    return status();
  }
  return { enable, disable, status, approve, deny, revokeAll, revoke, rename, validateGrant: currentGrant, close: disable };
}
