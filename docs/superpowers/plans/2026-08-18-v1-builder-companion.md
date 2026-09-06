# Codex Builder Companion v1.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade Codex Builder Companion from a prompt formatter into a local project-aware builder assistant that reduces repeated context and follow-up turns.

**Architecture:** Keep prompt generation and project analysis local in Node/VS Code. Add pure utility modules for project profiling, task classification/context ranking, token estimation, AGENTS generation, and prompt optimization, then wire them into a VS Code sidebar and commands. No second AI/API call is introduced.

**Tech Stack:** JavaScript, Node.js built-ins, VS Code Extension API, node:test.

**Spec:** Conversation-approved v0.4-v0.7 consolidated roadmap.

## Global Constraints

- Keep extension ID `localbuilder.codex-builder-companion` so VS Code updates the existing install.
- Version becomes `1.0.0`.
- No AI API calls and no Codex CLI dependency.
- Avoid unnecessary new npm runtime dependencies.
- Project scanning must ignore dependency/build/generated directories and be bounded.
- Never read or store secret values from `.env` or credential files.
- Token numbers are estimates only and must be labeled as estimates.
- Preserve v0.3 Decision Authority and one-shot feature behavior.

---

### Task 1: Pure project intelligence utilities
- [ ] Add failing tests for stack detection, verification scripts, decisions, and concise AGENTS generation.
- [ ] Implement project profile/AGENTS utilities.
- [ ] Run tests.

### Task 2: Classification, context ranking, and prompt optimization
- [ ] Add failing tests for richer task tags, relevant-file ranking, token estimates, and deduplication.
- [ ] Implement pure context/classification/token utilities.
- [ ] Integrate concise project context into prompt generation.
- [ ] Run tests.

### Task 3: VS Code integration and sidebar
- [ ] Add manifest tests for sidebar and new commands/settings.
- [ ] Implement project profile persistence, decisions file, history, preview, and sidebar webview.
- [ ] Add bounded filesystem scanning and import resolution.
- [ ] Run syntax checks and tests.

### Task 4: Packaging and docs
- [ ] Update README and update notes.
- [ ] Verify tests and syntax checks.
- [ ] Package source/update ZIPs.
