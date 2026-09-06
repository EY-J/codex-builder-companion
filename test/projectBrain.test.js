const test = require('node:test');
const assert = require('node:assert/strict');

const {
  analyzeProject,
  buildAgentsMarkdown,
  buildProjectContextSummary,
  buildProjectDisplayRows,
  defaultDecisions
} = require('../src/projectBrain');

test('analyzeProject detects stack, package manager, database, tests and verification commands', () => {
  const profile = analyzeProject({
    packageJson: {
      scripts: { dev: 'next dev', build: 'next build', lint: 'next lint', test: 'vitest run', typecheck: 'tsc --noEmit' },
      dependencies: { next: '^15', react: '^19', 'better-sqlite3': '^11' },
      devDependencies: { typescript: '^5', vitest: '^3' }
    },
    fileNames: ['src/app/page.tsx', 'src/components/Navbar.tsx', 'src/lib/db.ts', 'package-lock.json'],
    rootEntries: ['src', 'package.json', 'package-lock.json', 'tsconfig.json']
  });

  assert.equal(profile.packageManager, 'npm');
  assert.deepEqual(profile.frameworks, ['Next.js', 'React']);
  assert.ok(profile.languages.includes('TypeScript'));
  assert.ok(profile.databases.includes('SQLite'));
  assert.ok(profile.testing.includes('Vitest'));
  assert.equal(profile.sourceRoot, 'src');
  assert.deepEqual(profile.verificationCommands, ['npm run typecheck', 'npm run test', 'npm run lint', 'npm run build']);
});

test('defaultDecisions creates explicit local project decisions without secrets', () => {
  const profile = analyzeProject({
    packageJson: { dependencies: { electron: '^35', react: '^19', sqlite3: '^5' } },
    fileNames: ['src/main/index.js', 'src/renderer/App.jsx'],
    rootEntries: ['src', 'package.json', 'yarn.lock']
  });
  const decisions = defaultDecisions(profile);
  assert.equal(decisions.packageManager, 'yarn');
  assert.equal(decisions.database, 'SQLite');
  assert.equal(decisions.storageBoundary, 'local-only');
  assert.equal(Object.values(decisions).some((v) => /password|secret|token/i.test(String(v))), false);
});

test('buildAgentsMarkdown is concise and contains detected project rules', () => {
  const profile = analyzeProject({
    packageJson: { dependencies: { next: '^15', react: '^19' }, devDependencies: { typescript: '^5' } },
    fileNames: ['src/app/page.tsx'],
    rootEntries: ['src', 'package.json', 'pnpm-lock.yaml']
  });
  const agents = buildAgentsMarkdown(profile, { styling: 'existing project styling', avoidUnrelatedRefactors: true });
  assert.match(agents, /Next\.js/);
  assert.match(agents, /React/);
  assert.match(agents, /pnpm/);
  assert.match(agents, /Avoid unrelated refactors/i);
  assert.ok(agents.length < 1800, `AGENTS.md too verbose: ${agents.length}`);
});

test('buildProjectContextSummary compresses project information for prompts', () => {
  const profile = analyzeProject({
    packageJson: { dependencies: { electron: '^35', react: '^19', 'better-sqlite3': '^11' }, devDependencies: { vitest: '^3' } },
    fileNames: ['src/main/db.js', 'src/renderer/App.jsx'],
    rootEntries: ['src', 'package.json', 'package-lock.json']
  });
  const summary = buildProjectContextSummary(profile, { storageBoundary: 'local-only' });
  assert.match(summary, /Electron/);
  assert.match(summary, /React/);
  assert.match(summary, /SQLite/);
  assert.match(summary, /local-only/);
  assert.ok(summary.length < 700);
});


test('buildProjectDisplayRows returns readable sidebar metadata rows', () => {
  const profile = analyzeProject({
    packageJson: { dependencies: { react: '^19', 'better-sqlite3': '^11' }, devDependencies: { typescript: '^5' } },
    fileNames: ['src/App.tsx', 'src/styles.css', 'src/native/src/main.rs'],
    rootEntries: ['src', 'package.json', 'package-lock.json']
  });
  const rows = buildProjectDisplayRows(profile, { storageBoundary: 'local-only' });
  assert.deepEqual(rows, [
    { label: 'Stack', value: 'React' },
    { label: 'Language', value: 'TypeScript + JavaScript + Rust' },
    { label: 'Data', value: 'SQLite' },
    { label: 'Styling', value: 'CSS' },
    { label: 'Source', value: '/src' },
    { label: 'Storage', value: 'local-only' }
  ]);
});
