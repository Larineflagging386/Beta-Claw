# MicroClaw — Global Memory

## Project
MicroClaw is a token-optimized, provider-agnostic AI agent runtime.
Version 2.0. Built with TypeScript strict mode, SQLite (WAL), and TOON serialization.

## Architecture
- Event-driven orchestrator (no polling)
- 12 AI providers supported
- Multi-agent DAG execution (Kahn's algorithm)
- 4-tier model routing (nano/standard/pro/max)
- FTS5-backed semantic search
- AES-256-GCM encrypted vault

## Groups
- `default` — CLI chat, general purpose
- `family` — Family group chat, persona: Mia
- `work` — Professional tasks, persona: Andy

## Key Facts
- All prompts live in /prompts/ (never in .ts files)
- TOON format for all internal communication (28-44% token savings)
- Skills are hot-swappable (<60ms reload)
- Secrets accessed via vault.getSecret() → use → zero buffer

## User Preferences
(Updated automatically as MicroClaw learns your preferences)
