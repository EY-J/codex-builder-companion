const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const manifest = require('./package.json');
const {
  detectMode,
  buildPrompt,
  sanitizeIntent,
  normalizeDecisionAuthority,
  cleanEditorFileContext
} = require('./src/promptBuilder');
const {
  analyzeProject,
  buildAgentsMarkdown,
  buildProjectContextSummary,
  buildProjectDisplayRows,
  defaultDecisions
} = require('./src/projectBrain');
const {
  classifyTask,
  rankRelevantFiles,
  extractImports,
  resolveImportPaths,
  estimateTokens,
  dedupeText,
  contextLimit,
  usageStats
} = require('./src/contextEngine');
const { SidebarProvider } = require('./src/sidebarProvider');
const { renderPromptPreviewHtml } = require('./src/previewView');
const { CodexUsageService, resolveCodexBinary } = require('./src/codexUsage');
const { PromptIntelligenceService } = require('./src/promptIntelligence');

const HISTORY_KEY = 'codexBuilder.promptHistory.v1';
const MAX_HISTORY = 25;
const brainCache = new Map();
let extensionContext;
let sidebarProvider;
let promptPreviewPanel;
let latestPreviewResult;
let codexUsageService;
let promptIntelligenceService;
let promptBuildState = { busy: false, action: '', detail: '' };

function config() {
  return vscode.workspace.getConfiguration('codexBuilder');
}

function getDecisionAuthority() {
  return normalizeDecisionAuthority(config().get('decisionAuthority', 'balanced'));
}

function getContextBudget() {
  const value = String(config().get('contextBudget', 'balanced')).toLowerCase();
  return ['economy', 'balanced', 'deep'].includes(value) ? value : 'balanced';
}

function getPromptIntelligenceMode() {
  const value = String(config().get('promptIntelligenceMode', 'local')).toLowerCase();
  return value === 'ai' ? 'ai' : 'local';
}

function getPromptIntelligenceModel() {
  const value = String(config().get('promptIntelligenceModel', 'auto')).trim();
  return value || 'auto';
}

async function setPromptIntelligenceModel(value) {
  const model = String(value || 'auto').trim() || 'auto';
  await config().update('promptIntelligenceModel', model, vscode.ConfigurationTarget.Global);
  try {
    await promptIntelligenceService?.refreshModels(model);
  } catch {
    /* Model list may be unavailable until the app-server/account is ready. */
  }
  await sidebarProvider?.refreshState();
}

function setPromptBuildBusy(busy, action = '', detail = '') {
  promptBuildState = { busy: Boolean(busy), action: String(action || ''), detail: String(detail || '') };
}

async function setPromptIntelligenceMode(value) {
  const mode = String(value || '').toLowerCase();
  if (!['local', 'ai'].includes(mode)) return;
  await config().update('promptIntelligenceMode', mode, vscode.ConfigurationTarget.Global);
  if (mode === 'ai') promptIntelligenceService?.start().catch(() => {});
  await sidebarProvider?.refreshState();
}

function activeWorkspaceFolder() {
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    const folder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
    if (folder) return folder;
  }
  return vscode.workspace.workspaceFolders?.[0];
}

function readJson(filePath, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function scanMaxFiles(budget) {
  if (budget === 'economy') return 600;
  if (budget === 'deep') return 2600;
  return 1400;
}

async function scanProject(folder, force = false) {
  if (!folder) return { folder: undefined, root: '', filePaths: [], profile: {}, packageJson: {} };
  const root = folder.uri.fsPath;
  const budget = getContextBudget();
  const cacheKey = `${root}:${budget}`;
  const cached = brainCache.get(cacheKey);
  if (!force && cached && Date.now() - cached.at < 30000) return cached.value;

  const include = new vscode.RelativePattern(
    folder,
    '**/*.{js,jsx,ts,tsx,mjs,cjs,json,css,scss,sass,html,md,sql,py,go,rs,java,cs,vue,svelte}'
  );
  const exclude = '**/{node_modules,.git,.next,dist,build,coverage,vendor,.venv,venv,out,target,.cache,.codex-builder}/**';
  const uris = await vscode.workspace.findFiles(include, exclude, scanMaxFiles(budget));
  const filePaths = uris
    .map((uri) => path.relative(root, uri.fsPath).replace(/\\/g, '/'))
    .filter((file) => !file.startsWith('../'));

  let rootEntries = [];
  try {
    rootEntries = fs.readdirSync(root);
  } catch {
    rootEntries = [];
  }
  const packageJson = readJson(path.join(root, 'package.json'), {});
  let readmeText = '';
  try {
    const handle = fs.openSync(path.join(root, 'README.md'), 'r');
    try {
      const buffer = Buffer.alloc(12000);
      readmeText = buffer.toString('utf8', 0, fs.readSync(handle, buffer, 0, buffer.length, 0));
    } finally {
      fs.closeSync(handle);
    }
  } catch {
    // A README is optional.
  }
  const profile = analyzeProject({ packageJson, fileNames: filePaths, rootEntries, readmeText, workspaceName: path.basename(root) });
  const value = { folder, root, filePaths, profile, packageJson };
  brainCache.set(cacheKey, { at: Date.now(), value });
  return value;
}

function readProjectDecisions(root, profile) {
  if (!root) return {};
  const decisionPath = path.join(root, '.codex-builder', 'decisions.json');
  const saved = readJson(decisionPath, null);
  return saved && typeof saved === 'object' ? saved : defaultDecisions(profile);
}

async function getProjectIntelligence(force = false) {
  const folder = activeWorkspaceFolder();
  const snapshot = await scanProject(folder, force);
  if (!snapshot.root) {
    return { ...snapshot, decisions: {}, projectSummary: '', verificationCommands: [] };
  }
  const decisions = readProjectDecisions(snapshot.root, snapshot.profile);
  const projectSummary = buildProjectContextSummary(snapshot.profile, decisions);
  return {
    ...snapshot,
    decisions,
    projectSummary,
    verificationCommands: snapshot.profile.verificationCommands || []
  };
}

async function persistProjectBrain() {
  const intelligence = await getProjectIntelligence(true);
  if (!intelligence.root) {
    vscode.window.showWarningMessage('Codex Builder: Open a project folder first.');
    return null;
  }
  const dir = path.join(intelligence.root, '.codex-builder');
  fs.mkdirSync(dir, { recursive: true });
  writeJson(path.join(dir, 'project-profile.json'), {
    ...intelligence.profile,
    generatedAt: new Date().toISOString(),
    note: 'Generated locally by Codex Builder Companion. No secret values are scanned or stored.'
  });
  const decisionsPath = path.join(dir, 'decisions.json');
  if (!fs.existsSync(decisionsPath)) writeJson(decisionsPath, defaultDecisions(intelligence.profile));
  vscode.window.showInformationMessage('Codex Builder: Project Brain refreshed locally.');
  return intelligence;
}

function editorContext(intelligence) {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !intelligence.root) {
    return { relativeFile: '', hasSelection: false, diagnostics: [], importedFiles: [] };
  }

  const document = editor.document;
  const folder = vscode.workspace.getWorkspaceFolder(document.uri);
  if (!folder || folder.uri.fsPath !== intelligence.root) {
    return { relativeFile: '', hasSelection: false, diagnostics: [], importedFiles: [] };
  }

  const rawRelative = path.relative(intelligence.root, document.uri.fsPath).replace(/\\/g, '/');
  const relativeFile = cleanEditorFileContext(rawRelative, document.isUntitled, document.uri.scheme);
  if (!relativeFile) return { relativeFile: '', hasSelection: false, diagnostics: [], importedFiles: [] };

  const hasSelection = !editor.selection.isEmpty;
  const diagnostics = vscode.languages
    .getDiagnostics(document.uri)
    .slice(0, 3)
    .map((diagnostic) => diagnostic.message.replace(/\s+/g, ' ').trim());

  let importedFiles = [];
  try {
    const text = document.getText().slice(0, 500000);
    importedFiles = resolveImportPaths(relativeFile, extractImports(text), intelligence.filePaths);
  } catch {
    importedFiles = [];
  }

  return { relativeFile, hasSelection, diagnostics, importedFiles };
}

function tagsForMode(tags, mode) {
  const result = [...tags];
  const map = {
    match: 'VISUAL_MATCH',
    fix: 'BUG_FIX',
    add: 'SMALL_FEATURE',
    feature: 'FEATURE',
    update: 'UI_CHANGE'
  };
  if (map[mode] && !result.includes(map[mode])) result.unshift(map[mode]);
  return result;
}

function modeLabel(mode) {
  return ({ match: 'Screenshot Match', fix: 'Fix', add: 'Quick Change', feature: 'One-Shot Feature', update: 'Update' })[mode] || 'Auto';
}

async function buildGeneratedPrompt(intent, forcedMode) {
  const cleanIntent = sanitizeIntent(intent || '');
  if (!cleanIntent) return null;

  const classification = classifyTask(cleanIntent);
  const mode = forcedMode || classification.mode || detectMode(cleanIntent);
  const intelligence = await getProjectIntelligence(false);
  const context = editorContext(intelligence);
  const budget = getContextBudget();
  const preferred = [context.relativeFile, ...context.importedFiles].filter(Boolean);
  const relevantFiles = config().get('includeRelevantFiles', true)
    ? rankRelevantFiles(cleanIntent, intelligence.filePaths || [], { limit: contextLimit(budget), preferred })
    : [];
  const projectSummary = config().get('includeProjectBrain', true) ? intelligence.projectSummary : '';
  const taskTags = tagsForMode(classification.tags, mode);
  const intelligenceMode = getPromptIntelligenceMode();
  let interpretation = null;
  let intelligenceSource = 'local';
  let intelligenceFallbackReason = '';

  if (intelligenceMode === 'ai') {
    try {
      interpretation = await promptIntelligenceService?.interpret({
        intent: cleanIntent,
        mode,
        taskTags,
        projectSummary,
        relativeFile: context.relativeFile,
        relevantFiles,
        decisionAuthority: getDecisionAuthority(),
        preferredModelId: getPromptIntelligenceModel()
      });
      if (!interpretation) throw new Error('AI Prompt Intelligence returned no interpretation.');
      intelligenceSource = 'ai';
    } catch (error) {
      intelligenceSource = 'local-fallback';
      intelligenceFallbackReason = String(error?.message || error || 'AI Enhanced unavailable.').replace(/\s+/g, ' ').trim();
    }
  }

  const rawPrompt = buildPrompt({
    intent: cleanIntent,
    mode,
    decisionAuthority: getDecisionAuthority(),
    relativeFile: context.relativeFile,
    hasSelection: context.hasSelection,
    diagnostics: context.diagnostics,
    projectSummary,
    taskTags,
    relevantFiles,
    verificationCommands: intelligence.verificationCommands || [],
    interpretation,
    intelligenceSource
  });
  const prompt = dedupeText(rawPrompt);

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    intent: cleanIntent,
    prompt,
    promptTokens: estimateTokens(prompt),
    inputTokens: estimateTokens(cleanIntent),
    mode,
    modeLabel: modeLabel(mode),
    tags: taskTags,
    relevantFiles,
    projectSummary,
    contextBudget: budget,
    authority: getDecisionAuthority(),
    intelligenceMode,
    intelligenceSource,
    intelligenceFallbackReason
  };
}

function history() {
  return extensionContext?.workspaceState.get(HISTORY_KEY, []) || [];
}

async function setHistory(items) {
  if (!extensionContext) return;
  await extensionContext.workspaceState.update(HISTORY_KEY, items.slice(0, MAX_HISTORY));
}

async function recordHistory(result) {
  const item = {
    id: result.id,
    at: new Date().toISOString(),
    intent: result.intent,
    mode: result.mode,
    tags: result.tags,
    promptTokens: result.promptTokens,
    contextFiles: result.relevantFiles.length,
    favorite: false
  };
  await setHistory([item, ...history()]);
}

async function toggleFavorite(id) {
  const updated = history().map((item) => item.id === id ? { ...item, favorite: !item.favorite } : item);
  updated.sort((a, b) => Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)) || String(b.at).localeCompare(String(a.at)));
  await setHistory(updated);
}

async function clearHistory() {
  const choice = await vscode.window.showWarningMessage('Clear Codex Builder local prompt history?', { modal: true }, 'Clear');
  if (choice === 'Clear') await setHistory([]);
}

async function createAndCopyPrompt(forcedMode) {
  const intent = await vscode.window.showInputBox({
    title: `Codex Builder · ${getDecisionAuthority().toUpperCase()} · ${getContextBudget().toUpperCase()}`,
    prompt: 'Describe only what you want changed. Builder Companion adds project context and implementation instructions locally.',
    placeHolder: 'Example: create a secure local password vault with SQLite, categories and tags',
    ignoreFocusOut: true
  });
  if (!intent) return;
  const result = await buildGeneratedPrompt(intent, forcedMode);
  if (!result) return;
  await vscode.env.clipboard.writeText(result.prompt);
  await recordHistory(result);
  await sidebarProvider?.refreshState();

  const imageHint = result.mode === 'match' ? ' and attach your reference image' : '';
  const action = await vscode.window.showInformationMessage(
    `Codex Builder: ${result.modeLabel} copied · ≈${result.promptTokens} prompt tokens · ${result.relevantFiles.length} targeted path(s). Paste into Codex${imageHint}.`,
    'Preview Prompt'
  );
  if (action === 'Preview Prompt') await openPromptPreview(result);
}


function previewNonce() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let value = '';
  for (let i = 0; i < 24; i += 1) value += chars.charAt(Math.floor(Math.random() * chars.length));
  return value;
}

async function openPromptPreview(result) {
  if (!result) return;
  latestPreviewResult = result;

  if (!promptPreviewPanel) {
    promptPreviewPanel = vscode.window.createWebviewPanel(
      'codexBuilder.promptPreview',
      'Codex Prompt Preview',
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    promptPreviewPanel.onDidDispose(() => {
      promptPreviewPanel = undefined;
      latestPreviewResult = undefined;
    });

    promptPreviewPanel.webview.onDidReceiveMessage(async (message) => {
      if (message.type !== 'copy' || !latestPreviewResult) return;
      await vscode.env.clipboard.writeText(latestPreviewResult.prompt);
      await recordHistory(latestPreviewResult);
      await sidebarProvider?.refreshState();
      promptPreviewPanel?.webview.postMessage({ type: 'copied' });
      vscode.window.showInformationMessage(
        `Codex Builder: prompt copied · ≈${latestPreviewResult.promptTokens} estimated tokens.`
      );
    });
  } else {
    promptPreviewPanel.reveal(vscode.ViewColumn.Active, false);
  }

  promptPreviewPanel.title = `Codex Preview · ${result.modeLabel || 'Prompt'}`;
  promptPreviewPanel.webview.html = renderPromptPreviewHtml(result, previewNonce());
}

async function previewText(content, language = 'markdown') {
  const doc = await vscode.workspace.openTextDocument({ content, language });
  await vscode.window.showTextDocument(doc, { preview: true });
}

async function setDecisionAuthority(value) {
  if (!value) {
    const current = getDecisionAuthority();
    const picked = await vscode.window.showQuickPick([
      { label: '$(shield) Balanced', detail: 'Recommended: decides normal engineering details.', value: 'balanced' },
      { label: '$(rocket) Autonomous', detail: 'Fewest follow-up questions; asks only when blocked or before destructive product-level decisions.', value: 'autonomous' },
      { label: '$(lock) Conservative', detail: 'More approval gates for architecture/dependencies/security policy.', value: 'conservative' }
    ], { title: `Decision Authority · Current: ${current.toUpperCase()}` });
    if (!picked) return;
    value = picked.value;
  }
  if (!['conservative', 'balanced', 'autonomous'].includes(value)) return;
  await config().update('decisionAuthority', value, vscode.ConfigurationTarget.Global);
  vscode.window.showInformationMessage(`Codex Builder decision authority: ${value.toUpperCase()}.`);
}

async function setContextBudget(value) {
  if (!value) {
    const current = getContextBudget();
    const picked = await vscode.window.showQuickPick([
      { label: '$(zap) Economy', detail: 'Up to 3 targeted paths.', value: 'economy' },
      { label: '$(list-tree) Balanced', detail: 'Recommended: up to 6 targeted paths.', value: 'balanced' },
      { label: '$(search) Deep', detail: 'Up to 10 targeted paths.', value: 'deep' }
    ], { title: `Context Budget · Current: ${current.toUpperCase()}` });
    if (!picked) return;
    value = picked.value;
  }
  if (!['economy', 'balanced', 'deep'].includes(value)) return;
  await config().update('contextBudget', value, vscode.ConfigurationTarget.Global);
  brainCache.clear();
  vscode.window.showInformationMessage(`Codex Builder context budget: ${value.toUpperCase()}.`);
}

async function ensureProjectFile(kind) {
  const intelligence = await getProjectIntelligence(false);
  if (!intelligence.root) {
    vscode.window.showWarningMessage('Codex Builder: Open a project folder first.');
    return null;
  }
  const dir = path.join(intelligence.root, '.codex-builder');
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, kind === 'profile' ? 'project-profile.json' : 'decisions.json');
  if (!fs.existsSync(filePath)) {
    if (kind === 'profile') {
      writeJson(filePath, { ...intelligence.profile, generatedAt: new Date().toISOString() });
    } else {
      writeJson(filePath, defaultDecisions(intelligence.profile));
    }
  }
  return filePath;
}

async function openProjectFile(kind) {
  const filePath = await ensureProjectFile(kind);
  if (!filePath) return;
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
  await vscode.window.showTextDocument(doc, { preview: false });
}

async function generateAgents() {
  const intelligence = await getProjectIntelligence(true);
  if (!intelligence.root) {
    vscode.window.showWarningMessage('Codex Builder: Open a project folder first.');
    return;
  }
  const content = buildAgentsMarkdown(intelligence.profile, intelligence.decisions);
  const target = path.join(intelligence.root, 'AGENTS.md');
  if (fs.existsSync(target)) {
    const choice = await vscode.window.showWarningMessage(
      'AGENTS.md already exists. Replace it with the generated repository overview?',
      { modal: true },
      'Replace',
      'Preview Generated'
    );
    if (choice === 'Preview Generated') {
      await previewText(content, 'markdown');
      return;
    }
    if (choice !== 'Replace') return;
  }
  fs.writeFileSync(target, content, 'utf8');
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(target));
  await vscode.window.showTextDocument(doc, { preview: false });
  vscode.window.showInformationMessage('Codex Builder: AGENTS.md generated. Review the project overview and constraints before relying on it.');
}

async function connectChatGPT() {
  try {
    const login = await promptIntelligenceService?.beginChatGptLogin();
    if (!login) throw new Error('Prompt Intelligence service is unavailable.');
    if (login.alreadyConnected) {
      vscode.window.showInformationMessage('Codex Builder: ChatGPT is already connected for AI Enhanced Prompt Intelligence.');
      await sidebarProvider?.refreshState();
      return;
    }
    if (login.authUrl) {
      await vscode.env.openExternal(vscode.Uri.parse(login.authUrl));
      vscode.window.showInformationMessage('Codex Builder: Complete ChatGPT sign-in in your browser, then return to VS Code.');
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Codex Builder: ${error.message || error}`);
  }
  await sidebarProvider?.refreshState();
}

async function sidebarState() {
  const intelligence = await getProjectIntelligence(false);
  const items = history();
  return {
    version: manifest.version,
    authority: getDecisionAuthority(),
    contextBudget: getContextBudget(),
    projectName: intelligence.profile?.packageName || intelligence.folder?.name || '',
    projectSummary: intelligence.projectSummary || '',
    projectDetails: buildProjectDisplayRows(intelligence.profile || {}, intelligence.decisions || {}),
    codexUsage: codexUsageService?.getState() || { status: 'idle', windows: [] },
    promptIntelligenceMode: getPromptIntelligenceMode(),
    promptIntelligenceModel: getPromptIntelligenceModel(),
    promptIntelligence: promptIntelligenceService?.getState() || { status: 'idle', connected: false },
    promptBuildState,
    stats: usageStats(items),
    history: [...items].sort((a, b) => Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)) || String(b.at).localeCompare(String(a.at))).slice(0, 12)
  };
}

function activate(context) {
  extensionContext = context;

  codexUsageService = new CodexUsageService({
    version: manifest.version,
    resolveBinary: () => resolveCodexBinary(vscode),
    pollMs: 60000,
    onChange: () => sidebarProvider?.refreshState()
  });

  promptIntelligenceService = new PromptIntelligenceService({
    version: manifest.version,
    resolveBinary: () => resolveCodexBinary(vscode),
    onChange: () => sidebarProvider?.refreshState()
  });

  const services = {
    getState: sidebarState,
    buildPrompt: async (intent) => {
      setPromptBuildBusy(true, 'build', getPromptIntelligenceMode() === 'ai' ? 'AI Enhanced is interpreting your request…' : 'Building prompt…');
      await sidebarProvider?.refreshState();
      try {
        const result = await buildGeneratedPrompt(intent);
        if (!result) return null;
        await openPromptPreview(result);
        return result;
      } finally {
        setPromptBuildBusy(false);
        await sidebarProvider?.refreshState();
      }
    },
    copyPrompt: async (intent) => {
      setPromptBuildBusy(true, 'copy', getPromptIntelligenceMode() === 'ai' ? 'AI Enhanced is interpreting your request before copying…' : 'Copying prompt…');
      await sidebarProvider?.refreshState();
      try {
        const result = await buildGeneratedPrompt(intent);
        if (!result) return null;
        await vscode.env.clipboard.writeText(result.prompt);
        await recordHistory(result);
        vscode.window.showInformationMessage(`Codex Builder: prompt copied · ≈${result.promptTokens} estimated tokens.`);
        return result;
      } finally {
        setPromptBuildBusy(false);
        await sidebarProvider?.refreshState();
      }
    },
    refreshBrain: persistProjectBrain,
    generateAgents,
    openProfile: () => openProjectFile('profile'),
    openDecisions: () => openProjectFile('decisions'),
    clearHistory,
    toggleFavorite,
    setAuthority: setDecisionAuthority,
    setBudget: setContextBudget,
    setIntelligenceMode: setPromptIntelligenceMode,
    setIntelligenceModel: setPromptIntelligenceModel,
    connectChatGPT,
    ensureUsage: () => codexUsageService?.start(),
    refreshUsage: () => codexUsageService?.refresh(),
    ensureIntelligence: () => promptIntelligenceService?.start(),
    refreshIntelligence: () => promptIntelligenceService?.refreshAccount(getPromptIntelligenceModel())
  };

  sidebarProvider = new SidebarProvider(context.extensionUri, services);
  context.subscriptions.push(vscode.window.registerWebviewViewProvider('codexBuilder.sidebar', sidebarProvider));

  const commands = [
    ['codexBuilder.optimizePrompt', undefined],
    ['codexBuilder.matchScreenshot', 'match'],
    ['codexBuilder.fixIssue', 'fix'],
    ['codexBuilder.addFeature', 'feature'],
    ['codexBuilder.quickAdd', 'add'],
    ['codexBuilder.updateUI', 'update']
  ];
  for (const [commandId, mode] of commands) {
    context.subscriptions.push(vscode.commands.registerCommand(commandId, () => createAndCopyPrompt(mode)));
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('codexBuilder.setDecisionAuthority', () => setDecisionAuthority()),
    vscode.commands.registerCommand('codexBuilder.setContextBudget', () => setContextBudget()),
    vscode.commands.registerCommand('codexBuilder.refreshProjectBrain', persistProjectBrain),
    vscode.commands.registerCommand('codexBuilder.generateAgents', generateAgents),
    vscode.commands.registerCommand('codexBuilder.openProjectProfile', () => openProjectFile('profile')),
    vscode.commands.registerCommand('codexBuilder.openProjectDecisions', () => openProjectFile('decisions')),
    vscode.commands.registerCommand('codexBuilder.clearHistory', clearHistory),
    vscode.commands.registerCommand('codexBuilder.refreshCodexUsage', async () => {
      await codexUsageService?.refresh();
      await sidebarProvider?.refreshState();
    }),
    vscode.commands.registerCommand('codexBuilder.showVersion', () => {
      vscode.window.showInformationMessage(
        `Codex Builder Companion v${manifest.version} · ${getDecisionAuthority().toUpperCase()} · ${getContextBudget().toUpperCase()} context`
      );
    })
  );
}

function deactivate() {
  brainCache.clear();
  codexUsageService?.stop();
  codexUsageService = undefined;
  promptIntelligenceService?.stop();
  promptIntelligenceService = undefined;
  if (promptPreviewPanel) promptPreviewPanel.dispose();
  promptPreviewPanel = undefined;
  latestPreviewResult = undefined;
}

module.exports = { activate, deactivate };
