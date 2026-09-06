const path = require('path');

function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}

function depsOf(packageJson = {}) {
  return {
    ...(packageJson.dependencies || {}),
    ...(packageJson.devDependencies || {}),
    ...(packageJson.peerDependencies || {})
  };
}

function hasDep(deps, ...names) {
  return names.some((name) => Object.prototype.hasOwnProperty.call(deps, name));
}

function detectPackageManager(rootEntries = []) {
  const entries = new Set(rootEntries.map((x) => String(x).toLowerCase()));
  if (entries.has('pnpm-lock.yaml')) return 'pnpm';
  if (entries.has('yarn.lock')) return 'yarn';
  if (entries.has('bun.lockb') || entries.has('bun.lock')) return 'bun';
  return 'npm';
}

function scriptCommand(packageManager, script) {
  if (packageManager === 'yarn') return `yarn ${script}`;
  if (packageManager === 'pnpm') return `pnpm ${script}`;
  if (packageManager === 'bun') return `bun run ${script}`;
  return `npm run ${script}`;
}

function verificationCommands(packageJson = {}, packageManager = 'npm') {
  const scripts = packageJson.scripts || {};
  const ordered = [
    ['typecheck', ['typecheck', 'type-check', 'check:types']],
    ['test', ['test']],
    ['lint', ['lint']],
    ['build', ['build']],
    ['check', ['check']]
  ];
  const picked = [];
  for (const [, names] of ordered) {
    const found = names.find((name) => scripts[name]);
    if (found && !picked.includes(found)) picked.push(found);
  }
  return picked.slice(0, 4).map((script) => scriptCommand(packageManager, script));
}

function analyzeProject({ packageJson = {}, fileNames = [], rootEntries = [] } = {}) {
  const deps = depsOf(packageJson);
  const normalizedFiles = fileNames.map((file) => String(file).replace(/\\/g, '/'));
  const packageManager = detectPackageManager(rootEntries);
  const frameworks = [];
  if (hasDep(deps, 'electron')) frameworks.push('Electron');
  if (hasDep(deps, 'next')) frameworks.push('Next.js');
  if (hasDep(deps, 'react', 'react-dom')) frameworks.push('React');
  if (hasDep(deps, 'vue')) frameworks.push('Vue');
  if (hasDep(deps, '@angular/core')) frameworks.push('Angular');
  if (hasDep(deps, 'svelte', '@sveltejs/kit')) frameworks.push('Svelte');
  if (hasDep(deps, 'express')) frameworks.push('Express');
  if (hasDep(deps, 'astro')) frameworks.push('Astro');

  const languages = [];
  if (hasDep(deps, 'typescript') || normalizedFiles.some((f) => /\.(ts|tsx)$/.test(f))) languages.push('TypeScript');
  if (normalizedFiles.some((f) => /\.(js|jsx|mjs|cjs)$/.test(f)) || frameworks.length) languages.push('JavaScript');
  if (normalizedFiles.some((f) => /\.py$/.test(f))) languages.push('Python');
  if (normalizedFiles.some((f) => /\.go$/.test(f))) languages.push('Go');
  if (normalizedFiles.some((f) => /\.rs$/.test(f))) languages.push('Rust');

  const databases = [];
  if (hasDep(deps, 'better-sqlite3', 'sqlite3', 'sqlite', '@libsql/client') || normalizedFiles.some((f) => /sqlite|\.db$/i.test(f))) databases.push('SQLite');
  if (hasDep(deps, 'pg', 'postgres', 'postgresql')) databases.push('PostgreSQL');
  if (hasDep(deps, 'mysql', 'mysql2')) databases.push('MySQL');
  if (hasDep(deps, 'mongodb', 'mongoose')) databases.push('MongoDB');
  if (hasDep(deps, 'prisma', '@prisma/client')) databases.push('Prisma ORM');
  if (hasDep(deps, 'drizzle-orm')) databases.push('Drizzle ORM');

  const styling = [];
  if (hasDep(deps, 'tailwindcss')) styling.push('Tailwind CSS');
  if (hasDep(deps, 'styled-components')) styling.push('styled-components');
  if (hasDep(deps, '@emotion/react', '@emotion/styled')) styling.push('Emotion');
  if (normalizedFiles.some((f) => /\.module\.(css|scss|sass)$/.test(f))) styling.push('CSS Modules');
  if (!styling.length && normalizedFiles.some((f) => /\.(css|scss|sass)$/.test(f))) styling.push('CSS');

  const testing = [];
  if (hasDep(deps, 'vitest')) testing.push('Vitest');
  if (hasDep(deps, 'jest')) testing.push('Jest');
  if (hasDep(deps, '@playwright/test', 'playwright')) testing.push('Playwright');
  if (hasDep(deps, 'cypress')) testing.push('Cypress');

  const sourceRoot = rootEntries.includes('src') || normalizedFiles.some((f) => f.startsWith('src/')) ? 'src' : '';

  const architecture = {};
  const commonDirs = [
    ['app', ['src/app/', 'app/']],
    ['components', ['src/components/', 'components/']],
    ['features', ['src/features/', 'features/']],
    ['main', ['src/main/']],
    ['renderer', ['src/renderer/']],
    ['database', ['src/database/', 'src/db/', 'src/main/database/', 'src/main/db/']],
    ['services', ['src/services/', 'services/']],
    ['tests', ['test/', 'tests/', '__tests__/']]
  ];
  for (const [key, prefixes] of commonDirs) {
    const found = prefixes.find((prefix) => normalizedFiles.some((file) => file.startsWith(prefix)));
    if (found) architecture[key] = found.replace(/\/$/, '');
  }

  return {
    schemaVersion: 1,
    packageName: packageJson.name || '',
    packageManager,
    frameworks: uniq(frameworks),
    languages: uniq(languages),
    databases: uniq(databases),
    styling: uniq(styling),
    testing: uniq(testing),
    sourceRoot,
    architecture,
    verificationCommands: verificationCommands(packageJson, packageManager)
  };
}

function defaultDecisions(profile = {}) {
  const database = (profile.databases || []).find((item) => !/ORM/.test(item)) || '';
  const decisions = {
    packageManager: profile.packageManager || 'npm',
    framework: (profile.frameworks || []).join(' + '),
    database,
    styling: (profile.styling || []).join(' + '),
    sourceRoot: profile.sourceRoot || '',
    avoidUnrelatedRefactors: true,
    reuseExistingDependencies: true
  };
  if (database === 'SQLite') {
    decisions.storageBoundary = 'local-only';
  }
  return decisions;
}

function decisionLines(decisions = {}) {
  const allowed = [
    ['framework', 'Framework'],
    ['database', 'Database'],
    ['styling', 'Styling'],
    ['sourceRoot', 'Source root'],
    ['storageBoundary', 'Storage'],
    ['architecture', 'Architecture']
  ];
  return allowed
    .filter(([key]) => decisions[key])
    .map(([key, label]) => `${label}: ${decisions[key]}`);
}


function buildProjectDisplayRows(profile = {}, decisions = {}) {
  const rows = [];
  const add = (label, value) => {
    const clean = String(value || '').trim();
    if (clean) rows.push({ label, value: clean });
  };

  add('Stack', (profile.frameworks || []).join(' + '));
  add('Language', (profile.languages || []).join(' + '));
  add('Data', (profile.databases || []).join(' + '));
  add('Styling', (profile.styling || []).join(' + '));
  add('Source', profile.sourceRoot ? `/${profile.sourceRoot}` : '');
  add('Storage', decisions.storageBoundary);
  return rows;
}

function buildProjectContextSummary(profile = {}, decisions = {}) {
  const parts = [];
  if ((profile.frameworks || []).length) parts.push(`Stack: ${profile.frameworks.join(' + ')}`);
  if ((profile.languages || []).length) parts.push(`Language: ${profile.languages.join(' + ')}`);
  if ((profile.databases || []).length) parts.push(`Data: ${profile.databases.join(' + ')}`);
  if ((profile.styling || []).length) parts.push(`Styling: ${profile.styling.join(' + ')}`);
  if (profile.sourceRoot) parts.push(`Source: /${profile.sourceRoot}`);
  if (decisions.storageBoundary) parts.push(`Storage: ${decisions.storageBoundary}`);
  return parts.join(' | ');
}

function buildAgentsMarkdown(profile = {}, decisions = {}) {
  const lines = ['# Repository Instructions', ''];
  const stack = (profile.frameworks || []).join(' + ');
  if (stack) lines.push(`- Use the existing ${stack} architecture.`);
  if ((profile.languages || []).length) lines.push(`- Primary language(s): ${profile.languages.join(', ')}.`);
  if (profile.packageManager) lines.push(`- Use ${profile.packageManager} for package scripts and dependency changes.`);
  if (profile.sourceRoot) lines.push(`- Keep application code under \`/${profile.sourceRoot}\` unless the repository already establishes another location.`);
  if ((profile.databases || []).length) lines.push(`- Reuse the existing data layer (${profile.databases.join(', ')}); do not introduce a parallel database stack.`);
  if ((profile.styling || []).length) lines.push(`- Follow the existing styling system (${profile.styling.join(', ')}).`);
  for (const text of decisionLines(decisions)) lines.push(`- ${text}.`);
  if (decisions.reuseExistingDependencies !== false) lines.push('- Reuse existing dependencies and utilities before adding new packages.');
  if (decisions.avoidUnrelatedRefactors !== false) lines.push('- Avoid unrelated refactors; keep changes targeted to the requested task.');
  lines.push('- Inspect nearby code and follow existing naming, component, data-access, and testing patterns.');
  if ((profile.verificationCommands || []).length) lines.push(`- Before finishing, run the relevant verification command(s): ${profile.verificationCommands.join(', ')}.`);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

module.exports = {
  analyzeProject,
  buildAgentsMarkdown,
  buildProjectContextSummary,
  buildProjectDisplayRows,
  defaultDecisions,
  detectPackageManager,
  verificationCommands
};
