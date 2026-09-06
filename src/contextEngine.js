const path = require('path');
const { detectMode } = require('./promptBuilder');

function normalize(text = '') {
  return String(text).toLowerCase().replace(/\s+/g, ' ').trim();
}

function classifyTask(intent = '') {
  const text = normalize(intent);
  const mode = detectMode(intent);
  const tags = [];
  const push = (tag, yes) => { if (yes && !tags.includes(tag)) tags.push(tag); };

  push('VISUAL_MATCH', mode === 'match');
  push('BUG_FIX', mode === 'fix');
  push('FEATURE', mode === 'feature');
  push('SMALL_FEATURE', mode === 'add');
  push('UI_CHANGE', /navbar|button|card|modal|sidebar|layout|ui|screen|page|component|style|css|design|visual|footer|header/.test(text) || mode === 'match');
  push('ANIMATION', /animation|animate|motion|transition|reveal|sketch|draw|drawing|cursor|mouse|easing|keyframe/.test(text));
  push('TYPOGRAPHY', /font|typography|font-size|font size|font-weight|font weight|bold|letter spacing|line height/.test(text));
  push('FORM', /form|input|field|validation|submit|checkbox|radio|dropdown|select/.test(text));
  push('NAVIGATION', /route|routing|navigation|navigate|navbar|menu|tab|breadcrumb/.test(text));
  push('API', /api|endpoint|request|response|fetch|webhook|integration|graphql|rest api/.test(text));
  push('STATE_MANAGEMENT', /state management|store|redux|zustand|context provider|global state/.test(text));
  push('FILE_UPLOAD', /upload|file picker|drag and drop|attachment/.test(text));
  push('RESPONSIVE', /responsive|mobile|tablet|desktop|breakpoint|viewport/.test(text));
  push('DATABASE_CHANGE', /database|sqlite|postgres|mysql|mongo|schema|migration|persist|storage|stored/.test(text));
  push('SECURITY_SENSITIVE', /password|credential|secret|vault|encrypt|authentication|authorization|token|private key|api key/.test(text));
  push('PERFORMANCE', /performance|optimi[sz]e|slow|latency|bundle|memory|3g|4g/.test(text));
  push('ACCESSIBILITY', /accessibility|a11y|wcag|screen reader|keyboard navigation/.test(text));
  push('TESTING', /test|testing|coverage|vitest|jest|playwright|cypress/.test(text));
  push('REFACTOR', /refactor|restructure|cleanup|clean up|architecture/.test(text));
  push('ARCHITECTURE', /architecture|subsystem|service layer|data layer|repository pattern|major refactor/.test(text));
  push('LARGE_FEATURE', mode === 'feature' && (text.length > 220 || /system|module|workflow|management|dashboard|portal/.test(text)));

  return { mode, tags };
}

const STOP = new Set('the a an and or to of in on for with this that my our your please lets now create add update make feature system using use should be is it as from into by requested functionality existing project projects primary file context'.split(' '));

function intentTokens(intent = '') {
  return [...new Set(normalize(intent)
    .replace(/[^a-z0-9_/-]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOP.has(token))
    .map((token) => token.replace(/s$/, '')))];
}

function rankRelevantFiles(intent = '', filePaths = [], { limit = 6, preferred = [] } = {}) {
  const tokens = intentTokens(intent);
  const preferredSet = new Set(preferred);
  return filePaths
    .map((file, index) => {
      const normalized = String(file).replace(/\\/g, '/');
      const lower = normalized.toLowerCase();
      const base = path.posix.basename(lower).replace(/\.[^.]+$/, '');
      let score = preferredSet.has(normalized) ? 100 : 0;
      for (const token of tokens) {
        if (base.includes(token)) score += 12;
        else if (lower.includes(`/${token}`) || lower.includes(`${token}/`)) score += 7;
        else if (lower.includes(token)) score += 3;
      }
      if (/node_modules|\.next|dist|build|coverage|vendor/.test(lower)) score -= 100;
      return { file: normalized, score, index };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, Math.max(0, limit))
    .map((item) => item.file);
}

function extractImports(source = '') {
  const result = [];
  const regexes = [
    /\bimport\s+(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g
  ];
  for (const regex of regexes) {
    let match;
    while ((match = regex.exec(source))) {
      if (!result.includes(match[1])) result.push(match[1]);
    }
  }
  return result;
}

function candidatePaths(base) {
  return [
    base,
    `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.jsx`, `${base}.mjs`, `${base}.cjs`,
    `${base}.css`, `${base}.scss`, `${base}.json`,
    `${base}/index.ts`, `${base}/index.tsx`, `${base}/index.js`, `${base}/index.jsx`
  ];
}

function resolveImportPaths(currentFile = '', imports = [], filePaths = []) {
  const files = new Set(filePaths.map((f) => String(f).replace(/\\/g, '/')));
  const currentDir = path.posix.dirname(String(currentFile).replace(/\\/g, '/'));
  const resolved = [];
  for (const specifier of imports) {
    let base = '';
    if (specifier.startsWith('.')) base = path.posix.normalize(path.posix.join(currentDir, specifier));
    else if (specifier.startsWith('@/')) base = `src/${specifier.slice(2)}`;
    else continue;
    const match = candidatePaths(base).find((candidate) => files.has(candidate));
    if (match && !resolved.includes(match)) resolved.push(match);
  }
  return resolved;
}

function estimateTokens(text = '') {
  const value = String(text || '');
  if (!value) return 0;
  return Math.max(1, Math.ceil(value.length / 4));
}

function dedupeText(text = '') {
  const seen = new Set();
  const lines = [];
  for (const line of String(text).split(/\r?\n/)) {
    const key = line.trim().replace(/\s+/g, ' ').toLowerCase();
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    lines.push(line.replace(/[ \t]+$/g, ''));
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function contextLimit(value = 'balanced') {
  const mode = normalize(value);
  if (mode === 'economy') return 3;
  if (mode === 'deep') return 10;
  return 6;
}

function usageStats(history = []) {
  const prompts = history.length;
  const estimatedPromptTokens = history.reduce((sum, item) => sum + Number(item.promptTokens || 0), 0);
  return {
    prompts,
    estimatedPromptTokens,
    averageEstimatedPromptTokens: prompts ? Math.round(estimatedPromptTokens / prompts) : 0,
    oneShotFeatures: history.filter((item) => item.mode === 'feature').length
  };
}

module.exports = {
  classifyTask,
  rankRelevantFiles,
  extractImports,
  resolveImportPaths,
  estimateTokens,
  dedupeText,
  contextLimit,
  usageStats,
  intentTokens
};
