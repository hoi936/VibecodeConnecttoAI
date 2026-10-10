const $ = id => document.getElementById(id);
let state, selectedFile = '', noticeTimer;
function notify(message, error = false) { $('notice').hidden = false; $('notice').textContent = message; $('notice').className = error ? 'error' : ''; clearTimeout(noticeTimer); noticeTimer = setTimeout(() => $('notice').hidden = true, 6000); }
async function api(url, body) {
  const response = await fetch(url, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Bridge-CSRF': state.csrf }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Yêu cầu không thành công.');
  return result;
}
function resultText(result) { if (result.isError) throw new Error(result.content?.map(c => c.text || '').join('\n')); return result.content?.map(c => c.text || '').join('\n') || JSON.stringify(result, null, 2); }
async function tool(name, args) { return api('/api/tool', { name, arguments: args }); }
function protect(fn) { return async event => { event?.preventDefault(); const button = event?.submitter || (event?.currentTarget?.tagName === 'BUTTON' ? event.currentTarget : null); if (button?.disabled) return; if (button) button.disabled = true; try { await fn(event); } catch (e) { notify(e.message, true); } finally { if (button) button.disabled = false; } }; }
async function refresh() {
  const previousTool = $('tool-name').value;
  state = await api('/api/status');
  $('status').textContent = '● MCP local đang chạy';
  if (document.activeElement !== $('workspace-path')) $('workspace-path').value = state.workspace;
  renderHub();
  $('allow-writes').checked = state.allowWrites;
  $('save-file').disabled = !selectedFile || !state.allowWrites;
  $('endpoint').textContent = state.endpoint;
  renderGemini();
  const statuses = { stopped: 'Chưa kết nối', starting: 'Đang khởi động', connecting: 'Đang kết nối', ready: '● Sẵn sàng', stopping: 'Đang dừng', error: 'Lỗi kết nối' };
  const readyTunnels = (state.connections || []).filter(c => c.provider === 'chatgpt' && c.state === 'ready').length;
  $('tunnel-status').textContent = readyTunnels ? `${readyTunnels} tunnel sẵn sàng` : statuses[state.tunnel.state] || state.tunnel.state;
  $('tunnel-error').hidden = !state.tunnel.error;
  $('tunnel-error').textContent = state.tunnel.error;
  $('tool-count').textContent = `${state.tools.length} công cụ`;
  $('tool-name').replaceChildren(...state.tools.map(t => new Option(t.name, t.name)));
  if (state.tools.some(t => t.name === previousTool)) $('tool-name').value = previousTool;
  else { $('tool-name').value = 'list_directory'; if (previousTool) $('tool-name').dispatchEvent(new Event('change')); }
  $('events').replaceChildren(...state.events.map(e => {
    const row = document.createElement('div'); row.className = 'event';
    const time = document.createElement('time'); time.textContent = new Date(e.time).toLocaleTimeString('vi-VN');
    const action = document.createElement('span'); action.textContent = e.action + (e.detail ? ` · ${e.detail}` : '');
    const status = document.createElement('b'); status.textContent = e.ok ? 'OK' : 'Lỗi';
    row.append(time, action, status); return row;
  }));
}
function renderGemini() {
  const gemini = state.gemini;
  if (!gemini) { $('gemini-status').textContent = 'Cần khởi động lại Code Bridge'; for (const button of $('gemini-setup').querySelectorAll('form button')) button.disabled = true; return; }
  $('gemini-status').textContent = gemini.enabled ? 'Cổng MCP sẵn sàng' : 'Chưa bật';
  if (document.activeElement !== $('gemini-origin') && !$('gemini-origin').value) $('gemini-origin').value = state.geminiOrigin || gemini.publicOrigin || '';
  $('gemini-local-target').textContent = gemini.localTarget;
  $('gemini-endpoint').textContent = gemini.endpoint || 'Bật cổng Gemini để nhận URL MCP.';
  $('copy-gemini-endpoint').disabled = !gemini.enabled;
  $('gemini-activity').textContent = gemini.lastCallAt ? `Lệnh MCP gần nhất: ${new Date(gemini.lastCallAt).toLocaleString('vi-VN')} · ${gemini.grantedCount} quyền kết nối` : `${gemini.grantedCount} quyền kết nối · Chưa nhận lệnh MCP qua cổng Gemini.`;
  const container = $('gemini-pending');
  const pendingKey = JSON.stringify({ pending: gemini.pending, allowWrites: state.allowWrites });
  if (container.dataset.requests === pendingKey) return;
  container.dataset.requests = pendingKey;
  container.replaceChildren();
  if (!gemini.pending.length) { const p = document.createElement('p'); p.className = 'muted'; p.textContent = 'Chưa có yêu cầu. Yêu cầu sẽ xuất hiện khi Gemini bắt đầu xác thực.'; container.append(p); }
  for (const request of gemini.pending) {
    const card = document.createElement('article'); card.className = 'approval-card';
    const title = document.createElement('h3'); title.textContent = `Mã yêu cầu: ${request.id.slice(0, 10)}`;
    const description = document.createElement('p'); description.textContent = `Tên tự khai báo: ${request.clientName}. Đối chiếu địa chỉ trả về với trang bạn vừa mở trước khi duyệt.`;
    const redirect = document.createElement('code'); redirect.textContent = request.redirectUri;
    const context = document.createElement('p'); context.textContent = `${request.allowWrites && state.allowWrites ? 'Đọc và sửa file' : 'Chỉ đọc file'} trong ${request.workspace}. Hết hạn lúc ${new Date(request.expiresAt * 1000).toLocaleTimeString('vi-VN')}.`;
    const nameLabel = document.createElement('label'); nameLabel.textContent = 'Tên để nhận biết kết nối';
    const nameInput = document.createElement('input'); nameInput.maxLength = 80; nameInput.placeholder = 'Ví dụ: Gemini cá nhân'; nameLabel.append(nameInput);
    const buttons = document.createElement('div'); buttons.className = 'row';
    for (const [action, label] of [['approve', 'Cho phép'], ['deny', 'Từ chối']]) {
      const button = document.createElement('button'); button.textContent = label; button.className = action === 'deny' ? 'secondary small' : 'small';
      button.onclick = protect(async () => { await api(`/api/gemini/${action}`, { id: request.id, label: nameInput.value.trim() }); await refresh(); notify(action === 'approve' ? 'Đã duyệt. Trở lại trang xác thực của Gemini.' : 'Đã từ chối kết nối.'); });
      buttons.append(button);
    }
    card.append(title, description, redirect, context, nameLabel, buttons); container.append(card);
  }
}
async function files(directory = '.') {
  const text = resultText(await tool('list_directory', { path: directory }));
  const list = document.createDocumentFragment();
  if (directory !== '.') { const back = document.createElement('button'); back.textContent = '← Thư mục gốc'; back.onclick = protect(() => files('.')); list.append(back); }
  for (const line of text.split('\n')) {
    const match = line.match(/^\[(FILE|DIR)\]\s+(.+)$/); if (!match) continue;
    const [, kind, name] = match;
    const relative = directory === '.' ? name : `${directory}/${name}`;
    const button = document.createElement('button'); button.textContent = `${kind === 'DIR' ? '▸' : '·'} ${name}`;
    button.onclick = protect(async () => {
      if (kind === 'DIR') return files(relative);
      const content = resultText(await tool('read_text_file', { path: relative }));
      selectedFile = relative; $('current-file').textContent = relative; $('file-content').value = content; $('save-file').disabled = !state.allowWrites;
    });
    list.append(button);
  }
  $('files').replaceChildren(list);
}
$('workspace-form').onsubmit = protect(async () => { await api('/api/workspace', { path: $('workspace-path').value }); selectedFile = ''; $('file-content').value = ''; $('current-file').textContent = 'Chọn một file'; await refresh(); await files(); $('preview').removeAttribute('src'); notify('Đã chuyển workspace.'); });
$('allow-writes').onchange = protect(async () => { await api('/api/permissions', { allowWrites: $('allow-writes').checked }); await refresh(); });
$('reload-files').onclick = protect(() => files());
$('save-file').onclick = protect(async () => { resultText(await tool('write_file', { path: selectedFile, content: $('file-content').value })); notify('Đã lưu file.'); await refresh(); });
$('reload-preview').onclick = () => { $('preview').src = '/preview/index.html?reload=' + Date.now(); };
$('tunnel-form').onsubmit = protect(async () => { await api('/api/tunnel/start', { id: $('connection-id').value || undefined, label: $('connection-label').value.trim(), tunnelId: $('tunnel-id').value.trim(), apiKey: $('api-key').value.trim() }); resetTunnelForm(); await refresh(); notify('Đã khởi động kết nối. Đang chờ OpenAI.'); });
$('cancel-reconnect').onclick = resetTunnelForm;
$('gemini-form').onsubmit = protect(async () => { await api('/api/gemini/enable', { publicOrigin: $('gemini-origin').value.trim() }); await refresh(); notify('Cổng MCP đã bật. Thêm URL MCP vào Gemini để bắt đầu xác thực.'); });
$('disable-gemini').onclick = protect(async () => { await api('/api/gemini/disable', {}); await refresh(); notify('Đã tắt cổng Gemini và thu hồi quyền truy cập.'); });
$('revoke-gemini').onclick = protect(async () => { await api('/api/gemini/revoke', {}); await refresh(); notify('Đã thu hồi toàn bộ quyền Gemini.'); });
$('copy-gemini-command').onclick = protect(async () => { await navigator.clipboard.writeText('npm run gemini:tunnel'); notify('Đã copy lệnh tạo URL.'); });
$('copy-gemini-endpoint').onclick = protect(async () => { await navigator.clipboard.writeText(state.gemini.endpoint); notify('Đã copy URL MCP cho Gemini.'); });
$('copy-gemini-prompt').onclick = protect(async () => { await navigator.clipboard.writeText('Use the Code Bridge connected app to list the allowed directories and read index.html in the selected workspace. Suggest a small edit, then use edit_file with dryRun=true to show the diff before applying it.'); notify('Đã copy yêu cầu thử cho Gemini.'); });
$('copy-prompt').onclick = protect(async () => { await navigator.clipboard.writeText('Hãy dùng Code Bridge để liệt kê thư mục được phép, đọc index.html trong workspace, rồi đề xuất một thay đổi nhỏ. Dùng edit_file với dryRun=true để xem diff trước khi áp dụng.'); notify('Đã copy yêu cầu thử.'); });
$('tool-name').onchange = () => {
  const name = $('tool-name').value;
  const examples = { list_allowed_directories: {}, list_directory: { path: '.' }, read_text_file: { path: 'index.html' }, edit_file: { path: 'index.html', edits: [{ oldText: 'Chào mừng đến Code Bridge', newText: 'Xin chào từ ChatGPT' }], dryRun: true }, write_file: { path: 'hello.txt', content: 'Xin chào!' }, search_files: { path: '.', pattern: '**/*.html' } };
  $('tool-args').value = JSON.stringify(examples[name] || { path: '.' }, null, 2);
};
$('tool-form').onsubmit = protect(async () => { const result = await tool($('tool-name').value, JSON.parse($('tool-args').value)); $('tool-result').textContent = resultText(result); await refresh(); });
let hubBusy = false, connectionKey = '', selectedProvider = 'chatgpt', selectedTab = 'connect';
const providerTabs = { chatgpt: 'connect', gemini: 'connect' };
const providerQueries = { chatgpt: '', gemini: '' };
const providerName = mode => mode === 'gemini' ? 'Gemini' : 'ChatGPT';
const stateName = value => ({ ready: 'Tunnel sẵn sàng', authorized: 'Đã cấp quyền', stopped: 'Đã dừng', starting: 'Đang khởi động', connecting: 'Đang kết nối', stopping: 'Đang dừng', error: 'Lỗi kết nối', unknown: 'Chưa xác định' }[value] || value);
function node(tag, text, className) { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (className) el.className = className; return el; }
function route() {
  const requested = location.hash.slice(1);
  const provider = ['chatgpt', 'gemini'].includes(requested) ? requested : requested === 'connection' ? 'chatgpt' : null;
  const view = provider ? 'provider' : ['workspace', 'tools', 'activity'].includes(requested) ? requested : 'overview';
  if (provider) {
    if (selectedProvider !== provider) {
      providerQueries[selectedProvider] = $('connection-search').value;
      $('connection-search').value = providerQueries[provider];
    }
    selectedProvider = provider; selectedTab = providerTabs[provider];
  }
  for (const el of document.querySelectorAll('.view')) el.hidden = el.id !== view;
  for (const link of document.querySelectorAll('nav [data-view]')) { if (link.dataset.view === (provider || view)) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); }
  $('view-name').textContent = provider ? providerName(provider) : { overview: 'Trang chủ', workspace: 'Dự án & file', tools: 'Công cụ MCP', activity: 'Nhật ký' }[view];
  document.title = `Code Bridge · ${$('view-name').textContent}`;
  document.body.dataset.provider = provider || 'home';
  if (state) renderHub();
  renderTab();
}
window.addEventListener('hashchange', () => { route(); window.scrollTo(0, 0); });
function renderTab() {
  for (const el of document.querySelectorAll('.provider-tabpanel')) el.hidden = el.id !== selectedTab + '-panel';
  for (const button of document.querySelectorAll('[data-tab]')) { const active = button.dataset.tab === selectedTab; button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1; }
  $('approval-panel').hidden = selectedProvider !== 'gemini' || selectedTab === 'use';
}
function openTab(tab) { selectedTab = tab; providerTabs[selectedProvider] = tab; renderTab(); }
function resetTunnelForm() { $('tunnel-form').reset(); $('connection-id').value = ''; $('cancel-reconnect').hidden = true; }
function showSetup() { location.hash = selectedProvider; route(); openTab('connect'); const el = $(selectedProvider === 'gemini' ? 'gemini-setup' : 'chatgpt-setup'); el.scrollIntoView({ block: 'start' }); (selectedProvider === 'gemini' ? $('gemini-origin') : $('connection-label')).focus({ preventScroll: true }); }
function renderHub() {
  const supported = Array.isArray(state.connections), activeMode = state.connectionMode || 'chatgpt', name = providerName(selectedProvider), active = activeMode === selectedProvider;
  const connections = state.connections || [];
  $('upgrade-notice').hidden = supported;
  for (const provider of ['chatgpt', 'gemini']) {
    const ready = connections.filter(c => c.provider === provider && ['ready', 'authorized'].includes(c.state)).length;
    $(provider + '-home-count').textContent = ready;
    $(provider + '-nav-count').textContent = ready;
    $(provider + '-home-status').textContent = activeMode === provider ? 'Chế độ đang chọn' : 'Sẵn sàng thiết lập';
    $(provider + '-home-status').classList.toggle('is-active', activeMode === provider);
  }
  $('home-active-mode').textContent = providerName(activeMode);
  $('chatgpt-setup').hidden = selectedProvider !== 'chatgpt'; $('gemini-setup').hidden = selectedProvider !== 'gemini';
  $('provider-title').textContent = name;
  $('provider-icon').textContent = selectedProvider === 'gemini' ? '✦' : 'C';
  $('provider-description').textContent = selectedProvider === 'gemini' ? 'Thiết lập Custom app, duyệt quyền và quản lý các kết nối Gemini.' : 'Kết nối qua OpenAI Tunnel và quản lý các kết nối ChatGPT của bạn.';
  $('activation-title').textContent = active ? `${name} là chế độ đang chọn` : `Bật chế độ ${name} để bắt đầu kết nối`;
  $('activation-description').textContent = active ? 'Bạn có thể thêm và quản lý nhiều kết nối trong không gian này.' : `Hiện đang dùng ${providerName(activeMode)}. Bật ${name} sẽ dừng các kết nối ${providerName(activeMode)} đang được quản lý.`;
  $('activate-provider').hidden = active;
  $('activate-provider').disabled = !supported || hubBusy;
  $('activate-provider').textContent = `Bật chế độ ${name}`;
  $('activation-panel').classList.toggle('is-active', active);
  $('add-connection').disabled = !supported;
  for (const form of [$('tunnel-form'), $('gemini-form')]) for (const button of form.querySelectorAll('button')) button.disabled = !supported || !active || hubBusy;
  $('open-provider').textContent = `Mở ${name} ↗`;
  $('open-provider').href = selectedProvider === 'gemini' ? 'https://gemini.google.com' : 'https://chatgpt.com';
  const own = connections.filter(p => p.provider === selectedProvider);
  $('ready-count').textContent = own.filter(p => ['ready', 'authorized'].includes(p.state)).length;
  $('recent-count').textContent = own.filter(p => p.lastCallAt && Date.now() - Date.parse(p.lastCallAt) < 300000 && ['ready', 'authorized'].includes(p.state)).length;
  $('pending-count').textContent = selectedProvider === 'gemini' ? state.gemini?.pending.length || 0 : 0;
  $('sidebar-project').textContent = state.workspace.split(/[\\/]/).filter(Boolean).at(-1);
  $('sidebar-permission').textContent = state.allowWrites ? 'Đọc và sửa file' : 'Chỉ đọc file';
  $('setup-project').textContent = state.workspace;
  $('connections-count').textContent = own.length;
  $('use-intro').textContent = `Sau khi kết nối, bạn ra lệnh trong ${name} và quản lý file tại Code Bridge.`;
  $('use-select').textContent = selectedProvider === 'gemini' ? 'Trong Gemini, nhập @ và chọn custom app Code Bridge bạn đã thêm.' : 'Trong ChatGPT, chọn custom app Code Bridge đã thiết lập bằng Tunnel ID của bạn.';
  $('use-prompt').textContent = selectedProvider === 'gemini' ? 'Use Code Bridge to list the allowed directories and read index.html in the selected workspace. Suggest a small change and show the diff with edit_file dryRun=true before applying it.' : 'Hãy dùng Code Bridge để liệt kê thư mục được phép và đọc index.html trong dự án. Đề xuất một thay đổi nhỏ rồi dùng edit_file với dryRun=true để xem diff trước khi áp dụng.';
  $('provider-troubleshooting').textContent = selectedProvider === 'gemini' ? 'Nếu không có Custom apps, hãy kiểm tra điều kiện tài khoản Google ở phần kết nối. Nếu URL báo 502, giữ terminal tunnel mở và bật cổng Gemini. Nếu trang xác thực chờ, quay về Quản lý kết nối để duyệt yêu cầu cùng mã.' : 'Nếu tunnel chưa sẵn sàng, kiểm tra Tunnel ID, Runtime API Key và thông báo trong Quản lý kết nối. Nếu không thấy tunnel trong ChatGPT, kiểm tra quyền của tài khoản và liên kết với workspace OpenAI.';
  renderConnections();
}
function renderConnections() {
  if (!state) return;
  const filter = selectedProvider, query = $('connection-search').value.trim().toLocaleLowerCase();
  const all = (state.connections || []).filter(p => (filter === 'all' || p.provider === filter) && (p.label + ' ' + (p.tunnelId || '')).toLocaleLowerCase().includes(query));
  const key = JSON.stringify([all, state.connectionMode, filter, query]);
  if (key === connectionKey) return; connectionKey = key;
  const container = $('connection-list'); container.replaceChildren();
  if (!all.length) {
    const empty = node('div', undefined, 'empty-state');
    empty.append(node('span', '⌁'), node('strong', query ? 'Không có kết nối phù hợp' : `Chưa có kết nối ${providerName(selectedProvider)}`), node('p', 'Mở Hướng dẫn kết nối để thiết lập kết nối đầu tiên.'));
    container.append(empty); return;
  }
  for (const item of all) {
    const row = node('article', undefined, 'connection-row'); row.dataset.connectionId = item.id;
    const identity = node('div', undefined, 'connection-identity'), text = node('div');
    text.append(node('strong', item.label), node('small', providerName(item.provider) + (item.legacy ? ' · Phiên trước nâng cấp' : '')));
    const project = node('small', item.workspace); project.title = item.workspace; text.append(project);
    if (item.tunnelId) text.append(node('small', item.tunnelId));
    if (item.provider === 'gemini') text.append(node('small', item.allowWrites ? 'Đọc và sửa file' : 'Chỉ đọc file'));
    identity.append(node('span', item.provider === 'gemini' ? '✦' : 'C', 'provider-logo ' + item.provider), text);
    const status = node('div'); status.append(node('span', stateName(item.state), 'badge ' + item.state));
    if (item.error) status.append(node('p', item.error, 'connection-error'));
    const time = node('div', item.lastCallAt ? new Date(item.lastCallAt).toLocaleString('vi-VN') : item.legacy ? 'Phiên cũ không cung cấp' : 'Chưa nhận yêu cầu MCP', 'connection-time');
    if (item.expiresAt) time.append(node('div', 'Hết hạn ' + new Date(item.expiresAt * 1000).toLocaleTimeString('vi-VN')));
    const actions = node('div', undefined, 'connection-actions');
    function action(label, fn, danger = false) { const b = node('button', label, danger ? 'danger small' : 'secondary small'); b.onclick = protect(async () => { await fn(); await refresh(); }); actions.append(b); }
    if (item.provider === 'gemini') {
      action('Đổi tên', async () => { $('rename-id').value = item.id; $('rename-label').value = item.label; $('rename-dialog').showModal(); });
      action('Thu hồi', () => api('/api/gemini/revoke', { id: item.id }), true);
    } else {
      if (!['stopped', 'error'].includes(item.state)) action('Dừng', () => api('/api/tunnel/stop', { id: item.id }), true);
      else {
        action('Kết nối lại', async () => {
          if (state.connectionMode !== 'chatgpt') { notify('Chuyển sang chế độ ChatGPT trước.'); return; }
          resetTunnelForm(); $('connection-id').value = item.legacy ? '' : item.id; $('connection-label').value = item.label; $('tunnel-id').value = item.tunnelId; $('cancel-reconnect').hidden = false; showSetup(); $('api-key').focus();
        });
        if (!item.legacy) action('Xóa', () => api('/api/tunnel/remove', { id: item.id }));
      }
    }
    row.append(identity, status, time, actions); container.append(row);
  }
}
$('activate-provider').onclick = protect(async () => {
  if (selectedProvider === state.connectionMode || hubBusy) return;
  hubBusy = true;
  try { await api('/api/mode', { mode: selectedProvider }); await refresh(); notify(`Đã bật chế độ ${providerName(state.connectionMode)}. Kết nối của chế độ cũ đã dừng.`); }
  finally { hubBusy = false; renderHub(); }
});
for (const button of document.querySelectorAll('[data-tab]')) {
  button.onclick = () => openTab(button.dataset.tab);
  button.onkeydown = event => {
    const tabs = [...document.querySelectorAll('[data-tab]')], index = tabs.indexOf(button);
    let next;
    if (event.key === 'ArrowRight') next = tabs[(index + 1) % tabs.length];
    if (event.key === 'ArrowLeft') next = tabs[(index + tabs.length - 1) % tabs.length];
    if (event.key === 'Home') next = tabs[0];
    if (event.key === 'End') next = tabs.at(-1);
    if (next) { event.preventDefault(); openTab(next.dataset.tab); next.focus(); }
  };
}
for (const button of document.querySelectorAll('[data-open-tab]')) button.onclick = () => { openTab(button.dataset.openTab); $('tab-' + selectedTab).focus(); };
$('copy-use-prompt').onclick = protect(async () => { await navigator.clipboard.writeText($('use-prompt').textContent); notify('Đã copy yêu cầu thử.'); });
$('add-connection').onclick = () => { resetTunnelForm(); showSetup(); };
$('connection-search').oninput = renderConnections;
$('refresh-status').onclick = protect(refresh);
$('rename-form').onsubmit = protect(async () => { await api('/api/gemini/rename', { id: $('rename-id').value, label: $('rename-label').value }); $('rename-dialog').close(); await refresh(); });
$('cancel-rename').onclick = () => $('rename-dialog').close();
route();
try { await refresh(); await files(); } catch (e) { notify(e.message, true); }
setInterval(() => { if (!document.hidden && !hubBusy) refresh().catch(() => { $('status').textContent = 'Mất kết nối local'; }); }, 5000);
