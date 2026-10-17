# Codex Builder Companion v1.0

A local VS Code companion for builders who use the Codex IDE/chat extension and want to spend less time writing technical prompts or answering routine implementation questions.

Codex Builder Companion **does not call another AI**, does not require an OpenAI API key, and does not require Codex CLI. It analyzes project metadata locally, builds a concise task brief, and copies the result for you to paste into the normal Codex tab.

## What v1.0 adds

- **Project Brain** — locally detects framework, language, database, styling, tests, package manager, source layout, and existing verification scripts.
- **Project Decisions** — optional `.codex-builder/decisions.json` stores explicit repository decisions such as SQLite, local-only storage, styling approach, and source root.
- **Smart Context** — ranks likely relevant project paths and direct imports instead of telling Codex to explore everything.
- **Context Budgets** — Economy (3 paths), Balanced (6), Deep (10).
- **Task Classification** — visual match, bug fix, UI, responsive, feature, database, security, performance, accessibility, refactor, testing, and architecture signals can combine.
- **Decision Authority** — Conservative, Balanced, or Autonomous one-shot behavior.
- **Security Mode** — security-sensitive requests automatically receive stronger guardrails; password-vault requests receive safe local-vault defaults.
- **Verification Profiles** — detects existing package scripts such as typecheck, test, lint, and build and includes only relevant existing commands.
- **Prompt Deduplication** — prevents repeated generated instructions and cleans old `Task: Task:` input.
- **Prompt Preview + Token Estimate** — estimates prompt tokens locally (directional estimate, not billing data).
- **History + Favorites** — local workspace history of copied prompts with approximate prompt sizes.
- **Usage Dashboard** — copied prompt count, approximate prompt-token total/average, and one-shot feature count. These are local estimates, not Codex usage/billing numbers.
- **AGENTS.md Generator** — creates a short repository instruction file from detected project conventions and explicit project decisions.
- **Builder Sidebar** — a dedicated Codex Builder activity-bar panel for previewing and copying prompts.

## Normal workflow

1. Open your actual project folder in VS Code.
2. Open the file you are working on when one is relevant.
3. Open the **Codex Builder** icon in the Activity Bar, or press `Ctrl+Alt+B`.
4. Type only your raw builder request, for example:

   `Create a password vault with name, username/email, password, optional URL, category and tags. Use local SQLite and strict encryption.`

5. Builder Companion detects the task, project stack, likely relevant paths, security/database signals, and verification commands.
6. Preview or copy the generated prompt.
7. Paste it once into the normal Codex tab. Attach screenshots there when needed.

## Recommended setup for one-prompt building

- Decision Authority: **Autonomous**
- Context Budget: **Balanced** for normal features, **Economy** for small UI edits
- Run **Codex Builder: Refresh Project Brain** once per project to create editable local profile/decision files.
- Review and generate a concise `AGENTS.md` when you have stable repository-wide rules.

## Shortcuts

- `Ctrl+Alt+B` — Auto-classify and optimize prompt
- `Ctrl+Alt+M` — Screenshot/visual-match prompt

## Useful commands

Open `Ctrl+Shift+P` and search `Codex Builder`:

- Optimize Prompt
- Match Screenshot
- Fix Current Issue
- Build Feature (One-Shot)
- Add Quick Change
- Update UI
- Set Decision Authority
- Set Context Budget
- Refresh Project Brain
- Generate AGENTS.md
- Open Project Profile
- Open Project Decisions
- Clear Prompt History
- Show Version

## Project Brain files

When you explicitly run **Refresh Project Brain**, the extension can create:

```text
.codex-builder/
├── project-profile.json
└── decisions.json
```

The automatic scanner reads project metadata/file paths and the active editor for direct import paths. It does not scan `.env` values or intentionally ingest credential/key files.

`project-profile.json` is generated metadata. `decisions.json` is designed for you to edit.

## AGENTS.md

`Codex Builder: Generate AGENTS.md` creates a root `AGENTS.md` with development rules, project overview, technology stack, codebase map, architectural constraints, and project documentation. It uses the package manifest, the README introduction, detected file paths, and `.codex-builder/decisions.json`. Sections without reliable information are omitted. Existing verification scripts are listed; missing scripts are not invented.

Edit `purpose`, `projectType`, or `architecturalConstraints` in `.codex-builder/decisions.json` when the detected metadata does not fully explain the project. `architecturalConstraints` is an array of repository-wide rules, such as data preservation or project isolation. If `AGENTS.md` already exists, Builder Companion offers a preview or explicit replacement and never overwrites it silently.

## Token estimates

The extension uses a simple local approximation (roughly characters divided by four). It is useful for comparing prompt sizes, but it **does not know or report actual Codex billing/token usage**.

## Packaging

Run inside this extension source folder:

```powershell
npm test
npm run check
npm run package
```

The package command creates:

```text
codex-builder-companion-1.0.0.vsix
```

Install/update it with:

```powershell
code --install-extension .\codex-builder-companion-1.0.0.vsix --force
```

Then run **Developer: Reload Window** in VS Code.

## v1.1 Editor Preview workflow

The sidebar is now focused on task input and controls. **Build Prompt** generates the project-aware prompt and opens a full preview in the main editor area instead of rendering a long prompt inside the narrow sidebar. The editor preview includes task classification, Project Brain context, targeted paths, estimated prompt size, and a **Copy for Codex** action.

## v1.2.0 — Live Codex Usage

The sidebar can now show current Codex rate-limit windows separately from Builder Companion's local prompt-token estimates.

- Reads the official Codex app-server `account/rateLimits/read` snapshot.
- Shows remaining percentage and reset time for the available primary/secondary quota windows.
- Listens for `account/rateLimits/updated` and also refreshes once per minute while the Builder sidebar is active.
- Includes a manual **Refresh** button and Command Palette action: **Codex Builder: Refresh Codex Usage**.
- Prefers the `codex` bucket from `rateLimitsByLimitId` when the runtime provides it.
- Uses the Codex executable bundled with the installed `openai.chatgpt` VS Code extension when available, then falls back to a configured/installed Codex executable.
- Does not read, copy, store, or display ChatGPT authentication tokens.

The live card reports usage-limit percentage, not an exact remaining-token balance. If the Codex runtime or rate-limit endpoint is unavailable, the card shows an unavailable/retry state instead of inventing a number.
