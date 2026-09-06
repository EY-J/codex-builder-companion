const vscode = require('vscode');

function nonce() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let value = '';
  for (let i = 0; i < 24; i += 1) value += chars.charAt(Math.floor(Math.random() * chars.length));
  return value;
}

class SidebarProvider {
  constructor(extensionUri, services) {
    this.extensionUri = extensionUri;
    this.services = services;
    this.view = undefined;
  }

  async resolveWebviewView(webviewView) {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };
    webviewView.webview.html = this.html(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (message) => {
      try {
        switch (message.type) {
          case 'ready':
            await this.refreshState();
            this.services.ensureUsage?.();
            this.services.ensureIntelligence?.();
            break;
          case 'build':
            await this.services.buildPrompt(message.intent || '');
            break;
          case 'copy': {
            const result = await this.services.copyPrompt(message.intent || '');
            if (result) await this.refreshState();
            break;
          }
          case 'setIntelligenceMode':
            await this.services.setIntelligenceMode?.(message.value);
            await this.refreshState();
            break;
          case 'setIntelligenceModel':
            await this.services.setIntelligenceModel?.(message.value);
            await this.refreshState();
            break;
          case 'connectChatGPT':
            await this.services.connectChatGPT?.();
            await this.refreshState();
            break;
          case 'refreshIntelligence':
            await this.services.refreshIntelligence?.();
            await this.refreshState();
            break;
          case 'refreshUsage':
            await this.services.refreshUsage?.();
            await this.refreshState();
            break;
          case 'refreshBrain':
            await this.services.refreshBrain();
            await this.refreshState();
            break;
          case 'generateAgents':
            await this.services.generateAgents();
            await this.refreshState();
            break;
          case 'openProfile':
            await this.services.openProfile();
            break;
          case 'openDecisions':
            await this.services.openDecisions();
            break;
          case 'clearHistory':
            await this.services.clearHistory();
            await this.refreshState();
            break;
          case 'toggleFavorite':
            await this.services.toggleFavorite(message.id);
            await this.refreshState();
            break;
          case 'setAuthority':
            await this.services.setAuthority(message.value);
            await this.refreshState();
            break;
          case 'setBudget':
            await this.services.setBudget(message.value);
            await this.refreshState();
            break;
          default:
            break;
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Codex Builder: ${error.message || error}`);
      }
    });
  }

  async refreshState() {
    if (!this.view) return;
    const state = await this.services.getState();
    this.view.webview.postMessage({ type: 'state', state });
  }

  html(webview) {
    const n = nonce();
    const csp = `default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${n}';`;
    return `<!doctype html>
<html>
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 12px; color: var(--vscode-foreground); background: var(--vscode-sideBar-background); font-family: var(--vscode-font-family); font-size: 12px; }
  h3 { font-size: 12px; margin: 0 0 6px; }
  .section { padding: 10px; margin-bottom: 10px; border: 1px solid var(--vscode-panel-border); border-radius: 8px; background: var(--vscode-editor-background); }
  textarea { width: 100%; min-height: 118px; resize: vertical; padding: 9px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); border-radius: 6px; font-family: inherit; }
  select, button { font: inherit; }
  select { width: 100%; min-height: 31px; padding: 6px 8px; color: var(--vscode-dropdown-foreground); background: var(--vscode-dropdown-background); border: 1px solid var(--vscode-dropdown-border); border-radius: 6px; }
  button { border: 1px solid var(--vscode-button-border, var(--vscode-panel-border)); border-radius: 6px; padding: 7px 10px; cursor: pointer; color: var(--vscode-button-foreground, var(--vscode-foreground)); background: color-mix(in srgb, var(--vscode-button-background, transparent) 28%, transparent); }
  button:hover { background: color-mix(in srgb, var(--vscode-button-background, transparent) 42%, transparent); }
  button.secondary { color: var(--vscode-button-secondaryForeground, var(--vscode-foreground)); background: transparent; border-color: var(--vscode-panel-border); }
  button.secondary:hover { background: var(--vscode-list-hoverBackground); border-color: var(--vscode-focusBorder); }
  button.ghost { background: transparent; color: var(--vscode-descriptionForeground); border-color: var(--vscode-panel-border); }
  button:disabled { opacity: .6; cursor: default; }
  .taskHeader { display:flex; align-items:center; justify-content:space-between; gap:8px; }
  .builderHint { margin: 0 0 8px; color: var(--vscode-descriptionForeground); line-height: 1.4; }
  .label { margin: 8px 0 4px; color: var(--vscode-descriptionForeground); }
  .muted { color: var(--vscode-descriptionForeground); line-height: 1.4; }
  .row { display:flex; align-items:center; gap:8px; }
  .spaceBetween { display:flex; align-items:center; justify-content:space-between; gap:8px; }
  .hidden { display:none !important; }
  .intelWrap { margin-top: 10px; border: 1px solid var(--vscode-panel-border); border-radius: 8px; overflow: hidden; background: var(--vscode-sideBar-background); }
  .intelHead { display:flex; align-items:center; justify-content:space-between; gap:8px; padding: 9px 10px; border-bottom: 1px solid var(--vscode-panel-border); }
  .intelBadge { font-size: 11px; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--vscode-panel-border); color: var(--vscode-descriptionForeground); }
  .intelModes { padding: 8px; display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap:8px; }
  .intelModeCard { display:flex; gap:6px; align-items:flex-start; width:100%; min-width:0; padding:8px 7px; border:1px solid var(--vscode-panel-border); border-radius:7px; cursor:pointer; background: var(--vscode-editor-background); overflow:hidden; }
  .intelModeCard > div { min-width:0; }
  .intelModeCard:hover { border-color: var(--vscode-focusBorder); background: var(--vscode-list-hoverBackground); }
  .intelModeCard input { margin: 2px 0 0; }
  .intelModeName { min-width:0; font-weight:600; line-height:1.25; white-space:normal; overflow-wrap:anywhere; word-break:normal; }
  .intelModeDesc { display:none; }
  .intelMeta { padding: 0 10px 10px; display:grid; gap:8px; }
  .statusCard { padding: 9px; border: 1px solid var(--vscode-panel-border); border-radius: 7px; background: var(--vscode-editor-background); }
  .statusLine { display:flex; align-items:center; gap:6px; line-height:1.35; overflow-wrap:anywhere; }
  .dot { width: 8px; height: 8px; border-radius: 999px; background: var(--vscode-descriptionForeground); flex: 0 0 auto; }
  .dot.live { background: var(--vscode-testing-iconPassed, #4ec9b0); }
  .dot.warn { background: var(--vscode-charts-yellow, #d7ba7d); }
  .dot.error { background: var(--vscode-errorForeground); }
  .intelActions { display:grid; grid-template-columns: 1fr 1fr; gap:8px; }
  .actionStack { display:grid; gap:8px; margin-top: 10px; }
  .actionStack button { width:100%; min-height:36px; font-weight:600; }
  .buttonNote { margin-top: 4px; font-size: 11px; color: var(--vscode-descriptionForeground); }
  .loadingBar { display:none; margin-top:10px; padding:9px; border:1px solid var(--vscode-panel-border); border-radius:7px; background: var(--vscode-sideBar-background); }
  .loadingBar.active { display:block; }
  .spinnerRow { display:flex; align-items:center; gap:8px; }
  .spinner { width:14px; height:14px; border-radius:999px; border:2px solid var(--vscode-panel-border); border-top-color: var(--vscode-progressBar-background, var(--vscode-focusBorder)); animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .projectHeader { display: grid; gap: 4px; margin-bottom: 9px; }
  .projectName { font-size: 12px; font-weight: 600; color: var(--vscode-descriptionForeground); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .projectMeta { display: grid; gap: 0; border: 1px solid var(--vscode-panel-border); border-radius: 6px; overflow: hidden; background: var(--vscode-sideBar-background); }
  .projectMetaRow { display: grid; grid-template-columns: minmax(58px, 0.75fr) minmax(0, 1.6fr); gap: 9px; padding: 6px 8px; border-top: 1px solid var(--vscode-panel-border); align-items: start; }
  .projectMetaRow:first-child { border-top: 0; }
  .projectMetaLabel { color: var(--vscode-descriptionForeground); font-size: 11px; }
  .projectMetaValue { min-width: 0; color: var(--vscode-foreground); line-height: 1.35; overflow-wrap: anywhere; }
  .projectActions { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 9px; }
  .projectAction { min-height: 30px; padding: 6px 8px; text-align: center; }
  .usageHeader { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px; }
  .usageHeader h3 { margin: 0; }
  .usageRefresh { padding: 4px 8px; min-height: 25px; font-size: 11px; }
  .usageSource { margin-bottom: 9px; font-size: 11px; }
  .usageWindow { padding: 8px 0; border-top: 1px solid var(--vscode-panel-border); }
  .usageWindow:first-child { border-top: 0; }
  .usageWindowTop { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
  .usageWindowLabel { font-weight: 600; }
  .usageRemaining { font-size: 13px; font-weight: 700; }
  .usageTrack { height: 6px; margin: 7px 0 5px; overflow: hidden; border-radius: 999px; background: var(--vscode-progressBar-background, var(--vscode-panel-border)); opacity: .55; }
  .usageFill { height: 100%; border-radius: inherit; background: var(--vscode-testing-iconPassed, #4ec9b0); opacity: 1; }
  .usageReset { color: var(--vscode-descriptionForeground); font-size: 11px; }
  .usageStatus { color: var(--vscode-descriptionForeground); line-height: 1.4; padding: 4px 0; }
  .usageLive { color: var(--vscode-testing-iconPassed, #4ec9b0); font-weight: 600; }
  .usageError { color: var(--vscode-errorForeground); }
  .metric { font-size: 17px; font-weight: 700; }
  .metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .metricCard { padding: 7px; border: 1px solid var(--vscode-panel-border); border-radius: 5px; }
  .historyItem { border-top: 1px solid var(--vscode-panel-border); padding: 7px 0; }
  .historyItem:first-child { border-top: 0; }
  .historyText { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .historyActions { display: flex; gap: 5px; margin-top: 4px; }
  .historyActions button { padding: 3px 6px; }
  @media (max-width: 225px) {
    .intelModes { grid-template-columns: 1fr; }
  }
</style>
</head>
<body>
  <div class="section">
    <div class="taskHeader">
      <h3>Task</h3>
    </div>
    <p class="builderHint">Describe only what you want built or changed. Build opens the full prompt preview in the editor.</p>
    <textarea id="intent" placeholder="Example: Create a secure local password vault with SQLite, categories and tags…"></textarea>

    <div class="intelWrap">
      <div class="intelHead">
        <div class="row"><strong>Prompt Intelligence</strong></div>
        <span id="intelModeBadge" class="intelBadge">Local Advanced</span>
      </div>
      <div class="intelModes">
        <label class="intelModeCard">
          <input type="radio" name="intelligenceMode" value="local" id="intelLocal" />
          <div>
            <div class="intelModeName">Local Advanced</div>
            <div class="intelModeDesc">Fast local requirement decomposition, constraints, implementation guidance, and acceptance criteria.</div>
          </div>
        </label>
        <label class="intelModeCard">
          <input type="radio" name="intelligenceMode" value="ai" id="intelAi" />
          <div>
            <div class="intelModeName">AI Enhanced</div>
            <div class="intelModeDesc">Uses your ChatGPT-connected Codex runtime for deeper prompt understanding.</div>
          </div>
        </label>
      </div>
      <div class="intelMeta">
        <div class="statusCard">
          <div id="intelStatusLine" class="statusLine"><span id="intelStatusDot" class="dot"></span><span id="intelStatusText">Checking Codex / ChatGPT account…</span></div>
        </div>
        <div>
          <div class="label" style="margin-top:0">AI model</div>
          <select id="intelModel"></select>
        </div>
        <div class="intelActions">
          <button id="connectChatGPTBtn" class="secondary">Connect</button>
          <button id="refreshIntelBtn" class="secondary">Refresh</button>
        </div>
      </div>
    </div>

    <div id="loadingBar" class="loadingBar">
      <div class="spinnerRow"><span class="spinner"></span><div><strong id="loadingTitle">Building prompt…</strong><div id="loadingDetail" class="buttonNote">Please wait while Builder Companion processes your request.</div></div></div>
    </div>

    <div class="label">Decision authority</div>
    <select id="authority">
      <option value="conservative">Conservative</option>
      <option value="balanced">Balanced</option>
      <option value="autonomous">Autonomous — fewest follow-ups</option>
    </select>
    <div class="label">Context budget</div>
    <select id="budget">
      <option value="economy">Economy — up to 3 paths</option>
      <option value="balanced">Balanced — up to 6 paths</option>
      <option value="deep">Deep — up to 10 paths</option>
    </select>
    <div class="actionStack">
      <button id="buildBtn">Build Prompt</button>
      <button id="copyBtn" class="secondary">Copy for Codex</button>
    </div>
  </div>

  <div class="section">
    <div class="projectHeader">
      <h3 style="margin:0">Project Brain</h3>
      <div id="projectName" class="projectName">Project: No workspace</div>
    </div>
    <div id="projectMeta" class="projectMeta"></div>
    <div id="projectEmpty" class="muted hidden">Project Brain will infer stack metadata locally when a workspace is open.</div>
    <div class="projectActions">
      <button id="brainBtn" class="projectAction secondary">Refresh</button>
      <button id="agentsBtn" class="projectAction secondary">AGENTS.md</button>
      <button id="profileBtn" class="projectAction secondary">Profile</button>
      <button id="decisionsBtn" class="projectAction secondary">Decisions</button>
    </div>
  </div>

  <div class="section">
    <div class="usageHeader">
      <h3>Codex Usage</h3>
      <button id="codexUsageRefreshBtn" class="secondary usageRefresh">Refresh</button>
    </div>
    <div class="muted usageSource">Official Codex rate-limit data · auto-refreshes</div>
    <div id="codexUsageStatus" class="usageStatus">Connecting to Codex…</div>
    <div id="codexUsageWindows"></div>
    <div id="codexUsageUpdated" class="muted"></div>
  </div>

  <div class="section">
    <h3>Local Usage</h3>
    <div class="muted">Estimates only — not Codex billing data.</div>
    <div class="metrics">
      <div class="metricCard"><div id="statPrompts" class="metric">0</div><div class="muted">copied prompts</div></div>
      <div class="metricCard"><div id="statAvg" class="metric">0</div><div class="muted">avg est. tokens</div></div>
      <div class="metricCard"><div id="statTokens" class="metric">0</div><div class="muted">total est. tokens</div></div>
      <div class="metricCard"><div id="statFeatures" class="metric">0</div><div class="muted">one-shot features</div></div>
    </div>
  </div>

  <div class="section">
    <div class="spaceBetween"><h3>History & Favorites</h3><button id="clearHistoryBtn" class="secondary">Clear</button></div>
    <div id="history" class="muted">No copied prompts yet.</div>
  </div>

<script nonce="${n}">
  const vscode = acquireVsCodeApi();
  const el = (id) => document.getElementById(id);
  const intent = el('intent');
  const loadingBar = el('loadingBar');
  const loadingTitle = el('loadingTitle');
  const loadingDetail = el('loadingDetail');
  const buildBtn = el('buildBtn');
  const copyBtn = el('copyBtn');
  const intelModel = el('intelModel');
  buildBtn.addEventListener('click', () => vscode.postMessage({ type: 'build', intent: intent.value }));
  copyBtn.addEventListener('click', () => vscode.postMessage({ type: 'copy', intent: intent.value }));
  el('codexUsageRefreshBtn').addEventListener('click', () => vscode.postMessage({ type: 'refreshUsage' }));
  el('brainBtn').addEventListener('click', () => vscode.postMessage({ type: 'refreshBrain' }));
  el('agentsBtn').addEventListener('click', () => vscode.postMessage({ type: 'generateAgents' }));
  el('profileBtn').addEventListener('click', () => vscode.postMessage({ type: 'openProfile' }));
  el('decisionsBtn').addEventListener('click', () => vscode.postMessage({ type: 'openDecisions' }));
  el('clearHistoryBtn').addEventListener('click', () => vscode.postMessage({ type: 'clearHistory' }));
  el('authority').addEventListener('change', (e) => vscode.postMessage({ type: 'setAuthority', value: e.target.value }));
  el('budget').addEventListener('change', (e) => vscode.postMessage({ type: 'setBudget', value: e.target.value }));
  el('intelLocal').addEventListener('change', (e) => { if (e.target.checked) vscode.postMessage({ type: 'setIntelligenceMode', value: 'local' }); });
  el('intelAi').addEventListener('change', (e) => { if (e.target.checked) vscode.postMessage({ type: 'setIntelligenceMode', value: 'ai' }); });
  el('connectChatGPTBtn').addEventListener('click', () => vscode.postMessage({ type: 'connectChatGPT' }));
  el('refreshIntelBtn').addEventListener('click', () => vscode.postMessage({ type: 'refreshIntelligence' }));
  intelModel.addEventListener('change', (e) => vscode.postMessage({ type: 'setIntelligenceModel', value: e.target.value }));

  function setBusy(state) {
    const busy = Boolean(state?.busy);
    buildBtn.disabled = busy;
    copyBtn.disabled = busy;
    intent.disabled = busy;
    intelModel.disabled = busy || el('intelLocal').checked;
    loadingBar.classList.toggle('active', busy);
    if (busy) {
      const action = state?.action === 'copy' ? 'Copying prompt…' : 'Building prompt…';
      loadingTitle.textContent = action;
      loadingDetail.textContent = state?.detail || 'Please wait while Builder Companion processes your request.';
    }
  }

  function formatReset(resetsAt) {
    const seconds = Number(resetsAt) || 0;
    if (!seconds) return 'Reset time unavailable';
    const date = new Date(seconds * 1000);
    if (Number.isNaN(date.getTime())) return 'Reset time unavailable';
    return 'Resets ' + date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function renderCodexUsage(usage) {
    const status = el('codexUsageStatus');
    const windows = el('codexUsageWindows');
    const updated = el('codexUsageUpdated');
    windows.innerHTML = '';
    updated.textContent = '';
    const value = usage || { status: 'idle', windows: [] };
    const rows = Array.isArray(value.windows) ? value.windows : [];

    if (value.status === 'live' && rows.length) {
      status.className = 'usageStatus usageLive';
      status.textContent = '● Live';
      rows.forEach((item) => {
        const wrap = document.createElement('div'); wrap.className = 'usageWindow';
        const top = document.createElement('div'); top.className = 'usageWindowTop';
        const label = document.createElement('div'); label.className = 'usageWindowLabel'; label.textContent = (item.label || 'Usage') + ' limit';
        const remaining = document.createElement('div'); remaining.className = 'usageRemaining'; remaining.textContent = String(item.remainingPercent ?? 0) + '% left';
        top.appendChild(label); top.appendChild(remaining); wrap.appendChild(top);
        const track = document.createElement('div'); track.className = 'usageTrack';
        const fill = document.createElement('div'); fill.className = 'usageFill'; fill.style.width = Math.max(0, Math.min(100, Number(item.remainingPercent) || 0)) + '%';
        track.appendChild(fill); wrap.appendChild(track);
        const reset = document.createElement('div'); reset.className = 'usageReset'; reset.textContent = formatReset(item.resetsAt); wrap.appendChild(reset);
        windows.appendChild(wrap);
      });
      if (value.lastUpdatedAt) {
        const d = new Date(value.lastUpdatedAt);
        updated.textContent = 'Updated ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
      }
      return;
    }

    if (value.status === 'connecting') {
      status.className = 'usageStatus';
      status.textContent = 'Reading current Codex limits…';
      return;
    }

    if ((value.status === 'stale' || value.status === 'unavailable') && rows.length) {
      status.className = 'usageStatus';
      status.textContent = 'Last known Codex usage';
      return;
    }

    status.className = value.status === 'unavailable' ? 'usageStatus usageError' : 'usageStatus';
    status.textContent = value.error || 'Live Codex usage is not available yet. Click Refresh to retry.';
  }

  function renderIntelligence(state) {
    const mode = state.promptIntelligenceMode || 'local';
    const intel = state.promptIntelligence || {};
    const selectedModel = state.promptIntelligenceModel || 'auto';
    el('intelLocal').checked = mode === 'local';
    el('intelAi').checked = mode === 'ai';
    el('intelModeBadge').textContent = mode === 'ai' ? 'AI Enhanced' : 'Local Advanced';

    const statusDot = el('intelStatusDot');
    const statusText = el('intelStatusText');
    statusDot.className = 'dot';
    let text = 'Local Advanced runs entirely in the extension.';
    if (mode === 'ai') {
      if (intel.loginPending) {
        statusDot.classList.add('warn');
        text = 'Finish ChatGPT sign-in in your browser, then click Refresh.';
      } else if (intel.connected) {
        statusDot.classList.add('live');
        const parts = ['ChatGPT connected'];
        if (intel.planType) parts.push(String(intel.planType).toUpperCase());
        if (intel.modelName) parts.push(intel.modelName);
        text = parts.join(' · ');
      } else if (intel.status === 'connecting') {
        statusDot.classList.add('warn');
        text = 'Connecting to Codex app-server…';
      } else if (intel.error) {
        statusDot.classList.add('error');
        text = intel.error;
      } else {
        statusDot.classList.add('warn');
        text = 'AI Enhanced requires a ChatGPT-connected Codex account.';
      }
    }
    statusText.textContent = text;

    const models = Array.isArray(intel.models) ? intel.models : [];
    intelModel.innerHTML = '';
    const autoOption = document.createElement('option');
    autoOption.value = 'auto';
    autoOption.textContent = 'Auto — use default model';
    intelModel.appendChild(autoOption);
    models.forEach((item) => {
      const option = document.createElement('option');
      option.value = item.id || '';
      option.textContent = item.isDefault ? (String(item.label || '') + ' (default)') : String(item.label || '');
      intelModel.appendChild(option);
    });
    intelModel.value = selectedModel;
    if (intelModel.value !== selectedModel) intelModel.value = 'auto';
    intelModel.disabled = mode !== 'ai' || Boolean(state.promptBuildState?.busy);
    el('connectChatGPTBtn').disabled = Boolean(state.promptBuildState?.busy);
    el('refreshIntelBtn').disabled = Boolean(state.promptBuildState?.busy);
  }

  function renderState(state) {
    el('authority').value = state.authority || 'balanced';
    el('budget').value = state.contextBudget || 'balanced';
    el('projectName').textContent = state.projectName ? ('Project: ' + state.projectName) : 'Project: No workspace';
    const details = Array.isArray(state.projectDetails) ? state.projectDetails : [];
    const meta = el('projectMeta');
    const empty = el('projectEmpty');
    meta.innerHTML = '';
    if (!details.length) {
      meta.classList.add('hidden');
      empty.classList.remove('hidden');
    } else {
      meta.classList.remove('hidden');
      empty.classList.add('hidden');
      details.forEach((item) => {
        const row = document.createElement('div'); row.className = 'projectMetaRow';
        const label = document.createElement('div'); label.className = 'projectMetaLabel'; label.textContent = item.label || '';
        const value = document.createElement('div'); value.className = 'projectMetaValue'; value.textContent = item.value || '';
        row.appendChild(label); row.appendChild(value); meta.appendChild(row);
      });
    }
    renderIntelligence(state);
    setBusy(state.promptBuildState || { busy: false });
    renderCodexUsage(state.codexUsage);
    const stats = state.stats || {};
    el('statPrompts').textContent = stats.prompts || 0;
    el('statAvg').textContent = stats.averageEstimatedPromptTokens || 0;
    el('statTokens').textContent = stats.estimatedPromptTokens || 0;
    el('statFeatures').textContent = stats.oneShotFeatures || 0;
    const history = state.history || [];
    if (!history.length) { el('history').textContent = 'No copied prompts yet.'; return; }
    el('history').innerHTML = '';
    history.forEach((item) => {
      const wrap = document.createElement('div'); wrap.className = 'historyItem';
      const text = document.createElement('div'); text.className = 'historyText'; text.textContent = item.intent; wrap.appendChild(text);
      const meta = document.createElement('div'); meta.className = 'muted'; meta.textContent = (item.mode || '') + ' · ≈' + (item.promptTokens || 0) + ' tokens'; wrap.appendChild(meta);
      const actions = document.createElement('div'); actions.className = 'historyActions';
      const reuse = document.createElement('button'); reuse.className = 'secondary'; reuse.textContent = 'Reuse'; reuse.onclick = () => { intent.value = item.intent; intent.focus(); }; actions.appendChild(reuse);
      const fav = document.createElement('button'); fav.className = 'secondary'; fav.textContent = item.favorite ? '★' : '☆'; fav.title = 'Toggle favorite'; fav.onclick = () => vscode.postMessage({ type: 'toggleFavorite', id: item.id }); actions.appendChild(fav);
      wrap.appendChild(actions); el('history').appendChild(wrap);
    });
  }

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message.type === 'state') renderState(message.state);
  });
  vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
  }
}

module.exports = { SidebarProvider };
