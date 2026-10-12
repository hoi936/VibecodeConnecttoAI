import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { createRemoteAccess, validatePublicOrigin } from '../src/remote-access.mjs';

const issuer = 'https://bridge.example.com', port = 3240;
function http(url, body, headers = {}, method) {
  const target = new URL(url, issuer);
  const payload = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path: target.pathname + target.search, method: method || (body === undefined ? 'GET' : 'POST'), headers: { Host: 'bridge.example.com', ...(body === undefined ? {} : { 'Content-Type': typeof body === 'string' ? 'application/x-www-form-urlencoded' : 'application/json' }), ...headers } }, res => {
      let text = ''; res.setEncoding('utf8'); res.on('data', c => text += c); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text, json() { return JSON.parse(text); } }));
    }); req.on('error', reject); req.end(payload);
  });
}
test('public URL validation', () => {
  for (const invalid of ['http://bridge.example.com', 'https://localhost', 'https://127.0.0.1', 'https://user:pw@bridge.example.com', 'https://bridge.example.com/mcp', 'https://bridge.example.com/?token=x', 'https://bridge.local']) assert.throws(() => validatePublicOrigin(invalid));
  assert.equal(validatePublicOrigin(issuer + '/'), issuer);
});
test('remote OAuth requires local consent and enforces grant boundaries', async t => {
  let context = { workspace: '/workspace/one', allowWrites: true, allowTerminal: false };
  const gateway = createRemoteAccess({ port, getContext: () => context, handleMcp: (req, res) => res.json({ ok: true, workspace: req.auth.extra.workspace, allowWrites: req.auth.extra.allowWrites, allowTerminal: req.auth.extra.allowTerminal }) });
  t.after(() => gateway.close());
  await gateway.enable(issuer);
  let registration;
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const redirectUri = 'https://gemini.google.com/example-callback'; // Test URI, not a claimed Google callback.
  async function begin({ client = registration, redirect = redirectUri, resource = issuer + '/mcp' } = {}) {
    return http('/authorize?' + new URLSearchParams({ client_id: client.client_id, redirect_uri: redirect, response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256', state: 'test-state', scope: 'mcp', resource }));
  }
  async function authorize(allowTerminal = false) {
    const initial = await begin(); assert.equal(initial.status, 302);
    const pending = gateway.status().pending.at(-1);
    gateway.approve(pending.id, undefined, allowTerminal);
    const redirect = await http(initial.headers.location);
    assert.equal(redirect.status, 302);
    const location = new URL(redirect.headers.location);
    assert.equal(location.searchParams.get('state'), 'test-state');
    return location.searchParams.get('code');
  }
  async function exchange(code, overrides = {}) {
    return http('/token', new URLSearchParams({ grant_type: 'authorization_code', client_id: registration.client_id, code, code_verifier: verifier, redirect_uri: redirectUri, resource: issuer + '/mcp', ...overrides }).toString());
  }
  await t.test('metadata and unauthenticated isolation', async () => {
    const metadata = (await http('/.well-known/oauth-authorization-server')).json();
    assert.equal(metadata.issuer, issuer + '/');
    assert.deepEqual(metadata.code_challenge_methods_supported, ['S256']);
    const resource = (await http('/.well-known/oauth-protected-resource/mcp')).json(); assert.equal(resource.resource, issuer + '/mcp');
    const denied = await http('/mcp', {}); assert.equal(denied.status, 401); assert.match(denied.headers['www-authenticate'], /resource_metadata=/);
    for (const url of ['/api/status', '/api/gemini/approve', '/preview/index.html', '/', '/style.css']) assert.equal((await http(url)).status, 404);
    assert.equal((await http('/mcp', {}, { Host: 'evil.example.com' })).status, 403);
  });
  await t.test('DCR and pending authorization reveal no credentials', async () => {
    assert.equal((await http('/register', { redirect_uris: ['http://evil.example/cb'] })).status, 400);
    // Gemini Spark currently registers several Google relay callbacks at once.
    const relayUris = Array.from({ length: 6 }, (_, index) => `https://oauth-redirect${index || ''}.googleusercontent.com/r/code-bridge`);
    assert.equal((await http('/register', { redirect_uris: relayUris, token_endpoint_auth_method: 'none' })).status, 201);
    const response = await http('/register', { redirect_uris: [redirectUri], client_name: '<script>example</script>', token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], scope: 'mcp' });
    assert.equal(response.status, 201); registration = response.json();
    const initial = await begin(); assert.equal(initial.status, 302);
    const waiting = await http(initial.headers.location); assert.equal(waiting.status, 200); assert.ok(!waiting.text.includes('<script>example</script>'));
    assert.match(waiting.text, /&lt;script&gt;example/);
    const view = gateway.status().pending[0];
    assert.ok(!('params' in view)); assert.ok(!('browserTicket' in view)); assert.ok(!JSON.stringify(gateway.status()).includes(challenge));
    assert.equal((await http(initial.headers.location.replace(/[^/]+$/, 'wrong-ticket'))).status, 410);
    gateway.deny(view.id);
    const denied = await http(initial.headers.location); assert.equal(new URL(denied.headers.location).searchParams.get('error'), 'access_denied');
  });
  let token;
  await t.test('client, redirect, resource and PKCE binding with one-time code', async () => {
    const badRedirect = await begin({ redirect: 'https://attacker.example/callback' }); assert.equal(badRedirect.status, 400);
    const badResource = await begin({ resource: 'https://attacker.example/mcp' }); assert.equal(new URL(badResource.headers.location).searchParams.get('error'), 'invalid_target');
    const code = await authorize();
    const otherClient = (await http('/register', { redirect_uris: [redirectUri], token_endpoint_auth_method: 'none' })).json();
    assert.equal((await exchange(code, { client_id: otherClient.client_id })).status, 400);
    assert.equal((await exchange(code, { code_verifier: 'wrong' })).status, 400);
    assert.equal((await exchange(code, { redirect_uri: 'https://attacker.example/callback' })).status, 400);
    assert.equal((await exchange(code, { resource: 'https://attacker.example/mcp' })).status, 400);
    const valid = await exchange(code); assert.equal(valid.status, 200); token = valid.json();
    assert.equal((await exchange(code)).status, 400);
    const result = await http('/mcp', {}, { Authorization: 'Bearer ' + token.access_token }); assert.equal(result.status, 200); assert.equal(result.json().workspace, context.workspace);
    assert.equal((await gateway.enable(issuer)).grantedCount, 1);
    assert.equal((await http('/mcp', {}, { Authorization: 'Bearer ' + token.access_token })).status, 200);
    assert.ok(gateway.status().lastCallAt);
    assert.ok(!JSON.stringify(gateway.status()).includes(token.access_token));
  });
  await t.test('refresh rotation, scope checks and revocation', async () => {
    async function refresh(extra = {}) { return http('/token', new URLSearchParams({ grant_type: 'refresh_token', client_id: registration.client_id, refresh_token: token.refresh_token, ...extra }).toString()); }
    assert.equal((await refresh({ scope: 'admin' })).status, 400);
    const rotated = await refresh(); assert.equal(rotated.status, 200);
    assert.equal((await refresh()).status, 400);
    const next = rotated.json();
    assert.equal((await http('/revoke', new URLSearchParams({ client_id: registration.client_id, token: next.refresh_token }).toString())).status, 200);
    for (const value of [token.access_token, next.access_token]) assert.equal((await http('/mcp', {}, { Authorization: 'Bearer ' + value })).status, 401);
  });
  await t.test('terminal requires explicit approval while enabled', async () => {
    const pendingResponse = await begin();
    const pending = gateway.status().pending.at(-1);
    assert.throws(() => gateway.approve(pending.id, undefined, true), /bật quyền terminal/);
    gateway.deny(pending.id);
    await http(pendingResponse.headers.location);
    context.allowTerminal = true;
    const without = (await exchange(await authorize())).json();
    assert.equal((await http('/mcp', {}, { Authorization: 'Bearer ' + without.access_token })).json().allowTerminal, false);
    const withTerminal = (await exchange(await authorize(true))).json();
    const auth = { Authorization: 'Bearer ' + withTerminal.access_token };
    assert.equal((await http('/mcp', {}, auth)).json().allowTerminal, true);
    context.allowTerminal = false;
    assert.equal(gateway.status().connections.find(c => c.allowTerminal), undefined);
    context.allowTerminal = true;
    gateway.revokeAll();
  });
  await t.test('read-only grants do not gain writes and workspace changes invalidate', async () => {
    context.allowWrites = false;
    const issued = (await exchange(await authorize())).json();
    context.allowWrites = true;
    const auth = { Authorization: 'Bearer ' + issued.access_token };
    assert.equal((await http('/mcp', {}, auth)).json().allowWrites, false);
    context = { workspace: '/workspace/two', allowWrites: true };
    assert.equal((await http('/mcp', {}, auth)).status, 401);
    gateway.revokeAll(); assert.equal(gateway.status().grantedCount, 0);
    assert.equal(gateway.status().pending.length, 0);
  });
  await t.test('separate grants can be listed, named and individually revoked', async () => {
    const a = (await exchange(await authorize())).json();
    const b = (await exchange(await authorize())).json();
    assert.equal(gateway.status().connections.length, 2);
    const [first, second] = gateway.status().connections;
    gateway.rename(first.id, 'Gemini cá nhân');
    assert.equal(gateway.status().connections[0].label, 'Gemini cá nhân');
    assert.throws(() => gateway.rename(first.id, ''));
    const [one, two] = await Promise.all([a, b].map(token => http('/mcp', {}, { Authorization: 'Bearer ' + token.access_token })));
    assert.equal(one.status, 200); assert.equal(two.status, 200);
    assert.ok(gateway.status().connections.every(c => c.lastCallAt));
    gateway.revoke(first.id);
    assert.equal((await http('/mcp', {}, { Authorization: 'Bearer ' + a.access_token })).status, 401);
    assert.equal((await http('/mcp', {}, { Authorization: 'Bearer ' + b.access_token })).status, 200);
    assert.equal(gateway.status().connections[0].id, second.id);
    assert.equal(gateway.status().grantedCount, 1);
    gateway.revokeAll();
  });
  await t.test('explicit disable clears authorization', async () => { await gateway.disable(); assert.equal(gateway.status().enabled, false); assert.equal(gateway.status().endpoint, ''); });
});
