const test = require('node:test');
const assert = require('node:assert/strict');

const { detectMode, buildPrompt } = require('../src/promptBuilder');

test('detectMode recognizes screenshot matching language', () => {
  assert.equal(detectMode('make navbar like this screenshot'), 'match');
  assert.equal(detectMode('copy this photo design'), 'match');
});

test('detectMode recognizes bug fixing language', () => {
  assert.equal(detectMode('fix this css problem'), 'fix');
  assert.equal(detectMode('navbar is broken on mobile'), 'fix');
});

test('detectMode keeps tiny additions in compact add mode', () => {
  assert.equal(detectMode('add an icon here'), 'add');
  assert.equal(detectMode('insert a divider below this'), 'add');
});

test('detectMode upgrades substantial additions to one-shot feature mode', () => {
  assert.equal(
    detectMode('create a password vault with SQLite storage, encryption, categories and tags'),
    'feature'
  );
  assert.equal(
    detectMode('implement a user management feature with create edit delete search roles and database persistence'),
    'feature'
  );
});

test('compact update prompt still implements without another approval turn', () => {
  const prompt = buildPrompt({
    intent: 'update this navbar',
    mode: 'update',
    relativeFile: 'src/components/Navbar.tsx',
    hasSelection: false,
    diagnostics: []
  });

  assert.match(prompt, /update this navbar/i);
  assert.match(prompt, /src\/components\/Navbar\.tsx/);
  assert.match(prompt, /implement immediately/i);
  assert.match(prompt, /without waiting for another confirmation/i);
  assert.match(prompt, /Preserve unrelated code/i);
  assert.ok(prompt.length < 950, `prompt was unexpectedly long: ${prompt.length}`);
});

test('match prompt tells Codex to use attached image and check responsive behavior', () => {
  const prompt = buildPrompt({
    intent: 'make navbar like this',
    mode: 'match',
    relativeFile: 'src/components/Navbar.tsx',
    hasSelection: true,
    diagnostics: []
  });

  assert.match(prompt, /attached image/i);
  assert.match(prompt, /responsive/i);
  assert.match(prompt, /current selection/i);
});

test('fix prompt includes only a small number of diagnostics', () => {
  const prompt = buildPrompt({
    intent: 'fix this',
    mode: 'fix',
    relativeFile: 'src/app/page.tsx',
    hasSelection: false,
    diagnostics: ['Error one', 'Error two', 'Error three', 'Error four']
  });

  assert.match(prompt, /Error one/);
  assert.match(prompt, /Error three/);
  assert.doesNotMatch(prompt, /Error four/);
});

test('feature prompt tells Codex to inspect first, make routine decisions, implement end-to-end and verify', () => {
  const prompt = buildPrompt({
    intent: 'create a dashboard feature with saved filters, search, edit and delete',
    mode: 'feature',
    relativeFile: 'src/app/dashboard/page.tsx',
    hasSelection: false,
    diagnostics: []
  });

  assert.match(prompt, /ONE-SHOT FEATURE IMPLEMENTATION/i);
  assert.match(prompt, /inspect the relevant codebase/i);
  assert.match(prompt, /Do not ask me to choose routine implementation details/i);
  assert.match(prompt, /implement the complete usable flow/i);
  assert.match(prompt, /Do not wait for another confirmation/i);
  assert.match(prompt, /DEFINITION OF DONE/i);
  assert.match(prompt, /tests|type checks|lint|build/i);
});

test('security-sensitive feature prompt adds local security guardrails without inventing custom crypto', () => {
  const prompt = buildPrompt({
    intent: 'create a password vault stored in SQLite with encrypted passwords and a master password',
    mode: 'feature',
    relativeFile: '',
    hasSelection: false,
    diagnostics: []
  });

  assert.match(prompt, /SECURITY-SENSITIVE REQUIREMENTS/i);
  assert.match(prompt, /Never store passwords, secrets, or encryption keys as plaintext/i);
  assert.match(prompt, /authenticated encryption/i);
  assert.match(prompt, /Do not invent custom cryptography/i);
  assert.match(prompt, /parameterized queries|prepared statements/i);
  assert.match(prompt, /local-only/i);
});

test('sanitizeIntent removes duplicated Task prefixes and old generated boilerplate', () => {
  const { sanitizeIntent } = require('../src/promptBuilder');
  const raw = "Task: Task: create a password vault with SQLite and encryption Add the requested functionality using the project's existing patterns and dependencies. Avoid unnecessary new packages. Primary file/context: Untitled-1 Briefly state your approach in 2-3 bullets, then implement immediately without waiting for another confirmation.";
  assert.equal(sanitizeIntent(raw), 'create a password vault with SQLite and encryption');
});

test('sanitizeIntent extracts the TASK section if a one-shot prompt is accidentally re-submitted', () => {
  const { sanitizeIntent } = require('../src/promptBuilder');
  const raw = `ONE-SHOT FEATURE IMPLEMENTATION\n\nTASK\ncreate a local password vault\n\nGOAL\nImplement this completely.`;
  assert.equal(sanitizeIntent(raw), 'create a local password vault');
});

test('feature prompt includes balanced decision authority by default', () => {
  const prompt = buildPrompt({
    intent: 'create a dashboard with database persistence and user roles',
    mode: 'feature',
    relativeFile: '',
    hasSelection: false,
    diagnostics: []
  });

  assert.match(prompt, /DECISION AUTHORITY — BALANCED/i);
  assert.match(prompt, /routine implementation decisions yourself/i);
  assert.match(prompt, /Do not present multiple options and ask me to choose/i);
});

test('autonomous profile strongly minimizes follow-up questions while preserving critical stop conditions', () => {
  const prompt = buildPrompt({
    intent: 'create a password vault with SQLite and encryption',
    mode: 'feature',
    decisionAuthority: 'autonomous',
    relativeFile: '',
    hasSelection: false,
    diagnostics: []
  });

  assert.match(prompt, /DECISION AUTHORITY — AUTONOMOUS/i);
  assert.match(prompt, /make the implementation decisions yourself/i);
  assert.match(prompt, /irreversible|destructive/i);
  assert.match(prompt, /genuinely blocked/i);
});

test('password vault feature receives concrete default product and security decisions', () => {
  const prompt = buildPrompt({
    intent: 'create a password vault with name username password optional URL category tags SQLite encryption',
    mode: 'feature',
    decisionAuthority: 'autonomous',
    relativeFile: '',
    hasSelection: false,
    diagnostics: []
  });

  assert.match(prompt, /PASSWORD VAULT DEFAULT DECISIONS/i);
  assert.match(prompt, /local-only SQLite/i);
  assert.match(prompt, /master vault passphrase|existing secure unlock/i);
  assert.match(prompt, /hidden by default/i);
  assert.match(prompt, /clipboard/i);
  assert.match(prompt, /confirmation/i);
});

test('compact prompt also carries a short decision-authority instruction', () => {
  const prompt = buildPrompt({
    intent: 'update this navbar spacing',
    mode: 'update',
    decisionAuthority: 'autonomous',
    relativeFile: 'src/components/Navbar.tsx',
    hasSelection: false,
    diagnostics: []
  });

  assert.match(prompt, /Use your best judgment for routine implementation decisions/i);
  assert.ok(prompt.length < 1200, `compact prompt was unexpectedly long: ${prompt.length}`);
});

test('cleanEditorFileContext ignores untitled documents', () => {
  const { cleanEditorFileContext } = require('../src/promptBuilder');
  assert.equal(cleanEditorFileContext('Untitled-1', true, 'untitled'), '');
  assert.equal(cleanEditorFileContext('Untitled-2', false, 'untitled'), '');
  assert.equal(cleanEditorFileContext('src/app/page.tsx', false, 'file'), 'src/app/page.tsx');
});

test('package manifest preserves decision authority setting and command', () => {
  const manifest = require('../package.json');
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.deepEqual(manifest.contributes.configuration.properties['codexBuilder.decisionAuthority'].enum, [
    'conservative',
    'balanced',
    'autonomous'
  ]);
  assert.ok(manifest.contributes.commands.some((item) => item.command === 'codexBuilder.setDecisionAuthority'));
  assert.ok(manifest.contributes.commands.some((item) => item.command === 'codexBuilder.showVersion'));
});

test('v1 prompt can include concise project brain, task tags, relevant files and exact verification commands', () => {
  const prompt = buildPrompt({
    intent: 'create a password vault with SQLite and encryption',
    mode: 'feature',
    decisionAuthority: 'autonomous',
    projectSummary: 'Stack: Electron + React | Database: SQLite | Storage: local-only',
    taskTags: ['FEATURE', 'DATABASE_CHANGE', 'SECURITY_SENSITIVE'],
    relevantFiles: ['src/main/db.js', 'src/renderer/Vault.jsx'],
    verificationCommands: ['npm run test', 'npm run build']
  });
  assert.match(prompt, /PROJECT BRAIN/i);
  assert.match(prompt, /Electron \+ React/);
  assert.match(prompt, /src\/main\/db\.js/);
  assert.match(prompt, /npm run test/);
  assert.match(prompt, /FEATURE.*DATABASE_CHANGE.*SECURITY_SENSITIVE/s);
});

test('package manifest exposes v1 sidebar, project brain commands and context budget', () => {
  const manifest = require('../package.json');
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.ok(manifest.contributes.viewsContainers.activitybar.some((item) => item.id === 'codexBuilder'));
  assert.ok(manifest.contributes.views.codexBuilder.some((item) => item.id === 'codexBuilder.sidebar'));
  assert.deepEqual(manifest.contributes.configuration.properties['codexBuilder.contextBudget'].enum, ['economy', 'balanced', 'deep']);
  for (const command of [
    'codexBuilder.refreshProjectBrain',
    'codexBuilder.generateAgents',
    'codexBuilder.openProjectProfile',
    'codexBuilder.openProjectDecisions',
    'codexBuilder.clearHistory'
  ]) {
    assert.ok(manifest.contributes.commands.some((item) => item.command === command), `missing ${command}`);
  }
});


test('v1.1 sidebar keeps Project Brain as readable metadata rows and visible action buttons', () => {
  const fs = require('node:fs');
  const sidebar = fs.readFileSync(require.resolve('../src/sidebarProvider'), 'utf8');
  assert.match(sidebar, /projectMetaRow/);
  assert.match(sidebar, /projectMetaLabel/);
  assert.match(sidebar, /projectMetaValue/);
  assert.match(sidebar, /projectActions/);
  assert.match(sidebar, /projectAction/);
  assert.doesNotMatch(sidebar, /id=\"projectSummary\"/);
});
