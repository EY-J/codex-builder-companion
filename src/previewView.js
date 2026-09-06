function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function chipClass(tag = '') {
  const value = String(tag || '').toUpperCase();
  if (value.includes('SECURITY')) return 'chip chip--security';
  if (value.includes('DATABASE')) return 'chip chip--database';
  if (value.includes('LARGE')) return 'chip chip--large';
  if (value.includes('FEATURE')) return 'chip chip--feature';
  if (value.includes('BUG') || value.includes('FIX')) return 'chip chip--bug';
  if (value.includes('UI') || value.includes('ACCESS') || value.includes('ANIMATION') || value.includes('TYPOGRAPHY') || value.includes('FORM') || value.includes('NAVIGATION')) return 'chip chip--ui';
  return 'chip chip--default';
}

function renderChips(tags = []) {
  if (!tags.length) return '<span class="empty">No classification tags</span>';
  return tags.map((tag) => `<span class="${chipClass(tag)}">${escapeHtml(tag)}</span>`).join('');
}

function renderFiles(files = []) {
  if (!files.length) return '<div class="empty">No targeted paths were added. Codex can inspect the project as needed.</div>';
  return `<ul>${files.map((file) => `<li><code>${escapeHtml(file)}</code></li>`).join('')}</ul>`;
}

function renderPromptPreviewHtml(preview = {}, nonce = '') {
  const promptTokens = Number(preview.promptTokens) || 0;
  const mode = escapeHtml(preview.modeLabel || preview.mode || 'Auto');
  const budget = escapeHtml(preview.contextBudget || 'balanced');
  const authority = escapeHtml(preview.authority || 'balanced');
  const intelligenceSource = preview.intelligenceSource === 'ai'
    ? 'AI Enhanced'
    : preview.intelligenceSource === 'local-fallback'
      ? 'Local Advanced · fallback'
      : 'Local Advanced';
  const intelligence = escapeHtml(intelligenceSource);
  const intelligenceHint = escapeHtml(preview.intelligenceFallbackReason || '');
  const projectSummary = escapeHtml(preview.projectSummary || 'No Project Brain summary included.');
  const intent = escapeHtml(preview.intent || 'Untitled task');
  const prompt = escapeHtml(preview.prompt || '');
  const safeNonce = escapeHtml(nonce);

  return `<!doctype html>
<html>
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${safeNonce}';" />
<title>Codex Prompt Preview</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    font-family: var(--vscode-font-family);
    font-size: 13px;
  }
  .toolbar {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 14px 20px;
    border-bottom: 1px solid var(--vscode-panel-border);
    background: var(--vscode-editor-background);
  }
  .titleWrap { min-width: 0; }
  h1 { margin: 0; font-size: 18px; line-height: 1.25; }
  .taskTitle {
    margin-top: 4px;
    max-width: 760px;
    color: var(--vscode-descriptionForeground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  button {
    min-width: 132px;
    min-height: 34px;
    border: 1px solid var(--vscode-button-border, transparent);
    border-radius: 5px;
    padding: 7px 13px;
    color: var(--vscode-button-foreground);
    background: var(--vscode-button-background);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  button:hover { background: var(--vscode-button-hoverBackground); }
  main { width: min(1080px, calc(100% - 40px)); margin: 20px auto 40px; }
  .summaryGrid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    margin-bottom: 14px;
  }
  .summaryCard, .panel {
    border: 1px solid var(--vscode-panel-border);
    border-radius: 8px;
    background: var(--vscode-editorWidget-background, var(--vscode-editor-background));
  }
  .summaryCard { padding: 12px 14px; min-width: 0; }
  .summaryLabel { color: var(--vscode-descriptionForeground); font-size: 11px; margin-bottom: 4px; }
  .summaryValue { font-size: 15px; font-weight: 650; overflow-wrap: anywhere; }
  .panel { padding: 14px 16px; margin-top: 12px; }
  .panelHeader {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 10px;
  }
  h2 { margin: 0; font-size: 13px; }
  .hint { color: var(--vscode-descriptionForeground); font-size: 11px; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip {
    display: inline-flex;
    align-items: center;
    padding: 4px 9px;
    border: 1px solid;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.02em;
  }
  .chip--feature { color: #d9ecff; background: #19324d; border-color: #3777b6; }
  .chip--database { color: #d8fff7; background: #143a38; border-color: #2f8f89; }
  .chip--security { color: #fff0c2; background: #433015; border-color: #d1a640; }
  .chip--large { color: #f0e1ff; background: #35214f; border-color: #8f63cf; }
  .chip--ui { color: #ddffea; background: #183925; border-color: #4aa071; }
  .chip--bug { color: #ffdede; background: #4a1f24; border-color: #c65c6c; }
  .chip--default { color: var(--vscode-foreground); background: var(--vscode-badge-background, transparent); border-color: var(--vscode-panel-border); }
  .projectSummary { line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; }
  ul { margin: 0; padding-left: 20px; }
  li { margin: 5px 0; }
  code { font-family: var(--vscode-editor-font-family); }
  pre {
    margin: 0;
    padding: 14px;
    overflow: auto;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 6px;
    background: var(--vscode-textCodeBlock-background);
    color: var(--vscode-editor-foreground);
    font-family: var(--vscode-editor-font-family);
    font-size: var(--vscode-editor-font-size, 12px);
    line-height: 1.5;
  }
  .empty { color: var(--vscode-descriptionForeground); }
  .status { min-height: 18px; margin-top: 8px; color: var(--vscode-descriptionForeground); text-align: right; }
  @media (max-width: 720px) {
    .toolbar { align-items: stretch; flex-direction: column; }
    .toolbar button { width: 100%; }
    .summaryGrid { grid-template-columns: 1fr; }
    main { width: calc(100% - 24px); margin-top: 12px; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <div class="titleWrap">
      <h1>Codex Prompt Preview</h1>
      <div class="taskTitle" title="${intent}">${intent}</div>
    </div>
    <button id="copyBtn">Copy for Codex</button>
  </div>

  <main>
    <div class="summaryGrid">
      <div class="summaryCard">
        <div class="summaryLabel">Estimated prompt tokens</div>
        <div class="summaryValue">≈${promptTokens}</div>
      </div>
      <div class="summaryCard">
        <div class="summaryLabel">Build mode</div>
        <div class="summaryValue">${mode}</div>
      </div>
      <div class="summaryCard">
        <div class="summaryLabel">Decision / context</div>
        <div class="summaryValue">${authority} · ${budget}</div>
      </div>
      <div class="summaryCard">
        <div class="summaryLabel">Prompt intelligence</div>
        <div class="summaryValue">${intelligence}</div>
      </div>
    </div>

    <section class="panel">
      <div class="panelHeader"><h2>Detected task</h2><span class="hint">Used to keep the prompt focused</span></div>
      <div class="chips">${renderChips(preview.tags || [])}</div>
    </section>

    <section class="panel">
      <div class="panelHeader"><h2>Project context</h2><span class="hint">Project Brain summary</span></div>
      <div class="projectSummary">${projectSummary}</div>
    </section>

    <section class="panel">
      <div class="panelHeader"><h2>Targeted project paths</h2><span class="hint">${(preview.relevantFiles || []).length} path(s)</span></div>
      ${renderFiles(preview.relevantFiles || [])}
    </section>

    ${intelligenceHint ? `<section class="panel"><div class="panelHeader"><h2>AI fallback</h2><span class="hint">Local Advanced was used</span></div><div class="projectSummary">${intelligenceHint}</div></section>` : ''}

    <section class="panel">
      <div class="panelHeader"><h2>Generated prompt</h2><span class="hint">Review before sending to Codex</span></div>
      <pre>${prompt}</pre>
      <div id="status" class="status"></div>
    </section>
  </main>

<script nonce="${safeNonce}">
  const vscode = acquireVsCodeApi();
  const button = document.getElementById('copyBtn');
  const status = document.getElementById('status');
  button.addEventListener('click', () => {
    button.disabled = true;
    vscode.postMessage({ type: 'copy' });
  });
  window.addEventListener('message', (event) => {
    if (event.data?.type === 'copied') {
      button.disabled = false;
      button.textContent = 'Copied';
      status.textContent = 'Prompt copied. Paste it into the Codex chat.';
      setTimeout(() => { button.textContent = 'Copy for Codex'; status.textContent = ''; }, 1800);
    }
  });
</script>
</body>
</html>`;
}

module.exports = { escapeHtml, renderPromptPreviewHtml };
