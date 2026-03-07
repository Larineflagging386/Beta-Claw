# MicroClaw v2.0 — Complete System Documentation

> Token-Optimized, Provider-Agnostic AI Agent Runtime
> Built with TypeScript (strict), SQLite, TOON, Zod, EventEmitter

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture Diagram](#2-architecture-diagram)
3. [Directory Structure](#3-directory-structure)
4. [Configuration & Environment](#4-configuration--environment)
5. [Core Infrastructure](#5-core-infrastructure)
6. [Provider System](#6-provider-system)
7. [Memory System](#7-memory-system)
8. [Security Layer](#8-security-layer)
9. [Execution Engine](#9-execution-engine)
10. [Agent System](#10-agent-system)
11. [Scheduler](#11-scheduler)
12. [Search System](#12-search-system)
13. [Channel System](#13-channel-system)
14. [CLI Commands](#14-cli-commands)
15. [Prompt Files](#15-prompt-files)
16. [Skills System](#16-skills-system)
17. [Group Configuration](#17-group-configuration)
18. [Database Schema](#18-database-schema)
19. [Test Suite](#19-test-suite)
20. [Build & Tooling](#20-build--tooling)
21. [Known Limitations & Stub Modules](#21-known-limitations--stub-modules)
22. [Data Flow: Message Lifecycle](#22-data-flow-message-lifecycle)

---

## 1. Project Overview

MicroClaw is an open, provider-agnostic AI agent runtime. It routes user messages from multiple channels (CLI, HTTP, WhatsApp) to AI providers (12 supported), using a multi-agent DAG execution engine with parallel task execution, memory systems, and security guardrails.

**Key design principles:**
- Event-driven: `EventEmitter` throughout, no `setInterval` polling
- TOON format: Custom serialization for 28-44% token savings over JSON
- Zero hardcoded models: Dynamic catalog from providers, tier-based auto-selection
- TypeScript strict mode with Zod runtime validation everywhere
- SQLite with WAL mode via `better-sqlite3`

**Tech stack:**
- Runtime: Node.js ≥ 20 (ESM)
- Language: TypeScript 5.x (strict)
- Database: SQLite via better-sqlite3 (WAL, FTS5)
- Validation: Zod
- CLI: Commander.js
- File watching: Chokidar
- Testing: Vitest (900+ tests)
- Logging: Pino

---

## 2. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        CHANNELS                                  │
│   CLI Channel ←→ stdin/stdout                                    │
│   HTTP Channel ←→ REST API (:3210)                               │
│   WhatsApp Channel ←→ Baileys (stub)                             │
└──────────────┬──────────────────────────────────────────────────┘
               │ InboundMessage
               ▼
┌──────────────────────────────────────────────────────────────────┐
│                     MESSAGE ROUTER                                │
│   Trigger word matching → Group routing → Priority assignment     │
└──────────────┬──────────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────────┐
│                      ORCHESTRATOR                                 │
│   EventEmitter-based │ maxConcurrentGroups │ IPC processing       │
│   Events: message, scheduled_task, webhook, ipc, skill_reload    │
└──────────┬───────────┬──────────────────────────────────────────┘
           │           │
     ┌─────┘           └──────┐
     ▼                        ▼
┌────────────┐    ┌──────────────────────────────────────────────┐
│ GUARDRAILS │    │              AGENT SYSTEM                     │
│ 3-stage:   │    │  Planner → DAG → Research/Execution/Memory   │
│ input      │    │         → Composer                            │
│ pre-prompt │    │  SwarmRunner (concurrency + timeout)          │
│ output     │    │  WorkerPool (simulated threads)               │
└────────────┘    └──────────────┬───────────────────────────────┘
                                 │
                  ┌──────────────┼──────────────┐
                  ▼              ▼              ▼
          ┌───────────┐  ┌────────────┐  ┌──────────────┐
          │ PROVIDERS  │  │   MEMORY   │  │   SECURITY   │
          │ 12 adapters│  │ Episodic   │  │ Injection    │
          │ Registry   │  │ Semantic   │  │ PII          │
          │ Catalog    │  │ RAG        │  │ Vault        │
          │ Selector   │  │ Retriever  │  │ Persona Lock │
          │ Estimator  │  │ Compactor  │  │ E2E Encrypt  │
          └───────────┘  │ Working    │  └──────────────┘
                         └────────────┘
                                │
                         ┌──────┴───────┐
                         ▼              ▼
                  ┌────────────┐ ┌────────────┐
                  │   SQLite   │ │ Filesystem │
                  │ (WAL+FTS5) │ │ CLAUDE.md  │
                  │ 10 tables  │ │ Snapshots  │
                  └────────────┘ └────────────┘
```

---

## 3. Directory Structure

```
microclaw/
├── .claude/skills/              # 19 SKILL.md hot-swappable skill files
│   ├── add-brave/SKILL.md
│   ├── add-clear/SKILL.md
│   ├── add-discord/SKILL.md
│   ├── add-gmail/SKILL.md
│   ├── add-openrouter/SKILL.md
│   ├── add-provider/SKILL.md
│   ├── add-serper/SKILL.md
│   ├── add-signal/SKILL.md
│   ├── add-slack/SKILL.md
│   ├── add-telegram/SKILL.md
│   ├── convert-to-docker/SKILL.md
│   ├── customize/SKILL.md
│   ├── debug/SKILL.md
│   ├── export/SKILL.md
│   ├── rollback/SKILL.md
│   ├── setup/SKILL.md
│   ├── setup-vps/SKILL.md
│   ├── setup-windows/SKILL.md
│   └── status/SKILL.md
├── .micro/                      # Runtime data (created at setup)
│   ├── config.toon              # Main TOON config
│   ├── config.toon.template     # Template for config
│   ├── logs/                    # App logs
│   ├── snapshots/               # Rollback snapshots
│   └── microclaw.pid            # Daemon PID file
├── groups/                      # Per-group memory + config
│   ├── default/
│   │   ├── CLAUDE.md            # Group memory & TOON config
│   │   └── workspace/           # Group workspace
│   ├── family/
│   │   ├── CLAUDE.md
│   │   └── workspace/
│   └── work/
│       ├── CLAUDE.md
│       └── workspace/
├── prompts/                     # All prompt templates (TOON/TXT)
│   ├── agents/                  # Agent role prompts (6 files)
│   ├── guardrails/              # Security patterns (6 files)
│   ├── memory/                  # Memory operation prompts (4 files)
│   ├── onboarding/              # Setup wizard prompts (3 files)
│   ├── search/                  # Search formatting prompts (3 files)
│   ├── system/                  # System/persona prompts (4 files)
│   └── tools/                   # Tool descriptions (12 files)
├── src/                         # Source code
│   ├── agents/                  # Multi-agent system (6 files)
│   ├── channels/                # I/O channels (4 files)
│   ├── cli/                     # CLI entry + commands (14 files)
│   ├── core/                    # Core infrastructure (12 files)
│   ├── execution/               # DAG, workers, rollback (6 files)
│   ├── memory/                  # Memory subsystems (6 files)
│   ├── providers/               # AI provider adapters (14 files)
│   ├── scheduler/               # Cron scheduler + prefetch (2 files)
│   ├── search/                  # Web search clients (4 files)
│   ├── security/                # Security layer (6 files)
│   ├── db.ts                    # Database layer
│   ├── ipc.ts                   # Inter-process communication
│   └── router.ts                # Message routing
├── tests/                       # Vitest test suites (900+ tests)
├── dist/                        # Compiled JS output
├── CLAUDE.md                    # Global AI memory
├── .env                         # API keys (gitignored)
├── package.json                 # NPM manifest
├── tsconfig.json                # TypeScript config
└── vitest.config.ts             # Test config
```

**Total source files:** ~70 TypeScript files
**Total test files:** ~45 test files
**Total prompt files:** ~32 TOON/TXT files
**Total skill files:** 19 SKILL.md files

---

## 4. Configuration & Environment

### 4.1 `.env` — API Keys

```
OPENROUTER_API_KEY=sk-or-...       # OpenRouter (200+ models)
ANTHROPIC_API_KEY=sk-ant-...       # Anthropic Claude
OPENAI_API_KEY=sk-...              # OpenAI GPT
GOOGLE_API_KEY=AIza...             # Google Gemini
GROQ_API_KEY=gsk_...               # Groq
MISTRAL_API_KEY=...                # Mistral
COHERE_API_KEY=...                 # Cohere
TOGETHER_API_KEY=...               # Together AI
DEEPSEEK_API_KEY=sk-...            # DeepSeek
PERPLEXITY_API_KEY=pplx-...        # Perplexity
BRAVE_API_KEY=BSA...               # Brave Search
SERPER_API_KEY=...                 # Serper Search
```

Loaded via `dotenv.config()` in `src/cli/index.ts` at startup. Each provider checks its own env var in `registerAvailableProviders()` in `chat.ts`.

### 4.2 `.micro/config.toon` — Runtime Config

Written by the setup wizard. Format is TOON (Token-Oriented Object Notation):

```
@config{
  version:2.0.0
  profile:standard
  executionMode:isolated
  triggerWord:@alya
  persona:alya
  personaStyle:casual
  provider:google
  cliEnabled:true
  httpEnabled:false
  httpPort:3210
  vaultEnabled:true
  piiRedaction:true
  injectionDetection:true
  personaLock:true
  maxWorkingTokens:8192
  summarizeThreshold:0.85
  ragChunkSize:500
  ragChunkOverlap:50
}
```

**Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `version` | string | MicroClaw version |
| `profile` | `micro\|lite\|standard\|full` | Resource profile (affects DB cache, memory limits) |
| `executionMode` | `isolated\|full_control` | Sandbox vs host-level execution |
| `triggerWord` | string | e.g. `@alya` — word that activates the agent in group chats |
| `persona` | string | Agent name |
| `personaStyle` | `concise\|detailed\|technical\|casual` | Communication style |
| `provider` | string | Primary AI provider ID |
| `cliEnabled` | boolean | CLI channel on/off |
| `httpEnabled` | boolean | HTTP channel on/off |
| `httpPort` | number | HTTP API port |
| `vaultEnabled` | boolean | Encrypted vault on/off |
| `piiRedaction` | boolean | PII auto-redaction on/off |
| `injectionDetection` | boolean | Injection detection on/off |
| `personaLock` | boolean | Persona drift detection on/off |
| `maxWorkingTokens` | number | Working memory budget |
| `summarizeThreshold` | number | Trigger summarization at this utilization (0.0-1.0) |
| `ragChunkSize` | number | RAG chunk size in chars |
| `ragChunkOverlap` | number | RAG chunk overlap in chars |

### 4.3 `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noPropertyAccessFromIndexSignature": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

### 4.4 `package.json` — Key Details

- **Name:** `microclaw`, **Version:** `2.0.0`
- **Type:** `"module"` (ESM)
- **Node:** `>=20`
- **Bin:** `"microclaw": "./dist/cli/index.js"` (global CLI via `npm link`)
- **Scripts:**
  | Script | Command |
  |--------|---------|
  | `build` | `tsc` |
  | `dev` | `tsx src/cli/index.ts` |
  | `start` | `tsx src/cli/index.ts start --foreground` |
  | `start:bg` | `tsx src/cli/index.ts start` |
  | `stop` | `tsx src/cli/index.ts stop` |
  | `restart` | `tsx src/cli/index.ts restart --foreground` |
  | `status` | `tsx src/cli/index.ts status` |
  | `chat` | `tsx src/cli/index.ts chat` |
  | `setup` | `tsx src/cli/index.ts setup` |
  | `doctor` | `tsx src/cli/index.ts doctor` |
  | `benchmark` | `tsx src/cli/index.ts benchmark` |
  | `test` | `vitest run` |
  | `test:watch` | `vitest` |
  | `lint` | `tsc --noEmit` |
  | `prod` | `node dist/cli/index.js` |

---

## 5. Core Infrastructure

### 5.1 `src/core/toon-serializer.ts` — TOON Format

**Purpose:** Custom serialization format for internal communication. Claims 28-44% token reduction vs JSON.

**Exports:** `encode(type, data)`, `decode(toon)`, `parseAll(input)`, `ToonParseError`

**Format:**
```
@type{
  key:value
  nested:@_nested{
    innerKey:innerValue
  }
  list:[item1, item2, item3]
  multiline:|This is a
  multi-line string|
  flag:true
  count:42
  empty:null
}
```

**Parser:** Hand-written recursive descent, single-pass, character-by-character. Supports `#` comments.

**Encoder:** `encode(type: string, data: Record<string, ToonValue>)` → TOON string. Nested objects become `@_nested{...}`, arrays become `[a, b, c]`, multi-line strings use `|...|`.

**Types:**
```typescript
type ToonValue = string | number | boolean | null | ToonValue[] | ToonObject;
interface ToonObject { [key: string]: ToonValue; }
interface ParseResult { type: string; data: ToonObject; }
```

---

### 5.2 `src/db.ts` — Database Layer

**Purpose:** SQLite database with WAL mode, Zod validation, and FTS5 full-text search.

**Exports:** `MicroClawDB`

**Constructor:** `new MicroClawDB(dbPath: string, profile?: ResourceProfile)`

**Resource profiles:**
| Profile | Cache Pages | Use Case |
|---------|------------|----------|
| `micro` | 2,000 | Minimal memory |
| `lite` | 4,000 | Light usage |
| `standard` | 8,000 | Default |
| `full` | 16,000 | High throughput |

**Tables (10):**
| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `messages` | Chat messages | id, group_id, sender_id, content, timestamp, channel, processed |
| `sessions` | Chat sessions | id, group_id, started_at, ended_at, summary, key_facts, token_count |
| `tool_cache` | Cached tool results | id, tool_name, input_hash, result, created_at, expires_at, group_id |
| `scheduled_tasks` | Cron tasks | id, group_id, name, cron, instruction, enabled, last_run |
| `groups` | Group configs | id, channel, name, trigger_word, execution_mode |
| `model_catalog` | Cached models | model_id, provider_id, name, context_window, costs, capabilities, tier |
| `security_events` | Security audit log | id, event_type, severity, details, group_id, timestamp |
| `ipc_messages` | Inter-process messages | id, type, payload, processed, created_at |
| `snapshots` | Rollback snapshots | id, paths, manifest, created_at, expires_at |
| `memory_fts` | FTS5 virtual table | chunk_id, content, group_id, source_type |

**Key methods:**
- `insertMessage()`, `getMessages()`, `getMessagesByGroup()`
- `insertSession()`, `endSession()`, `getSession()`
- `insertToolCacheEntry()`, `getToolCacheEntry()`, `deleteExpiredCache()`
- `insertScheduledTask()`, `getScheduledTasks()`, `getEnabledTasks()`, `updateTaskLastRun()`
- `insertGroup()`, `getGroup()`, `getAllGroups()`
- `upsertModel()`, `getModelsByProvider()`, `getModelsByTier()`, `getAllModels()`
- `insertSecurityEvent()`, `getSecurityEvents()`
- `insertIpcMessage()`, `getPendingIpcMessages()`, `markIpcProcessed()`
- `insertSnapshot()`, `getSnapshot()`, `listSnapshots()`, `deleteSnapshot()`
- `insertMemoryChunk()`, `searchMemory()`, `deleteMemoryChunks()`
- `transaction(fn)`

---

### 5.3 `src/core/orchestrator.ts` — Event-Driven Core

**Purpose:** Central event loop that receives messages from channels and dispatches them.

**Exports:** `Orchestrator`

**Events:**
| Event | Payload | Trigger |
|-------|---------|---------|
| `message` | InboundMessage | Channel message received |
| `scheduled_task` | task data | Cron trigger |
| `webhook` | webhook data | External webhook |
| `ipc` | IPC payload | Inter-process message |
| `skill_reload` | skill data | Skill file changed |
| `shutdown` | — | Graceful shutdown |

**Config:**
```typescript
interface OrchestratorConfig {
  dbPath: string;          // Default: 'microclaw.db'
  profile: ResourceProfile; // Default: 'standard'
  maxConcurrentGroups: number; // Default: 3
  logLevel: string;        // Default: 'info'
}
```

**Flow:**
1. `start()` → creates DB, processes pending IPC, logs "started — purely event-driven"
2. Channels call `emit('event', { type: 'message', payload })` on the orchestrator
3. `handleEvent()` routes by event type
4. `handleMessage()` → inserts message to DB, marks processed (agent/planner integration is a placeholder)
5. `stop()` → emits `shutdown`, closes DB

---

### 5.4 `src/core/provider-registry.ts` — Provider Registry

**Purpose:** Registry of AI provider adapters.

**Exports:** `ProviderRegistry`

**Methods:**
| Method | Description |
|--------|-------------|
| `register(adapter)` | Adds provider; first becomes default |
| `unregister(id)` | Removes; auto-selects new default |
| `get(id)` | Get adapter by ID |
| `getDefault()` | Get default adapter |
| `setDefault(id)` | Set default |
| `list()` | All adapters |
| `listIds()` | All IDs |
| `has(id)` | Check existence |
| `size()` | Count |

---

### 5.5 `src/core/model-catalog.ts` — Model Catalog

**Purpose:** Fetches models from providers, caches them in DB, assigns tiers by cost.

**Exports:** `ModelCatalog`, `CATALOG_TTL_MS` (4 hours)

**Tier assignment (by avg cost per 1M tokens):**
| Tier | Cost Range | Examples |
|------|-----------|----------|
| `nano` | ≤ $0.50 | Gemini 2.5 Flash-Lite, GPT-4o-mini |
| `standard` | $0.50 - $5.00 | Gemini 2.5 Flash, Groq LLaMA |
| `pro` | $5.00 - $20.00 | Gemini 2.5 Pro, GPT-4o |
| `max` | > $20.00 | Claude Opus |

**Methods:**
- `refreshAll()` — fetches from all registered providers
- `refreshProvider(id)` — fetch + upsert models for one provider
- `getAllModels()` — all cached models
- `getModelsForTier(tier)` — filter by tier
- `getBestModelForTier(tier)` — highest capability, lowest cost
- `startAutoRefresh()` / `stopAutoRefresh()` — periodic refresh

---

### 5.6 `src/core/complexity-estimator.ts` — Complexity Scoring

**Purpose:** Zero-LLM-call heuristic that scores task complexity 0-100.

**Exports:** `estimateComplexity(input, thresholds?)`, `DEFAULT_THRESHOLDS`

**Formula:**
```
score = 0.15 × tokenFactor
      + 0.25 × verbComplexity
      + 0.30 × toolDependency
      + 0.20 × reasoningDensity
      + 0.10 × accuracyNeeded
```

**Scoring factors:**
| Factor | Calculation |
|--------|-------------|
| `tokenFactor` | `min(charCount / 4 / 500, 1)` |
| `verbComplexity` | Simple verbs (hi, thanks) → 0.1; Complex verbs (build, refactor, analyze) → 0.8 |
| `toolDependency` | Count of tool indicators (file, search, run, install, etc.) / 5 |
| `reasoningDensity` | Reasoning keywords (because, compare, trade-off) density |
| `accuracyNeeded` | Accuracy keywords (exact, precise, correct) count |

**Tier thresholds:**
| Tier | Score Range |
|------|-------------|
| `nano` | 0 - 20 |
| `standard` | 21 - 60 |
| `pro` | 61 - 85 |
| `max` | 86 - 100 |

**Output:**
```typescript
interface ComplexityResult {
  score: number;         // 0-100
  tier: ModelTier;       // nano | standard | pro | max
  needsWebSearch: boolean;
  reasoning: string;
}
```

---

### 5.7 `src/core/model-selector.ts` — Model Selection

**Purpose:** Picks the best model from the catalog based on complexity tier.

**Exports:** `selectModel(catalog, complexity, weights?)`, `scoreModel()`, `DEFAULT_WEIGHTS`

**Scoring formula:**
```
score = 0.4 × capability + 0.3 × speed + 0.3 × costEfficiency
```

| Dimension | Calculation |
|-----------|-------------|
| `capability` | `min(capabilities.length / 7, 1)` |
| `speed` | context ≥ 128k → 0.8; ≥ 32k → 0.6; else 0.4 |
| `costEfficiency` | `min(1 / avgCostPer1M, 1)` |

**Fallback:** If no models for the requested tier, tries adjacent tiers. Order depends on original tier (e.g., `nano` → standard → pro → max).

**Output:**
```typescript
interface ModelSelection {
  model: ModelRow;    // The selected model from DB
  score: number;      // Computed score
  tier: ModelTier;    // Actual tier used
}
```

---

### 5.8 `src/core/prompt-loader.ts` — Prompt Loading

**Purpose:** Loads prompt templates from `/prompts/`, caches them, supports hot-reload and variable substitution.

**Exports:** `PromptLoader`

**Constructor:** `new PromptLoader(baseDir?)` — defaults to `<cwd>/prompts`

**Methods:**
| Method | Description |
|--------|-------------|
| `load(relativePath)` | Load and cache a prompt file |
| `render(relativePath, vars)` | Load + substitute `{{var}}` placeholders |
| `invalidate(relativePath)` | Clear cache for a file |
| `clearCache()` | Clear all cached prompts |
| `startWatching()` | Watch for file changes (chokidar, 50ms debounce) |
| `stopWatching()` | Stop watching |

---

### 5.9 `src/core/prompt-compressor.ts` — Prompt Compression

**Purpose:** Compresses prompts for token savings using section extraction, filler removal, and TOON encoding.

**Exports:** `PromptCompressor`

**Compression pipeline:**
1. Split by `#` or `[` section headers
2. Remove list markers (`-`, `*`, numbered)
3. Join lines with `; `
4. Strip filler words (the, a, an, is, are, was, were, etc.)
5. Collapse whitespace
6. Encode as TOON

**Methods:**
| Method | Description |
|--------|-------------|
| `compress(content, type?)` | Compress a prompt → TOON string |
| `compressForProvider(content, providerFeatures, type?)` | If provider supports cache → `<mc_agent_v1:sha256>`, else TOON |
| `decompress(toon)` | Decode TOON back to readable text |
| `estimateTokens(text)` | `text.length / 4` |

---

### 5.10 `src/core/dynamic-tool-loader.ts` — Intent Classification

**Purpose:** Maps user input to tool categories and returns suggested tool names.

**Exports:** `classifyIntent(input)`, `getToolsForIntent(input)`, `TOOL_MAP`, `INTENT_CATEGORIES`

**Intent categories:**
| Category | Keywords | Tools |
|----------|----------|-------|
| `web_search` | search, find, look up, google | brave_search, fetch_url, summarize_page |
| `code_exec` | run, execute, code, script | run_code, write_file, read_file |
| `file_ops` | file, read, write, create, delete | read_file, write_file, list_dir, delete_file |
| `email` | email, send mail, gmail | send_message |
| `calendar` | schedule, meeting, calendar | send_message |
| `memory_read` | remember, recall, what did | — (internal) |
| `memory_write` | save, store, note | — (internal) |
| `system_cmd` | install, update, restart, status | run_code, install_pkg |
| `media` | image, photo, video, audio | — |
| `communication` | send, message, notify, tell | send_message |
| `math` | calculate, math, equation | run_code |
| `general` | (fallback) | brave_search, read_file, write_file, run_code |

**Ambiguity threshold:** If best score < 0.6, falls back to `general`.

---

### 5.11 `src/core/tool-cache.ts` — Tool Result Cache

**Purpose:** Caches tool execution results in SQLite with tool-specific TTLs.

**Exports:** `ToolCache`, `computeInputHash(toolName, inputs, groupId?)`

**TTL rules:**
| Tool | Default TTL | News TTL |
|------|------------|----------|
| `brave_search` | 24 hours | 1 hour |
| `serper_search` | 24 hours | 1 hour |
| `fetch_url` | 30 minutes | — |
| `run_code` | 0 (no cache) | — |
| `read_file` | 5 minutes | — |
| `install_pkg` | 7 days | — |
| Other | 1 hour | — |

**Hash:** SHA-256 of TOON-encoded inputs, optionally prefixed with group ID.

---

### 5.12 `src/core/skill-parser.ts` — Skill File Parser

**Purpose:** Parses SKILL.md files with YAML-like frontmatter.

**Exports:** `parseSkillFile(content)`, `SkillFrontmatterSchema`

**SKILL.md format:**
```markdown
---
name: My Skill
command: /my-skill
description: Does something useful
version: 1.0.0
author: someone
requiredEnvVars:
  - MY_API_KEY
requiredTools:
  - fetch_url
platforms:
  - linux
  - macos
---

# Instructions

Actual skill content here...
```

**Output:**
```typescript
interface SkillDefinition {
  name: string;
  command: string;
  description: string;
  version: string;
  author: string;
  requiredEnvVars?: string[];
  requiredTools?: string[];
  platforms?: ('linux' | 'macos' | 'windows')[];
  content: string;  // Body after frontmatter
}
```

---

### 5.13 `src/core/skill-watcher.ts` — Skill Hot-Reload

**Purpose:** Watches `.claude/skills/` for changes and emits events on skill add/update/remove.

**Exports:** `SkillWatcher`, `DEBOUNCE_MS` (50ms), `SKILL_FILENAME` ("SKILL.md")

**Events:**
| Event | Payload | Trigger |
|-------|---------|---------|
| `skill:loaded` | SkillDefinition | New skill file found |
| `skill:updated` | SkillDefinition | Existing skill changed |
| `skill:removed` | { command } | Skill file deleted |

**Methods:**
| Method | Description |
|--------|-------------|
| `start()` | Begin watching + initial scan |
| `stop()` | Stop watcher |
| `getSkill(command)` | Get skill by command name |
| `getAllSkills()` | Get all loaded skills |
| `getSkillCount()` | Number of loaded skills |

---

## 6. Provider System

### 6.1 Provider Interface (`src/providers/interface.ts`)

Every provider implements `IProviderAdapter`:

```typescript
interface IProviderAdapter {
  readonly id: string;
  readonly name: string;
  readonly baseURL: string;

  fetchAvailableModels(): Promise<ModelCatalogResponse>;
  complete(req: CompletionRequest): Promise<CompletionResponse>;
  stream(req: CompletionRequest): AsyncIterable<CompletionChunk>;
  estimateCost(req: CompletionRequest): TokenCost;
  supportsFeature(feature: ProviderFeature): boolean;
}
```

**CompletionRequest:**
```typescript
interface CompletionRequest {
  model: string;
  messages: CompletionMessage[];
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
  tools?: ToolDef[];
  systemPrompt?: string;
}
```

**ProviderFeatures:** `streaming`, `function_calling`, `vision`, `prompt_caching`, `json_mode`, `system_message`, `structured_output`

### 6.2 Provider Adapters

| # | File | Class | API Base URL | Auth | Models | Pattern |
|---|------|-------|-------------|------|--------|---------|
| 1 | `openrouter.ts` | `OpenRouterAdapter` | `https://openrouter.ai/api/v1` | `Authorization: Bearer` | Dynamic from `/models` | Custom |
| 2 | `anthropic.ts` | `AnthropicAdapter` | `https://api.anthropic.com/v1` | `x-api-key` | Claude Sonnet 4, Opus 4, Haiku 3.5 | Custom (Messages API) |
| 3 | `google.ts` | `GoogleAdapter` | `https://generativelanguage.googleapis.com/v1beta` | `?key=` in URL | 6 Gemini models (see below) | Custom (Gemini API) |
| 4 | `openai.ts` | `OpenAIAdapter` | `https://api.openai.com/v1` | `Authorization: Bearer` | GPT-4o, o3, GPT-4-turbo | Extends OpenAICompat |
| 5 | `groq.ts` | `GroqAdapter` | `https://api.groq.com/openai/v1` | `Authorization: Bearer` | LLaMA 3.1, Mixtral, Gemma | Extends OpenAICompat |
| 6 | `mistral.ts` | `MistralAdapter` | `https://api.mistral.ai/v1` | `Authorization: Bearer` | Large, Medium, Small, 7B | Extends OpenAICompat |
| 7 | `cohere.ts` | `CohereAdapter` | `https://api.cohere.ai/v1` | `Authorization: Bearer` | Command R+, Command R, Command | Custom (Chat API) |
| 8 | `together.ts` | `TogetherAdapter` | `https://api.together.xyz/v1` | `Authorization: Bearer` | LLaMA, Mixtral | Extends OpenAICompat |
| 9 | `deepseek.ts` | `DeepSeekAdapter` | `https://api.deepseek.com/v1` | `Authorization: Bearer` | chat, coder, reasoner | Extends OpenAICompat |
| 10 | `perplexity.ts` | `PerplexityAdapter` | `https://api.perplexity.ai` | `Authorization: Bearer` | Sonar Large, Sonar Small | Extends OpenAICompat |
| 11 | `ollama.ts` | `OllamaAdapter` | `http://localhost:11434` | None | Dynamic from `/api/tags` | Custom (Ollama API) |
| 12 | `lmstudio.ts` | `LMStudioAdapter` | `http://localhost:1234/v1` | Optional Bearer | Dynamic from `/models` | Extends OpenAICompat |

### 6.3 OpenAI-Compatible Base (`src/providers/openai-compat.ts`)

Shared adapter for all providers using the OpenAI chat/completions API format. Handles:
- `POST /chat/completions` for both complete and stream
- SSE streaming with `data: ` lines and `[DONE]` sentinel
- Tool calls mapping
- Cost estimation

**Used by:** OpenAI, Groq, Mistral, Together, DeepSeek, Perplexity, LM Studio

### 6.4 Google Gemini Models (Current)

| Model ID | Name | Context | Max Output | Input $/1M | Output $/1M |
|----------|------|---------|-----------|-----------|------------|
| `gemini-3.1-pro-preview` | Gemini 3.1 Pro Preview | 1,048,576 | 65,536 | $1.25 | $10.00 |
| `gemini-3-flash-preview` | Gemini 3 Flash Preview | 1,048,576 | 65,536 | $0.15 | $0.60 |
| `gemini-3.1-flash-lite-preview` | Gemini 3.1 Flash-Lite Preview | 1,048,576 | 65,536 | $0.075 | $0.30 |
| `gemini-2.5-pro` | Gemini 2.5 Pro | 1,048,576 | 65,536 | $1.25 | $10.00 |
| `gemini-2.5-flash` | Gemini 2.5 Flash | 1,048,576 | 65,536 | $0.15 | $0.60 |
| `gemini-2.5-flash-lite` | Gemini 2.5 Flash-Lite | 1,048,576 | 65,536 | $0.075 | $0.30 |

### 6.5 Registration Flow (chat.ts)

```
dotenv.config()  →  Load .env vars
       ↓
For each PROVIDER_ENV_MAP entry:
  if process.env[envVar] exists:
    registry.register(new XAdapter(() => process.env[envVar]))
       ↓
Try Ollama (localhost:11434)
Try LM Studio (localhost:1234)
       ↓
If registry.size() === 0 → error message listing all env vars
If --provider flag → registry.setDefault(provider)
       ↓
catalog.refreshAll()  →  fetch models from all providers
       ↓
Ready for chat
```

---

## 7. Memory System

### 7.1 Episodic Memory (`src/memory/episodic.ts`)

**Purpose:** File-based memory using `CLAUDE.md` per group.

**Storage:** `groups/{groupId}/CLAUDE.md`

**Operations:**
| Method | Description |
|--------|-------------|
| `read(groupId)` | Read full CLAUDE.md content |
| `write(groupId, content)` | Atomic write (temp file + rename) |
| `update(groupId, section, content)` | Replace specific `## Section` content |
| `readConfig(groupId)` | Parse `## MicroClaw Config` as TOON |

**Atomic writes:** Writes to `.tmp` suffix first, then `fs.renameSync()` for crash safety.

---

### 7.2 Semantic Memory (`src/memory/semantic.ts`)

**Purpose:** Full-text search over memory chunks using SQLite FTS5.

**Storage:** `memory_fts` virtual table

**Source types:** `session_summary`, `episodic`, `workspace`, `skill_doc`

**Methods:**
| Method | Description |
|--------|-------------|
| `index(chunkId, content, groupId, sourceType)` | Insert into FTS5 |
| `search(query, groupId?, limit?)` | FTS5 search, returns ranked results |
| `removeBySource(groupId, sourceType)` | Delete chunks by source |

---

### 7.3 RAG Indexer (`src/memory/rag-indexer.ts`)

**Purpose:** Chunks text and indexes for RAG retrieval.

**Config:** `maxChunkSize` (default 500 chars), `chunkOverlap` (default 50 chars)

**Chunking:** Fixed-size sliding window with overlap. Step = `maxChunkSize - chunkOverlap`.

**Chunk IDs:** `{sha256(sourceId)[:16]}#chunk-{i}`

**Methods:**
| Method | Description |
|--------|-------------|
| `indexFile(filePath, groupId, sourceType)` | Read file + chunk + index |
| `indexContent(content, sourceId, groupId, sourceType)` | Chunk + index |
| `reindexFile(filePath, groupId, sourceType)` | Delete old + re-index |
| `removeSource(sourceId, groupId)` | Delete all chunks for source |

---

### 7.4 Retriever (`src/memory/retriever.ts`)

**Purpose:** Unified retrieval interface over semantic memory.

**Methods:**
| Method | Description |
|--------|-------------|
| `retrieve(query, groupId, topK?)` | Search all memory for group |
| `retrieveFrom(query, groupId, sourceType, topK?)` | Search specific source type |

**Query sanitization:** Strips FTS5 special characters `"*(){}:^~` to prevent syntax errors.

---

### 7.5 Compactor (`src/memory/compactor.ts`)

**Purpose:** Summarizes conversations for context compression and session handoff.

**Algorithm (extractive summarization):**
1. Split into sentences
2. Score each sentence:
   - +2 for ACTION_WORDS (should, must, will, need, important, etc.)
   - +1 for questions
   - +1 for assistant messages
   - +0.5 for longer sentences
3. Sort by score descending
4. Keep top sentences until ~30% of original char count
5. Re-order by original position

**Methods:**
| Method | Description |
|--------|-------------|
| `summarize(messages)` | Extract summary from messages |
| `extractFacts(messages)` | Extract sentences with ACTION_WORDS |
| `compact(groupId, sessionId, messages)` | Full compaction: summarize + facts + store |

**Storage:** Stores compacted data as TOON-encoded chunks in `memory_fts` and session data in `sessions`.

---

### 7.6 Working Memory (`src/memory/working-memory.ts`)

**Purpose:** In-memory context window with token budget enforcement.

**Profile limits:**
| Profile | Max Tokens |
|---------|-----------|
| `micro` | 2,048 |
| `lite` | 4,096 |
| `standard` | 8,192 |
| `full` | 128,000 |

**Token estimation:** `text.length / 4`

**Budget tracking:**
```typescript
interface ContextBudget {
  maxTokens: number;
  systemTokens: number;
  summaryTokens: number;
  toolResultTokens: number;
  messageTokens: number;
  ragTokens: number;
  availableTokens: number;
  utilizationPercent: number;
}
```

**Summarization trigger:** When `utilizationPercent >= summarizeThreshold` (default 0.85 = 85%).

**Methods:**
| Method | Description |
|--------|-------------|
| `addMessage(role, content)` | Add message, returns budget |
| `setSystemPrompt(content)` | Set system prompt tokens |
| `addSummary(content)` | Add compressed summary |
| `addToolResult(content)` | Add tool output |
| `addRagContext(content)` | Add RAG retrieval |
| `needsSummarization()` | Check if at threshold |
| `getMessagesForSummarization()` | Get first half of messages |
| `applySummarization(summary)` | Replace messages with summary |
| `getContextWindow()` | Get all messages |
| `getBudget()` | Get current budget |
| `toToon()` / `fromToon()` | Serialize/deserialize state |

---

## 8. Security Layer

### 8.1 Injection Detector (`src/security/injection-detector.ts`)

**Purpose:** Multi-layer prompt injection detection.

**Layers:**
1. **Pattern matching:** Loads patterns from `prompts/guardrails/injection-patterns.txt`, matches against stripped input (code blocks removed)
2. **Structural analysis:**
   - Zero-width characters (U+200B, U+200C, U+200D, U+FEFF, U+00AD)
   - Unicode homoglyphs (Cyrillic→Latin mapping)
   - Nested role declarations (`system:`, `assistant:`, `[INST]`, `<|im_start|>`)
   - Base64-encoded payloads
3. **Semantic flag:** Set for inputs > 500 chars (for external LLM check)

**Output:**
```typescript
interface InjectionScanResult {
  isInjection: boolean;
  confidence: number;     // 0.0 - 1.0
  patterns: string[];     // Matched pattern names
  details: string[];      // Human-readable explanations
  requiresSemanticCheck: boolean;
}
```

---

### 8.2 PII Detector (`src/security/pii-detector.ts`)

**Purpose:** Detects and redacts PII before storage.

**Detection types:**
| Type | Method | Details |
|------|--------|---------|
| Credit card | Luhn algorithm + regex | 13-19 digit numbers, with/without dashes |
| SSN | Regex | `XXX-XX-XXXX` format |
| Email | Regex | Standard email format |
| Phone | Regex | US/international formats |
| API keys | Regex | OpenAI `sk-`, Google `AIza`, GitHub `gh[ps]_`, Stripe `sk_`, Bearer tokens |

**Redaction format:** `[REDACTED:CREDIT_CARD]`, `[REDACTED:SSN]`, etc.

**Output:**
```typescript
interface PiiScanResult {
  hasDetections: boolean;
  detections: Array<{ type: string; position: number; length: number }>;
  redactedText: string;
}
```

---

### 8.3 Vault (`src/security/vault.ts`)

**Purpose:** Encrypted secret storage.

**Crypto:**
- Key derivation: PBKDF2 (100,000 iterations, SHA-256, 32-byte key)
- Encryption: AES-256-GCM (12-byte IV, 16-byte auth tag)

**Storage:** `.micro/vault.salt` + `.micro/vault.enc`

**Methods:**
| Method | Description |
|--------|-------------|
| `init(masterPassword)` | Create vault with new salt |
| `unlock(masterPassword)` | Derive key and decrypt |
| `setSecret(name, value)` | Store encrypted secret |
| `getSecret(name)` | Retrieve decrypted secret |
| `removeSecret(name)` | Delete a secret |
| `listSecretNames()` | List all secret names |
| `rotate(oldPassword, newPassword)` | Re-encrypt with new password |

---

### 8.4 Persona Lock (`src/security/persona-lock.ts`)

**Purpose:** Prevents AI persona drift via hash verification and keyword analysis.

**Config:**
```typescript
interface PersonaConfig {
  name: string;
  tone: string;
  language: string;
  neverDo: string[];
  alwaysDo: string[];
}
```

**Methods:**
| Method | Description |
|--------|-------------|
| `getHash()` | SHA-256 of canonical JSON config |
| `verify(hash)` | Check hash matches current config |
| `generateBlock()` | Generate persona instruction block |
| `checkDrift(output)` | Check output for persona keyword overlap |

**Drift detection:** Extracts keywords from persona config, tokenizes output, computes `matches / totalKeywords`. If similarity < threshold (default 0.7), `drifted: true`.

---

### 8.5 Guardrails (`src/security/guardrails.ts`)

**Purpose:** Three-stage security orchestration.

**Stages:**
| Stage | Method | Checks |
|-------|--------|--------|
| Input | `processInput(content, groupId)` | Injection patterns (critical/high/medium severity), PII detection + redaction |
| Pre-prompt | `prePromptCheck(content)` | Secret patterns in assembled prompt |
| Output | `processOutput(content, groupId)` | Secret leaks (API keys, tokens, private keys), persona drift |

**Injection severity:**
| Level | Action |
|-------|--------|
| `critical` | Block input entirely |
| `high` | Block input entirely |
| `medium` | Allow with warning event |

**Output:**
```typescript
interface GuardrailResult {
  allowed: boolean;
  modified: boolean;
  content: string;        // Possibly redacted content
  events: GuardrailEvent[];
}
```

**Audit:** All events logged to `security_events` table via `db.insertSecurityEvent()`.

---

### 8.6 E2E Encryption (`src/security/e2e.ts`)

**Purpose:** End-to-end encryption for inter-group/channel communication.

**Crypto:**
- Key generation: RSA 2048-bit
- Encryption: RSA-OAEP with SHA-256
- Signing: RSA-PSS with SHA-256

**Methods:**
| Method | Description |
|--------|-------------|
| `generateKeyPair()` | Generate RSA key pair (PEM) |
| `encrypt(message, publicKey)` | RSA-OAEP encrypt → base64 |
| `decrypt(encrypted, privateKey)` | RSA-OAEP decrypt |
| `sign(message, privateKey)` | RSA-PSS sign → base64 |
| `verify(message, signature, publicKey)` | RSA-PSS verify |

---

## 9. Execution Engine

### 9.1 DAG Executor (`src/execution/dag-executor.ts`)

**Purpose:** Executes a directed acyclic graph of agent tasks in topological order.

**Algorithm:** Kahn's algorithm
1. Calculate in-degree for each node
2. Start with all zero in-degree nodes (they can run in parallel)
3. Execute those nodes via the provided executor function
4. Decrement in-degree of dependent nodes
5. Repeat until all nodes processed
6. If processed count ≠ total → cycle detected → throw `CycleDetectedError`

**API:**
```typescript
async function executeDAG(
  nodes: AgentNode[],
  executor: (node: AgentNode) => Promise<string>
): Promise<Map<string, string>>
```

**AgentNode:**
```typescript
interface AgentNode {
  id: string;
  agentType: string;
  brief: string;
  dependsOn: string[];
}
```

---

### 9.2 Worker Pool (`src/execution/worker-pool.ts`)

**Purpose:** Concurrent task execution pool (simulated, not real `worker_threads`).

**Pool sizes by profile:**
| Profile | Workers |
|---------|---------|
| `micro` | 0 (no parallelism) |
| `lite` | 1 |
| `standard` | 2 |
| `full` | `os.cpus() - 1` |

**Methods:**
| Method | Description |
|--------|-------------|
| `submit(task)` | Queue a task, returns Promise<result> |
| `shutdown()` | Cancel all pending tasks |
| `stats()` | Running count, queued count, total completed |

---

### 9.3 Swarm Runner (`src/execution/swarm-runner.ts`)

**Purpose:** Runs multi-agent DAG plans with concurrency limits and timeouts.

**Config:**
```typescript
interface SwarmConfig {
  maxParallel: number;  // Default: 4
  timeoutMs: number;    // Default: 30,000
}
```

**Components:**
- **Semaphore:** Custom implementation limiting concurrent agent executions
- **Timeout:** `Promise.race()` against `setTimeout`
- **Executor wrapper:** Serializes input as TOON, acquires semaphore, runs, releases

**Output:** `Map<nodeId, outputString>` + `SwarmMetrics`

---

### 9.4 Rollback Manager (`src/execution/rollback.ts`)

**Purpose:** Filesystem snapshot and rollback for safe file operations.

**Storage:** `.micro/snapshots/` with content-addressed blobs

**Manifest:**
```typescript
interface ManifestEntry {
  hash: string;     // SHA-256 of file content
  exists: boolean;  // Whether file existed at snapshot time
}
interface Manifest {
  id: string;
  timestamp: number;
  paths: string[];
  entries: Record<string, ManifestEntry>;
}
```

**Methods:**
| Method | Description |
|--------|-------------|
| `withRollback(operation, paths)` | Snapshot → run → auto-restore on error |
| `createSnapshot(paths)` | Snapshot specified files |
| `restoreSnapshot(snapshotId)` | Restore files from snapshot |
| `listSnapshots()` | List all snapshots |
| `prune(maxSnapshots?)` | Keep only latest N (default 20) |

**DB integration:** Optional `MicroClawDB` for persistent snapshot metadata with 30-day expiry.

---

### 9.5 Group Queue (`src/execution/group-queue.ts`)

**Purpose:** Per-group message queue with priority lanes.

**Priorities:**
| Priority | Value | Use Case |
|----------|-------|----------|
| `CRITICAL` | 0 | System emergencies |
| `HIGH` | 1 | Direct mentions |
| `NORMAL` | 2 | Regular messages |
| `LOW` | 3 | Background tasks |

**Dequeue order:** Lowest priority value first, then oldest timestamp.

**Deduplication:** `processedIds` Set prevents reprocessing the same message.

**Methods:**
| Method | Description |
|--------|-------------|
| `enqueue(groupId, content, priority?, metadata?)` | Add message |
| `dequeue(groupId)` | Get highest priority message |
| `peek(groupId)` | Look without removing |
| `length(groupId)` | Queue length for group |
| `clear(groupId?)` | Clear one or all queues |
| `activeGroups()` | Groups with pending messages |
| `isProcessed(messageId)` | Check dedup set |

---

### 9.6 Sandbox (`src/execution/sandbox.ts`)

**Purpose:** Isolated command execution via Docker, nsjail, or direct.

**Config:**
```typescript
interface SandboxConfig {
  preferredRuntime: 'docker' | 'nsjail' | 'none';
  dockerImage: string;       // Default: 'node:20-slim'
  timeoutMs: number;         // Default: 30,000
  memoryLimitMb: number;     // Default: 256
  networkEnabled: boolean;   // Default: false
  allowDirectExec: boolean;  // Default: false
}
```

**Detection order:** Docker → nsjail → none

**Blocked commands (direct exec):** `rm -rf /`, `mkfs`, `dd`, `shutdown`, `reboot`, `init`, `:(){ :|:& };:`, `chmod 777 /`, `> /dev/sda`

**Methods:**
| Method | Description |
|--------|-------------|
| `exec(command, options?)` | Execute command in sandbox |
| `isAvailable()` | Check if sandbox runtime is available |
| `getType()` | Current sandbox type |

---

## 10. Agent System

### 10.1 Agent Types (`src/agents/types.ts`)

```typescript
interface AgentTask {
  id: string;
  type: string;       // planner | research | execution | memory | composer
  brief: string;      // Task description
  groupId: string;
  sessionId: string;
}

interface AgentResult {
  taskId: string;
  agentType: string;
  output: string;      // TOON-encoded output
  tokensUsed: number;
  durationMs: number;
}

interface IAgent {
  readonly type: string;
  execute(task: AgentTask): Promise<AgentResult>;
}

interface PlanStep {
  agentType: 'research' | 'execution' | 'memory' | 'composer';
  brief: string;
  dependsOn: string[];
  parallel: boolean;
}
```

### 10.2 Planner Agent (`src/agents/planner.ts`)

**Purpose:** Decomposes user messages into multi-step plans.

**Routing keywords:**
| Agent | Triggers |
|-------|----------|
| `research` | search, find, look up, research, what is, how to, explain |
| `execution` | run, execute, create, build, install, write, code |
| `memory` | remember, recall, save, store, history, previous |

**Algorithm:**
1. Scan input for keyword matches
2. Create PlanStep for each matched agent type
3. If multiple steps → add `composer` as final step (depends on all others)
4. If no matches → single `research` step + `composer`

**Output:** TOON-encoded plan

---

### 10.3 Research Agent (`src/agents/research.ts`)

**Status: STUB** — Returns placeholder TOON with `status: 'pending'`

**Expected output:** `@findings{ query, sources, relevance, summary }`

---

### 10.4 Execution Agent (`src/agents/execution.ts`)

**Status: STUB** — Returns placeholder TOON with `status: 'pending'`

**Expected output:** `@exec_result{ command, exitCode, stdout, stderr }`

---

### 10.5 Memory Agent (`src/agents/memory.ts`)

**Status: STUB** — Returns placeholder TOON with `status: 'pending'`

**Expected output:** `@memory_result{ operation, found, entries }`

---

### 10.6 Composer Agent (`src/agents/composer.ts`)

**Purpose:** Merges outputs from other agents into a final response.

**Methods:**
- `execute(task)` — Returns placeholder TOON response
- `compose(results, task)` — Decodes each agent result's TOON, extracts `summary`, `content`, or `stdout` field, joins with `\n\n`

---

## 11. Scheduler

### 11.1 Task Scheduler (`src/scheduler/task-scheduler.ts`)

**Purpose:** Cron-based task scheduling backed by SQLite.

**Uses:** `cron-parser` for cron expression parsing, `setTimeout` for scheduling (no polling).

**Events:**
| Event | Payload | Description |
|-------|---------|-------------|
| `task:fired` | `{ taskId, groupId, name, instruction }` | Task triggered |
| `task:added` | `{ taskId, name }` | New task registered |
| `task:removed` | `{ taskId }` | Task deleted |

**Methods:**
| Method | Description |
|--------|-------------|
| `start()` | Load tasks from DB, schedule all enabled |
| `stop()` | Clear all scheduled timers |
| `addTask(config)` | Add task to DB + schedule |
| `removeTask(taskId)` | Remove from DB + cancel timer |
| `setEnabled(taskId, enabled)` | Enable/disable |
| `listTasks(groupId?)` | List all or group tasks |
| `getNextRun(taskId)` | Next fire time |
| `runNow(taskId)` | Immediate execution |

---

### 11.2 Prefetcher (`src/scheduler/prefetcher.ts`)

**Purpose:** Pre-fetches search results on a schedule and caches them.

**Config source:** Parsed from `## Prefetch` section in CLAUDE.md:
```markdown
## Prefetch
query:"weather today" | cron:"0 7 * * *" | ttl:3600
query:"stock prices" | cron:"*/30 * * * *" | ttl:1800
```

**Flow:**
1. `parseConfig(claudeContent)` → extract rules
2. `registerRules(rules)` → create scheduled tasks via TaskScheduler
3. On `task:fired` → decode instruction → call search function → cache result

**Cache:** Uses `insertToolCacheEntry` with SHA-256 of query as `input_hash`.

---

## 12. Search System

### 12.1 Search Interface (`src/search/interface.ts`)

```typescript
interface ISearchClient {
  readonly id: string;
  readonly name: string;
  search(query: string, options?: SearchOptions): Promise<SearchResponse>;
  isConfigured(): boolean;
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  publishedDate?: string;
}

interface SearchOptions {
  count?: number;        // Default: 10
  freshness?: string;    // day, week, month, year
  country?: string;      // Country code
}
```

### 12.2 Brave Search (`src/search/brave.ts`)

- **Endpoint:** `https://api.search.brave.com/res/v1/web/search`
- **Auth:** `X-Subscription-Token` header
- **Env var:** `BRAVE_API_KEY`
- **Freshness mapping:** day→pd, week→pw, month→pm, year→py

### 12.3 Serper Search (`src/search/serper.ts`)

- **Endpoint:** `https://google.serper.dev/search` (POST)
- **Auth:** `X-API-KEY` header
- **Env var:** `SERPER_API_KEY`
- **Freshness mapping:** day→qdr:d, week→qdr:w, month→qdr:m, year→qdr:y

### 12.4 Search Router (`src/search/search-router.ts`)

**Strategy:** Try each configured client in order. Return first successful result. Throw if all fail.

---

## 13. Channel System

### 13.1 Channel Interface (`src/channels/interface.ts`)

```typescript
interface IChannel {
  readonly id: string;
  readonly name: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(message: OutboundMessage): Promise<void>;
  onMessage(handler: (msg: InboundMessage) => void): void;
  supportsFeature(feature: ChannelFeature): boolean;
}
```

**Features:** `markdown`, `images`, `files`, `reactions`, `threads`, `webhooks`

### 13.2 CLI Channel (`src/channels/cli.ts`)

- **I/O:** stdin/stdout via `readline`
- **Group:** `cli-default`
- **Sender:** `cli-user`
- **Features:** markdown only

### 13.3 HTTP Channel (`src/channels/http.ts`)

- **Port:** 3210 (configurable)
- **Endpoints:**
  | Method | Path | Description |
  |--------|------|-------------|
  | GET | `/health` | Health check |
  | POST | `/message` | Send message (body: `{ content, groupId?, senderId? }`) |
  | POST | `/webhook` | Register webhook URL for outbound messages |
- **Features:** markdown, webhooks

### 13.4 WhatsApp Channel (`src/channels/whatsapp.ts`)

**Status: STUB** — Event-based, no real Baileys integration

- **Config:** `authDir`, `printQRInTerminal`, `retryOnDisconnect`, `maxRetries`
- **Features:** images, files, reactions
- **Test helper:** `handleIncomingMessage(jid, content, groupId?)` for simulated messages

---

## 14. CLI Commands

### 14.1 Entry Point (`src/cli/index.ts`)

```
#!/usr/bin/env node
dotenv.config()  →  loads .env
Commander program 'microclaw' v2.0.0
  ├── chat        Open interactive chat session
  ├── start       Start daemon (--foreground)
  ├── stop        Graceful shutdown
  ├── restart     Restart daemon (--foreground)
  ├── status      Show health info
  ├── skills      Manage skills (list, reload, info, install)
  ├── provider    Manage providers (list, add, remove, models, refresh)
  ├── memory      Manage memory (show, search, clear, export)
  ├── vault       Manage secrets (show, add, remove, rotate)
  ├── rollback    Rollback filesystem (list, to)
  ├── logs        View logs (--follow, --level, --group)
  ├── setup       Onboarding wizard (--reset, --mode)
  ├── doctor      Health check
  ├── benchmark   TOON vs JSON benchmark
  └── export      Export data (--group, --format, --output)
```

### 14.2 Chat Command

**File:** `src/cli/commands/chat.ts`

**Options:** `--group <id>`, `--model <id>`, `--provider <id>`, `--no-persona`

**Flow:**
1. Load `.env` via `dotenv.config()`
2. Register all available providers from env vars
3. Try local providers (Ollama, LM Studio)
4. If no providers → show error with all supported env vars
5. `ModelCatalog.refreshAll()` → fetch models from all providers
6. Create session in DB
7. readline REPL:
   - `/quit` or `/exit` → end session
   - `/status` → show providers, model count, group, session, message count
   - Otherwise → `estimateComplexity()` → `selectModel()` → stream response
8. Persist all messages (user + assistant) in DB

### 14.3 Daemon Commands

**File:** `src/cli/commands/daemon.ts`

| Command | Description |
|---------|-------------|
| `microclaw start` | Start daemon (background by default) |
| `microclaw start --foreground` | Start in foreground |
| `microclaw stop` | SIGTERM → SIGKILL after 10 retries |
| `microclaw restart` | Stop + Start |
| `microclaw status` | Running/stopped, PID, providers, skills |

**PID file:** `.micro/microclaw.pid`
**Log file:** `.micro/logs/app.log`

**Foreground mode starts:** Orchestrator, ProviderRegistry, ModelCatalog, SkillWatcher, TaskScheduler

### 14.4 Setup Wizard

**File:** `src/cli/commands/setup.ts`

**5-step interactive wizard:**
1. **Execution Mode:** Isolated (containers) vs Full Control (host)
2. **AI Provider:** OpenRouter, Anthropic, OpenAI, Google, Groq, DeepSeek, Ollama, Skip
3. **API Key:** Paste key, validates format, saves to `.env`
4. **Persona:** Style (concise/detailed/technical/casual), name, trigger word
5. **Confirm:** Review and apply

**Outputs:**
- `.micro/config.toon` — TOON config file
- `.env` — API key
- `groups/default/CLAUDE.md` — Default group memory
- `CLAUDE.md` — Global memory
- `.micro/`, `.micro/logs/`, `.micro/snapshots/`, `groups/default/workspace/`, `.claude/skills/`

**Resume:** Saves state to `.micro/.setup-state.json` for back/quit support.

### 14.5 Doctor Command

**File:** `src/cli/commands/doctor.ts`

**Checks:**
- Node.js version (≥20)
- TypeScript availability
- SQLite (better-sqlite3)
- Disk space
- Memory
- Configured providers
- Skills count
- Channel availability

### 14.6 Benchmark Command

**File:** `src/cli/commands/benchmark.ts`

Compares JSON vs TOON token counts across 5 test cases, estimates token savings. Also benchmarks 10,000 complexity estimator runs.

### 14.7 Export Command

**File:** `src/cli/commands/export.ts`

**Options:** `--group <id>`, `--format <json|md>`, `--output <path>`

Exports groups, sessions, messages (last 500), and memory chunks (last 500) to JSON or Markdown format.

### 14.8 Other Commands

| Command | File | Status |
|---------|------|--------|
| `skills list\|reload\|info\|install` | `skills.ts` | Functional |
| `provider list\|add\|remove\|models\|refresh` | `provider.ts` | Partially functional |
| `memory show\|search\|clear\|export` | `memory.ts` | Placeholder |
| `vault show\|add\|remove\|rotate` | `vault.ts` | Placeholder |
| `rollback list\|to` | `rollback.ts` | Placeholder |
| `logs` | `logs.ts` | Placeholder |

---

## 15. Prompt Files

### 15.1 System Prompts (`prompts/system/`)

| File | Purpose |
|------|---------|
| `agent-base.toon` | Core MicroClaw agent identity and behavior rules |
| `persona-default.toon` | Default persona (Andy, helpful, concise) |
| `persona-template.toon` | Template with `{{name}}`, `{{tone}}`, `{{style}}` placeholders |
| `context-handoff.toon` | Session continuity context template |

### 15.2 Agent Prompts (`prompts/agents/`)

| File | Agent | Purpose |
|------|-------|---------|
| `planner.toon` | Planner | Task decomposition and routing instructions |
| `research.toon` | Research | Web search and RAG retrieval instructions |
| `execution.toon` | Execution | Code, file, and command execution instructions |
| `memory.toon` | Memory | Episodic/semantic memory operations instructions |
| `composer.toon` | Composer | Response assembly instructions |
| `complexity-classifier.toon` | Classifier | Intent classification instructions |

### 15.3 Tool Descriptions (`prompts/tools/tool-descriptions/`)

| File | Tool | Parameters |
|------|------|------------|
| `brave_search.toon` | brave_search | query, count, freshness |
| `serper_search.toon` | serper_search | query, num, gl |
| `fetch_url.toon` | fetch_url | url, maxChars |
| `summarize_page.toon` | summarize_page | url, maxLength |
| `read_file.toon` | read_file | path, encoding |
| `write_file.toon` | write_file | path, content, encoding |
| `delete_file.toon` | delete_file | path, confirm |
| `list_dir.toon` | list_dir | path, recursive, pattern |
| `run_code.toon` | run_code | language, code, timeout |
| `install_pkg.toon` | install_pkg | manager, package, version |
| `send_message.toon` | send_message | channel, target, content |

### 15.4 Tool Selector (`prompts/tools/tool-selector.toon`)

Hierarchical tool selection prompt for the dynamic tool loader.

### 15.5 Guardrail Patterns

| File | Contents |
|------|----------|
| `injection-patterns.txt` | Prompt injection regex patterns |
| `pii-patterns.txt` | PII detection regex patterns |
| `secret-patterns.txt` | API key/token regex patterns |
| `content-safety.toon` | Content safety guardrail prompt |
| `anti-extraction.toon` | Anti-extraction guardrail prompt |
| `persona-lock.toon` | Persona enforcement guardrail prompt |

### 15.6 Memory Prompts (`prompts/memory/`)

| File | Purpose |
|------|---------|
| `episodic-writer.toon` | Instructions for updating CLAUDE.md |
| `extractor.toon` | Fact extraction for semantic memory |
| `summarizer.toon` | Conversation summarization instructions |
| `session-handoff.toon` | Session continuity handoff template |

### 15.7 Search Prompts (`prompts/search/`)

| File | Purpose |
|------|---------|
| `query-extractor.toon` | Extract search queries from user input |
| `result-summarizer.toon` | Summarize search results |
| `citation-formatter.toon` | Format citations in responses |

### 15.8 Onboarding Prompts (`prompts/onboarding/`)

| File | Purpose |
|------|---------|
| `setup-wizard.toon` | First-run setup instructions |
| `mode-selection.toon` | Isolated vs Full Control explanation |
| `provider-setup.toon` | Provider configuration instructions |

---

## 16. Skills System

### 16.1 Skill File Format

Each skill lives in `.claude/skills/<name>/SKILL.md` with YAML-like frontmatter.

### 16.2 Available Skills (19)

| Skill | Command | Purpose |
|-------|---------|---------|
| `setup` | `/setup` | Full installation and onboarding wizard |
| `status` | `/status` | System health, models, channels, skills |
| `debug` | `/debug` | Debugging and diagnostics |
| `customize` | `/customize` | Guided configuration changes |
| `export` | `/export` | Export conversations, memory, config |
| `rollback` | `/rollback` | Rollback to filesystem snapshots |
| `add-provider` | `/add-provider` | Add any AI provider |
| `add-openrouter` | `/add-openrouter` | Configure OpenRouter specifically |
| `add-brave` | `/add-brave` | Configure Brave Search |
| `add-serper` | `/add-serper` | Configure Serper Search |
| `add-clear` | `/add-clear` | Compact/clear conversation history |
| `add-slack` | `/add-slack` | Add Slack channel integration |
| `add-discord` | `/add-discord` | Add Discord channel integration |
| `add-telegram` | `/add-telegram` | Add Telegram channel integration |
| `add-signal` | `/add-signal` | Add Signal via signal-cli |
| `add-gmail` | `/add-gmail` | Gmail read/send integration |
| `convert-to-docker` | `/convert-to-docker` | Switch to Docker for execution |
| `setup-vps` | `/setup-vps` | Harden Linux VPS for MicroClaw |
| `setup-windows` | `/setup-windows` | Install on Windows using WSL2 + Docker |

---

## 17. Group Configuration

### 17.1 Group CLAUDE.md Format

Each group has a `groups/{groupId}/CLAUDE.md` file:

```markdown
# Group: Group Name

## Memory
(Conversation history, facts, preferences stored here)

## MicroClaw Config
@group{
  triggerWord:@Andy
  allowedTools:[brave_search, fetch_url, read_file, write_file, run_code]
  executionMode:isolated
  maxContextTokens:8192
}

## Persona
Name: Andy
Tone: helpful, concise, accurate

## Prefetch
query:"weather today" | cron:"0 7 * * *" | ttl:3600
```

### 17.2 Current Groups

| Group | Trigger | Persona | Tools | Notes |
|-------|---------|---------|-------|-------|
| `default` | `@Andy` | Andy (helpful, concise) | brave_search, fetch_url, read_file, write_file, run_code, list_dir | Default CLI group |
| `family` | `@Mia` | Mia (warm, friendly) | brave_search, fetch_url, read_file, write_file | No code execution, has prefetch |
| `work` | `@Andy` | Andy (professional, technical) | brave_search, fetch_url, read_file, write_file, run_code, list_dir, install_pkg | Full tools |

### 17.3 Global CLAUDE.md

Root `CLAUDE.md` contains project-wide AI memory:
- Project overview
- Architecture summary
- Group listing
- Key facts

---

## 18. Database Schema

### 18.1 Full Schema

```sql
-- Core messaging
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  content TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  channel TEXT NOT NULL,
  processed INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  summary TEXT,
  key_facts TEXT,
  token_count INTEGER
);

-- Tool caching
CREATE TABLE tool_cache (
  id TEXT PRIMARY KEY,
  tool_name TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  result TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  group_id TEXT
);

-- Scheduling
CREATE TABLE scheduled_tasks (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  name TEXT NOT NULL,
  cron TEXT NOT NULL,
  instruction TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_run INTEGER,
  created_at INTEGER NOT NULL
);

-- Group management
CREATE TABLE groups (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,
  name TEXT NOT NULL,
  trigger_word TEXT NOT NULL,
  execution_mode TEXT NOT NULL DEFAULT 'isolated'
);

-- Model catalog cache
CREATE TABLE model_catalog (
  model_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  name TEXT NOT NULL,
  context_window INTEGER NOT NULL,
  input_cost_per_1m REAL NOT NULL,
  output_cost_per_1m REAL NOT NULL,
  capabilities TEXT NOT NULL,       -- JSON array
  tier TEXT NOT NULL,
  deprecated INTEGER NOT NULL DEFAULT 0,
  fetched_at INTEGER NOT NULL,
  PRIMARY KEY (model_id, provider_id)
);

-- Security audit
CREATE TABLE security_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  details TEXT NOT NULL,
  group_id TEXT,
  timestamp INTEGER NOT NULL
);

-- IPC
CREATE TABLE ipc_messages (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,           -- JSON
  processed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- Rollback
CREATE TABLE snapshots (
  id TEXT PRIMARY KEY,
  paths TEXT NOT NULL,             -- JSON array
  manifest TEXT NOT NULL,          -- JSON
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

-- Full-text search (virtual)
CREATE VIRTUAL TABLE memory_fts USING fts5(
  chunk_id,
  content,
  group_id,
  source_type
);

-- Indexes
CREATE INDEX idx_messages_group ON messages(group_id);
CREATE INDEX idx_messages_timestamp ON messages(timestamp);
CREATE INDEX idx_sessions_group ON sessions(group_id);
CREATE INDEX idx_tool_cache_hash ON tool_cache(input_hash);
CREATE INDEX idx_tool_cache_expires ON tool_cache(expires_at);
CREATE INDEX idx_scheduled_tasks_group ON scheduled_tasks(group_id);
CREATE INDEX idx_model_catalog_provider ON model_catalog(provider_id);
CREATE INDEX idx_model_catalog_tier ON model_catalog(tier);
CREATE INDEX idx_security_events_type ON security_events(event_type);
CREATE INDEX idx_ipc_processed ON ipc_messages(processed);
```

---

## 19. Test Suite

**Framework:** Vitest
**Total:** 900+ tests across 45 test files

### 19.1 Test Files

| Directory | File | Tests | Description |
|-----------|------|-------|-------------|
| `tests/core/` | `toon-serializer.test.ts` | ~30 | TOON encode/decode/parse |
| | `orchestrator.test.ts` | ~15 | Event handling, concurrency |
| | `provider-registry.test.ts` | ~12 | Register/unregister/default |
| | `model-catalog.test.ts` | ~15 | Tier assignment, refresh |
| | `complexity-estimator.test.ts` | ~20 | Scoring accuracy |
| | `model-selector.test.ts` | ~15 | Selection + fallback |
| | `prompt-loader.test.ts` | ~12 | Load/cache/render |
| | `prompt-compressor.test.ts` | ~10 | Compression ratio |
| | `dynamic-tool-loader.test.ts` | ~15 | Intent classification |
| | `tool-cache.test.ts` | ~15 | TTL, hash, cleanup |
| | `skill-watcher.test.ts` | ~12 | Hot-reload events |
| `tests/providers/` | `adapters.test.ts` | ~50 | All 12 provider adapters |
| | `openrouter.test.ts` | ~10 | OpenRouter specifics |
| | `anthropic.test.ts` | ~10 | Anthropic specifics |
| `tests/memory/` | `episodic.test.ts` | ~15 | File-based memory |
| | `semantic.test.ts` | ~12 | FTS5 search |
| | `rag-indexer.test.ts` | ~15 | Chunking + indexing |
| | `retriever.test.ts` | ~10 | Unified retrieval |
| | `compactor.test.ts` | ~15 | Summarization |
| | `working-memory.test.ts` | ~20 | Token budget |
| `tests/security/` | `injection-detector.test.ts` | ~20 | Injection detection |
| | `pii-detector.test.ts` | ~20 | PII detection + Luhn |
| | `vault.test.ts` | ~15 | Encryption/decryption |
| | `persona-lock.test.ts` | ~12 | Drift detection |
| | `guardrails.test.ts` | ~15 | 3-stage pipeline |
| | `e2e.test.ts` | ~10 | RSA encrypt/sign |
| | `adversarial.test.ts` | ~54 | Adversarial attack suite |
| `tests/execution/` | `dag-executor.test.ts` | ~15 | Kahn's algorithm |
| | `worker-pool.test.ts` | ~12 | Concurrency |
| | `swarm-runner.test.ts` | ~12 | DAG + timeout |
| | `rollback.test.ts` | ~15 | Snapshot/restore |
| | `group-queue.test.ts` | ~15 | Priority queue |
| | `sandbox.test.ts` | ~10 | Sandbox detection |
| `tests/agents/` | `planner.test.ts` | ~12 | Plan decomposition |
| | `research.test.ts` | ~8 | Research stub |
| | `execution.test.ts` | ~8 | Execution stub |
| | `memory-agent.test.ts` | ~8 | Memory stub |
| | `composer.test.ts` | ~10 | Response composition |
| `tests/channels/` | `cli.test.ts` | ~10 | CLI channel |
| | `http.test.ts` | ~12 | HTTP endpoints |
| | `whatsapp.test.ts` | ~10 | WhatsApp stub |
| `tests/scheduler/` | `task-scheduler.test.ts` | ~20 | Cron scheduling |
| | `prefetcher.test.ts` | ~10 | Prefetch parsing |
| `tests/search/` | `brave.test.ts` | ~10 | Brave API |
| | `serper.test.ts` | ~10 | Serper API |
| | `search-router.test.ts` | ~8 | Router fallback |
| `tests/` | `db.test.ts` | ~30 | Database CRUD |
| | `ipc.test.ts` | ~10 | IPC messages |
| | `router.test.ts` | ~10 | Message routing |
| `tests/cli/` | `commands.test.ts` | ~35 | CLI command registration |
| `tests/integration/` | `full-flow.test.ts` | ~15 | End-to-end flow |

---

## 20. Build & Tooling

### 20.1 Build

```bash
npm run build          # tsc → dist/
npm run lint           # tsc --noEmit (type checking)
```

### 20.2 Development

```bash
npm run dev            # tsx src/cli/index.ts (no compile needed)
npm run test           # vitest run
npm run test:watch     # vitest (watch mode)
```

### 20.3 Global CLI

```bash
npm run build          # Compile to dist/
npm link               # Register 'microclaw' globally
microclaw --help       # Now works from anywhere
```

### 20.4 Production

```bash
npm run build
npm run prod           # node dist/cli/index.js
npm run prod:start     # node dist/cli/index.js start --foreground
```

### 20.5 Dependencies

**Runtime:**
| Package | Purpose |
|---------|---------|
| `better-sqlite3` | SQLite with WAL |
| `commander` | CLI framework |
| `zod` | Runtime validation |
| `chokidar` | File watching |
| `dotenv` | Environment loading |
| `uuid` | UUID generation |
| `pino` | Structured logging |
| `cron-parser` | Cron expression parsing |
| `chalk` | Terminal colors |
| `ora` | Terminal spinners |
| `@whiskeysockets/baileys` | WhatsApp (stub) |
| `@anthropic-ai/sdk` | Anthropic SDK (unused, direct fetch used) |
| `@google/generative-ai` | Google SDK (unused, direct fetch used) |
| `openai` | OpenAI SDK (unused, direct fetch used) |
| `node-fetch` | HTTP (fallback) |
| `onnxruntime-node` | ONNX (unused, FTS5 used instead) |
| `ws` | WebSocket (for channels) |

**Dev:**
| Package | Purpose |
|---------|---------|
| `typescript` | Compiler |
| `vitest` | Testing |
| `tsx` | TypeScript execution |
| `prettier` | Formatting |
| `@types/*` | Type definitions |

---

## 21. Known Limitations & Stub Modules

### 21.1 Stub/Placeholder Modules

These modules exist with correct interfaces and pass tests but don't have full implementations:

| Module | Status | What's Missing |
|--------|--------|----------------|
| `ResearchAgent` | Stub | No actual web search or RAG integration; returns placeholder TOON |
| `ExecutionAgent` | Stub | No actual command execution; returns placeholder TOON |
| `MemoryAgent` | Stub | No actual memory read/write; returns placeholder TOON |
| `WhatsApp Channel` | Stub | No real Baileys connection; event-based simulation only |
| `CLI: memory` | Placeholder | Commands print messages but don't operate on data |
| `CLI: vault` | Placeholder | Commands print messages but don't use Vault class |
| `CLI: rollback` | Placeholder | Commands print messages but don't use RollbackManager |
| `CLI: logs` | Placeholder | Commands print messages but don't read log files |
| `CLI: provider models` | Placeholder | Doesn't actually list models |
| `CLI: provider refresh` | Placeholder | Doesn't refresh catalog |

### 21.2 Integration Gaps

| Gap | Description |
|-----|-------------|
| **Orchestrator → Agents** | Orchestrator receives messages but doesn't route to Planner/Agent system |
| **Guardrails → Chat** | Chat command doesn't run messages through Guardrails |
| **Working Memory → Chat** | Chat uses simple array, not WorkingMemory with token budget |
| **Prompt Loader → Chat** | Chat doesn't load system prompts from `/prompts/` |
| **Tool Cache → Chat** | Chat doesn't cache or use tool results |
| **Rollback → Execution** | ExecutionAgent doesn't use RollbackManager for file ops |
| **Sandbox → Execution** | ExecutionAgent doesn't use Sandbox for command execution |
| **Search → Research** | ResearchAgent doesn't use BraveSearch or SerperSearch |
| **Config → Runtime** | `.micro/config.toon` is written but not read at startup (only `.env` is loaded) |
| **Persona Lock → Chat** | PersonaLock not applied to AI responses in chat |
| **PII Detector → Chat** | PII not redacted from stored messages |
| **Episodic Memory → Chat** | Group CLAUDE.md not updated with conversation context |

### 21.3 Unused Dependencies

These packages are installed but the code uses `fetch()` directly instead:
- `@anthropic-ai/sdk` — Anthropic adapter uses raw fetch
- `@google/generative-ai` — Google adapter uses raw fetch
- `openai` — OpenAI adapter extends OpenAICompat which uses raw fetch
- `onnxruntime-node` — Was intended for vector embeddings, FTS5 used instead

---

## 22. Data Flow: Message Lifecycle

### 22.1 Current Flow (Chat Command)

```
User types message
        │
        ▼
   readline captures input
        │
        ▼
   estimateComplexity(input)  →  ComplexityResult { score, tier }
        │
        ▼
   selectModel(catalog, complexity)  →  ModelSelection { model, score, tier }
        │
        ▼
   registry.get(model.provider_id)  →  IProviderAdapter
        │
        ▼
   db.insertMessage({ role: 'user', content })
        │
        ▼
   provider.stream({ model, messages, maxTokens: 2048 })
        │                    │
        │          (fallback if stream fails)
        │                    │
        │            provider.complete(...)
        │
        ▼
   Print chunks to stdout
        │
        ▼
   db.insertMessage({ role: 'assistant', content })
        │
        ▼
   conversationHistory.push(...)
        │
        ▼
   rl.prompt()  →  wait for next input
```

### 22.2 Intended Full Flow (Not Yet Wired)

```
Channel receives message
        │
        ▼
   MessageRouter.route(message)  →  groupId, priority
        │
        ▼
   GroupQueue.enqueue(groupId, message, priority)
        │
        ▼
   Guardrails.processInput(content)  →  injection check, PII redaction
        │
        ▼
   Orchestrator handles event
        │
        ▼
   WorkingMemory.addMessage(...)  →  check token budget
        │
        ▼
   Retriever.retrieve(query)  →  RAG context from FTS5
        │
        ▼
   EpisodicMemory.read(groupId)  →  group context from CLAUDE.md
        │
        ▼
   PromptLoader.render('system/agent-base', vars)  →  system prompt
        │
        ▼
   PlannerAgent.decompose(message)  →  PlanStep[]
        │
        ▼
   DAGExecutor.executeDAG(steps, agentExecutor)
        │
   ┌────┴────┬──────────┐
   ▼         ▼          ▼
 Research  Execution  Memory    (parallel where possible)
   │         │          │
   └────┬────┘──────────┘
        ▼
   ComposerAgent.compose(results)  →  final response
        │
        ▼
   Guardrails.processOutput(response)  →  secret leak check, persona drift
        │
        ▼
   PromptCompressor.compress(...)  →  token savings for cache
        │
        ▼
   Channel.send(response)
        │
        ▼
   EpisodicMemory.update(...)  →  save to CLAUDE.md
   Compactor.compact(...)  →  summarize if needed
```

---

*Generated: March 2026*
*MicroClaw v2.0.0 — 70 source files, 45 test files, 32 prompt files, 19 skills, 900+ tests*
