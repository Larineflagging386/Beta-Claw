import { describe, it, expect } from 'vitest';
import { OpenAIAdapter } from '../../src/providers/openai.js';
import { GoogleAdapter } from '../../src/providers/google.js';
import { GroqAdapter } from '../../src/providers/groq.js';
import { MistralAdapter } from '../../src/providers/mistral.js';
import { CohereAdapter } from '../../src/providers/cohere.js';
import { TogetherAdapter } from '../../src/providers/together.js';
import { OllamaAdapter } from '../../src/providers/ollama.js';
import { LMStudioAdapter } from '../../src/providers/lmstudio.js';
import { PerplexityAdapter } from '../../src/providers/perplexity.js';
import { DeepSeekAdapter } from '../../src/providers/deepseek.js';
import type { ProviderFeature } from '../../src/providers/interface.js';

const testKey = () => 'test-key-123';

const sampleRequest = {
  model: 'test-model',
  messages: [{ role: 'user' as const, content: 'Explain quantum computing in simple terms' }],
};

// ─── OpenAI ──────────────────────────────────────────────────────

describe('OpenAIAdapter', () => {
  const adapter = new OpenAIAdapter(testKey);

  it('has correct id, name, and baseURL', () => {
    expect(adapter.id).toBe('openai');
    expect(adapter.name).toBe('OpenAI');
    expect(adapter.baseURL).toBe('https://api.openai.com/v1');
  });

  it('supports expected features', () => {
    const yes: ProviderFeature[] = ['streaming', 'function_calling', 'vision', 'prompt_caching', 'json_mode', 'structured_output'];
    const no: ProviderFeature[] = [];
    for (const f of yes) expect(adapter.supportsFeature(f)).toBe(true);
    for (const f of no) expect(adapter.supportsFeature(f)).toBe(false);
  });

  it('returns reasonable cost estimate', () => {
    const cost = adapter.estimateCost(sampleRequest);
    expect(cost.estimatedInputTokens).toBeGreaterThan(0);
    expect(cost.estimatedOutputTokens).toBeGreaterThan(0);
    expect(cost.estimatedCostUSD).toBeGreaterThanOrEqual(0);
  });

  it('has expected static models', async () => {
    const catalog = await adapter.fetchAvailableModels();
    expect(catalog.providerID).toBe('openai');
    expect(catalog.models.length).toBe(5);
    expect(catalog.models.some((m) => m.id === 'gpt-4o')).toBe(true);
    expect(catalog.models.some((m) => m.id === 'gpt-4o-mini')).toBe(true);
    expect(catalog.models.some((m) => m.id === 'o3')).toBe(true);
    expect(catalog.models.some((m) => m.id === 'o3-mini')).toBe(true);
    expect(catalog.models.some((m) => m.id === 'gpt-4-turbo')).toBe(true);
  });

  it('implements IProviderAdapter interface', () => {
    expect(typeof adapter.fetchAvailableModels).toBe('function');
    expect(typeof adapter.complete).toBe('function');
    expect(typeof adapter.stream).toBe('function');
    expect(typeof adapter.estimateCost).toBe('function');
    expect(typeof adapter.supportsFeature).toBe('function');
  });
});

// ─── Google (Gemini) ─────────────────────────────────────────────

describe('GoogleAdapter', () => {
  const adapter = new GoogleAdapter(testKey);

  it('has correct id, name, and baseURL', () => {
    expect(adapter.id).toBe('google');
    expect(adapter.name).toBe('Google (Gemini)');
    expect(adapter.baseURL).toBe('https://generativelanguage.googleapis.com/v1beta');
  });

  it('supports expected features', () => {
    expect(adapter.supportsFeature('streaming')).toBe(true);
    expect(adapter.supportsFeature('function_calling')).toBe(true);
    expect(adapter.supportsFeature('vision')).toBe(true);
    expect(adapter.supportsFeature('json_mode')).toBe(true);
    expect(adapter.supportsFeature('prompt_caching')).toBe(false);
    expect(adapter.supportsFeature('structured_output')).toBe(true);
  });

  it('returns reasonable cost estimate', () => {
    const cost = adapter.estimateCost(sampleRequest);
    expect(cost.estimatedInputTokens).toBeGreaterThan(0);
    expect(cost.estimatedOutputTokens).toBeGreaterThan(0);
    expect(cost.estimatedCostUSD).toBeGreaterThanOrEqual(0);
  });

  it('has expected static models', async () => {
    const catalog = await adapter.fetchAvailableModels();
    expect(catalog.providerID).toBe('google');
    expect(catalog.models.length).toBe(6);
    expect(catalog.models.some((m) => m.id === 'gemini-3.1-pro-preview')).toBe(true);
    expect(catalog.models.some((m) => m.id === 'gemini-3-flash-preview')).toBe(true);
    expect(catalog.models.some((m) => m.id === 'gemini-2.5-pro')).toBe(true);
    expect(catalog.models.some((m) => m.id === 'gemini-2.5-flash')).toBe(true);
  });

  it('models have large context windows', async () => {
    const catalog = await adapter.fetchAvailableModels();
    for (const model of catalog.models) {
      expect(model.contextWindow).toBeGreaterThanOrEqual(1_000_000);
    }
  });
});

// ─── Groq ────────────────────────────────────────────────────────

describe('GroqAdapter', () => {
  const adapter = new GroqAdapter(testKey);

  it('has correct id, name, and baseURL', () => {
    expect(adapter.id).toBe('groq');
    expect(adapter.name).toBe('Groq');
    expect(adapter.baseURL).toBe('https://api.groq.com/openai/v1');
  });

  it('supports expected features', () => {
    expect(adapter.supportsFeature('streaming')).toBe(true);
    expect(adapter.supportsFeature('function_calling')).toBe(true);
    expect(adapter.supportsFeature('json_mode')).toBe(true);
    expect(adapter.supportsFeature('vision')).toBe(false);
    expect(adapter.supportsFeature('prompt_caching')).toBe(false);
  });

  it('returns reasonable cost estimate', () => {
    const cost = adapter.estimateCost(sampleRequest);
    expect(cost.estimatedInputTokens).toBeGreaterThan(0);
    expect(cost.estimatedOutputTokens).toBeGreaterThan(0);
    expect(cost.estimatedCostUSD).toBeGreaterThanOrEqual(0);
  });

  it('has expected static models', async () => {
    const catalog = await adapter.fetchAvailableModels();
    expect(catalog.providerID).toBe('groq');
    expect(catalog.models.length).toBe(4);
    expect(catalog.models.some((m) => m.id === 'llama-3.1-70b-versatile')).toBe(true);
    expect(catalog.models.some((m) => m.id === 'llama-3.1-8b-instant')).toBe(true);
    expect(catalog.models.some((m) => m.id === 'mixtral-8x7b-32768')).toBe(true);
    expect(catalog.models.some((m) => m.id === 'gemma2-9b-it')).toBe(true);
  });
});

// ─── Mistral ─────────────────────────────────────────────────────

describe('MistralAdapter', () => {
  const adapter = new MistralAdapter(testKey);

  it('has correct id, name, and baseURL', () => {
    expect(adapter.id).toBe('mistral');
    expect(adapter.name).toBe('Mistral AI');
    expect(adapter.baseURL).toBe('https://api.mistral.ai/v1');
  });

  it('supports expected features', () => {
    expect(adapter.supportsFeature('streaming')).toBe(true);
    expect(adapter.supportsFeature('function_calling')).toBe(true);
    expect(adapter.supportsFeature('json_mode')).toBe(true);
    expect(adapter.supportsFeature('vision')).toBe(false);
    expect(adapter.supportsFeature('prompt_caching')).toBe(false);
  });

  it('returns reasonable cost estimate', () => {
    const cost = adapter.estimateCost(sampleRequest);
    expect(cost.estimatedInputTokens).toBeGreaterThan(0);
    expect(cost.estimatedOutputTokens).toBeGreaterThan(0);
    expect(cost.estimatedCostUSD).toBeGreaterThanOrEqual(0);
  });

  it('has expected static models', async () => {
    const catalog = await adapter.fetchAvailableModels();
    expect(catalog.providerID).toBe('mistral');
    expect(catalog.models.length).toBe(4);
    expect(catalog.models.some((m) => m.id === 'mistral-large-latest')).toBe(true);
    expect(catalog.models.some((m) => m.id === 'mistral-small-latest')).toBe(true);
    expect(catalog.models.some((m) => m.id === 'open-mistral-7b')).toBe(true);
  });
});

// ─── Cohere ──────────────────────────────────────────────────────

describe('CohereAdapter', () => {
  const adapter = new CohereAdapter(testKey);

  it('has correct id, name, and baseURL', () => {
    expect(adapter.id).toBe('cohere');
    expect(adapter.name).toBe('Cohere');
    expect(adapter.baseURL).toBe('https://api.cohere.ai/v1');
  });

  it('supports expected features', () => {
    expect(adapter.supportsFeature('streaming')).toBe(true);
    expect(adapter.supportsFeature('function_calling')).toBe(true);
    expect(adapter.supportsFeature('vision')).toBe(false);
    expect(adapter.supportsFeature('json_mode')).toBe(false);
    expect(adapter.supportsFeature('prompt_caching')).toBe(false);
  });

  it('returns reasonable cost estimate', () => {
    const cost = adapter.estimateCost(sampleRequest);
    expect(cost.estimatedInputTokens).toBeGreaterThan(0);
    expect(cost.estimatedOutputTokens).toBeGreaterThan(0);
    expect(cost.estimatedCostUSD).toBeGreaterThanOrEqual(0);
  });

  it('has expected static models', async () => {
    const catalog = await adapter.fetchAvailableModels();
    expect(catalog.providerID).toBe('cohere');
    expect(catalog.models.length).toBe(3);
    expect(catalog.models.some((m) => m.id === 'command-r-plus')).toBe(true);
    expect(catalog.models.some((m) => m.id === 'command-r')).toBe(true);
    expect(catalog.models.some((m) => m.id === 'command-light')).toBe(true);
  });

  it('implements IProviderAdapter interface', () => {
    expect(typeof adapter.fetchAvailableModels).toBe('function');
    expect(typeof adapter.complete).toBe('function');
    expect(typeof adapter.stream).toBe('function');
    expect(typeof adapter.estimateCost).toBe('function');
    expect(typeof adapter.supportsFeature).toBe('function');
  });
});

// ─── Together AI ─────────────────────────────────────────────────

describe('TogetherAdapter', () => {
  const adapter = new TogetherAdapter(testKey);

  it('has correct id, name, and baseURL', () => {
    expect(adapter.id).toBe('together');
    expect(adapter.name).toBe('Together AI');
    expect(adapter.baseURL).toBe('https://api.together.xyz/v1');
  });

  it('supports expected features', () => {
    expect(adapter.supportsFeature('streaming')).toBe(true);
    expect(adapter.supportsFeature('function_calling')).toBe(true);
    expect(adapter.supportsFeature('json_mode')).toBe(true);
    expect(adapter.supportsFeature('vision')).toBe(false);
    expect(adapter.supportsFeature('prompt_caching')).toBe(false);
  });

  it('returns reasonable cost estimate', () => {
    const cost = adapter.estimateCost(sampleRequest);
    expect(cost.estimatedInputTokens).toBeGreaterThan(0);
    expect(cost.estimatedOutputTokens).toBeGreaterThan(0);
    expect(cost.estimatedCostUSD).toBeGreaterThanOrEqual(0);
  });

  it('has expected static models', async () => {
    const catalog = await adapter.fetchAvailableModels();
    expect(catalog.providerID).toBe('together');
    expect(catalog.models.length).toBe(3);
    expect(catalog.models.some((m) => m.id === 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo')).toBe(true);
    expect(catalog.models.some((m) => m.id === 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo')).toBe(true);
  });
});

// ─── Ollama ──────────────────────────────────────────────────────

describe('OllamaAdapter', () => {
  const adapter = new OllamaAdapter();

  it('has correct id, name, and baseURL', () => {
    expect(adapter.id).toBe('ollama');
    expect(adapter.name).toBe('Ollama');
    expect(adapter.baseURL).toBe('http://localhost:11434');
  });

  it('supports expected features', () => {
    expect(adapter.supportsFeature('streaming')).toBe(true);
    expect(adapter.supportsFeature('system_message')).toBe(true);
    expect(adapter.supportsFeature('function_calling')).toBe(false);
    expect(adapter.supportsFeature('vision')).toBe(false);
    expect(adapter.supportsFeature('json_mode')).toBe(false);
  });

  it('returns zero cost (local inference)', () => {
    const cost = adapter.estimateCost(sampleRequest);
    expect(cost.estimatedInputTokens).toBeGreaterThan(0);
    expect(cost.estimatedOutputTokens).toBeGreaterThan(0);
    expect(cost.estimatedCostUSD).toBe(0);
  });

  it('gracefully returns empty catalog when server is unavailable', async () => {
    const offlineAdapter = new OllamaAdapter(() => '', 'http://localhost:1');
    const catalog = await offlineAdapter.fetchAvailableModels();
    expect(catalog.providerID).toBe('ollama');
    expect(catalog.models).toEqual([]);
  });

  it('implements IProviderAdapter interface', () => {
    expect(typeof adapter.fetchAvailableModels).toBe('function');
    expect(typeof adapter.complete).toBe('function');
    expect(typeof adapter.stream).toBe('function');
    expect(typeof adapter.estimateCost).toBe('function');
    expect(typeof adapter.supportsFeature).toBe('function');
  });
});

// ─── LM Studio ───────────────────────────────────────────────────

describe('LMStudioAdapter', () => {
  const adapter = new LMStudioAdapter();

  it('has correct id, name, and baseURL', () => {
    expect(adapter.id).toBe('lmstudio');
    expect(adapter.name).toBe('LM Studio');
    expect(adapter.baseURL).toBe('http://localhost:1234/v1');
  });

  it('supports expected features', () => {
    expect(adapter.supportsFeature('streaming')).toBe(true);
    expect(adapter.supportsFeature('function_calling')).toBe(true);
    expect(adapter.supportsFeature('system_message')).toBe(true);
    expect(adapter.supportsFeature('vision')).toBe(false);
    expect(adapter.supportsFeature('json_mode')).toBe(false);
  });

  it('returns zero cost (local inference)', () => {
    const cost = adapter.estimateCost(sampleRequest);
    expect(cost.estimatedInputTokens).toBeGreaterThan(0);
    expect(cost.estimatedOutputTokens).toBeGreaterThan(0);
    expect(cost.estimatedCostUSD).toBe(0);
  });

  it('gracefully returns empty catalog when server is unavailable', async () => {
    const offlineAdapter = new LMStudioAdapter(() => '', 'http://localhost:1/v1');
    const catalog = await offlineAdapter.fetchAvailableModels();
    expect(catalog.providerID).toBe('lmstudio');
    expect(catalog.models).toEqual([]);
  });

  it('implements IProviderAdapter interface', () => {
    expect(typeof adapter.fetchAvailableModels).toBe('function');
    expect(typeof adapter.complete).toBe('function');
    expect(typeof adapter.stream).toBe('function');
    expect(typeof adapter.estimateCost).toBe('function');
    expect(typeof adapter.supportsFeature).toBe('function');
  });
});

// ─── Perplexity AI ───────────────────────────────────────────────

describe('PerplexityAdapter', () => {
  const adapter = new PerplexityAdapter(testKey);

  it('has correct id, name, and baseURL', () => {
    expect(adapter.id).toBe('perplexity');
    expect(adapter.name).toBe('Perplexity AI');
    expect(adapter.baseURL).toBe('https://api.perplexity.ai');
  });

  it('supports expected features', () => {
    expect(adapter.supportsFeature('streaming')).toBe(true);
    expect(adapter.supportsFeature('system_message')).toBe(true);
    expect(adapter.supportsFeature('function_calling')).toBe(false);
    expect(adapter.supportsFeature('vision')).toBe(false);
    expect(adapter.supportsFeature('json_mode')).toBe(false);
  });

  it('returns reasonable cost estimate', () => {
    const cost = adapter.estimateCost(sampleRequest);
    expect(cost.estimatedInputTokens).toBeGreaterThan(0);
    expect(cost.estimatedOutputTokens).toBeGreaterThan(0);
    expect(cost.estimatedCostUSD).toBeGreaterThanOrEqual(0);
  });

  it('has expected static models', async () => {
    const catalog = await adapter.fetchAvailableModels();
    expect(catalog.providerID).toBe('perplexity');
    expect(catalog.models.length).toBe(2);
    expect(catalog.models.some((m) => m.id === 'llama-3.1-sonar-large-128k-online')).toBe(true);
    expect(catalog.models.some((m) => m.id === 'llama-3.1-sonar-small-128k-online')).toBe(true);
  });
});

// ─── DeepSeek ────────────────────────────────────────────────────

describe('DeepSeekAdapter', () => {
  const adapter = new DeepSeekAdapter(testKey);

  it('has correct id, name, and baseURL', () => {
    expect(adapter.id).toBe('deepseek');
    expect(adapter.name).toBe('DeepSeek');
    expect(adapter.baseURL).toBe('https://api.deepseek.com/v1');
  });

  it('supports expected features', () => {
    expect(adapter.supportsFeature('streaming')).toBe(true);
    expect(adapter.supportsFeature('function_calling')).toBe(true);
    expect(adapter.supportsFeature('json_mode')).toBe(true);
    expect(adapter.supportsFeature('vision')).toBe(false);
    expect(adapter.supportsFeature('prompt_caching')).toBe(false);
  });

  it('returns reasonable cost estimate', () => {
    const cost = adapter.estimateCost(sampleRequest);
    expect(cost.estimatedInputTokens).toBeGreaterThan(0);
    expect(cost.estimatedOutputTokens).toBeGreaterThan(0);
    expect(cost.estimatedCostUSD).toBeGreaterThanOrEqual(0);
  });

  it('has expected static models', async () => {
    const catalog = await adapter.fetchAvailableModels();
    expect(catalog.providerID).toBe('deepseek');
    expect(catalog.models.length).toBe(3);
    expect(catalog.models.some((m) => m.id === 'deepseek-chat')).toBe(true);
    expect(catalog.models.some((m) => m.id === 'deepseek-coder')).toBe(true);
    expect(catalog.models.some((m) => m.id === 'deepseek-reasoner')).toBe(true);
  });

  it('deepseek-reasoner lacks function_calling', async () => {
    const catalog = await adapter.fetchAvailableModels();
    const reasoner = catalog.models.find((m) => m.id === 'deepseek-reasoner');
    expect(reasoner).toBeDefined();
    expect(reasoner!.capabilities).not.toContain('function_calling');
  });
});

// ─── Cross-provider sanity checks ───────────────────────────────

describe('Cross-provider checks', () => {
  const adapters = [
    new OpenAIAdapter(testKey),
    new GoogleAdapter(testKey),
    new GroqAdapter(testKey),
    new MistralAdapter(testKey),
    new CohereAdapter(testKey),
    new TogetherAdapter(testKey),
    new OllamaAdapter(),
    new LMStudioAdapter(),
    new PerplexityAdapter(testKey),
    new DeepSeekAdapter(testKey),
  ];

  it('all adapters have unique ids', () => {
    const ids = adapters.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all adapters support streaming', () => {
    for (const a of adapters) {
      expect(a.supportsFeature('streaming')).toBe(true);
    }
  });

  it('estimateCost returns valid shape for all', () => {
    for (const a of adapters) {
      const cost = a.estimateCost(sampleRequest);
      expect(cost.estimatedInputTokens).toBeGreaterThan(0);
      expect(cost.estimatedOutputTokens).toBeGreaterThan(0);
      expect(typeof cost.estimatedCostUSD).toBe('number');
    }
  });

  it('all adapters have non-empty names', () => {
    for (const a of adapters) {
      expect(a.name.length).toBeGreaterThan(0);
      expect(a.baseURL.length).toBeGreaterThan(0);
    }
  });
});
