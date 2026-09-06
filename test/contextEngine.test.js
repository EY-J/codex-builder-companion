const test = require('node:test');
const assert = require('node:assert/strict');

const {
  classifyTask,
  rankRelevantFiles,
  extractImports,
  resolveImportPaths,
  estimateTokens,
  dedupeText,
  contextLimit,
  usageStats
} = require('../src/contextEngine');

test('classifyTask returns composable tags for a secure persistent feature', () => {
  const result = classifyTask('create a password vault with SQLite encryption and search');
  assert.equal(result.mode, 'feature');
  assert.ok(result.tags.includes('FEATURE'));
  assert.ok(result.tags.includes('DATABASE_CHANGE'));
  assert.ok(result.tags.includes('SECURITY_SENSITIVE'));
});

test('classifyTask detects visual responsive UI work without treating it as a large feature', () => {
  const result = classifyTask('match this navbar to the screenshot and fix mobile spacing');
  assert.equal(result.mode, 'match');
  assert.ok(result.tags.includes('VISUAL_MATCH'));
  assert.ok(result.tags.includes('UI_CHANGE'));
  assert.ok(result.tags.includes('RESPONSIVE'));
});

test('rankRelevantFiles prioritizes intent matches and avoids unrelated files', () => {
  const files = [
    'src/components/Navbar.tsx',
    'src/components/MobileMenu.tsx',
    'src/styles/navbar.css',
    'src/features/vault/VaultPage.tsx',
    'src/features/vault/vaultDb.ts',
    'src/pages/About.tsx'
  ];
  const ranked = rankRelevantFiles('create password vault sqlite', files, { limit: 3 });
  assert.ok(ranked.includes('src/features/vault/VaultPage.tsx'));
  assert.ok(ranked.includes('src/features/vault/vaultDb.ts'));
  assert.ok(!ranked.includes('src/pages/About.tsx'));
});

test('extractImports and resolveImportPaths resolve relative and src alias imports', () => {
  const source = `import x from './MobileMenu';\nimport { db } from '@/lib/db';\nconst z = require('../utils/nav');`;
  const imports = extractImports(source);
  assert.deepEqual(imports, ['./MobileMenu', '@/lib/db', '../utils/nav']);

  const files = [
    'src/components/MobileMenu.tsx',
    'src/lib/db.ts',
    'src/utils/nav.js'
  ];
  const resolved = resolveImportPaths('src/components/Navbar.tsx', imports, files);
  assert.deepEqual(resolved, ['src/components/MobileMenu.tsx', 'src/lib/db.ts', 'src/utils/nav.js']);
});

test('estimateTokens is explicitly approximate and stable enough for UI budgeting', () => {
  assert.equal(estimateTokens('12345678'), 2);
  assert.ok(estimateTokens('hello world this is a prompt') >= 5);
});

test('dedupeText removes repeated generated lines while preserving order', () => {
  const result = dedupeText('Task: update nav\nKeep changes targeted.\nKeep changes targeted.\nVerify after editing.');
  assert.equal(result, 'Task: update nav\nKeep changes targeted.\nVerify after editing.');
});

test('context budgets map to bounded relevant file counts', () => {
  assert.equal(contextLimit('economy'), 3);
  assert.equal(contextLimit('balanced'), 6);
  assert.equal(contextLimit('deep'), 10);
  assert.equal(contextLimit('invalid'), 6);
});

test('usageStats summarizes local prompt history without claiming actual Codex billing', () => {
  const stats = usageStats([
    { promptTokens: 200, mode: 'feature' },
    { promptTokens: 100, mode: 'update' },
    { promptTokens: 150, mode: 'feature' }
  ]);
  assert.deepEqual(stats, { prompts: 3, estimatedPromptTokens: 450, averageEstimatedPromptTokens: 150, oneShotFeatures: 2 });
});
