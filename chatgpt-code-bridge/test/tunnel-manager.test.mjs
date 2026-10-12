import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createTunnelManager } from '../src/tunnel-manager.mjs';

function setup() {
  const children = [], ports = [];
  let port = 4100;
  const manager = createTunnelManager({ binary: '/fake-runtime', origin: 'http://127.0.0.1:3213', cwd: '/tmp', binaryExists: () => true,
    allocatePort: async () => ++port,
    fetchHealth: async url => { ports.push(new URL(url).port); return { ok: true }; },
    spawnProcess: (binary, args, options) => {
      const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
      child.kill = signal => { queueMicrotask(() => child.emit('exit', signal === 'SIGTERM' ? 0 : 1)); return true; };
      children.push({ child, binary, args, options }); return child;
    }
  });
  return { manager, children, ports };
}
test('independent ChatGPT runtimes, per-connection readiness and stop', async () => {
  const { manager, children, ports } = setup();
  const [a, b] = await Promise.all([
    manager.start({ label: 'Cá nhân', tunnelId: 'tunnel_one', apiKey: 'sk-one' }),
    manager.start({ label: 'Công việc', tunnelId: 'tunnel_two', apiKey: 'sk-two' })
  ]);
  assert.notEqual(a.id, b.id);
  assert.ok(children[0].args.includes('http://127.0.0.1:3213/mcp/tunnels/' + a.id));
  assert.ok(children[1].args.includes('http://127.0.0.1:3213/mcp/tunnels/' + b.id));
  assert.ok(!JSON.stringify(children[0].args).includes('sk-one'));
  assert.equal(children[0].options.env.CONTROL_PLANE_API_KEY, 'sk-one');
  await manager.poll(); assert.deepEqual(ports.sort(), ['4101', '4102']);
  assert.ok(manager.list().every(p => p.state === 'ready'));
  assert.ok(manager.list().every(p => p.lastCheckedAt));
  await assert.rejects(manager.start({ label: 'Trùng', tunnelId: 'tunnel_one', apiKey: 'sk-three' }));
  manager.touch(a.id); assert.ok(manager.list()[0].lastCallAt); assert.equal(manager.list()[1].lastCallAt, null);
  await manager.stop(a.id); assert.equal(manager.list()[0].state, 'stopped'); assert.equal(manager.list()[1].state, 'ready');
  assert.throws(() => manager.touch(a.id));
  await manager.remove(a.id); assert.equal(manager.list().length, 1);
  await manager.stopAll(); assert.ok(manager.list().every(p => p.state === 'stopped'));
  assert.ok(!JSON.stringify(manager.savedProfiles()).includes('sk-'));
  await manager.close();
});
test('failed runtime hides credentials and does not affect another runtime', async () => {
  const { manager, children } = setup();
  await manager.start({ label: 'A', tunnelId: 'tunnel_a', apiKey: 'sk-secret-value' });
  await manager.start({ label: 'B', tunnelId: 'tunnel_b', apiKey: 'sk-b' });
  children[0].child.stderr.emit('data', 'error sk-secret-');
  children[0].child.stderr.emit('data', 'value failed');
  children[0].child.emit('exit', 1);
  assert.equal(manager.list()[0].state, 'error');
  assert.ok(!JSON.stringify(manager.list()).includes('sk-secret-value'));
  await manager.poll(); assert.equal(manager.list()[1].state, 'ready');
  await manager.close();
});
test('twelve independent ChatGPT profiles can run and the thirteenth is rejected', async () => {
  const { manager, children } = setup();
  for (let i = 1; i <= 12; i++) await manager.start({ label: `Tài khoản ${i}`, tunnelId: `tunnel_${i}`, apiKey: `sk-${i}` });
  await manager.poll();
  assert.equal(children.length, 12);
  assert.equal(manager.list().filter(profile => profile.state === 'ready').length, 12);
  await assert.rejects(manager.start({ label: 'Vượt giới hạn', tunnelId: 'tunnel_13', apiKey: 'sk-13' }), /Tối đa 12/);
  await manager.close();
});
