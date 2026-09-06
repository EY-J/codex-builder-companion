function normalize(text = '') {
  return String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function unique(values = [], limit = 12) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const clean = String(value || '').replace(/\s+/g, ' ').trim().replace(/^[\-•]\s*/, '').replace(/[;,:]+$/, '');
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
    if (result.length >= limit) break;
  }
  return result;
}

function ensurePeriod(value = '') {
  const clean = String(value || '').trim();
  if (!clean) return '';
  return /[.!?]$/.test(clean) ? clean : `${clean}.`;
}

function sentenceCase(value = '') {
  const clean = String(value || '').trim();
  return clean ? `${clean.charAt(0).toUpperCase()}${clean.slice(1)}` : '';
}

function stripPoliteness(value = '') {
  return String(value || '')
    .replace(/^(?:please\s+|can you\s+|could you\s+|would you\s+|i want you to\s+|i want to\s+|i need you to\s+|i need to\s+|kindly\s+)+/i, '')
    .replace(/\bplease\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitClauses(intent = '') {
  let text = stripPoliteness(intent);
  if (!text) return [];

  // Protect common phrases that should not be split around "and".
  const protectedPhrases = [
    ['black and white', 'black & white'],
    ['drag and drop', 'drag & drop'],
    ['copy and paste', 'copy & paste'],
    ['show and hide', 'show & hide'],
    ['login and signup', 'login & signup'],
    ['sign in and sign up', 'sign in & sign up']
  ];
  for (const [from, to] of protectedPhrases) text = text.replace(new RegExp(from, 'gi'), to);

  const actionStart = '(?:make|add|remove|delete|change|update|adjust|fix|improve|enhance|keep|preserve|use|show|hide|replace|reduce|increase|move|align|center|animate|create|build|implement|stop|prevent|avoid|do not|don\\\'t|dont|only|instead)';
  const splitter = new RegExp(`(?:\\n+|[.;]+|\\s+then\\s+|\\s+but\\s+(?=${actionStart}\\b)|\\s+and\\s+(?=${actionStart}\\b))`, 'i');

  return unique(
    text.split(splitter)
      .map((part) => part.replace(/\s*&\s*/g, ' and ').trim())
      .filter(Boolean),
    14
  );
}

function cleanTarget(value = '') {
  return String(value || '')
    .replace(/^(?:the|this|that|my|our|current|existing)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectDomains(intent = '', taskTags = []) {
  const text = normalize(intent);
  const tags = new Set((taskTags || []).map((tag) => String(tag).toUpperCase()));
  const domains = [];
  const add = (name, yes) => { if (yes && !domains.includes(name)) domains.push(name); };

  add('ui', tags.has('UI_CHANGE') || /\b(ui|layout|component|page|screen|button|card|modal|sidebar|footer|header|navbar|style|css|visual|spacing|padding|margin)\b/.test(text));
  add('animation', tags.has('ANIMATION') || /\b(animation|animate|motion|transition|reveal|sketch|draw|drawing|cursor|mouse|easing|keyframe|scroll effect)\b/.test(text));
  add('responsive', tags.has('RESPONSIVE') || /\b(responsive|mobile|tablet|desktop|breakpoint|viewport)\b/.test(text));
  add('typography', tags.has('TYPOGRAPHY') || /\b(font|typography|font-size|font size|weight|bold|letter spacing|line height)\b/.test(text));
  add('form', tags.has('FORM') || /\b(form|input|field|validation|submit|checkbox|radio|dropdown|select)\b/.test(text));
  add('navigation', tags.has('NAVIGATION') || /\b(route|routing|navigation|navigate|link|menu|tab|breadcrumb)\b/.test(text));
  add('data', tags.has('DATABASE_CHANGE') || /\b(database|sqlite|postgres|mysql|mongo|schema|migration|storage|persist|save|record|query)\b/.test(text));
  add('api', tags.has('API') || /\b(api|endpoint|request|response|fetch|webhook|integration|http|rest|graphql)\b/.test(text));
  add('security', tags.has('SECURITY_SENSITIVE') || /\b(password|credential|secret|encrypt|auth|authentication|authorization|token|api key|private key|permission)\b/.test(text));
  add('performance', tags.has('PERFORMANCE') || /\b(performance|slow|latency|optimi[sz]e|bundle|memory|render time|loading time)\b/.test(text));
  add('accessibility', tags.has('ACCESSIBILITY') || /\b(accessibility|a11y|wcag|keyboard|screen reader|aria|focus)\b/.test(text));
  add('testing', tags.has('TESTING') || /\b(test|testing|coverage|jest|vitest|playwright|cypress)\b/.test(text));
  return domains;
}

function explicitRequirementFromClause(clause = '') {
  const raw = stripPoliteness(clause).replace(/[.!?]+$/, '').trim();
  if (!raw) return '';
  let m;

  m = raw.match(/^make\s+(.+?)\s+(smaller|shorter|more compact|less tall|less wide)$/i);
  if (m) return `Reduce the visual footprint of ${cleanTarget(m[1])} while keeping required content and behavior intact`;

  m = raw.match(/^make\s+(.+?)\s+(bigger|larger|wider|taller|more prominent)$/i);
  if (m) return `Increase the size or prominence of ${cleanTarget(m[1])} without destabilizing the surrounding layout`;

  m = raw.match(/^make\s+(.+?)\s+(?:look|feel)(?:s)?\s+(?:more\s+)?(.+)$/i);
  if (m) return `Refine ${cleanTarget(m[1])} so it clearly reads or feels ${m[2].trim()}`;

  m = raw.match(/^make\s+(.+?)\s+look(?:s)?\s+like\s+(.+)$/i);
  if (m) return `Adjust ${cleanTarget(m[1])} so its appearance or behavior clearly matches ${m[2].trim()}`;

  m = raw.match(/^(?:reduce|decrease|shrink)\s+(.+)$/i);
  if (m) return `Reduce ${cleanTarget(m[1])} only as much as needed to achieve the requested result`;

  m = raw.match(/^(?:increase|enlarge)\s+(.+)$/i);
  if (m) return `Increase ${cleanTarget(m[1])} while preserving layout stability and responsiveness`;

  m = raw.match(/^(?:remove|delete)\s+(.+)$/i);
  if (m) return `Remove ${cleanTarget(m[1])} and clean up only directly related unused behavior or styling`;

  m = raw.match(/^(?:add|insert|create|implement|build)\s+(.+)$/i);
  if (m) return `Add ${cleanTarget(m[1])} as an integrated part of the existing application rather than an isolated demo`;

  m = raw.match(/^(?:fix|correct|repair)\s+(.+)$/i);
  if (m) return `Diagnose and correct ${cleanTarget(m[1])} at the underlying cause with the smallest reliable change`;

  m = raw.match(/^(?:change|update|adjust|modify|improve|enhance|refine)\s+(.+)$/i);
  if (m) return `Refine ${cleanTarget(m[1])} to achieve the requested outcome while preserving unrelated behavior`;

  m = raw.match(/^(?:keep|preserve)\s+(.+)$/i);
  if (m) return `Preserve ${cleanTarget(m[1])}`;

  if (/^(?:do not|don't|dont|never|avoid|without)\b/i.test(raw)) return sentenceCase(raw);
  if (/\binstead of\b/i.test(raw)) return `Honor this explicit contrast: ${raw}`;
  if (/\bonly\b/i.test(raw)) return `Respect this scope limitation: ${raw}`;
  return sentenceCase(raw);
}

function extractConstraints(clauses = [], intent = '') {
  const constraints = [];
  const rejectedBehaviors = [];
  for (const clause of clauses) {
    const raw = stripPoliteness(clause).replace(/[.!?]+$/, '').trim();
    if (!raw) continue;
    if (/\b(?:do not|don't|dont|never|avoid|without|keep|preserve|unchanged|same|exact|only)\b/i.test(raw)) {
      constraints.push(sentenceCase(raw));
    }
    const instead = raw.match(/(.+?)\s+instead of\s+(.+)/i);
    if (instead) {
      constraints.push(`Treat ${instead[1].trim()} as the desired behavior and avoid ${instead[2].trim()}`);
      rejectedBehaviors.push(instead[2].trim());
    }
    const notLike = raw.match(/(?:not|don't make it|do not make it)\s+(?:look|feel|behave)?\s*like\s+(.+)/i);
    if (notLike) rejectedBehaviors.push(notLike[1].trim());
  }

  const text = normalize(intent);
  if (/\bdon't change\b|\bdo not change\b|\bkeep .* same\b|\bpreserve\b/.test(text)) {
    constraints.push('Treat the named preserved elements as hard constraints rather than suggestions');
  }
  constraints.push('Preserve unrelated code and user-visible behavior');
  return {
    constraints: unique(constraints, 8).map(ensurePeriod),
    rejectedBehaviors: unique(rejectedBehaviors, 6).map(ensurePeriod)
  };
}

function inferObjective(intent = '', mode = 'update', domains = []) {
  const text = normalize(intent);
  if (mode === 'match') return 'Reproduce the requested visual result closely inside the existing interface while preserving established structure, behavior, and responsiveness.';
  if (mode === 'fix') return 'Resolve the reported problem at its underlying cause with a targeted, low-risk change while keeping unrelated behavior intact.';
  if (mode === 'feature') return 'Implement the requested capability as a complete, usable part of the existing application, including only the supporting behavior necessary for the end-to-end flow.';
  if (mode === 'add') return 'Add the requested capability cleanly within the existing project patterns with minimal surface-area change and no unnecessary parallel architecture.';
  if (domains.includes('animation') && domains.includes('ui')) return 'Refine the requested interface and motion behavior so the result communicates the intended visual effect clearly while remaining consistent with the existing design.';
  if (domains.includes('ui')) return 'Refine the requested interface so the visual result matches the user’s intent while preserving the existing design language, responsiveness, and surrounding behavior.';
  if (/\bperformance|slow|latency\b/.test(text)) return 'Improve the reported performance bottleneck with a measured, focused change that preserves existing behavior.';
  return 'Apply the requested change using the project’s existing architecture and conventions, keeping the implementation focused, maintainable, and production-ready.';
}

function inferredRequirements(intent = '', domains = [], mode = 'update') {
  const text = normalize(intent);
  const inferred = [];

  if (domains.includes('ui')) inferred.push('Reuse the existing component structure and styling system before introducing new wrappers, abstractions, or dependencies');
  if (/\bsmaller|shorter|compact|reduce.*(?:size|height|spacing|padding|margin)\b/.test(text)) inferred.push('Prefer tightening existing dimensions, spacing, padding, gaps, or line-height before removing content or restructuring markup');
  if (/\bbigger|larger|wider|taller|prominent\b/.test(text)) inferred.push('Increase size through the existing layout system and check nearby wrapping, overflow, and alignment');
  if (domains.includes('animation')) inferred.push('Animate the smallest meaningful visual parts needed for the effect instead of moving or fading an entire composite asset when that would contradict the intended motion');
  if (/\bsketch|sketched|drawing|drawn|being drawn|draw itself|trace|geometry.*build|build.*geometry\b/.test(text)) inferred.push('Prefer progressive strokes, paths, segments, clipping/masking that follows the artwork, or staged geometry construction instead of a flat wipe or opacity reveal');
  if (/\bmouse|cursor\b/.test(text) && domains.includes('animation')) inferred.push('Use a coherent pointer-like path and timing so cursor motion feels intentional rather than like a straight line passing through the artwork');
  if (domains.includes('responsive')) inferred.push('Use the project’s existing breakpoints and flexible sizing rather than adding viewport-specific hard-coded dimensions');
  if (domains.includes('typography')) inferred.push('Reuse the project’s current font-loading and typography system unless the request explicitly requires a different font source');
  if (domains.includes('form')) inferred.push('Preserve validation, disabled/loading states, keyboard behavior, and clear error feedback for affected inputs');
  if (domains.includes('navigation')) inferred.push('Preserve existing routing conventions, active-state behavior, browser history behavior, and accessible navigation semantics');
  if (domains.includes('data')) inferred.push('Follow the existing data-access, schema, and migration conventions instead of creating a parallel persistence layer');
  if (domains.includes('api')) inferred.push('Follow existing request/error/loading patterns and preserve the project’s API boundary and response handling conventions');
  if (domains.includes('security')) inferred.push('Prefer secure defaults; do not expose, log, or persist sensitive values in plaintext');
  if (domains.includes('performance')) inferred.push('Inspect or measure the actual hot path first and avoid speculative broad rewrites');
  if (domains.includes('accessibility')) inferred.push('Preserve keyboard access, focus visibility, semantic structure, and reduced-motion handling where relevant');
  if (mode === 'feature' || mode === 'add') inferred.push('Include the normal validation, empty/error states, and state transitions that are directly implied by the requested flow, but do not invent unrelated product features');

  return unique(inferred, 10).map(ensurePeriod);
}

function implementationGuidance(intent = '', domains = [], mode = 'update') {
  const text = normalize(intent);
  const notes = [];
  if (mode === 'fix') notes.push('Inspect the current implementation and trace/reproduce the failing behavior before editing; correct the cause rather than hiding the symptom');
  if (mode === 'match') notes.push('Treat the supplied reference as the target for composition, spacing, proportions, hierarchy, typography, and motion where applicable');
  if (domains.includes('ui')) notes.push('Inspect the affected component together with nearby styles and parent layout rules before changing markup');
  if (domains.includes('animation')) notes.push('Inspect the current animation primitive first and preserve the final static appearance after the animation completes');
  if (/\bpng|jpg|jpeg|image|logo|artwork\b/.test(text) && domains.includes('animation')) notes.push('Keep source artwork unchanged when possible and layer animation behavior around or within its existing visual geometry');
  if (domains.includes('data')) notes.push('Keep persistence/business logic separated from presentation code according to the repository’s existing architecture');
  if (domains.includes('api')) notes.push('Reuse existing client/service utilities, cancellation/error conventions, and request typing where present');
  if (domains.includes('testing')) notes.push('Update or add the smallest relevant tests around the changed behavior instead of broad test-suite rewrites');
  return unique(notes, 8).map(ensurePeriod);
}

function acceptanceCriteria(intent = '', mode = 'update', domains = [], explicit = [], constraints = []) {
  const text = normalize(intent);
  const criteria = [];

  for (const requirement of explicit.slice(0, 5)) {
    criteria.push(`The implementation visibly and functionally satisfies: ${String(requirement).replace(/[.]$/, '')}`);
  }
  if (mode === 'fix') criteria.push('The reported issue no longer reproduces in the affected flow, and nearby behavior does not regress');
  if (mode === 'match') criteria.push('The affected screen/component closely matches the reference at the intended viewport and remains usable at nearby viewport sizes');
  if (/\bsmaller|shorter|compact|less tall\b/.test(text)) criteria.push('The targeted element is visibly more compact without clipping, crowding, or removing required content');
  if (/\bsketch|sketched|drawing|drawn|being drawn|draw itself|trace\b/.test(text)) criteria.push('The reveal reads as progressive drawing/construction rather than a flat fade, slide, or single straight-line wipe');
  if (domains.includes('animation')) criteria.push('The motion starts and finishes cleanly, leaves no stray overlay artifacts, and preserves the intended final static state');
  if (domains.includes('responsive') || domains.includes('ui')) criteria.push('The changed UI remains stable and usable across the project’s existing responsive layouts');
  if (domains.includes('accessibility')) criteria.push('Keyboard interaction, focus behavior, semantics, and reduced-motion behavior remain appropriate for the affected UI');
  if (domains.includes('data')) criteria.push('Persistence follows existing storage/schema conventions and survives the expected application lifecycle');
  if (domains.includes('security')) criteria.push('Sensitive values are not exposed, logged, or stored in plaintext, and existing security boundaries remain intact');
  if (constraints.length) criteria.push('All explicit preservation and “do not” constraints are respected');
  criteria.push('No unrelated behavior is changed, and the smallest relevant existing verification commands pass');
  return unique(criteria, 10).map(ensurePeriod);
}

function normalizeInterpretation(value = {}, fallback = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const result = {
    objective: ensurePeriod(source.objective || fallback.objective || 'Apply the requested change using the project’s existing architecture and conventions.'),
    explicitRequirements: unique(source.explicitRequirements || source.requirements || fallback.explicitRequirements || [], 10).map(ensurePeriod),
    inferredRequirements: unique(source.inferredRequirements || fallback.inferredRequirements || [], 10).map(ensurePeriod),
    implementationGuidance: unique(source.implementationGuidance || source.implementation || fallback.implementationGuidance || [], 10).map(ensurePeriod),
    constraints: unique(source.constraints || source.preserve || fallback.constraints || [], 10).map(ensurePeriod),
    rejectedBehaviors: unique(source.rejectedBehaviors || fallback.rejectedBehaviors || [], 8).map(ensurePeriod),
    acceptanceCriteria: unique(source.acceptanceCriteria || fallback.acceptanceCriteria || [], 12).map(ensurePeriod)
  };
  return result;
}

function interpretIntent({ intent = '', mode = 'update', taskTags = [] } = {}) {
  const clean = stripPoliteness(intent);
  const clauses = splitClauses(clean);
  const domains = detectDomains(clean, taskTags);
  const explicitRequirements = unique(clauses.map(explicitRequirementFromClause).filter(Boolean), 10).map(ensurePeriod);
  if (!explicitRequirements.length && clean) explicitRequirements.push(ensurePeriod(`Implement the requested outcome: ${clean}`));

  const extracted = extractConstraints(clauses, clean);
  const local = {
    objective: inferObjective(clean, mode, domains),
    explicitRequirements,
    inferredRequirements: inferredRequirements(clean, domains, mode),
    implementationGuidance: implementationGuidance(clean, domains, mode),
    constraints: extracted.constraints,
    rejectedBehaviors: extracted.rejectedBehaviors,
    acceptanceCriteria: acceptanceCriteria(clean, mode, domains, explicitRequirements, extracted.constraints)
  };
  return normalizeInterpretation(local);
}

module.exports = {
  detectDomains,
  interpretIntent,
  normalizeInterpretation,
  splitClauses
};
