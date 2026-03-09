# betaclaw

**Token-optimized AI assistant with multi-provider support**

betaclaw is an open, provider-agnostic AI agent runtime that routes requests across 12 providers, compresses prompts with its custom TOON format, and orchestrates multi-agent workflows — all from a single CLI or HTTP interface.

---

## Features

- **12 AI Providers** — Anthropic, OpenAI, Google, Groq, Mistral, Cohere, Together, Ollama, LM Studio, Perplexity, DeepSeek, OpenRouter
- **Smart Model Routing** — 4-tier complexity estimation (nano / standard / pro / max) selects the cheapest model that fits the task
- **TOON Format** — Token-Oriented Object Notation achieves 28–44% token reduction vs JSON for structured agent payloads
- **Multi-Agent DAG Execution** — Planner, research, execution, memory, and composer agents coordinate through a directed acyclic graph
- **Encrypted Secret Vault** — AES-256-GCM with PBKDF2 key derivation; passphrase-protected secrets never touch disk in plaintext
- **Hot-Swappable Skills** — 19 built-in skills with < 60 ms reload via filesystem watcher
- **Prompt Injection Defense** — Multi-layer detection: pattern matching, zero-width character stripping, homoglyph normalization, base64 decoding, role injection blocking
- **PII Detection & Redaction** — Credit cards (Luhn-validated), SSNs, emails, phone numbers, and API keys are redacted before storage or transmission
- **RAG with FTS5** — Full-text search over conversation memory chunks via SQLite FTS5 virtual tables
- **Working Memory with Context Budgeting** — Token-aware context window management with automatic summarization when utilization exceeds threshold
- **CLI, HTTP, and Extensible Channel System** — Ship with CLI and HTTP channels; add Telegram, Discord, Slack, Signal via skill system
- **Cross-Platform** — Linux, macOS, and Windows (WSL2)

---

## Quick Start

```bash
# Clone and install
git clone https://github.com/your-org/betaclaw.git
cd betaclaw
npm install

# Configure a provider (OpenRouter recommended for broadest model access)
npx betaclaw setup          # interactive wizard

# Or set an API key directly
export OPENROUTER_API_KEY="sk-or-..."

# Start chatting
npx betaclaw chat
```

---

## CLI Commands

| Command | Description |
|---|---|
| `betaclaw chat` | Open interactive chat session |
| `betaclaw chat --provider <id>` | Chat using a specific provider |
| `betaclaw chat --model <id>` | Override the auto-selected model |
| `betaclaw chat --group <id>` | Chat within a named group context |
| `betaclaw start` | Start the betaclaw daemon |
| `betaclaw start --foreground` | Run daemon in the foreground |
| `betaclaw setup` | Run the interactive setup wizard |
| `betaclaw status` | Show system health, providers, and loaded skills |

In-chat commands:

| Command | Description |
|---|---|
| `/status` | Show provider, model count, group, session info |
| `/quit` or `/exit` | End session and close |

---

## Architecture

```
User Input
    │
    ▼
┌──────────┐    ┌──────────────┐    ┌────────────────┐
│ Channel   │───▶│ Guardrails   │───▶│ Complexity     │
│ (CLI/HTTP)│    │ + PII Redact │    │ Estimator      │
└──────────┘    └──────────────┘    └───────┬────────┘
                                            │
                                            ▼
                                   ┌────────────────┐
                                   │ Model Selector  │
                                   │ (4-tier routing)│
                                   └───────┬────────┘
                                           │
                                           ▼
                                   ┌────────────────┐
                                   │ Planner Agent   │
                                   │ (DAG builder)   │
                                   └───────┬────────┘
                                           │
                          ┌────────────────┬┴──────────────┐
                          ▼                ▼               ▼
                   ┌───────────┐   ┌────────────┐  ┌───────────┐
                   │ Research  │   │ Execution  │  │ Memory    │
                   │ Agent     │   │ Agent      │  │ Agent     │
                   └─────┬─────┘   └─────┬──────┘  └─────┬─────┘
                         └────────┬──────┘               │
                                  ▼                      │
                         ┌────────────────┐              │
                         │ Composer Agent │◀─────────────┘
                         └───────┬────────┘
                                 │
                                 ▼
                        ┌────────────────┐
                        │ Working Memory │
                        │ + Tool Cache   │
                        └────────────────┘
```

---

## Providers

| Provider | Environment Variable | Models | Features |
|---|---|---|---|
| Anthropic | `ANTHROPIC_API_KEY` | Claude 4, 3.5, 3 | Streaming, prompt caching, function calling |
| OpenAI | `OPENAI_API_KEY` | GPT-4o, 4, 3.5 | Streaming, function calling, JSON mode |
| Google | `GOOGLE_API_KEY` | Gemini 2, 1.5 | Streaming, vision, structured output |
| Groq | `GROQ_API_KEY` | Llama, Mixtral | Streaming, fast inference |
| Mistral | `MISTRAL_API_KEY` | Mistral Large, Medium | Streaming, function calling |
| Cohere | `COHERE_API_KEY` | Command R+ | Streaming, RAG-native |
| Together | `TOGETHER_API_KEY` | 100+ open models | Streaming, function calling |
| Ollama | `OLLAMA_BASE_URL` | Local models | Streaming, offline |
| LM Studio | `LMSTUDIO_BASE_URL` | Local GGUF models | Streaming, offline |
| Perplexity | `PERPLEXITY_API_KEY` | Sonar models | Streaming, search-augmented |
| DeepSeek | `DEEPSEEK_API_KEY` | DeepSeek V3, R1 | Streaming, code-optimized |
| OpenRouter | `OPENROUTER_API_KEY` | 200+ models | Streaming, function calling, unified API |

---

## Skills

19 built-in skills loaded from `.claude/skills/`:

| Skill | Command | Description |
|---|---|---|
| Setup | `setup` | Full installation and onboarding wizard |
| Setup VPS | `setup-vps` | Auto-harden a Linux VPS for deployment |
| Setup Windows | `setup-windows` | Set up on Windows using WSL2 and Docker |
| Add Provider | `add-provider` | Generic wizard to add any supported AI provider |
| Add OpenRouter | `add-openrouter` | Configure OpenRouter for 200+ models |
| Add Brave | `add-brave` | Configure Brave Search API |
| Add Serper | `add-serper` | Configure Serper for Google search |
| Add Telegram | `add-telegram` | Add Telegram as a channel |
| Add Discord | `add-discord` | Add Discord as a channel |
| Add Slack | `add-slack` | Add Slack as a channel |
| Add Signal | `add-signal` | Add Signal via signal-cli bridge |
| Add Gmail | `add-gmail` | Add Gmail read/send integration |
| Add Clear | `add-clear` | Compact and clear conversation history |
| Convert to Docker | `convert-to-docker` | Switch runtime to Docker for isolation |
| Customize | `customize` | Guided code customization |
| Debug | `debug` | AI-native debugging and diagnostics |
| Export | `export` | Export conversation summaries and config |
| Rollback | `rollback` | Roll back filesystem changes to a snapshot |
| Status | `status` | Show system health and active configuration |

---

## Configuration

betaclaw uses TOON (Token-Oriented Object Notation) for internal configuration and data exchange:

```
@config{
  provider:openrouter
  model:auto
  profile:standard
  maxTokens:8192
  summarizeThreshold:0.85
  vault:
  @vault{
    dir:.beta
    algorithm:aes-256-gcm
  }
  skills:
  @skills{
    dir:.claude/skills
    reloadMs:50
  }
}
```

TOON reduces token usage by 28–44% compared to equivalent JSON while remaining human-readable.

---

## Security

### Encrypted Vault

Secrets are stored in `.beta/vault.enc` using AES-256-GCM encryption with a PBKDF2-derived key (100,000 iterations, SHA-256). Plaintext never touches disk.

### Prompt Injection Defense

Three-layer detection:

1. **Pattern matching** — Known injection phrases (e.g., "ignore previous instructions")
2. **Structural analysis** — Zero-width character evasion, Unicode homoglyph attacks, base64-encoded payloads, nested role declarations
3. **Semantic check** — Flagged for long inputs that pass layers 1–2

### PII Detection & Redaction

Automatic detection and redaction of:

- Credit card numbers (Luhn-validated)
- Social Security Numbers
- Email addresses
- Phone numbers
- API keys and tokens (OpenAI, Anthropic, GitHub, Slack, Google, AWS, private keys)

---

## Development

### Prerequisites

- Node.js >= 20.0.0
- npm or bun

### Scripts

```bash
npm run build         # Compile TypeScript
npm run dev           # Run via tsx (development)
npm run start         # Run compiled output
npm test              # Run all tests
npm run test:watch    # Run tests in watch mode
npm run lint          # Type-check without emitting
npm run format        # Prettier formatting
```

### Testing

```bash
# Run all tests
npx vitest run

# Run specific test suite
npx vitest run tests/core/

# Run integration tests
npx vitest run tests/integration/

# Watch mode
npx vitest
```

### Project Structure

```
src/
├── agents/            # Planner, composer, research, execution, memory agents
├── channels/          # CLI, HTTP, and channel interface
├── cli/               # Commander-based CLI (chat, daemon)
├── core/              # Orchestrator, model catalog, complexity estimator,
│                        provider registry, prompt loader/compressor,
│                        skill parser/watcher, TOON serializer, tool cache
├── execution/         # DAG executor, worker pool, swarm runner, rollback
├── memory/            # Working memory, compactor, episodic, semantic,
│                        RAG indexer, retriever
├── providers/         # 12 provider adapters (Anthropic, OpenAI, …)
├── search/            # Brave, Serper adapters and search router
├── security/          # Vault, guardrails, injection detector, PII detector,
│                        persona lock
└── db.ts              # SQLite database layer (better-sqlite3)

tests/                 # Mirror of src/ structure with unit + integration tests
prompts/               # Prompt templates and guardrail patterns
groups/                # Group configuration
.claude/skills/        # Built-in skill definitions (SKILL.md)
.beta/                # Vault storage (encrypted)
```

---

## License

MIT
