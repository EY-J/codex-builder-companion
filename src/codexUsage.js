const fs = require('fs');
const path = require('path');
const { spawn: nodeSpawn } = require('child_process');

function clampPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(100, Math.round(number * 10) / 10));
}

function windowLabel(minutes, key = '') {
  const value = Number(minutes) || 0;
  if (value >= 6 * 24 * 60) return 'Weekly';
  if (value >= 24 * 60) {
    const days = Math.round(value / (24 * 60));
    return `${days}-day`;
  }
  if (value >= 60) {
    const hours = Math.round((value / 60) * 10) / 10;
    return `${hours}-hour`;
  }
  if (value > 0) return `${Math.round(value)}-minute`;
  return key === 'secondary' ? 'Secondary' : 'Primary';
}

function normalizeWindow(key, value) {
  if (!value || typeof value !== 'object') return null;
  const usedPercent = clampPercent(value.usedPercent);
  if (usedPercent === null) return null;
  const duration = Number(value.windowDurationMins) || 0;
  const resetsAt = Number(value.resetsAt) || 0;
  return {
    key,
    label: windowLabel(duration, key),
    usedPercent,
    remainingPercent: Math.round((100 - usedPercent) * 10) / 10,
    windowDurationMins: duration,
    resetsAt
  };
}

function selectCodexRateLimitSnapshot(result = {}) {
  const map = result.rateLimitsByLimitId;
  if (map && typeof map === 'object' && map.codex) return map.codex;
  return result.rateLimits && typeof result.rateLimits === 'object' ? result.rateLimits : {};
}

function normalizeRateLimitResult(result = {}) {
  const snapshot = selectCodexRateLimitSnapshot(result);
  const windows = [
    normalizeWindow('primary', snapshot.primary),
    normalizeWindow('secondary', snapshot.secondary)
  ].filter(Boolean);
  return {
    windows,
    rateLimitReachedType: snapshot.rateLimitReachedType || null,
    snapshot
  };
}

function mergeObjectKeepingExisting(previous, update) {
  if (!update || typeof update !== 'object') return previous;
  if (!previous || typeof previous !== 'object') return { ...update };
  const next = { ...previous };
  for (const [key, value] of Object.entries(update)) {
    if (value !== null && value !== undefined) next[key] = value;
  }
  return next;
}

function mergeRateLimitSnapshot(previous = {}, update = {}) {
  const merged = mergeObjectKeepingExisting(previous, update) || {};
  if (previous.primary || update.primary) {
    merged.primary = mergeObjectKeepingExisting(previous.primary, update.primary);
  }
  if (previous.secondary || update.secondary) {
    merged.secondary = mergeObjectKeepingExisting(previous.secondary, update.secondary);
  }
  return merged;
}

function platformFolders(platform = process.platform, arch = process.arch) {
  const archName = arch === 'arm64' ? 'aarch64' : 'x86_64';
  if (platform === 'win32') return [`windows-${archName}`];
  if (platform === 'linux') return [`linux-${archName}`];
  if (platform === 'darwin') return [`macos-${archName}`, `darwin-${archName}`];
  return [];
}

function findBundledCodexBinary(extensionPath, options = {}) {
  if (!extensionPath) return '';
  const platform = options.platform || process.platform;
  const arch = options.arch || process.arch;
  const fsModule = options.fsModule || fs;
  const pathModule = options.pathModule || path;
  const executable = platform === 'win32' ? 'codex.exe' : 'codex';
  const binRoot = pathModule.join(extensionPath, 'bin');

  for (const folder of platformFolders(platform, arch)) {
    const candidate = pathModule.join(binRoot, folder, executable);
    try {
      if (fsModule.existsSync(candidate)) return candidate;
    } catch {
      // Fall through to the bounded directory scan below.
    }
  }

  try {
    if (!fsModule.existsSync(binRoot)) return '';
    for (const entry of fsModule.readdirSync(binRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const candidate = pathModule.join(binRoot, entry.name, executable);
      if (fsModule.existsSync(candidate)) return candidate;
    }
  } catch {
    return '';
  }
  return '';
}

function resolveCodexBinary(vscodeApi) {
  const configured = vscodeApi?.workspace?.getConfiguration?.('chatgpt')?.get?.('cliExecutable');
  if (configured && fs.existsSync(String(configured))) {
    return { command: String(configured), source: 'Configured Codex executable' };
  }

  const envPath = process.env.CODEX_CLI_PATH;
  if (envPath && fs.existsSync(envPath)) {
    return { command: envPath, source: 'CODEX_CLI_PATH' };
  }

  const officialExtension = vscodeApi?.extensions?.getExtension?.('openai.chatgpt');
  const bundled = findBundledCodexBinary(officialExtension?.extensionPath || '');
  if (bundled) {
    return { command: bundled, source: 'VS Code Codex extension' };
  }

  return { command: 'codex', source: 'Codex on PATH' };
}

class CodexUsageService {
  constructor(options = {}) {
    this.resolveBinary = options.resolveBinary;
    this.spawnFn = options.spawnFn || nodeSpawn;
    this.version = options.version || '0.0.0';
    this.onChange = options.onChange || (() => {});
    this.pollMs = Number(options.pollMs) || 60000;
    this.startupTimeoutMs = Number(options.startupTimeoutMs) || 12000;
    this.process = null;
    this.buffer = '';
    this.pollTimer = null;
    this.startupTimer = null;
    this.requestId = 100;
    this.initializeId = null;
    this.rateLimitRequestIds = new Set();
    this.snapshot = {};
    this.intentionalStop = false;
    this.state = {
      status: 'idle',
      windows: [],
      source: '',
      lastUpdatedAt: 0,
      error: ''
    };
  }

  getState() {
    return {
      ...this.state,
      windows: Array.isArray(this.state.windows) ? this.state.windows.map((item) => ({ ...item })) : []
    };
  }

  emit(next = {}) {
    this.state = { ...this.state, ...next };
    try { this.onChange(this.getState()); } catch { /* UI callback must not break usage tracking. */ }
  }

  send(message) {
    if (!this.process?.stdin || this.process.stdin.destroyed) return false;
    try {
      this.process.stdin.write(`${JSON.stringify(message)}\n`);
      return true;
    } catch {
      return false;
    }
  }

  async start() {
    if (this.process && !this.process.killed) return this.getState();
    this.intentionalStop = false;
    const resolved = await Promise.resolve(this.resolveBinary?.());
    if (!resolved?.command) {
      this.emit({ status: 'unavailable', error: 'Codex executable was not found.' });
      return this.getState();
    }

    this.emit({ status: 'connecting', source: resolved.source || '', error: '' });
    let child;
    try {
      child = this.spawnFn(resolved.command, ['app-server', '--stdio'], {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe']
      });
    } catch (error) {
      this.emit({ status: 'unavailable', error: `Unable to start Codex app-server: ${error.message || error}` });
      return this.getState();
    }
    this.process = child;
    this.buffer = '';

    child.stdout?.setEncoding?.('utf8');
    child.stdout?.on('data', (chunk) => this.handleStdout(chunk));
    child.stderr?.on('data', () => { /* Drain app-server diagnostics without exposing them in the UI. */ });
    child.on?.('error', (error) => {
      this.clearTimers();
      this.process = null;
      this.emit({ status: 'unavailable', error: `Codex app-server unavailable: ${error.message || error}` });
    });
    child.on?.('exit', (code) => {
      this.clearTimers();
      this.process = null;
      if (!this.intentionalStop) {
        this.emit({
          status: this.state.windows.length ? 'stale' : 'unavailable',
          error: `Codex usage connection closed${Number.isInteger(code) ? ` (exit ${code})` : ''}.`
        });
      }
    });

    this.initializeId = ++this.requestId;
    this.send({
      method: 'initialize',
      id: this.initializeId,
      params: {
        clientInfo: {
          name: 'codex_builder_companion',
          title: 'Codex Builder Companion',
          version: this.version
        },
        capabilities: {
          optOutNotificationMethods: [
            'thread/started',
            'turn/started',
            'turn/completed',
            'item/started',
            'item/completed',
            'item/agentMessage/delta'
          ]
        }
      }
    });

    this.startupTimer = setTimeout(() => {
      if (this.state.status === 'connecting') {
        this.emit({ status: 'unavailable', error: 'Timed out reading Codex usage.' });
        this.stopProcessOnly();
      }
    }, this.startupTimeoutMs);

    return this.getState();
  }

  requestRateLimits() {
    if (!this.process || this.process.killed) return false;
    const id = ++this.requestId;
    this.rateLimitRequestIds.add(id);
    return this.send({ method: 'account/rateLimits/read', id });
  }

  async refresh() {
    if (!this.process || this.process.killed) {
      await this.start();
      return this.getState();
    }
    this.requestRateLimits();
    return this.getState();
  }

  handleStdout(chunk) {
    this.buffer += String(chunk || '');
    let newlineIndex;
    while ((newlineIndex = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (!line) continue;
      let message;
      try { message = JSON.parse(line); } catch { continue; }
      this.handleMessage(message);
    }
  }

  handleMessage(message = {}) {
    if (message.id === this.initializeId) {
      if (message.error) {
        this.clearTimers();
        this.emit({ status: 'unavailable', error: message.error.message || 'Codex app-server initialization failed.' });
        this.stopProcessOnly();
        return;
      }
      this.send({ method: 'initialized', params: {} });
      this.requestRateLimits();
      this.startPolling();
      return;
    }

    if (this.rateLimitRequestIds.has(message.id)) {
      this.rateLimitRequestIds.delete(message.id);
      if (message.error) {
        this.clearStartupTimer();
        this.emit({
          status: this.state.windows.length ? 'stale' : 'unavailable',
          error: message.error.message || 'Codex rate limits could not be read.'
        });
        return;
      }
      this.applyResult(message.result || {});
      return;
    }

    if (message.method === 'account/rateLimits/updated') {
      const update = message.params?.rateLimits;
      if (update && typeof update === 'object') {
        this.snapshot = mergeRateLimitSnapshot(this.snapshot, update);
        this.applySnapshot(this.snapshot);
      } else {
        this.requestRateLimits();
      }
    }
  }

  applyResult(result) {
    const normalized = normalizeRateLimitResult(result);
    this.snapshot = normalized.snapshot || {};
    this.applySnapshot(this.snapshot, normalized);
  }

  applySnapshot(snapshot, normalizedValue) {
    const normalized = normalizedValue || normalizeRateLimitResult({ rateLimits: snapshot });
    this.clearStartupTimer();
    this.emit({
      status: normalized.windows.length ? 'live' : 'unavailable',
      windows: normalized.windows,
      lastUpdatedAt: Date.now(),
      error: normalized.windows.length ? '' : 'Codex returned no rate-limit windows for this account.'
    });
  }

  startPolling() {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => this.requestRateLimits(), this.pollMs);
  }

  clearStartupTimer() {
    if (this.startupTimer) clearTimeout(this.startupTimer);
    this.startupTimer = null;
  }

  clearTimers() {
    this.clearStartupTimer();
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  stopProcessOnly() {
    const child = this.process;
    this.process = null;
    if (!child) return;
    try { child.stdin?.end?.(); } catch { /* ignore */ }
    try { child.kill?.(); } catch { /* ignore */ }
  }

  stop() {
    this.intentionalStop = true;
    this.clearTimers();
    this.stopProcessOnly();
  }
}

module.exports = {
  CodexUsageService,
  findBundledCodexBinary,
  mergeRateLimitSnapshot,
  normalizeRateLimitResult,
  resolveCodexBinary,
  windowLabel
};
