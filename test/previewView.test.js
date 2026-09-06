const test = require('node:test');
const assert = require('node:assert/strict');

const { renderPromptPreviewHtml } = require('../src/previewView');

test('full preview renders prompt metadata, targeted paths, and a Copy for Codex action', () => {
  const html = renderPromptPreviewHtml({
    intent: 'create password vault',
    prompt: 'ONE-SHOT FEATURE IMPLEMENTATION\n\nTASK\nCreate vault.',
    promptTokens: 1801,
    modeLabel: 'One-Shot Feature',
    contextBudget: 'balanced',
    authority: 'autonomous',
    tags: ['FEATURE', 'SECURITY_SENSITIVE'],
    relevantFiles: ['src/features/vault/index.ts', 'src/lib/db.ts'],
    projectSummary: 'React · TypeScript · local-only'
  }, 'nonce123');

  assert.match(html, /Codex Prompt Preview/);
  assert.match(html, /1801/);
  assert.match(html, /FEATURE/);
  assert.match(html, /SECURITY_SENSITIVE/);
  assert.match(html, /src\/features\/vault\/index\.ts/);
  assert.match(html, /Copy for Codex/);
  assert.match(html, /ONE-SHOT FEATURE IMPLEMENTATION/);
  assert.match(html, /nonce="nonce123"/);
});

test('full preview escapes user-controlled HTML instead of executing it', () => {
  const html = renderPromptPreviewHtml({
    intent: '<img src=x onerror=alert(1)>',
    prompt: '</pre><script>alert(1)</script>',
    tags: ['<unsafe>'],
    relevantFiles: ['src/<bad>.ts']
  }, 'safeNonce');

  assert.doesNotMatch(html, /<img src=x/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(html, /&lt;img/);
  assert.match(html, /&lt;script&gt;/);
});


test('preview renders readable chip color classes for known task tags', () => {
  const html = renderPromptPreviewHtml({
    tags: ['FEATURE', 'DATABASE_CHANGE', 'SECURITY_SENSITIVE', 'LARGE_FEATURE']
  }, 'nonce456');

  assert.match(html, /chip--feature/);
  assert.match(html, /chip--database/);
  assert.match(html, /chip--security/);
  assert.match(html, /chip--large/);
});
