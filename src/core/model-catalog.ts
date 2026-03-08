// src/core/model-catalog.ts

import type { MicroClawDB, ModelCatalogEntry } from '../db.js';
import type { ProviderRegistry } from './provider-registry.js';

export interface ModelEntry {
  id:          string;
  name:        string;
  provider_id: string;
  tier:        'nano' | 'standard' | 'pro' | 'max';
  context:     number;   // tokens
  inPer1M:     number;   // USD
  outPer1M:    number;   // USD
}

export const MODEL_CATALOG: ModelEntry[] = [
  // ── Anthropic ───────────────────────────────────────────────────────────────
  {
    id: 'claude-haiku-4-5-20251001',
    name: 'Claude Haiku 4.5',
    provider_id: 'anthropic', tier: 'nano',
    context: 200_000, inPer1M: 0.80, outPer1M: 4.00,
  },
  {
    id: 'claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6',
    provider_id: 'anthropic', tier: 'standard',
    context: 200_000, inPer1M: 3.00, outPer1M: 15.00,
  },
  {
    id: 'claude-opus-4-6',
    name: 'Claude Opus 4.6',
    provider_id: 'anthropic', tier: 'pro',
    context: 200_000, inPer1M: 5.00, outPer1M: 25.00,
  },

  // ── Google Gemini ───────────────────────────────────────────────────────────
  {
    id: 'gemini-2.5-flash-lite',
    name: 'Gemini 2.5 Flash-Lite',
    provider_id: 'google', tier: 'nano',
    context: 1_048_576, inPer1M: 0.07, outPer1M: 0.30,
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    provider_id: 'google', tier: 'standard',
    context: 1_048_576, inPer1M: 0.15, outPer1M: 0.60,
  },
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    provider_id: 'google', tier: 'pro',
    context: 1_048_576, inPer1M: 1.25, outPer1M: 10.00,
  },
  {
    id: 'gemini-3.1-pro-preview',
    name: 'Gemini 3.1 Pro Preview',
    provider_id: 'google', tier: 'max',
    context: 1_048_576, inPer1M: 1.25, outPer1M: 10.00,
  },

  // ── OpenRouter ──────────────────────────────────────────────────────────────
  {
    id: 'meta-llama/llama-3.1-8b-instruct',
    name: 'Llama 3.1 8B',
    provider_id: 'openrouter', tier: 'nano',
    context: 128_000, inPer1M: 0.06, outPer1M: 0.06,
  },
  {
    id: 'meta-llama/llama-4-maverick',
    name: 'Llama 4 Maverick',
    provider_id: 'openrouter', tier: 'standard',
    context: 524_288, inPer1M: 0.22, outPer1M: 0.88,
  },
  {
    id: 'deepseek/deepseek-chat-v3-0324',
    name: 'DeepSeek Chat V3',
    provider_id: 'openrouter', tier: 'standard',
    context: 64_000, inPer1M: 0.27, outPer1M: 1.10,
  },
  {
    id: 'mistralai/devstral-2',
    name: 'Devstral 2',
    provider_id: 'openrouter', tier: 'standard',
    context: 262_144, inPer1M: 0.30, outPer1M: 0.90,
  },
  {
    id: 'qwen/qwen3-235b-a22b',
    name: 'Qwen3 235B',
    provider_id: 'openrouter', tier: 'standard',
    context: 131_072, inPer1M: 0.23, outPer1M: 0.69,
  },
  {
    id: 'deepseek/deepseek-r1',
    name: 'DeepSeek R1',
    provider_id: 'openrouter', tier: 'pro',
    context: 128_000, inPer1M: 0.55, outPer1M: 2.19,
  },
];

/** Static fallback catalog alias — used to seed the model selector before DB is populated. */
export const DEFAULT_CATALOG: ModelEntry[] = MODEL_CATALOG;

/**
 * Dynamic model catalog — fetches from all registered providers and caches in DB.
 * Use `getAllModels()` to get the full merged list (static + dynamic).
 */
export class ModelCatalog {
  constructor(private db: MicroClawDB, private registry: ProviderRegistry) {}

  async refreshAll(): Promise<void> {
    for (const provider of this.registry.list()) {
      try {
        const response = await provider.fetchAvailableModels();
        for (const m of response.models) {
          this.db.upsertModelCatalogEntry({
            provider_id:        provider.id,
            model_id:           m.id,
            model_name:         m.name,
            context_window:     m.contextWindow ?? null,
            input_cost_per_1m:  m.inputCostPer1M ?? null,
            output_cost_per_1m: m.outputCostPer1M ?? null,
            capabilities:       m.capabilities ? JSON.stringify(m.capabilities) : null,
            tier:               'standard',
            fetched_at:         Math.floor(Date.now() / 1000),
            expires_at:         Math.floor(Date.now() / 1000) + 3600,
          });
        }
      } catch (e) {
        console.warn(`[model-catalog] Failed to refresh ${provider.id}:`, e);
      }
    }
  }

  getAllModels(): ModelCatalogEntry[] {
    return this.registry.listIds().flatMap(id => this.db.getModelsByProvider(id));
  }
}

// Tier-to-model-id selector — deterministic, no LLM call
const TIER_DEFAULTS: Record<string, Record<string, string>> = {
  anthropic: {
    nano:     'claude-haiku-4-5-20251001',
    standard: 'claude-sonnet-4-6',
    pro:      'claude-opus-4-6',
    max:      'claude-opus-4-6',  // no max tier in Anthropic yet
  },
  google: {
    nano:     'gemini-2.5-flash-lite',
    standard: 'gemini-2.5-flash',
    pro:      'gemini-2.5-pro',
    max:      'gemini-3.1-pro-preview',
  },
  openrouter: {
    nano:     'meta-llama/llama-3.1-8b-instruct',
    standard: 'deepseek/deepseek-chat-v3-0324',
    pro:      'deepseek/deepseek-r1',
    max:      'deepseek/deepseek-r1',
  },
};

export function selectModel(tier: string, provider: string): string {
  return TIER_DEFAULTS[provider]?.[tier] ?? TIER_DEFAULTS['anthropic']!['standard']!;
}

export function getCost1K(modelId: string): number {
  const m = MODEL_CATALOG.find(e => e.id === modelId);
  if (!m) return 0;
  return (m.inPer1M * 500 + m.outPer1M * 500) / 1_000_000;
}
