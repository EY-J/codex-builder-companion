const { interpretIntent, normalizeInterpretation } = require('./localIntelligence');

function normalize(text = '') {
  return String(text).toLowerCase().replace(/\s+/g, ' ').trim();
}

function sanitizeIntent(intent = '') {
  let text = String(intent || '').trim();
  if (!text) return '';

  const generatedMatch = text.match(/(?:ONE-SHOT FEATURE IMPLEMENTATION|IMPLEMENTATION BRIEF)[\s\S]*?\b(?:TASK|OBJECTIVE|REQUESTED CHANGES|REQUIREMENTS)\s*\n+([\s\S]*?)(?=\n+(?:GOAL|PROJECT CONTEXT|IMPLEMENTATION INTERPRETATION|ACCEPTANCE CRITERIA|EXECUTION RULES|WORKFLOW)\b|$)/i);
  if (generatedMatch && generatedMatch[1]) text = generatedMatch[1].trim();

  text = text.replace(/^(?:\s*task\s*:\s*)+/i, '').trim();
  const markers = [
    "Add the requested functionality using the project's existing patterns and dependencies.",
    "Update the requested area using the project's existing architecture and styling patterns.",
    'Primary file/context:',
    'Project Brain:',
    'Task signals:',
    'Likely relevant files:',
    'Briefly state your approach in 2-3 bullets',
    'Preserve unrelated code. Keep the change targeted.',
    '\nIMPLEMENTATION INTERPRETATION\n',
    '\nACCEPTANCE CRITERIA\n',
    '\nEXECUTION RULES\n'
  ];
  const lower = text.toLowerCase();
  let cutAt = text.length;
  for (const marker of markers) {
    const index = lower.indexOf(marker.toLowerCase());
    if (index > 0 && index < cutAt) cutAt = index;
  }
  return text.slice(0, cutAt).replace(/\s+/g, ' ').trim();
}

function isSubstantialFeature(intent = '') {
  const text = normalize(sanitizeIntent(intent));
  const explicitFeature = /\b(feature|module|system|workflow|management|portal|dashboard|vault)\b/.test(text);
  const infrastructure = /\b(database|sqlite|postgres|storage|persist|persistence|migration|schema|api|integration|authentication|authorization|encryption|encrypted|security|role|roles|permission|permissions|sync)\b/.test(text);
  const lifecycleWords = [
    /\bcreate\b/, /\badd\b/, /\bedit\b/, /\bupdate\b/, /\bdelete\b/,
    /\bview\b/, /\bsearch\b/, /\bfilter\b/, /\bsave\b/, /\bexport\b/, /\bimport\b/
  ].filter((pattern) => pattern.test(text)).length;
  return explicitFeature || infrastructure || lifecycleWords >= 3 || (text.length >= 110 && /,|\band\b|\bwith\b/.test(text));
}

function detectMode(intent = '') {
  const text = normalize(sanitizeIntent(intent));
  if (/screenshot|photo|image|picture|reference|match|like this|copy this/.test(text)) return 'match';
  if (/\bfix\b|bug|broken|error|issue|problem|not working|fails|failing/.test(text)) return 'fix';
  if (/\badd\b|\bcreate\b|\binsert\b|\bimplement\b|\bbuild\b|new feature/.test(text)) return isSubstantialFeature(text) ? 'feature' : 'add';
  return 'update';
}

function cleanEditorFileContext(relativeFile = '', isUntitled = false, scheme = 'file') {
  const file = String(relativeFile || '').trim();
  if (!file) return '';
  if (isUntitled || String(scheme || '').toLowerCase() === 'untitled' || /^Untitled-\d+$/i.test(file)) return '';
  return file;
}

function normalizeDecisionAuthority(value = 'balanced') {
  const normalized = normalize(value);
  return ['conservative', 'balanced', 'autonomous'].includes(normalized) ? normalized : 'balanced';
}

function decisionAuthoritySection(value = 'balanced') {
  const level = normalizeDecisionAuthority(value);
  if (level === 'conservative') {
    return [
      'DECISION AUTHORITY — CONSERVATIVE',
      '- Make routine, low-risk implementation decisions yourself and continue without asking.',
      '- Ask before broad architectural changes, new major dependencies, destructive migrations, or product/security-policy choices that materially change behavior.',
      '- Do not ask about naming, file placement, ordinary validation, normal schema details, component composition, or test structure when these can be inferred from the repository.'
    ];
  }
  if (level === 'autonomous') {
    return [
      'DECISION AUTHORITY — AUTONOMOUS',
      '- Make implementation decisions yourself using repository evidence, established best practices, secure defaults, and minimum necessary complexity.',
      '- Do not present routine technical options and ask me to choose. Select the best conventional option compatible with the existing stack.',
      '- Ask only when genuinely blocked by missing information that cannot be inferred safely, or before an irreversible/destructive action or major product decision with materially different user-visible outcomes.'
    ];
  }
  return [
    'DECISION AUTHORITY — BALANCED',
    '- Do not ask me to choose routine implementation details. Make normal implementation decisions yourself and continue.',
    '- Prefer the option that best matches the current codebase, has lower security/maintenance risk, adds less complexity, and requires fewer new dependencies.',
    '- Ask only for a major product, destructive, or architectural decision that cannot be safely inferred from the repository or task.'
  ];
}

function compactDecisionAuthority(value = 'balanced') {
  const level = normalizeDecisionAuthority(value);
  if (level === 'autonomous') return 'Use your best judgment for routine implementation decisions; do not ask me to choose normal technical details. Ask only if genuinely blocked or before an irreversible/destructive product-level decision.';
  if (level === 'conservative') return 'Make routine low-risk implementation decisions yourself; ask only before broad architecture, major dependency, destructive, or product/security-policy changes.';
  return 'Make routine implementation decisions yourself; ask only for a major product, destructive, or architectural decision that cannot be safely inferred.';
}

function isSecuritySensitive(intent = '') {
  return /password|credential|secret|vault|encrypt|encryption|master password|authentication|authorization|token|private key|api key/.test(normalize(intent));
}

function usesPersistentStorage(intent = '') {
  return /sqlite|database|storage|persist|persistence|schema|migration|stored|save to disk|local database/.test(normalize(intent));
}

function isPasswordVault(intent = '') {
  const text = normalize(intent);
  return /\b(password vault|vault|credential vault|credential manager|password manager)\b/.test(text) && /password|credential/.test(text);
}

function securityRequirements() {
  return [
    'SECURITY-SENSITIVE REQUIREMENTS',
    '- Treat this functionality as security-sensitive and prefer secure defaults over convenience.',
    '- Never store passwords, secrets, or encryption keys as plaintext.',
    '- Use established, runtime-appropriate authenticated encryption and cryptographic primitives. Do not invent custom cryptography.',
    '- If a master password/passphrase is part of the design, derive keys with an established password KDF supported by the runtime; never store the master password itself.',
    '- Use fresh random salts/nonces/IVs as required by the selected primitives and store only the non-secret metadata needed for decryption/key derivation.',
    '- Never log secrets, decrypted credentials, master passwords, or encryption keys.',
    '- Validate inputs and use parameterized queries/prepared statements for database access.',
    '- Preserve a local-only storage boundary when that is the existing product decision; do not add remote sync, telemetry, or external credential storage unless explicitly required.'
  ];
}

function passwordVaultDefaults() {
  return [
    'PASSWORD VAULT DEFAULT DECISIONS',
    '- Keep the vault as local-only persistent storage unless the existing project already establishes another explicitly compatible secure boundary.',
    '- Encrypt sensitive credential fields at rest using a mature authenticated-encryption implementation available to the runtime; do not store readable password copies.',
    '- Reuse an existing secure unlock mechanism when appropriate. Otherwise use a master vault passphrase, never store it, and derive the encryption key with a mature password KDF supported by the runtime.',
    '- Keep passwords hidden by default. Reveal and copy must be deliberate actions.',
    '- Never make password fields searchable. Search/filter only non-secret metadata that can be handled safely by the chosen storage design.',
    '- Use confirmation before permanent credential deletion. Do not add cloud recovery, sharing, synchronization, or browser autofill unless explicitly requested.'
  ];
}

function persistenceRequirements() {
  return [
    'PERSISTENCE REQUIREMENTS',
    '- Inspect and follow the project’s existing data-access and migration/schema conventions first.',
    '- Ensure data survives application restart where persistence is part of the requested behavior.',
    '- Use stable IDs, appropriate timestamps, validation, and indexes only where useful.',
    '- Do not keep duplicate plaintext copies of protected data.',
    '- Keep persistence logic separated from UI code when the existing architecture supports that separation.'
  ];
}

function pushBullets(lines, heading, values = []) {
  const clean = (values || []).filter(Boolean);
  if (!clean.length) return;
  lines.push('', heading);
  clean.forEach((value) => lines.push(`- ${String(value).replace(/^[-•]\s*/, '')}`));
}

function addProjectContext(lines, {
  relativeFile = '', hasSelection = false, projectSummary = '', taskTags = [], relevantFiles = []
} = {}) {
  lines.push('', 'PROJECT CONTEXT');
  if (relativeFile) lines.push(`- Primary file/context: ${relativeFile}`);
  if (hasSelection) lines.push('- Treat the current editor selection as the primary target when relevant.');
  if (projectSummary) lines.push(`- Project Brain: ${projectSummary}`);
  if (taskTags.length) lines.push(`- Task signals: ${taskTags.slice(0, 10).join(' · ')}`);
  if (relevantFiles.length) {
    lines.push('', 'LIKELY RELEVANT FILES');
    relevantFiles.slice(0, 10).forEach((file) => lines.push(`- ${file}`));
    lines.push('- Start with these paths when relevant; inspect additional files only when the implementation requires it.');
  }
}

function resolveBrief({ intent, mode, taskTags, interpretation }) {
  if (interpretation && typeof interpretation === 'object') {
    const localFallback = interpretIntent({ intent, mode, taskTags });
    return normalizeInterpretation(interpretation, localFallback);
  }
  return interpretIntent({ intent, mode, taskTags });
}

function buildPrompt({
  intent,
  mode = 'update',
  decisionAuthority = 'balanced',
  relativeFile = '',
  hasSelection = false,
  diagnostics = [],
  projectSummary = '',
  taskTags = [],
  relevantFiles = [],
  verificationCommands = [],
  interpretation = null,
  intelligenceSource = 'local'
}) {
  const cleanIntent = sanitizeIntent(intent);
  const brief = resolveBrief({ intent: cleanIntent, mode, taskTags, interpretation });
  const isFeature = mode === 'feature';
  const lines = [
    isFeature ? 'ONE-SHOT FEATURE IMPLEMENTATION' : 'IMPLEMENTATION BRIEF',
    '',
    'OBJECTIVE',
    brief.objective
  ];

  pushBullets(lines, isFeature ? 'EXPLICIT REQUIREMENTS' : (mode === 'fix' ? 'REQUIRED OUTCOME' : 'EXPLICIT REQUESTS'), brief.explicitRequirements);
  pushBullets(lines, 'INFERRED SUPPORTING REQUIREMENTS', brief.inferredRequirements);
  pushBullets(lines, 'IMPLEMENTATION INTERPRETATION', brief.implementationGuidance);
  pushBullets(lines, 'PRESERVE / CONSTRAINTS', brief.constraints);
  pushBullets(lines, 'AVOID / REJECTED BEHAVIOR', brief.rejectedBehaviors);

  addProjectContext(lines, { relativeFile, hasSelection, projectSummary, taskTags, relevantFiles });

  lines.push('', 'PROMPT INTELLIGENCE', `- Interpretation source: ${intelligenceSource === 'ai' ? 'AI Enhanced (ChatGPT-authenticated Codex)' : intelligenceSource === 'local-fallback' ? 'Local Advanced fallback' : 'Local Advanced'}.`);

  if (mode === 'fix' && diagnostics.length) pushBullets(lines, 'CURRENT DIAGNOSTICS', diagnostics.slice(0, 3));

  if (isFeature) {
    lines.push(
      '',
      'FEATURE EXPECTATIONS',
      '- Inspect the relevant codebase, dependencies, architecture, UI patterns, data layer, security utilities, and repository instructions such as AGENTS.md before making changes.',
      '- Reuse existing patterns and dependencies whenever appropriate. Do not rewrite unrelated areas or introduce a parallel architecture.',
      '- Infer only the normal supporting behavior needed to make the requested feature genuinely usable; do not invent unrelated product scope.',
      '- Include validation, loading/empty/error states, and safe failure handling where relevant.',
      '',
      ...decisionAuthoritySection(decisionAuthority)
    );
  }

  if (isSecuritySensitive(cleanIntent)) lines.push('', ...securityRequirements());
  if (isPasswordVault(cleanIntent)) lines.push('', ...passwordVaultDefaults());
  if (usesPersistentStorage(cleanIntent)) lines.push('', ...persistenceRequirements());

  pushBullets(lines, 'ACCEPTANCE CRITERIA', brief.acceptanceCriteria);

  if (isFeature) {
    lines.push(
      '',
      'WORKFLOW',
      '1. Inspect the relevant existing files and dependencies first.',
      '2. State your implementation approach in no more than 3 concise bullets.',
      '3. Immediately implement the feature. Do not wait for another confirmation or for me to say “proceed”.',
      '4. Keep changes focused and preserve unrelated behavior.',
      verificationCommands.length
        ? `5. Run the relevant existing verification commands where applicable: ${verificationCommands.join(', ')}.`
        : '5. Run the relevant tests, type checks, linting, and/or production build available in the project.',
      '6. Fix issues caused by your implementation before finishing.',
      '',
      'FINAL RESPONSE',
      'Keep the completion summary concise: what changed, important decisions, files/schema changed, and verification performed.'
    );
  } else {
    lines.push(
      '',
      'EXECUTION RULES',
      `- ${compactDecisionAuthority(decisionAuthority)}`,
      '- Inspect the relevant implementation before editing; follow existing repository patterns and AGENTS.md instructions when present.',
      '- Briefly state the approach in 2-3 bullets, then implement immediately without waiting for another confirmation.',
      verificationCommands.length
        ? `- Verify with the relevant existing command(s): ${verificationCommands.join(', ')}.`
        : '- Run the smallest relevant verification available after editing.',
      '- Keep the change targeted. Do not perform unrelated refactors or add dependencies unless the requested result genuinely requires them.'
    );
  }

  return lines.join('\n').trim();
}

module.exports = {
  detectMode,
  buildPrompt,
  isSubstantialFeature,
  sanitizeIntent,
  normalizeDecisionAuthority,
  cleanEditorFileContext,
  interpretIntent
};
