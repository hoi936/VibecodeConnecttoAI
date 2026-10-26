import { existsSync } from 'node:fs';
import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';

// VS Code/Codex provide the chat model; this module installs local MCP tools.
export function createVscodeProxy({ getStatus }) {
  function endpoint(origin) { return `${origin}/mcp`; }
  function configPath() { return path.join(getStatus().workspace, '.vscode', 'mcp.json'); }

  async function status(origin) {
    const mcpEndpoint = endpoint(origin);
    let isConfigured = false;
    try {
      const data = JSON.parse(await readFile(configPath(), 'utf8'));
      isConfigured = data?.servers?.['code-bridge']?.url === mcpEndpoint;
    } catch {}
    return {
      mcpEndpoint,
      isConfigured,
      vscodeSnippet: JSON.stringify({ servers: { 'code-bridge': { type: 'http', url: mcpEndpoint } } }, null, 2),
      codexSnippet: `[mcp_servers.code_bridge]\nurl = "${mcpEndpoint}"\n`
    };
  }

  async function configureWorkspace(origin) {
    const workspace = await realpath(getStatus().workspace);
    const directory = path.join(workspace, '.vscode');
    await mkdir(directory, { recursive: true });
    if (await realpath(directory) !== directory) throw new Error('Thư mục .vscode không được là liên kết ra ngoài workspace.');
    const file = path.join(directory, 'mcp.json');
    let data = {};
    if (existsSync(file)) {
      if ((await lstat(file)).isSymbolicLink()) throw new Error('mcp.json không được là liên kết tượng trưng.');
      data = JSON.parse(await readFile(file, 'utf8'));
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Cấu hình MCP hiện tại không hợp lệ.');
    }
    data.servers = { ...(data.servers || {}), 'code-bridge': { type: 'http', url: endpoint(origin) } };
    await writeFile(file, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
    return { ok: true, path: file };
  }

  return { status, configureWorkspace };
}
