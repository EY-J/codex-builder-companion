const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('v1.2.0 baseline contains every core runtime module', () => {
  const expected = [
    'extension.js',
    'src/promptBuilder.js',
    'src/projectBrain.js',
    'src/contextEngine.js',
    'src/sidebarProvider.js',
    'src/previewView.js',
    'src/codexUsage.js'
  ];
  for (const rel of expected) {
    assert.equal(fs.existsSync(path.join(root, rel)), true, `missing ${rel}`);
  }
});

test('package manifest is the v1.2.0 canonical baseline', () => {
  const pkg = require('../package.json');
  assert.equal(pkg.version, '1.2.0');
  assert.ok(pkg.contributes?.views?.codexBuilder, 'missing Codex Builder sidebar contribution');
  assert.ok(pkg.scripts?.check?.includes('src/previewView.js'), 'preview module missing from syntax checks');
});

test('v1.2.0 wires the official Codex usage service into the extension lifecycle', () => {
  const pkg = require('../package.json');
  const extensionSource = fs.readFileSync(path.join(root, 'extension.js'), 'utf8');
  assert.equal(pkg.version, '1.2.0');
  assert.ok(pkg.scripts?.check?.includes('src/codexUsage.js'));
  assert.ok(pkg.contributes?.commands?.some((item) => item.command === 'codexBuilder.refreshCodexUsage'));
  assert.match(extensionSource, /CodexUsageService/);
  assert.match(extensionSource, /codexUsage:/);
  assert.match(extensionSource, /codexUsageService\?\.stop\(\)/);
});
