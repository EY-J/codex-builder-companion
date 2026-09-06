const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn: nodeSpawn } = require('child_process');
const { normalizeInterpretation } = require('./localIntelligence');

const INTERPRETATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    objective: { type: 'string' },
    explicitRequirements: { type: 'array', items: { type: 'string' } },
    inferredRequirements: { type: 'array', items: { type: 'string' } },
    implementationGuidance: { type: 'array', items: { type: 'string' } },
    constraints: { type: 'array', items: { type: 'string' } },
    rejectedBehaviors: { type: 'array', items: { type: 'string' } },
    acceptanceCriteria: { type: 'array', items: { type: 'string' } }
  },
  required: [
    'objective',
    'explicitRequirements',
    'inferredRequirements',
    'implementationGuidance',
    'constraints',
    'rejectedBehaviors',
    'acceptanceCriteria'
  ]
};

function safeError(error) {
  return String(error?.message || error || 'Unknown error').replace(/\s+/g, ' ').trim();
}

function parseJsonObject(text = '') {
  const raw = String(text || '').trim();
  if (!raw) throw new Error('AI Prompt Intelligence returned an empty response.');
  const candidates = [raw, raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()];
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) candidates.push(raw.slice(firstBrace, lastBrace + 1));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {
      // Try the next candidate.
    }
  }
  throw new Error('AI Prompt Intelligence returned invalid structured JSON.');
}

function modelReasoningEffort(model = {}) {
  const supported = Array.isArray(model.supportedReasoningEfforts) ? model.supportedReasoningEfforts : [];
  const values = supported.map((item) => item?.reasoningEffort).filter(Boolean);
  if (values.includes('medium')) return 'medium';
  if (values.includes('low')) return 'low';
  return model.defaultReasoningEffort || values[0] || null;
}

function visibleModels(data = []) {
  return (Array.isArray(data) ? data : []).filter((item) => item && !item.hidden);
}

function toModelChoice(model = {}) {
  const id = model?.model || model?.id || '';
  return {
    id,
    label: model?.displayName || id || 'Unknown model',
    isDefault: Boolean(model?.isDefault)
  };
}

function selectModel(data = [], preferredId = '') {
  const visible = visibleModels(data);
  const preferred = String(preferredId || '').trim();
  if (preferred && preferred.toLowerCase() !== 'auto') {
    const match = visible.find((item) => (item?.model || item?.id || '') === preferred);
    if (match) return match;
  }
  return visible.find((item) => item.isDefault) || visible[0] || null;
}

function buildInterpretationInput(payload = {}) {
  const compact = {
    request: String(payload.intent || '').trim(),
    mode: payload.mode || 'update',
    taskSignals: Array.isArray(payload.taskTags) ? payload.taskTags.slice(0, 12) : [],
    projectSummary: String(payload.projectSummary || '').trim(),
    activeFile: String(payload.relativeFile || '').trim(),
    likelyRelevantFiles: Array.isArray(payload.relevantFiles) ? payload.relevantFiles.slice(0, 10) : [],
    decisionAuthority: String(payload.decisionAuthority || 'balanced')
  };

  return [
    'Interpret this rough builder request into a precise engineering brief.',
    '',
    'Rules:',
    '- Do not implement code and do not inspect the filesystem or call tools.',
    '- Preserve the user’s meaning, especially negative instructions such as “do not”, “not like that”, “instead of”, “keep”, “same”, “only”, and “without”.',
    '- Separate explicit requirements from low-risk inferred requirements.',
    '- Infer only details that are normally necessary to make the requested change usable and technically coherent.',
    '- Do not invent product features, exact libraries, frameworks, file paths, or architecture unless the supplied project context supports them.',
    '- Prefer the existing project architecture and styling conventions.',
    '- Convert vague visual/motion language into concrete implementation guidance and observable acceptance criteria.',
    '- Rejected behaviors should describe what the user explicitly does not want.',
    '- Keep each list item concise and implementation-oriented.',
    '- Return only the structured result required by the output schema.',
    '',
    'Builder context:',
    JSON.stringify(compact, null, 2)
  ].join('\n');
}

class PromptIntelligenceService {
  constructor(options = {}) {
    this.resolveBinary = options.resolveBinary;
    this.spawnFn = options.spawnFn || nodeSpawn;
    this.version = options.version || '0.0.0';
    this.onChange = options.onChange || (() => {});
    this.requestTimeoutMs = Number(options.requestTimeoutMs) || 15000;
    this.turnTimeoutMs = Number(options.turnTimeoutMs) || 60000;
    this.process = null;
    this.buffer = '';
    this.requestId = 3000;
    this.pending = new Map();
    this.turnCollectors = new Map();
    this.earlyTurnEvents = new Map();
    this.startPromise = null;
    this.intentionalStop = false;
    this.tempDir = '';
    this.pendingLoginId = '';
    this.models = [];
    this.state = {
      status: 'idle',
      connected: false,
      accountType: '',
      planType: '',
      loginPending: false,
      modelId: '',
      modelName: '',
      models: [],
      source: '',
      error: ''
    };
  }

  getState() {
    return { ...this.state, models: Array.isArray(this.state.models) ? this.state.models.map((item) => ({ ...item })) : [] };
  }

  emit(next = {}) {
    this.state = { ...this.state, ...next };
    try { this.onChange(this.getState()); } catch { /* UI refresh must not break intelligence. */ }
  }

  write(message) {
    if (!this.process?.stdin || this.process.stdin.destroyed) throw new Error('Codex app-server is not connected.');
    this.process.stdin.write(`${JSON.stringify(message)}\n`);
  }

  notify(method, params) {
    const message = { method };
    if (params !== undefined) message.params = params;
    this.write(message);
  }

  request(method, params, timeoutMs = this.requestTimeoutMs) {
    const id = ++this.requestId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out.`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer, method });
      try {
        const message = { method, id };
        if (params !== undefined) message.params = params;
        this.write(message);
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  async start() {
    if (this.startPromise) return this.startPromise;
    if (this.process && !this.process.killed && this.state.status !== 'unavailable') return this.getState();

    this.startPromise = this.startInternal().finally(() => { this.startPromise = null; });
    return this.startPromise;
  }

  async startInternal() {
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
      this.emit({ status: 'unavailable', error: `Unable to start Codex app-server: ${safeError(error)}` });
      return this.getState();
    }

    this.process = child;
    this.buffer = '';
    child.stdout?.setEncoding?.('utf8');
    child.stdout?.on('data', (chunk) => this.handleStdout(chunk));
    child.stderr?.on('data', () => { /* Drain diagnostics without exposing auth/runtime internals. */ });
    child.on?.('error', (error) => this.handleProcessFailure(`Codex app-server unavailable: ${safeError(error)}`));
    child.on?.('exit', (code) => {
      if (!this.intentionalStop) this.handleProcessFailure(`Codex Prompt Intelligence connection closed${Number.isInteger(code) ? ` (exit ${code})` : ''}.`);
    });

    try {
      await this.request('initialize', {
        clientInfo: {
          name: 'codex_builder_prompt_intelligence',
          title: 'Codex Builder Prompt Intelligence',
          version: this.version
        },
        capabilities: {
          optOutNotificationMethods: [
            'thread/started',
            'turn/started',
            'item/started',
            'item/agentMessage/delta',
            'item/reasoning/summaryTextDelta',
            'item/reasoning/textDelta',
            'thread/tokenUsage/updated'
          ]
        }
      }, 15000);
      this.notify('initialized', {});
      await this.refreshAccount();
      return this.getState();
    } catch (error) {
      this.handleProcessFailure(`Prompt Intelligence initialization failed: ${safeError(error)}`);
      return this.getState();
    }
  }

  handleProcessFailure(message) {
    const child = this.process;
    this.process = null;
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error(message));
      this.pending.delete(id);
    }
    for (const collector of this.turnCollectors.values()) collector.reject(new Error(message));
    this.turnCollectors.clear();
    this.emit({ status: 'unavailable', connected: false, loginPending: false, error: message });
    try { child?.kill?.(); } catch { /* ignore */ }
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
    if (message.id !== undefined && this.pending.has(message.id)) {
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(message.error.message || `${pending.method} failed.`));
      else pending.resolve(message.result);
      return;
    }

    const method = message.method;
    const params = message.params || {};
    if (!method) return;

    if (method === 'account/login/completed') {
      if (!this.pendingLoginId || !params.loginId || params.loginId === this.pendingLoginId) {
        this.pendingLoginId = '';
        if (params.success) {
          this.emit({ loginPending: false, error: '' });
          this.refreshAccount().catch((error) => this.emit({ error: safeError(error) }));
        } else {
          this.emit({ loginPending: false, error: params.error || 'ChatGPT sign-in was not completed.' });
        }
      }
      return;
    }

    if (method === 'account/updated') {
      this.refreshAccount().catch(() => {});
      return;
    }

    if (method === 'item/completed' || method === 'turn/completed' || method === 'error') {
      this.routeTurnEvent(method, params);
    }
  }

  routeTurnEvent(method, params) {
    const turnId = params.turnId || params.turn?.id || '';
    if (!turnId) return;
    const collector = this.turnCollectors.get(turnId);
    if (!collector) {
      const events = this.earlyTurnEvents.get(turnId) || [];
      events.push({ method, params });
      this.earlyTurnEvents.set(turnId, events.slice(-20));
      return;
    }
    this.applyTurnEvent(collector, method, params);
  }

  applyTurnEvent(collector, method, params) {
    if (method === 'item/completed') {
      const item = params.item || {};
      if (item.type === 'agentMessage' && item.text) collector.texts.push(String(item.text));
      return;
    }
    if (method === 'error') {
      const message = params.message || params.error?.message || 'Codex turn failed.';
      collector.reject(new Error(message));
      return;
    }
    if (method === 'turn/completed') {
      const status = params.turn?.status;
      if (status && status !== 'completed') {
        collector.reject(new Error(`Codex Prompt Intelligence turn ended with status: ${status}.`));
      } else {
        collector.resolve(collector.texts.join('\n').trim());
      }
    }
  }

  waitForTurn(turnId) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.turnCollectors.delete(turnId);
        reject(new Error('AI Prompt Intelligence timed out.'));
      }, this.turnTimeoutMs);
      const collector = {
        texts: [],
        resolve: (value) => {
          clearTimeout(timer);
          this.turnCollectors.delete(turnId);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          this.turnCollectors.delete(turnId);
          reject(error);
        }
      };
      this.turnCollectors.set(turnId, collector);
      const early = this.earlyTurnEvents.get(turnId) || [];
      this.earlyTurnEvents.delete(turnId);
      for (const event of early) this.applyTurnEvent(collector, event.method, event.params);
    });
  }

  async refreshAccount(preferredModelId = 'auto') {
    await this.ensureRunning();
    const result = await this.request('account/read', {});
    const account = result?.account || null;
    const connected = account?.type === 'chatgpt';
    this.emit({
      status: 'ready',
      connected,
      accountType: account?.type || '',
      planType: connected ? (account.planType || 'unknown') : '',
      error: connected || !account ? '' : 'AI Enhanced requires a ChatGPT-authenticated Codex account.'
    });
    if (connected) await this.refreshModels(preferredModelId);
    else this.emit({ modelId: '', modelName: '', models: [] });
    return this.getState();
  }

  async refreshModels(preferredModelId = 'auto') {
    const result = await this.request('model/list', {});
    this.models = Array.isArray(result?.data) ? result.data : [];
    const visible = visibleModels(this.models);
    const model = selectModel(visible, preferredModelId);
    this.emit({
      modelId: model?.model || model?.id || '',
      modelName: model?.displayName || model?.model || model?.id || '',
      models: visible.map(toModelChoice)
    });
    return model;
  }

  async beginChatGptLogin() {
    await this.ensureRunning();
    const current = await this.request('account/read', {});
    if (current?.account?.type === 'chatgpt') {
      await this.refreshAccount();
      return { alreadyConnected: true };
    }
    const result = await this.request('account/login/start', { type: 'chatgpt' }, 20000);
    if (!result?.authUrl || !result?.loginId) throw new Error('Codex did not return a ChatGPT sign-in URL.');
    this.pendingLoginId = result.loginId;
    this.emit({ loginPending: true, error: '' });
    return { authUrl: result.authUrl, loginId: result.loginId };
  }

  async ensureRunning() {
    if (!this.process || this.process.killed || this.state.status === 'unavailable') await this.start();
    if (!this.process || this.process.killed) throw new Error(this.state.error || 'Codex app-server is unavailable.');
  }

  ensureTempDir() {
    if (this.tempDir && fs.existsSync(this.tempDir)) return this.tempDir;
    this.tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-builder-intel-'));
    return this.tempDir;
  }

  async runTurn(threadId, inputText, model, withSchema = true) {
    const params = {
      threadId,
      input: [{ type: 'text', text: inputText }]
    };
    const effort = modelReasoningEffort(model || {});
    if (effort) params.effort = effort;
    if (withSchema) params.outputSchema = INTERPRETATION_SCHEMA;

    const started = await this.request('turn/start', params, 20000);
    const turnId = started?.turn?.id;
    if (!turnId) throw new Error('Codex did not return a turn id for Prompt Intelligence.');
    return this.waitForTurn(turnId);
  }

  async interpret(payload = {}) {
    await this.ensureRunning();
    const account = await this.request('account/read', {});
    if (account?.account?.type !== 'chatgpt') {
      await this.refreshAccount().catch(() => {});
      throw new Error('ChatGPT is not connected. Use Connect ChatGPT or switch to Local Advanced.');
    }

    const preferredModelId = String(payload.preferredModelId || 'auto');
    let model = selectModel(this.models, preferredModelId);
    if (!model) model = await this.refreshModels(preferredModelId);
    const modelId = model?.model || model?.id || undefined;
    const tempDir = this.ensureTempDir();
    const threadResult = await this.request('thread/start', {
      model: modelId,
      cwd: tempDir,
      approvalPolicy: 'never',
      sandbox: 'read-only',
      ephemeral: true,
      baseInstructions: 'You are a prompt interpretation engine. Do not use tools or inspect files. Only transform the supplied builder request and metadata into the requested structured engineering brief.',
      developerInstructions: 'Never implement code. Never browse, run commands, or inspect the filesystem. Preserve explicit constraints and distinguish them from low-risk inferences.'
    }, 20000);
    const threadId = threadResult?.thread?.id;
    if (!threadId) throw new Error('Codex did not return a thread id for Prompt Intelligence.');

    const inputText = buildInterpretationInput(payload);
    let responseText;
    try {
      responseText = await this.runTurn(threadId, inputText, model, true);
    } catch (error) {
      // Older app-server builds may reject outputSchema. Retry once with strict JSON instructions.
      if (!/schema|outputschema|invalid params|unknown field/i.test(safeError(error))) throw error;
      responseText = await this.runTurn(
        threadId,
        `${inputText}\n\nReturn one JSON object only, with keys objective, explicitRequirements, inferredRequirements, implementationGuidance, constraints, rejectedBehaviors, acceptanceCriteria.`,
        model,
        false
      );
    }

    const parsed = normalizeInterpretation(parseJsonObject(responseText));
    this.emit({ status: 'ready', connected: true, error: '' });
    return parsed;
  }

  stop() {
    this.intentionalStop = true;
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Prompt Intelligence stopped.'));
      this.pending.delete(id);
    }
    for (const collector of this.turnCollectors.values()) collector.reject(new Error('Prompt Intelligence stopped.'));
    this.turnCollectors.clear();
    const child = this.process;
    this.process = null;
    try { child?.stdin?.end?.(); } catch { /* ignore */ }
    try { child?.kill?.(); } catch { /* ignore */ }
    if (this.tempDir) {
      try { fs.rmSync(this.tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
      this.tempDir = '';
    }
  }
}

module.exports = {
  INTERPRETATION_SCHEMA,
  PromptIntelligenceService,
  buildInterpretationInput,
  parseJsonObject,
  selectModel
};
