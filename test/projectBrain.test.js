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
  assert.match(agents, /Keep changes focused on the requested task/i);
  assert.match(agents, /## Development Rules\n/);
  assert.match(agents, /## Technology Stack\n/);
  assert.ok(agents.length < 1800, `AGENTS.md too verbose: ${agents.length}`);
});

test('AGENTS.md describes a detected desktop project and explicit constraints', () => {
  const profile = analyzeProject({
    packageJson: {
      name: 'imemory',
      displayName: 'IMemory',
      description: 'A workspace for conversations.',
      scripts: { build: 'tauri build', test: 'vitest run' },
      dependencies: { '@tauri-apps/api': '^2', react: '^19', 'better-sqlite3': '^11' },
      devDependencies: { typescript: '^5', vitest: '^3' }
    },
    readmeText: '# IMemory\n\nA local-first AI workspace for persistent conversations and project memory.\n',
    fileNames: ['src/App.tsx', 'src-tauri/src/main.rs', 'docs/architecture.md', 'docs/reliability-readiness-v1.md'],
    rootEntries: ['src', 'src-tauri', 'README.md', 'package.json']
  });
  const agents = buildAgentsMarkdown(profile, {
    purpose: 'Persistent conversations and continuity across authorized AI accounts.',
    architecturalConstraints: [
      'Do not reset or delete SQLite data.',
      'Keep project memory isolated between projects.'
    ],
    storageBoundary: 'local-only'
  });

  assert.match(agents, /## Project Overview\n\n- Name: IMemory\n- Type: Desktop application\n- Purpose: Persistent conversations/);
  assert.match(agents, /Frameworks: Tauri 2, React/);
  assert.match(agents, /Languages: TypeScript, JavaScript, Rust/);
  assert.match(agents, /Data: SQLite/);
  assert.match(agents, /Native backend: `src-tauri\/src\/`/);
  assert.match(agents, /npm run build/);
  assert.match(agents, /## Architectural Constraints\n/);
  assert.match(agents, /Do not reset or delete SQLite data/);
  assert.match(agents, /## Project Documentation\n\n- `README\.md`\n- `docs\/architecture\.md`\n- `docs\/reliability-readiness-v1\.md`/);
});

test('AGENTS.md omits unknown overview facts and nonexistent checks', () => {
  const profile = analyzeProject({ packageJson: { name: 'small-library' }, rootEntries: ['package.json'] });
  const agents = buildAgentsMarkdown(profile, {});
  assert.match(agents, /- Name: small-library/);
  assert.doesNotMatch(agents, /- Type:|- Purpose:|## Project Documentation|npm run build/);
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
