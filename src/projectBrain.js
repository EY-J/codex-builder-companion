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

function readmePurpose(readmeText = '') {
  const paragraphs = String(readmeText).slice(0, 12000).split(/\r?\n\s*\r?\n/);
  for (const paragraph of paragraphs) {
    const text = paragraph.split(/\r?\n/)
      .filter((line) => !/^\s*(?:#|>|```|~~~|\[!|!\[|[-*] |\d+\. )/.test(line))
      .join(' ').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[`*_]/g, '').replace(/\s+/g, ' ').trim();
    if (text.length >= 30 && !/^(?:installation|getting started|usage|features)\b/i.test(text)) return text.slice(0, 240);
  }
  return '';
}

function analyzeProject({ packageJson = {}, fileNames = [], rootEntries = [], readmeText = '', workspaceName = '' } = {}) {
  const deps = depsOf(packageJson);
  const normalizedFiles = fileNames.map((file) => String(file).replace(/\\/g, '/'));
  const packageManager = detectPackageManager(rootEntries);
  const frameworks = [];
  if (hasDep(deps, '@tauri-apps/api') || rootEntries.includes('src-tauri')) {
    const version = String(deps['@tauri-apps/api'] || '');
    frameworks.push(/^[^\d]*2(?:\D|$)/.test(version) ? 'Tauri 2' : 'Tauri');
  }
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

  let projectType = '';
  if (packageJson.engines?.vscode) projectType = 'VS Code extension';
  else if (frameworks.some((framework) => framework.startsWith('Tauri'))) projectType = 'Desktop application';
  else if (frameworks.includes('Electron')) projectType = 'Desktop application';
  else if (frameworks.some((framework) => ['Next.js', 'React', 'Vue', 'Angular', 'Svelte', 'Astro'].includes(framework))) projectType = 'Web application';

  const documentation = uniq(normalizedFiles
    .filter((file) => /^(?:README\.md|CONTRIBUTING\.md|docs\/[\w./-]+\.md)$/i.test(file))
    .filter((file) => !file.split('/').some((part) => part.startsWith('.'))))
    .sort((a, b) => {
      const rank = (file) => /(^|\/)README\.md$/i.test(file) ? 0 : /architecture|design|overview/i.test(file) ? 1 : /reliability|security/i.test(file) ? 2 : 3;
      return rank(a) - rank(b) || a.localeCompare(b);
    })
    .slice(0, 6);
  if (rootEntries.includes('README.md') && !documentation.includes('README.md')) documentation.unshift('README.md');

  const architecture = {};
  const commonDirs = [
    ['app', ['src/app/', 'app/']],
    ['components', ['src/components/', 'components/']],
    ['features', ['src/features/', 'features/']],
    ['main', ['src/main/']],
    ['renderer', ['src/renderer/']],
    ['native backend', ['src-tauri/src/']],
    ['server', ['src/server/', 'server/']],
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
    packageName: packageJson.name || workspaceName,
    displayName: packageJson.displayName || '',
    projectType,
    purpose: readmePurpose(readmeText) || packageJson.description || '',
    packageManager,
    frameworks: uniq(frameworks),
    languages: uniq(languages),
    databases: uniq(databases),
    styling: uniq(styling),
    testing: uniq(testing),
    sourceRoot,
    architecture,
    documentation: documentation.slice(0, 6),
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
    projectType: '',
    purpose: '',
    architecturalConstraints: [],
    avoidUnrelatedRefactors: true,
    reuseExistingDependencies: true
  };
  if (database === 'SQLite') {
    decisions.storageBoundary = 'local-only';
  }
  return decisions;
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
  const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const section = (heading, bullets) => {
    if (bullets.length) lines.push(`## ${heading}`, '', ...bullets.map((bullet) => `- ${bullet}`), '');
  };
  const lines = ['# Repository Instructions', ''];
  const rules = ['Follow the existing project architecture and nearby code patterns.'];
  if (decisions.reuseExistingDependencies !== false) rules.push('Reuse existing dependencies and utilities before adding new packages.');
  if (decisions.avoidUnrelatedRefactors !== false) rules.push('Keep changes focused on the requested task.');
  if (profile.packageManager) rules.push(`Use ${clean(profile.packageManager)} for package scripts and dependency changes.`);
  if ((profile.verificationCommands || []).length) rules.push(`Before finishing, run the relevant existing checks: ${profile.verificationCommands.map(clean).join(', ')}.`);
  section('Development Rules', rules);

  const overview = [];
  const name = clean(profile.displayName || profile.packageName);
  const type = clean(decisions.projectType || profile.projectType);
  const purpose = clean(decisions.purpose || profile.purpose);
  if (name) overview.push(`Name: ${name}`);
  if (type) overview.push(`Type: ${type}`);
  if (purpose) overview.push(`Purpose: ${purpose}`);
  section('Project Overview', overview);

  const stack = [];
  const frameworks = clean(decisions.framework || (profile.frameworks || []).join(', '));
  const database = clean(decisions.database || (profile.databases || []).join(', '));
  const styling = clean(decisions.styling || (profile.styling || []).join(', '));
  if (frameworks) stack.push(`Frameworks: ${frameworks}`);
  if ((profile.languages || []).length) stack.push(`Languages: ${profile.languages.map(clean).join(', ')}`);
  if (database) stack.push(`Data: ${database}`);
  if (styling) stack.push(`Styling: ${styling}`);
  if ((profile.testing || []).length) stack.push(`Testing: ${profile.testing.map(clean).join(', ')}`);
  section('Technology Stack', stack);

  const codebase = [];
  const sourceRoot = clean(decisions.sourceRoot || profile.sourceRoot);
  if (sourceRoot) codebase.push(`Application source: \`${sourceRoot}/\``);
  for (const [area, location] of Object.entries(profile.architecture || {})) {
    if (location !== sourceRoot) codebase.push(`${area[0].toUpperCase()}${area.slice(1)}: \`${clean(location)}/\``);
  }
  section('Codebase Map', codebase);

  const constraints = [];
  if (database) constraints.push(`Use the existing ${database} data layer; preserve existing user data and migrations.`);
  if (decisions.storageBoundary === 'local-only') constraints.push('Keep storage local unless the project explicitly requires a remote service.');
  else if (decisions.storageBoundary) constraints.push(`Storage boundary: ${clean(decisions.storageBoundary)}.`);
  if (decisions.architecture) constraints.push(clean(decisions.architecture));
  const explicit = Array.isArray(decisions.architecturalConstraints) ? decisions.architecturalConstraints : [];
  for (const constraint of explicit.map(clean).filter(Boolean)) if (!constraints.includes(constraint)) constraints.push(constraint);
  section('Architectural Constraints', constraints);

  section('Project Documentation', (profile.documentation || []).map((file) => `\`${clean(file)}\``));
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
