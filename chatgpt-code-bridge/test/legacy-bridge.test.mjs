import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createLegacyBridge } from '../src/legacy-bridge.mjs';

test('previous bridge can be monitored and explicitly stopped without transferring key', async t => {
  let state = 'ready', stops = 0;
  const server = createServer((req, res) => {
    if (req.url === '/api/status') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ csrf: 'local-csrf', tunnelId: 'tunnel_old', workspace: '/old-project', tunnel: { state, error: '' } })); }
    else if (req.url === '/api/tunnel/stop' && req.headers['x-bridge-csrf'] === 'local-csrf' && req.method === 'POST') { stops++; state = 'stopped'; res.end('{}'); }
    else { res.statusCode = 403; res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const bridge = createLegacyBridge(`http://127.0.0.1:${server.address().port}`, 'http://127.0.0.1:3213');
  await bridge.poll(); assert.equal(stops, 0); assert.equal(bridge.list()[0].state, 'ready');
  assert.equal(bridge.list()[0].workspace, '/old-project');
  assert.ok(!JSON.stringify(bridge.list()).includes('csrf'));
  await bridge.stop(); assert.equal(stops, 1); assert.equal(bridge.list()[0].state, 'stopped');
  for (const url of ['https://example.com', 'http://127.0.0.1:3213', 'http://user:pass@127.0.0.1:3210']) assert.throws(() => createLegacyBridge(url, 'http://127.0.0.1:3213'));
});
