import { spawn } from 'node:child_process';

export const terminalTool = {
  name: 'run_command',
  description: 'Run one shell command on the local computer in the selected project directory. This has the full permissions of the Code Bridge operating-system user; the project directory is only the starting directory, not a sandbox. Commands time out and output is limited. Do not use for long-running servers.',
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Shell command to run.' },
      timeoutMs: { type: 'integer', minimum: 1000, maximum: 30000, description: 'Timeout in milliseconds (default 30000, maximum 30000).' }
    },
    required: ['command'], additionalProperties: false
  },
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true }
};

export function canUseTerminal(enabled, remoteAuth, chatgptProfiles) {
  if (!enabled) return false;
  if (!remoteAuth) return true;
  if (remoteAuth.provider === 'chatgpt') return !!remoteAuth.id && chatgptProfiles.has(remoteAuth.id);
  return remoteAuth.allowTerminal === true;
}

export function createTerminalRunner() {
  const active = new Set();
  function stop(child) {
    if (child.exitCode !== null || child.killed) return;
    try {
      if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGKILL');
      else if (child.pid) {
        // cmd.exe may have launched another process. Kill the full tree on Windows.
        const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        killer.on('error', () => child.kill('SIGKILL'));
      } else child.kill('SIGKILL');
    } catch { child.kill('SIGKILL'); }
  }
  function stopAll() { for (const child of active) stop(child); }
  async function run({ command, timeoutMs = 30000 } = {}, cwd) {
    if (typeof command !== 'string' || !command.trim() || command.length > 4096 || command.includes('\0')) throw new Error('Lệnh cần từ 1 đến 4096 ký tự và không chứa ký tự NUL.');
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000) throw new Error('timeoutMs cần từ 1000 đến 30000.');
    return new Promise((resolve, reject) => {
      let output = '', bytes = 0, timedOut = false, truncated = false, settled = false;
      const child = spawn(command, { cwd, shell: true, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
      active.add(child);
      const timer = setTimeout(() => { timedOut = true; stop(child); }, timeoutMs);
      const collect = (label, chunk) => {
        const remaining = 65536 - bytes;
        if (remaining > 0) { const piece = chunk.subarray(0, remaining); output += `${label}${piece.toString('utf8')}`; bytes += piece.length; }
        if (chunk.length > remaining) { truncated = true; stop(child); }
      };
      child.stdout.on('data', chunk => collect('', chunk));
      child.stderr.on('data', chunk => collect('[stderr] ', chunk));
      child.once('error', error => { if (settled) return; settled = true; clearTimeout(timer); active.delete(child); reject(error); });
      child.once('close', (code, signal) => {
        if (settled) return; settled = true; clearTimeout(timer); active.delete(child);
        const summary = `Exit code: ${code ?? 'none'}${signal ? ` (${signal})` : ''}${timedOut ? ' · Timed out' : ''}${truncated ? ' · Output limit reached' : ''}`;
        resolve({ content: [{ type: 'text', text: `${summary}\n${output}` }], isError: code !== 0 || timedOut || truncated });
      });
    });
  }
  return { run, stopAll };
}
