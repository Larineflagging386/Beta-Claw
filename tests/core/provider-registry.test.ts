import { describe, it, expect, beforeEach } from 'vitest';
import { ProviderRegistry } from '../../src/core/provider-registry.js';
import type {
  IProviderAdapter,
  CompletionRequest,
  CompletionResponse,
  CompletionChunk,
  TokenCost,
  ModelCatalogResponse,
  ProviderFeature,
} from '../../src/providers/interface.js';

function createMockProvider(id: string): IProviderAdapter {
  return {
    id,
    name: `Mock ${id}`,
    baseURL: `https://${id}.api`,
    async fetchAvailableModels(): Promise<ModelCatalogResponse> {
      return { models: [], fetchedAt: Date.now(), providerID: id };
    },
    async complete(_req: CompletionRequest): Promise<CompletionResponse> {
      return {
        content: 'mock',
        model: 'mock',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        finishReason: 'stop',
      };
    },
    async *stream(_req: CompletionRequest): AsyncIterable<CompletionChunk> {
      yield { content: 'mock', done: true };
    },
    estimateCost(_req: CompletionRequest): TokenCost {
      return { estimatedInputTokens: 0, estimatedOutputTokens: 0, estimatedCostUSD: 0 };
    },
    supportsFeature(_f: ProviderFeature): boolean {
      return false;
    },
  };
}

describe('ProviderRegistry', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry();
  });

  it('registers and retrieves a provider', () => {
    const provider = createMockProvider('openrouter');
    registry.register(provider);
    expect(registry.get('openrouter')).toBe(provider);
  });

  it('sets first registered provider as default', () => {
    const provider = createMockProvider('openrouter');
    registry.register(provider);
    expect(registry.getDefault()).toBe(provider);
  });

  it('does not change default when registering additional providers', () => {
    const first = createMockProvider('openrouter');
    const second = createMockProvider('anthropic');
    registry.register(first);
    registry.register(second);
    expect(registry.getDefault()).toBe(first);
  });

  it('changes default explicitly', () => {
    const first = createMockProvider('openrouter');
    const second = createMockProvider('anthropic');
    registry.register(first);
    registry.register(second);
    registry.setDefault('anthropic');
    expect(registry.getDefault()).toBe(second);
  });

  it('throws when setting default to unregistered provider', () => {
    expect(() => registry.setDefault('nonexistent')).toThrow();
  });

  it('unregisters a provider', () => {
    const provider = createMockProvider('openrouter');
    registry.register(provider);
    const removed = registry.unregister('openrouter');
    expect(removed).toBe(true);
    expect(registry.get('openrouter')).toBeUndefined();
  });

  it('returns false when unregistering nonexistent provider', () => {
    expect(registry.unregister('nonexistent')).toBe(false);
  });

  it('updates default on unregister if default was removed', () => {
    registry.register(createMockProvider('openrouter'));
    registry.register(createMockProvider('anthropic'));
    registry.unregister('openrouter');
    const def = registry.getDefault();
    expect(def).toBeDefined();
    expect(def!.id).toBe('anthropic');
  });

  it('sets default to null when all providers removed', () => {
    registry.register(createMockProvider('openrouter'));
    registry.unregister('openrouter');
    expect(registry.getDefault()).toBeUndefined();
  });

  it('lists all providers', () => {
    registry.register(createMockProvider('openrouter'));
    registry.register(createMockProvider('anthropic'));
    registry.register(createMockProvider('groq'));
    expect(registry.list()).toHaveLength(3);
  });

  it('lists all provider IDs', () => {
    registry.register(createMockProvider('openrouter'));
    registry.register(createMockProvider('anthropic'));
    const ids = registry.listIds();
    expect(ids).toContain('openrouter');
    expect(ids).toContain('anthropic');
  });

  it('checks if provider exists', () => {
    registry.register(createMockProvider('openrouter'));
    expect(registry.has('openrouter')).toBe(true);
    expect(registry.has('nonexistent')).toBe(false);
  });

  it('reports correct size', () => {
    expect(registry.size()).toBe(0);
    registry.register(createMockProvider('a'));
    registry.register(createMockProvider('b'));
    expect(registry.size()).toBe(2);
  });
});
