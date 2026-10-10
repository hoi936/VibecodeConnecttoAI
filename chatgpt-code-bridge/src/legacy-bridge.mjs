// Preserve an existing 0.1/0.2 connection during upgrade. Never read or transfer its API key.
export function createLegacyBridge(value, selfOrigin) {
  let url;
  if (value) {
    url = new URL(value);
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.origin === selfOrigin || url.pathname !== '/' || url.username || url.password || url.search || url.hash) throw new Error('BRIDGE_LEGACY_URL phải là địa chỉ loopback của bridge cũ.');
  }
  let entry = null;
  async function read() {
    const response = await fetch(url.origin + '/api/status', { signal: AbortSignal.timeout(2000) });
    if (!response.ok) throw new Error('Không đọc được bridge cũ.');
    const data = await response.json();
    if (!data.tunnel || data.connections) throw new Error('Chỉ liên kết phiên bridge 0.1/0.2.');
    return data;
  }
  async function poll() {
    if (!url) return;
    try {
      const data = await read();
      if (!data.tunnelId) { entry = null; return; }
      entry = { id: 'legacy-chatgpt', provider: 'chatgpt', label: 'ChatGPT đang chạy trước nâng cấp', tunnelId: data.tunnelId, state: data.tunnel.state, error: data.tunnel.error, workspace: data.workspace, legacy: true, lastCallAt: null, url: url.origin };
    } catch { if (entry) entry = { ...entry, state: 'unknown', error: 'Không đọc được trạng thái phiên cũ.' }; }
  }
  async function stop() {
    if (!url || !entry || entry.state === 'stopped') return;
    const data = await read();
    const response = await fetch(url.origin + '/api/tunnel/stop', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Bridge-CSRF': data.csrf }, body: '{}', signal: AbortSignal.timeout(3000) });
    if (!response.ok) throw new Error('Không dừng được kết nối của bridge cũ.');
    for (let i = 0; i < 40; i++) {
      await poll();
      if (entry?.state === 'stopped') return;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error('Phiên cũ chưa dừng. Chưa thể chuyển sang Gemini.');
  }
  return { poll, stop, list: () => entry ? [{ ...entry }] : [] };
}
