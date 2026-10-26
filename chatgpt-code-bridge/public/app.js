const $ = id => document.getElementById(id);
let state, selectedFile = '', noticeTimer;
const authorizationResume = new Map();
$('workspace').querySelector('.section-heading').insertAdjacentHTML('afterend', '<div class="terminal-permission"><div><strong>Quyền terminal trên máy</strong><p class="muted">Mặc định tắt mỗi khi mở Code Bridge. Khi bật, lệnh chạy với quyền của tài khoản máy tính này và có thể tạo tiến trình nền. Thư mục dự án chỉ là nơi bắt đầu, không giới hạn quyền truy cập. Cấp quyền riêng cho từng kết nối ChatGPT hoặc khi duyệt Gemini/Claude/Grok.</p></div><label class="toggle"><input id="allow-terminal" type="checkbox"> Bật terminal</label></div>');
function notify(message, error = false) { $('notice').hidden = false; $('notice').textContent = message; $('notice').className = error ? 'error' : ''; clearTimeout(noticeTimer); noticeTimer = setTimeout(() => $('notice').hidden = true, 6000); }
async function api(url, body) {
  const response = await fetch(url, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Bridge-CSRF': state.csrf }, body: JSON.stringify(body) });
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('Code Bridge đang chạy phiên cũ hoặc API chưa sẵn sàng. Đóng cửa sổ Code Bridge cũ ở cổng này, mở bản mới rồi tải lại trang.');
  }
  let result;
  try { result = await response.json(); }
  catch { throw new Error('Code Bridge trả dữ liệu không hợp lệ. Hãy khởi động lại ứng dụng rồi tải lại trang.'); }
  if (!response.ok) throw new Error(result.error || 'Yêu cầu không thành công.');
  return result;
}
function resultText(result) { if (result.isError) throw new Error(result.content?.map(c => c.text || '').join('\n')); return result.content?.map(c => c.text || '').join('\n') || JSON.stringify(result, null, 2); }
function showAuthorizationResume(container, url, provider) {
  if (!url) return;
  if (container.querySelector('[data-authorization-resume]')) return;
  const card = document.createElement('article'); card.className = 'approval-card';
  card.dataset.authorizationResume = 'true';
  const message = document.createElement('p'); message.textContent = `Đã cho phép. Nếu ${provider} báo chưa liên kết, bấm nút dưới đây để hoàn tất xác thực trong tab mới.`;
  const link = document.createElement('a'); link.className = 'button small'; link.textContent = `Hoàn tất liên kết ${provider} ↗`;
  link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
  card.append(message, link); container.prepend(card);
}
function rememberAuthorizationResume(provider, url) {
  if (url) authorizationResume.set(provider, { url, expiresAt: Date.now() + 5 * 60_000 });
}
function renderAuthorizationResume(container, provider, label) {
  const entry = authorizationResume.get(provider);
  if (!entry) return;
  if (entry.expiresAt <= Date.now()) { authorizationResume.delete(provider); return; }
  showAuthorizationResume(container, entry.url, label);
}
function renderQuickTunnel(provider, prefix, name) {
  const quick = state.quickTunnels?.[provider];
  if (!quick) {
    $(`start-${prefix}-quick`).disabled = true;
    $(`stop-${prefix}-quick`).disabled = true;
    $(`${prefix}-quick-state`).textContent = 'Phiên Code Bridge đang chạy chưa có nút tạo URL. Đóng ứng dụng cũ ở cổng này, mở bản mới rồi tải lại trang.';
    $(`${prefix}-quick-state`).classList.add('is-error');
    $(`${prefix}-quick-progress`).hidden = true;
    $(`${prefix}-quick-origin`).hidden = true;
    return;
  }
  const active = ['installing', 'starting', 'ready'].includes(quick.state);
  const fixedUrlActive = !active && state[provider]?.enabled && !!state[provider]?.publicOrigin;
  $(`start-${prefix}-quick`).disabled = active || fixedUrlActive;
  $(`start-${prefix}-quick`).textContent = quick.state === 'ready' ? `URL ${name} đang chạy` : quick.state === 'error' ? `Thử tạo lại URL ${name}` : `Tạo URL và kết nối ${name} ↗`;
  $(`stop-${prefix}-quick`).disabled = !active;
  $(`stop-${prefix}-quick`).textContent = 'Dừng URL · thu hồi quyền';
  const percent = quick.total ? Math.min(100, Math.round(100 * quick.downloaded / quick.total)) : null;
  $(`${prefix}-quick-state`).textContent = fixedUrlActive ? `Cổng local đã bật cho ${state[provider].publicOrigin}. Nếu đây là hostname cố định, quyền còn hạn sẽ được khôi phục khi mở lại; hãy bảo đảm tunnel bên ngoài đang chạy.` : ({
    installing: percent === null ? 'Đang cài cloudflared từ bản phát hành chính thức…' : `Đang cài cloudflared · ${percent}%`,
    starting: 'Đang tạo URL HTTPS và bật cổng MCP…',
    ready: `URL đã sẵn sàng. Copy URL MCP ở bên phải để thêm vào ${name}.`,
    error: quick.error || 'Không tạo được URL. Bấm thử lại.',
    stopped: 'Chưa tạo URL. Bấm nút để bắt đầu.'
  })[quick.state] || 'Đang xử lý…';
  $(`${prefix}-quick-state`).classList.toggle('is-error', quick.state === 'error');
  const bar = $(`${prefix}-quick-progress`);
  bar.hidden = quick.state !== 'installing';
  if (percent === null) bar.removeAttribute('value'); else { bar.max = 100; bar.value = percent; }
  const origin = $(`${prefix}-quick-origin`);
  origin.hidden = !quick.origin;
  origin.textContent = quick.origin || '';
  $(`enable-${prefix}`).disabled = active;
}
async function tool(name, args) { return api('/api/tool', { name, arguments: args }); }
function protect(fn) { return async event => { event?.preventDefault(); const button = event?.submitter || (event?.currentTarget?.tagName === 'BUTTON' ? event.currentTarget : null); if (button?.disabled) return; if (button) button.disabled = true; try { await fn(event); } catch (e) { notify(e.message, true); } finally { if (button) button.disabled = false; } }; }
async function refresh() {
  const previousTool = $('tool-name').value;
  state = await api('/api/status');
  if (!Array.isArray(state.connections) && location.port === '3210') {
    $('upgrade-notice').hidden = false;
    $('status').textContent = 'Đang mở giao diện mới trên cổng 3213…';
    try {
      await fetch('http://127.0.0.1:3213/health', { mode: 'no-cors', cache: 'no-store', signal: AbortSignal.timeout(1500) });
      location.replace(`http://127.0.0.1:3213/${location.hash || '#overview'}`);
      return;
    } catch {
      $('status').textContent = 'Cổng 3213 chưa chạy · mở START-BRIDGE-LINUX.sh';
    }
  }
  const readyChatgpt = (state.connections || []).filter(c => c.provider === 'chatgpt' && c.state === 'ready').length;
  const grantedGemini = state.gemini?.grantedCount || 0;
  $('status').textContent = `● ${readyChatgpt} ChatGPT · ${grantedGemini} Gemini · ${state.claude?.grantedCount || 0} Claude · ${state.grok?.grantedCount || 0} Grok`;
  if (document.activeElement !== $('workspace-path')) $('workspace-path').value = state.workspace;
  renderHub();
  $('allow-writes').checked = state.allowWrites;
  $('allow-terminal').checked = state.terminalEnabled === true;
  $('save-file').disabled = !selectedFile || !state.allowWrites;
  $('endpoint').textContent = state.endpoint;
  renderGemini();
  renderOtherRemote();
  renderVscode();
  renderAntigravity();
  const statuses = { stopped: 'Chưa kết nối', starting: 'Đang khởi động', connecting: 'Đang kết nối', ready: '● Sẵn sàng', stopping: 'Đang dừng', error: 'Lỗi kết nối' };
  const chatgpt = (state.connections || []).filter(c => c.provider === 'chatgpt');
  const currentTunnel = chatgpt.find(c => c.state === 'error') || chatgpt.find(c => c.state === 'connecting' || c.state === 'starting') || chatgpt[0];
  $('tunnel-status').textContent = readyChatgpt ? `${readyChatgpt} tunnel sẵn sàng` : statuses[currentTunnel?.state] || 'Chưa kết nối';
  $('tunnel-error').hidden = !currentTunnel?.error;
  $('tunnel-error').textContent = currentTunnel?.error || '';
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
  renderQuickTunnel('gemini', 'gemini', 'Gemini');
  $('disable-gemini').textContent = 'Tắt cổng · thu hồi quyền';
  const pendingCount = gemini.pending.length;
  const pausedCount = gemini.connections.filter(connection => connection.state === 'paused').length;
  const readOnlyCount = state.allowWrites ? gemini.connections.filter(connection => !connection.allowWrites).length : 0;
  $('gemini-regrant-help').hidden = readOnlyCount === 0;
  $('gemini-status').textContent = gemini.grantedCount ? `${gemini.grantedCount} quyền đã cấp` : gemini.enabled ? 'Cổng local đã bật' : 'Chưa bật';
  $('gemini-pending-inline').textContent = String(pendingCount);
  const setupState = $('gemini-setup-state');
  setupState.className = 'gemini-setup-state' + (pendingCount ? ' is-pending' : readOnlyCount ? ' is-regrant' : gemini.grantedCount ? ' is-ready' : '');
  setupState.textContent = pendingCount ? `${pendingCount} yêu cầu đang chờ. Đối chiếu mã ở phần “Yêu cầu kết nối” bên dưới trước khi cho phép.` : pausedCount ? `${pausedCount} kết nối Gemini đang tạm dừng. Mở Quản lý kết nối và bấm Kết nối lại; không cần thêm app mới.` : readOnlyCount ? `${readOnlyCount} quyền Gemini vẫn chỉ đọc dù dự án đã bật quyền sửa. Cần kết nối lại và duyệt quyền mới.` : gemini.grantedCount ? `Đã cấp ${gemini.grantedCount} quyền Gemini. Mở Gemini, chọn app bằng @ rồi thử đọc file.` : gemini.enabled ? 'Cổng local đã bật; chưa có quyền Gemini. Sao chép URL MCP có đuôi /mcp ở bên phải để thêm app trong Gemini.' : 'Chọn dự án, tạo URL HTTPS rồi bật cổng Gemini. Chưa có tài khoản nào được cấp quyền.';
  if (document.activeElement !== $('gemini-origin') && !$('gemini-origin').value) $('gemini-origin').value = state.geminiOrigin || gemini.publicOrigin || '';
  $('gemini-local-target').textContent = gemini.localTarget;
  $('gemini-endpoint').textContent = gemini.endpoint || 'Bật cổng Gemini để nhận URL MCP.';
  $('copy-gemini-endpoint').disabled = !gemini.enabled;
  $('gemini-activity').textContent = gemini.lastCallAt ? `Kết nối MCP gần nhất: ${new Date(gemini.lastCallAt).toLocaleString('vi-VN')} · ${gemini.grantedCount} quyền còn hiệu lực` : `${gemini.grantedCount} quyền còn hiệu lực · Chưa có yêu cầu MCP được xác thực.`;
  const container = $('gemini-pending');
  const pendingKey = JSON.stringify({ pending: gemini.pending, allowWrites: state.allowWrites, terminalEnabled: state.terminalEnabled });
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
    const terminalLabel = document.createElement('label'); terminalLabel.className = 'terminal-grant' + (state.terminalEnabled ? '' : ' is-disabled');
    const terminalInput = document.createElement('input'); terminalInput.type = 'checkbox'; terminalInput.disabled = !state.terminalEnabled;
    terminalLabel.append(terminalInput, document.createTextNode(' Cho phép chạy lệnh terminal trên máy (quyền cao, mặc định tắt)'));
    if (!state.terminalEnabled) { const hint = document.createElement('p'); hint.className = 'terminal-grant-hint'; hint.innerHTML = '⚠ Cần bật quyền terminal hệ thống trước. Vào <a href="#workspace" onclick="navigate(\'workspace\')" style="color:var(--accent-light)">Dự án &amp; file</a> → bật <strong>Terminal trên máy</strong> rồi quay lại duyệt.'; terminalLabel.append(hint); }
    const buttons = document.createElement('div'); buttons.className = 'row';
    for (const [action, label] of [['approve', 'Cho phép'], ['deny', 'Từ chối']]) {
      const button = document.createElement('button'); button.textContent = label; button.className = action === 'deny' ? 'secondary small' : 'small';
      button.onclick = protect(async () => { const result = await api(`/api/gemini/${action}`, { id: request.id, label: nameInput.value.trim(), allowTerminal: action === 'approve' && terminalInput.checked }); if (action === 'approve') rememberAuthorizationResume('gemini', result.continueUrl); await refresh(); notify(action === 'approve' ? 'Đã duyệt. Nếu Gemini chưa liên kết, bấm Hoàn tất liên kết bên dưới.' : 'Đã từ chối kết nối.'); });
      buttons.append(button);
    }
    card.append(title, description, redirect, context, nameLabel, terminalLabel, buttons); container.append(card);
  }
  renderAuthorizationResume(container, 'gemini', 'Gemini');
}
const remoteSites = {
  claude: { name: 'Claude', url: 'https://claude.ai/customize/connectors', info: 'Claude Web: Customize → Connectors → + Add → Add custom connector. Nếu dùng Team/Enterprise, quản trị viên phải thêm connector trước.', steps: ['Mở Customize → Connectors → + Add → Add custom connector; nhập tên Code Bridge và dán URL MCP có đuôi /mcp.', 'Chọn Sign in now hoặc Sign in when needed. Ở OAuth client, chọn Register automatically để dùng đăng ký OAuth của Code Bridge. Hoàn tất Add rồi bấm Connect.', 'Khi trang xin quyền mở, đối chiếu mã ở Code Bridge và bấm Cho phép. Trong cuộc chat, bật connector bằng nút + → Connectors rồi thử đọc file.'] },
  grok: { name: 'Grok', url: 'https://grok.com/connectors', info: 'Grok Web: Connectors → New Connector → Custom. Tài khoản Business/Enterprise có thể cần quản trị viên cấp connector trước.', steps: ['Mở grok.com/connectors → New Connector → Custom; dán URL MCP có đuôi /mcp.', 'Hoàn tất bước xác thực OAuth nếu Grok yêu cầu. Khi trang xin quyền mở, đối chiếu mã ở Code Bridge và bấm Cho phép.', 'Trở lại cuộc trò chuyện Grok, bật connector Code Bridge và yêu cầu liệt kê thư mục được phép trước khi sửa file.'] }
};
const remoteOriginDrafts = { claude: '', grok: '' };
function renderOtherRemote() {
  if (!remoteSites[selectedProvider]) return;
  const provider = selectedProvider, site = remoteSites[provider], remote = state[provider];
  $('remote-name-heading').textContent = site.name.toUpperCase();
  $('remote-name-title').textContent = site.name;
  $('remote-name-step').textContent = site.name.toUpperCase();
  $('remote-name-action').textContent = site.name;
  $('remote-approval-name').textContent = site.name;
  $('remote-eligibility').textContent = site.info;
  $('enable-remote').textContent = `Bật cổng ${site.name}`;
  $('remote-steps').replaceChildren(...site.steps.map(step => { const li = document.createElement('li'); li.textContent = step; return li; }));
  if (!remote) { $('remote-status').textContent = 'Cần khởi động lại Code Bridge'; for (const button of $('remote-form').querySelectorAll('button')) button.disabled = true; return; }
  renderQuickTunnel(provider, 'remote', site.name);
  $('disable-remote').textContent = 'Tắt cổng · thu hồi quyền';
  $('remote-status').textContent = remote.grantedCount ? `${remote.grantedCount} quyền đã cấp` : remote.enabled ? 'Cổng local đã bật' : 'Chưa bật';
  const pendingCount = remote.pending.length;
  const pausedCount = remote.connections.filter(connection => connection.state === 'paused').length;
  $('remote-pending-inline').textContent = String(pendingCount);
  const setupState = $('remote-setup-state');
  setupState.className = 'gemini-setup-state' + (pendingCount ? ' is-pending' : remote.grantedCount ? ' is-ready' : '');
  setupState.textContent = pendingCount ? `${pendingCount} yêu cầu đang chờ. Đối chiếu mã trước khi cho phép.` : pausedCount ? `${pausedCount} kết nối ${site.name} đang tạm dừng. Mở Quản lý kết nối và bấm Kết nối lại.` : remote.grantedCount ? `Đã cấp ${remote.grantedCount} quyền ${site.name}. Hãy thử đọc file từ trang chat.` : remote.enabled ? `Cổng ${site.name} đã bật. Copy URL MCP có đuôi /mcp để thêm connector.` : `Chọn dự án, tạo URL HTTPS và bật cổng ${site.name}.`;
  if (document.activeElement !== $('remote-origin')) $('remote-origin').value = remoteOriginDrafts[provider] || state[`${provider}Origin`] || remote.publicOrigin || '';
  $('remote-local-target').textContent = remote.localTarget;
  $('remote-endpoint').textContent = remote.endpoint || `Bật cổng ${site.name} để nhận URL MCP.`;
  $('copy-remote-endpoint').disabled = !remote.enabled;
  $('remote-activity').textContent = remote.lastCallAt ? `Lệnh MCP gần nhất: ${new Date(remote.lastCallAt).toLocaleString('vi-VN')} · ${remote.grantedCount} quyền còn hiệu lực.` : `${remote.grantedCount} quyền còn hiệu lực · Chưa có lệnh MCP được xác thực.`;
  const container = $('remote-pending');
  const pendingKey = JSON.stringify({ provider, pending: remote.pending, allowWrites: state.allowWrites, terminalEnabled: state.terminalEnabled });
  if (container.dataset.requests === pendingKey) return;
  container.dataset.requests = pendingKey;
  container.replaceChildren();
  if (!pendingCount) { const p = document.createElement('p'); p.className = 'muted'; p.textContent = `Chưa có yêu cầu. Yêu cầu xuất hiện khi ${site.name} bắt đầu xác thực.`; container.append(p); }
  for (const request of remote.pending) {
    const card = document.createElement('article'); card.className = 'approval-card';
    const title = document.createElement('h3'); title.textContent = `Mã yêu cầu: ${request.id.slice(0, 10)}`;
    const description = document.createElement('p'); description.textContent = `Tên tự khai báo: ${request.clientName}. Đối chiếu địa chỉ trả về với trang vừa mở.`;
    const redirect = document.createElement('code'); redirect.textContent = request.redirectUri;
    const context = document.createElement('p'); context.textContent = `${request.allowWrites && state.allowWrites ? 'Đọc và sửa file' : 'Chỉ đọc file'} trong ${request.workspace}. Hết hạn lúc ${new Date(request.expiresAt * 1000).toLocaleTimeString('vi-VN')}.`;
    const nameLabel = document.createElement('label'); nameLabel.textContent = 'Tên để nhận biết kết nối';
    const nameInput = document.createElement('input'); nameInput.maxLength = 80; nameInput.placeholder = `Ví dụ: ${site.name} cá nhân`; nameLabel.append(nameInput);
    const terminalLabel = document.createElement('label'); terminalLabel.className = 'terminal-grant' + (state.terminalEnabled ? '' : ' is-disabled');
    const terminalInput = document.createElement('input'); terminalInput.type = 'checkbox'; terminalInput.disabled = !state.terminalEnabled;
    terminalLabel.append(terminalInput, document.createTextNode(' Cho phép chạy lệnh terminal trên máy (quyền cao, mặc định tắt)'));
    if (!state.terminalEnabled) { const hint = document.createElement('p'); hint.className = 'terminal-grant-hint'; hint.innerHTML = '⚠ Cần bật quyền terminal hệ thống trước. Vào <a href="#workspace" onclick="navigate(\'workspace\')" style="color:var(--accent-light)">Dự án &amp; file</a> → bật <strong>Terminal trên máy</strong> rồi quay lại duyệt.'; terminalLabel.append(hint); }
    const buttons = document.createElement('div'); buttons.className = 'row';
    for (const [action, label] of [['approve', 'Cho phép'], ['deny', 'Từ chối']]) {
      const button = document.createElement('button'); button.textContent = label; button.className = action === 'deny' ? 'secondary small' : 'small';
      button.onclick = protect(async () => { const result = await api(`/api/${provider}/${action}`, { id: request.id, label: nameInput.value.trim(), allowTerminal: action === 'approve' && terminalInput.checked }); if (action === 'approve') rememberAuthorizationResume(provider, result.continueUrl); await refresh(); notify(action === 'approve' ? `Đã duyệt. Nếu ${site.name} chưa liên kết, bấm Hoàn tất liên kết bên dưới.` : 'Đã từ chối kết nối.'); });
      buttons.append(button);
    }
    card.append(title, description, redirect, context, nameLabel, terminalLabel, buttons); container.append(card);
  }
  renderAuthorizationResume(container, provider, site.name);
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
$('allow-terminal').onchange = protect(async () => { await api('/api/terminal', { enabled: $('allow-terminal').checked }); await refresh(); notify(state.terminalEnabled ? 'Terminal đã bật trên máy. Hãy cấp quyền riêng cho kết nối cần dùng.' : 'Terminal đã tắt.'); });
$('reload-files').onclick = protect(() => files());
$('save-file').onclick = protect(async () => { resultText(await tool('write_file', { path: selectedFile, content: $('file-content').value })); notify('Đã lưu file.'); await refresh(); });
$('reload-preview').onclick = () => { $('preview').src = '/preview/index.html?reload=' + Date.now(); };
$('tunnel-form').onsubmit = protect(async () => { await api('/api/tunnel/start', { id: $('connection-id').value || undefined, label: $('connection-label').value.trim(), tunnelId: $('tunnel-id').value.trim(), apiKey: $('api-key').value.trim() }); resetTunnelForm(); await refresh(); notify('Đã khởi động kết nối. Đang chờ OpenAI.'); });
$('cancel-reconnect').onclick = resetTunnelForm;
function geminiOriginValue() {
  const value = $('gemini-origin').value.trim();
  let url;
  try { url = new URL(value); } catch { throw new Error('URL HTTPS riêng chưa hợp lệ. Hãy nhập URL gốc https://…'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !['/', '/mcp', '/mcp/'].includes(url.pathname)) throw new Error('Nhập URL HTTPS gốc, ví dụ https://abc.trycloudflare.com, không thêm đường dẫn khác.');
  return { origin: url.origin, wasMcp: url.pathname.startsWith('/mcp') };
}
function updateGeminiOriginHint() {
  const hint = $('gemini-origin-feedback');
  const value = $('gemini-origin').value.trim();
  hint.classList.toggle('is-error', /\/mcp\/?(?:[?#]|$)/i.test(value));
  hint.textContent = /\/mcp\/?(?:[?#]|$)/i.test(value) ? 'Bạn đang dán URL MCP. Code Bridge sẽ tự lấy URL gốc để bật cổng; URL có /mcp dùng trong Gemini.' : 'URL gốc chỉ dùng trong Code Bridge; ứng dụng sẽ tạo URL MCP hoàn chỉnh cho Gemini.';
}
$('gemini-origin').oninput = updateGeminiOriginHint;
$('gemini-form').onsubmit = protect(async () => {
  const { origin, wasMcp } = geminiOriginValue();
  $('gemini-origin').value = origin;
  updateGeminiOriginHint();
  const alreadyEnabled = state.gemini?.enabled && state.gemini.publicOrigin === origin;
  if (alreadyEnabled) { notify('Cổng đã bật với URL này; các quyền Gemini vẫn được giữ nguyên.'); return; }
  await api('/api/gemini/enable', { publicOrigin: origin });
  await refresh();
  notify(wasMcp ? 'Đã lấy URL gốc để bật cổng. Trong Gemini, hãy dùng nút Copy URL MCP có đuôi /mcp.' : 'Cổng đã bật. Bấm Copy URL MCP ở bên phải, rồi dán vào Gemini.');
});
$('disable-gemini').onclick = protect(async () => { await api('/api/gemini/disable', {}); await refresh(); notify('Đã tắt cổng Gemini và thu hồi quyền truy cập.'); });
$('revoke-gemini').onclick = protect(async () => { await api('/api/gemini/revoke', {}); await refresh(); notify('Đã thu hồi toàn bộ quyền Gemini.'); });
$('start-gemini-quick').onclick = protect(async () => { await api('/api/gemini/quick-tunnel/start', {}); await refresh(); notify('Đang cài hoặc khởi động tunnel. URL MCP sẽ hiện trên trang.'); });
$('stop-gemini-quick').onclick = protect(async () => { await api('/api/gemini/quick-tunnel/stop', {}); await refresh(); notify('Đã dừng URL Gemini và thu hồi quyền đang dùng.'); });
$('copy-gemini-endpoint').onclick = protect(async () => { await navigator.clipboard.writeText(state.gemini.endpoint); notify('Đã copy URL có /mcp. Dán URL này vào “URL của máy chủ MCP” trong Gemini.'); });
$('jump-gemini-approval').onclick = () => $('approval-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
$('copy-gemini-prompt').onclick = protect(async () => { await navigator.clipboard.writeText('Hãy dùng Code Bridge để liệt kê các thư mục được phép và đọc index.html trong dự án. Chưa sửa file.'); notify('Đã copy câu thử đọc file cho Gemini.'); });
$('remote-origin').oninput = () => { if (remoteSites[selectedProvider]) remoteOriginDrafts[selectedProvider] = $('remote-origin').value; const hasMcp = /\/mcp\/?(?:[?#]|$)/i.test($('remote-origin').value); $('remote-origin-feedback').classList.toggle('is-error', hasMcp); $('remote-origin-feedback').textContent = hasMcp ? 'Code Bridge sẽ lấy URL gốc; khi thêm connector hãy dùng URL MCP có /mcp ở bên phải.' : 'URL gốc chỉ dùng trong Code Bridge; ứng dụng sẽ tạo URL MCP hoàn chỉnh.'; };
$('remote-form').onsubmit = protect(async () => {
  const provider = selectedProvider, site = remoteSites[provider];
  if (!site) return;
  let url;
  try { url = new URL($('remote-origin').value.trim()); } catch { throw new Error('URL HTTPS riêng chưa hợp lệ. Hãy nhập URL gốc https://…'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !['/', '/mcp', '/mcp/'].includes(url.pathname)) throw new Error('Nhập URL HTTPS gốc hoặc URL MCP có đuôi /mcp.');
  const origin = url.origin;
  $('remote-origin').value = origin; remoteOriginDrafts[provider] = origin;
  if (state[provider]?.enabled && state[provider].publicOrigin === origin) { notify(`Cổng ${site.name} đang bật với URL này; quyền đã cấp vẫn còn.`); return; }
  await api(`/api/${provider}/enable`, { publicOrigin: origin });
  await refresh(); notify(`Cổng ${site.name} đã bật. Copy URL MCP có đuôi /mcp và dán vào connector.`);
});
$('disable-remote').onclick = protect(async () => { const provider = selectedProvider; await api(`/api/${provider}/disable`, {}); await refresh(); notify(`Đã tắt cổng ${remoteSites[provider].name} và thu hồi quyền.`); });
$('revoke-remote').onclick = protect(async () => { const provider = selectedProvider; await api(`/api/${provider}/revoke`, {}); await refresh(); notify(`Đã thu hồi toàn bộ quyền ${remoteSites[provider].name}.`); });
$('start-remote-quick').onclick = protect(async () => { const provider = selectedProvider; await api(`/api/${provider}/quick-tunnel/start`, {}); await refresh(); notify('Đang cài hoặc khởi động tunnel. URL MCP sẽ hiện trên trang.'); });
$('stop-remote-quick').onclick = protect(async () => { const provider = selectedProvider; await api(`/api/${provider}/quick-tunnel/stop`, {}); await refresh(); notify(`Đã dừng URL ${remoteSites[provider].name} và thu hồi quyền đang dùng.`); });
$('copy-remote-endpoint').onclick = protect(async () => { await navigator.clipboard.writeText(state[selectedProvider].endpoint); notify('Đã copy URL MCP có /mcp.'); });
$('jump-remote-approval').onclick = () => $('remote-approval-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
$('copy-remote-prompt').onclick = protect(async () => { await navigator.clipboard.writeText('Hãy dùng Code Bridge để liệt kê các thư mục được phép và đọc index.html trong dự án. Chưa sửa file.'); notify('Đã copy câu thử đọc file.'); });
$('copy-prompt').onclick = protect(async () => { await navigator.clipboard.writeText('Hãy dùng Code Bridge để liệt kê thư mục được phép, đọc index.html trong workspace, rồi đề xuất một thay đổi nhỏ. Dùng edit_file với dryRun=true để xem diff trước khi áp dụng.'); notify('Đã copy yêu cầu thử.'); });
$('tool-name').onchange = () => {
  const name = $('tool-name').value;
  const examples = { list_allowed_directories: {}, list_directory: { path: '.' }, read_text_file: { path: 'index.html' }, edit_file: { path: 'index.html', edits: [{ oldText: 'Chào mừng đến Code Bridge', newText: 'Xin chào từ ChatGPT' }], dryRun: true }, write_file: { path: 'hello.txt', content: 'Xin chào!' }, search_files: { path: '.', pattern: '**/*.html' }, run_command: { command: 'echo Code Bridge terminal ready', timeoutMs: 10000 } };
  $('tool-args').value = JSON.stringify(examples[name] || { path: '.' }, null, 2);
};
$('tool-form').onsubmit = protect(async () => { const result = await tool($('tool-name').value, JSON.parse($('tool-args').value)); $('tool-result').textContent = resultText(result); await refresh(); });
let hubBusy = false, connectionKey = '', selectedProvider = 'chatgpt', selectedTab = 'connect';
const providerTabs = { chatgpt: 'connect', gemini: 'connect', claude: 'connect', grok: 'connect', meta: 'connect' };
const providerQueries = { chatgpt: '', gemini: '', claude: '', grok: '', meta: '' };
const providerName = mode => ({ chatgpt: 'ChatGPT', gemini: 'Gemini', claude: 'Claude', grok: 'Grok', meta: 'Meta AI' }[mode] || mode);
const stateName = value => ({ ready: 'Tunnel sẵn sàng', authorized: 'Đã cấp quyền', paused: 'Đã tạm dừng', stopped: 'Đã dừng', offline: 'Phiên cũ đã tắt', starting: 'Đang khởi động', connecting: 'Đang kết nối', stopping: 'Đang dừng', error: 'Lỗi kết nối', unknown: 'Chưa xác định' }[value] || value);
function node(tag, text, className) { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (className) el.className = className; return el; }

// ── VS CODE / CODEX MCP CONNECTION ─────────────────────────────────────────
function renderVscode() {
  const vs = state?.vscodeMode;
  if (!vs) return;
  const endpoint = $('vsc-endpoint-note'); if (endpoint) endpoint.textContent = vs.mcpEndpoint;
  const configured = $('vsc-config-status'); if (configured) configured.textContent = vs.isConfigured ? '● Đã thêm vào .vscode/mcp.json' : 'Chưa thêm vào dự án';
  const mcp = $('vsc-mcp-snippet'); if (mcp) mcp.textContent = vs.vscodeSnippet;
  const codex = $('vsc-codex-snippet'); if (codex) codex.textContent = vs.codexSnippet;
}
$('vsc-auto-configure').onclick = protect(async () => {
  await api('/api/vscode/configure', {});
  state = await api('/api/status'); renderVscode();
  notify('Đã thêm Code Bridge vào .vscode/mcp.json của dự án.');
});
$('vsc-copy-mcp').onclick = protect(async () => {
  await navigator.clipboard.writeText(state?.vscodeMode?.vscodeSnippet || '');
  notify('Đã sao chép cấu hình MCP cho VS Code.');
});
$('vsc-copy-codex').onclick = protect(async () => {
  await navigator.clipboard.writeText(state?.vscodeMode?.codexSnippet || '');
  notify('Đã sao chép cấu hình MCP cho Codex.');
});

// ── GOOGLE ANTIGRAVITY MCP CONNECTION ──────────────────────────────────────
function renderAntigravity() {
  const agy = state?.antigravityMode;
  if (!agy) return;
  const homeStatus = $('antigravity-home-status');
  if (homeStatus) homeStatus.textContent = agy.isConfigured ? '● MCP đã thêm' : 'Chưa cấu hình';
  const badge = $('agy-config-badge');
  if (badge) { badge.textContent = agy.isConfigured ? '● Đã cấu hình' : 'Chưa cấu hình'; badge.classList.toggle('ready', agy.isConfigured); }
  const target = $('agy-target-ws'); if (target) target.textContent = `Dự án: ${agy.workspace}`;
  const snippet = $('agy-mcp-snippet'); if (snippet) snippet.textContent = agy.mcpConfigSnippet;
}
$('agy-auto-configure').onclick = protect(async () => {
  await api('/api/antigravity/configure', {});
  state = await api('/api/status'); renderAntigravity();
  $('agy-config-success').hidden = false;
  notify('Đã thêm Code Bridge vào cấu hình MCP của dự án.');
});
$('agy-copy-mcp').onclick = protect(async () => {
  await navigator.clipboard.writeText(state?.antigravityMode?.mcpConfigSnippet || '');
  notify('Đã sao chép cấu hình MCP cho Antigravity.');
});

function route() {
  const requested = location.hash.slice(1);
  const provider = ['chatgpt', 'gemini', 'claude', 'grok', 'meta'].includes(requested) ? requested : requested === 'connection' ? 'chatgpt' : null;
  const view = provider ? 'provider' : ['workspace', 'tools', 'activity', 'vscode', 'antigravity'].includes(requested) ? requested : 'overview';
  if (provider) {
    if (selectedProvider !== provider) {
      providerQueries[selectedProvider] = $('connection-search').value;
      $('connection-search').value = providerQueries[provider];
    }
    selectedProvider = provider; selectedTab = providerTabs[provider];
    if (state && remoteSites[provider]) renderOtherRemote();
  }
  for (const el of document.querySelectorAll('.view')) el.hidden = el.id !== view;
  for (const link of document.querySelectorAll('nav [data-view]')) { if (link.dataset.view === (provider || view)) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); }
  $('view-name').textContent = provider ? providerName(provider) : { overview: 'Trang chủ', workspace: 'Dự án & file', tools: 'Công cụ MCP', activity: 'Nhật ký', vscode: 'VS Code / Codex', antigravity: 'Google Antigravity · Argon 4' }[view];
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
  $('remote-approval-panel').hidden = !remoteSites[selectedProvider] || selectedTab === 'use';
}
function openTab(tab) { selectedTab = tab; providerTabs[selectedProvider] = tab; renderTab(); }
function resetTunnelForm() { $('tunnel-form').reset(); $('connection-id').value = ''; $('cancel-reconnect').hidden = true; }
function showSetup() { location.hash = selectedProvider; route(); openTab('connect'); const remote = remoteSites[selectedProvider]; const el = $(selectedProvider === 'gemini' ? 'gemini-setup' : remote ? 'remote-setup' : selectedProvider === 'meta' ? 'meta-setup' : 'chatgpt-setup'); el.scrollIntoView({ block: 'start' }); if (selectedProvider !== 'meta') $(selectedProvider === 'gemini' ? 'gemini-origin' : remote ? 'remote-origin' : 'connection-label').focus({ preventScroll: true }); }
function renderHub() {
  const supported = Array.isArray(state.connections), name = providerName(selectedProvider);
  const connections = state.connections || [];
  $('upgrade-notice').hidden = supported;
  $('backend-upgrade-notice').hidden = !!(state.claude && state.grok && state.quickTunnels);
  for (const provider of ['chatgpt', 'gemini', 'claude', 'grok']) {
    const ready = connections.filter(c => c.provider === provider && ['ready', 'authorized'].includes(c.state)).length;
    $(provider + '-home-count').textContent = ready;
    $(provider + '-nav-count').textContent = ready;
    const online = provider === 'chatgpt' ? ready > 0 : !!state[provider]?.enabled;
    $(provider + '-home-status').textContent = provider !== 'chatgpt' && !state[provider] ? 'Cần khởi động lại' : online ? (provider === 'chatgpt' ? 'Tunnel sẵn sàng' : 'Cổng MCP đang bật') : 'Chưa kết nối';
    $(provider + '-home-status').classList.toggle('is-active', online);
  }
  $('home-active-mode').textContent = `${connections.filter(c => c.provider === 'chatgpt' && c.state === 'ready').length} ChatGPT · ${state.gemini?.grantedCount || 0} Gemini · ${state.claude?.grantedCount || 0} Claude · ${state.grok?.grantedCount || 0} Grok`;
  $('chatgpt-setup').hidden = selectedProvider !== 'chatgpt'; $('gemini-setup').hidden = selectedProvider !== 'gemini'; $('remote-setup').hidden = !remoteSites[selectedProvider]; $('meta-setup').hidden = selectedProvider !== 'meta'; $('setup-next').hidden = selectedProvider === 'meta';
  $('tab-manage').hidden = selectedProvider === 'meta'; $('tab-use').hidden = selectedProvider === 'meta';
  $('provider-title').textContent = name;
  $('provider-icon').textContent = ({ chatgpt: 'C', gemini: '✦', claude: '✳', grok: '𝕏', meta: '◉' })[selectedProvider];
  $('provider-description').textContent = selectedProvider === 'meta' ? 'Theo dõi khả năng tích hợp Meta AI Connectors.' : selectedProvider === 'chatgpt' ? 'Kết nối qua OpenAI Tunnel và quản lý các kết nối ChatGPT của bạn.' : `Thiết lập remote MCP, duyệt quyền và quản lý các kết nối ${name}.`;
  const ownConnections = connections.filter(p => p.provider === selectedProvider);
  const ownReady = ownConnections.filter(p => ['ready', 'authorized'].includes(p.state)).length;
  $('activation-title').textContent = selectedProvider === 'meta' ? 'Meta AI Connectors đang ở developer preview' : selectedProvider === 'chatgpt' ? `${ownReady} tunnel sẵn sàng / ${ownConnections.filter(p => !p.legacy).length} cấu hình` : `${state[selectedProvider]?.enabled ? 'Cổng MCP đang bật' : 'Cổng MCP chưa bật'} · ${ownReady} đang dùng / ${ownConnections.length} quyền còn hiệu lực`;
  $('activation-description').textContent = selectedProvider === 'meta' ? 'Chưa có luồng tự thêm MCP URL trên meta.ai; xem điều kiện của Meta bên dưới.' : selectedProvider === 'chatgpt' ? 'Thêm tối đa 12 Tunnel ID riêng. Mỗi tunnel được kiểm tra trạng thái độc lập.' : 'Mỗi yêu cầu OAuth được duyệt riêng. Các cổng khác vẫn hoạt động khi bật cổng này.';
  $('activate-provider').hidden = selectedProvider === 'meta';
  $('activate-provider').disabled = !supported || hubBusy || (selectedProvider !== 'chatgpt' && selectedProvider !== 'meta' && !state[selectedProvider]);
  $('activate-provider').textContent = selectedProvider === 'chatgpt' ? 'Thêm kết nối ChatGPT' : `Thiết lập ${name}`;
  $('activation-panel').classList.toggle('is-active', ownReady > 0 || !!state[selectedProvider]?.enabled);
  $('add-connection').disabled = !supported;
  for (const form of [$('tunnel-form'), $('gemini-form'), $('remote-form')]) for (const button of form.querySelectorAll('button')) button.disabled = !supported || hubBusy;
  $('open-provider').textContent = `Mở ${name} ↗`;
  $('open-provider').href = selectedProvider === 'gemini' ? 'https://gemini.google.com' : remoteSites[selectedProvider]?.url || (selectedProvider === 'meta' ? 'https://meta.ai' : 'https://chatgpt.com');
  const own = ownConnections;
  $('ready-count').textContent = own.filter(p => ['ready', 'authorized'].includes(p.state)).length;
  $('recent-count').textContent = own.filter(p => p.lastCallAt && Date.now() - Date.parse(p.lastCallAt) < 300000 && ['ready', 'authorized'].includes(p.state)).length;
  $('pending-count').textContent = state[selectedProvider]?.pending?.length || 0;
  $('sidebar-project').textContent = state.workspace.split(/[\\/]/).filter(Boolean).at(-1);
  $('sidebar-permission').textContent = state.allowWrites ? 'Đọc và sửa file' : 'Chỉ đọc file';
  $('setup-project').textContent = state.workspace;
  $('connections-count').textContent = own.length;
  $('use-intro').textContent = `Sau khi kết nối, bạn ra lệnh trong ${name} và quản lý file tại Code Bridge.`;
  $('use-select').textContent = selectedProvider === 'chatgpt' ? 'Trong ChatGPT, chọn custom app Code Bridge đã thiết lập bằng Tunnel ID của bạn.' : selectedProvider === 'gemini' ? 'Trong Gemini, nhập @ và chọn custom app Code Bridge bạn đã thêm.' : `Trong ${name}, bật connector Code Bridge trong cuộc trò chuyện.`;
  $('use-prompt').textContent = selectedProvider === 'chatgpt' ? 'Hãy dùng Code Bridge để liệt kê thư mục được phép và đọc index.html trong dự án. Đề xuất một thay đổi nhỏ rồi dùng edit_file với dryRun=true để xem diff trước khi áp dụng.' : 'Hãy dùng Code Bridge để liệt kê các thư mục được phép và đọc index.html trong dự án. Chưa sửa file.';
  $('provider-troubleshooting').textContent = selectedProvider === 'chatgpt' ? 'Nếu tunnel chưa sẵn sàng, kiểm tra Tunnel ID, Runtime API Key và thông báo trong Quản lý kết nối.' : 'Nếu URL không hợp lệ, hãy dán URL có đuôi /mcp. Nếu báo 502, kiểm tra trạng thái URL tự động và tạo lại khi tunnel đã ngắt. Nếu xác thực chờ, quay lại Code Bridge để duyệt yêu cầu cùng mã.';
  renderConnections();
}
function renderConnections() {
  if (!state) return;
  const filter = selectedProvider, query = $('connection-search').value.trim().toLocaleLowerCase();
  const all = (state.connections || []).filter(p => (filter === 'all' || p.provider === filter) && (p.label + ' ' + (p.tunnelId || '')).toLocaleLowerCase().includes(query));
  const key = JSON.stringify([all, filter, query, state.terminalEnabled]);
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
    if (item.provider !== 'chatgpt') text.append(node('small', item.allowWrites ? 'Đọc và sửa file' : 'Chỉ đọc file'));
    text.append(node('small', item.allowTerminal ? 'Terminal: đã cấp quyền' : 'Terminal: chưa cấp quyền'));
    identity.append(node('span', ({ chatgpt: 'C', gemini: '✦', claude: '✳', grok: '𝕏' })[item.provider] || '·', 'provider-logo ' + item.provider), text);
    const status = node('div'); status.append(node('span', stateName(item.state), 'badge ' + item.state));
    if (item.error) status.append(node('p', item.error, 'connection-error'));
    const time = node('div', undefined, 'connection-time');
    time.append(node('div', item.lastCallAt ? `Lệnh MCP: ${new Date(item.lastCallAt).toLocaleString('vi-VN')}` : 'Chưa nhận yêu cầu MCP'));
    if (item.provider === 'chatgpt') time.append(node('div', item.lastCheckedAt ? `Kiểm tra tunnel: ${new Date(item.lastCheckedAt).toLocaleString('vi-VN')}` : 'Chưa kiểm tra tunnel'));
    if (item.expiresAt) time.append(node('div', 'Hết hạn ' + new Date(item.expiresAt * 1000).toLocaleString('vi-VN')));
    const actions = node('div', undefined, 'connection-actions');
    function action(label, fn, danger = false) { const b = node('button', label, danger ? 'danger small' : 'secondary small'); b.onclick = protect(async () => { await fn(); await refresh(); }); actions.append(b); }
    if (item.provider !== 'chatgpt') {
      action(item.state === 'paused' ? 'Kết nối lại' : 'Tạm dừng', () => api(`/api/${item.provider}/${item.state === 'paused' ? 'resume' : 'pause'}`, { id: item.id }));
      action('Đổi tên', async () => { $('rename-provider').value = item.provider; $('rename-id').value = item.id; $('rename-label').value = item.label; $('rename-dialog').showModal(); });
      action('Thu hồi', () => api(`/api/${item.provider}/revoke`, { id: item.id }), true);
    } else {
      if (!item.legacy && state.terminalEnabled) action(item.allowTerminal ? 'Tắt terminal' : 'Cấp terminal', () => api('/api/tunnel/terminal', { id: item.id, enabled: !item.allowTerminal }));
      if (!['stopped', 'error', 'offline'].includes(item.state)) action('Dừng', () => api('/api/tunnel/stop', { id: item.id }), true);
      else {
        action('Kết nối lại', async () => {
          resetTunnelForm(); $('connection-id').value = item.legacy ? '' : item.id; $('connection-label').value = item.label; $('tunnel-id').value = item.tunnelId; $('cancel-reconnect').hidden = false; showSetup(); $('api-key').focus();
        });
        if (!item.legacy) action('Xóa', () => api('/api/tunnel/remove', { id: item.id }));
      }
    }
    row.append(identity, status, time, actions); container.append(row);
  }
}
$('activate-provider').onclick = showSetup;
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
$('check-connections').onclick = protect(async () => { await api('/api/connections/check', {}); await refresh(); notify('Đã kiểm tra lại trạng thái từng kết nối.'); });
$('connection-search').oninput = renderConnections;
$('refresh-status').onclick = protect(refresh);
$('rename-form').onsubmit = protect(async () => { await api(`/api/${$('rename-provider').value}/rename`, { id: $('rename-id').value, label: $('rename-label').value }); $('rename-dialog').close(); await refresh(); });
$('cancel-rename').onclick = () => $('rename-dialog').close();
route();
try { await refresh(); await files(); } catch (e) { notify(e.message, true); }
setInterval(() => { if (!document.hidden && !hubBusy) refresh().catch(() => { $('status').textContent = 'Mất kết nối local'; }); }, 5000);
