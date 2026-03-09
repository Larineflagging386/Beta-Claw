# Contributing to MicroClaw

Thanks for wanting to contribute. This doc covers everything you need to get started, what to work on, and how to get a PR merged.

---

## Table of Contents

- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Core Rules](#core-rules)
- [What to Work On](#what-to-work-on)
- [Making Changes](#making-changes)
- [Writing Skills](#writing-skills)
- [Tests and Benchmarks](#tests-and-benchmarks)
- [Pull Request Process](#pull-request-process)
- [Code Style](#code-style)
- [Getting Help](#getting-help)

---

## Getting Started

```bash
git clone https://github.com/your-org/microclaw
cd microclaw
npm install
npx playwright install chromium   # only needed for browser features
cp .env.example .env              # add your API keys
npm run dev
```

Node 20+ required. TypeScript strict mode is on — no `any`, no `@ts-ignore`.

---

## Project Structure

```
src/
  core/           — orchestrator, agent loop, tier router, prompt builder
  providers/      — Gemini, Anthropic, OpenRouter adapters
  channels/       — WhatsApp, Telegram, Discord, CLI, HTTP
  execution/      — tool executor, sandbox, scheduler, queue
  hooks/          — hook registry + bundled hooks
  skills/         — skill watcher, converter, registry, ClawHub client
  browser/        — Playwright session manager + browser tool
  gmail/          — multi-account Gmail manager + webhook
  capabilities/   — image/voice generation, multimodal detection
  security/       — suspicious command scorer
  memory/         — working memory, MEMORY.md read/write
  cli/            — all CLI commands

groups/           — per-group SOUL.md, MEMORY.md, BOOT.md, HEARTBEAT.md
skills/           — user-installed skill folders (each has a SKILL.md)
prompts/          — all prompt files (.toon format)
.workspaces/      — all files created by the agent go here
.micro/           — DB, logs, config, sandboxes (generated, not committed)
```

---

## Core Rules

These are non-negotiable. PRs that violate them will not be merged.

**`setInterval` is banned in agent and skill code.** Use `node-cron` for recurring tasks or `scheduler.scheduleOnce()` for one-shot delays. `setInterval` is only allowed in infrastructure files like `clawhub-sync.ts` — and only with a comment explaining why.

**No prompts in TypeScript.** All prompt content goes in `prompts/*.toon` files. TypeScript files build and inject context; they don't contain instruction text.

**No JSON between internal components.** Use TOON format for inter-component communication.

**All SQL must be parameterised.** No string interpolation in queries.

**All external data must go through Zod.** No raw `as SomeType` casts on API responses.

**Files created by the agent go in `.workspaces/{groupId}/`.** Never in the project root.

**Sub-agents use `promptMode: minimal`.** Don't give sub-agents the full system prompt.

---

## What to Work On

Good first issues are labelled `good first issue` on GitHub. Here are some areas that always need attention:

**Channels** — adding a new channel (Signal, SMS, Slack) follows the same interface as the existing ones. Look at `src/channels/telegram-adapter.ts` as the simplest reference.

**Skills** — writing a new skill is the easiest contribution. See [Writing Skills](#writing-skills) below.

**Provider adapters** — if you use a model provider not currently supported, adding an adapter is self-contained. See `src/providers/google.ts` for the shape.

**Hooks** — bundled hooks are small and isolated. A hook is a single async function that responds to an event type. See `src/hooks/bundled/` for examples.

**Bug fixes** — check open issues. The benchmark (`microclaw benchmark`) surfaces regressions reliably.

Things that need discussion before you start: changes to the agent loop, tier routing logic, sandbox architecture, or the TOON format. Open an issue first.

---

## Making Changes

1. Fork the repo and create a branch from `main`.
2. Branch names: `fix/what-you-fixed`, `feat/what-you-added`, `skill/skill-name`.
3. Keep changes focused. One logical change per PR.
4. Run `npm run typecheck` and `npm run lint` before pushing. Both must pass.
5. Run `microclaw benchmark` — all existing benchmarks must stay green.
6. Update `CLAUDE.md` if you change any architecture decisions or core rules.

---

## Writing Skills

A skill is a folder in `skills/` with a `SKILL.md` file. That's it.

```
skills/
  my-skill/
    SKILL.md        ← required
    scripts/        ← optional: scripts the agent can exec
```

Minimal `SKILL.md`:

```markdown
---
name: my-skill
command: /my-skill
description: One sentence describing what this skill does.
allowed-tools: ["exec", "read"]
version: 1.0.0
---

# My Skill

Instructions for the agent written in plain English.
Tell it exactly what commands to run and when.

## Example usage

\`\`\`bash
# What the agent should exec
my-command --flag value
\`\`\`
```

Rules for skills:
- Instructions must be in the SKILL.md body, not in TypeScript.
- Declare only the tools the skill actually needs in `allowed-tools`.
- If your skill shells out to an external binary, add it to `requires-bins`.
- If it needs an env var (API key etc.), add it to `requires-env`.
- Skills that use `exec` with any elevated or destructive commands will be reviewed carefully.

To test your skill locally, drop it into `skills/` and the skill-watcher picks it up in under a second. Check `[skill-watcher]` in the console output.

---

## Tests and Benchmarks

```bash
npm run typecheck       # TypeScript strict check — must pass
npm run lint            # ESLint — must pass
microclaw benchmark     # full suite — must stay green
```

The benchmark tests: tier routing accuracy, tool dispatch, hook loading, queue throughput, sandbox routing, memory compaction, and model catalog completeness. If you change any of these systems, add a benchmark case for your change.

Unit tests live in `src/__tests__/`. We use Node's built-in test runner — no Jest, no Vitest.

---

## Pull Request Process

1. Open a PR against `main` with a clear title and description.
2. The description should explain: what the problem was, what you changed, and how to verify it.
3. Link any related issues.
4. All CI checks must pass before review.
5. One approving review required from a maintainer.
6. Squash-merge only — keep the commit history clean.

For anything significant (new channel, new provider, architecture change), open a discussion issue first. It saves everyone time.

---

## Code Style

- TypeScript strict, ESM imports, `.js` extensions on local imports.
- No default exports except for hook handlers and channel adapters.
- Named exports everywhere else.
- Prefer `const` over `let`. No `var`.
- Error messages should be human-readable. The agent (and users) read them.
- Log prefixes follow the `[module-name]` convention already in the codebase.
- Comments explain *why*, not *what*. The code explains what.

---

## Getting Help

- Open a GitHub Discussion for questions.
- Open an Issue for bugs — include the relevant `microclaw start --verbose` output.
- For security issues, do not open a public issue. Email the maintainers directly.
