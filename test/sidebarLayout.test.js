const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'sidebarProvider.js'), 'utf8');

test('sidebar uses Build Prompt as the primary action and removes inline prompt preview', () => {
  assert.match(source, /id="buildBtn"/);
  assert.match(source, />Build Prompt</);
  assert.match(source, /type:\s*'build'/);
  assert.doesNotMatch(source, /id="previewBtn"/);
  assert.doesNotMatch(source, /id="previewSection"/);
});


test('sidebar removes duplicate internal Codex Builder heading and labels project name clearly', () => {
  assert.doesNotMatch(source, /<h2>Codex Builder<\/h2>/);
  assert.match(source, /Project: No workspace/);
});

test('sidebar includes official Codex usage card with refresh and live percentage rendering', () => {
  assert.match(source, /id="codexUsageRefreshBtn"/);
  assert.match(source, /id="codexUsageWindows"/);
  assert.match(source, /type:\s*'refreshUsage'/);
  assert.match(source, /Official Codex rate-limit data/);
  assert.match(source, /remainingPercent/);
});
