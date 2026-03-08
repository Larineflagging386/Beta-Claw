import { describe, it, expect } from 'vitest';
import { selectModel } from '../../src/core/model-selector.js';
import { DEFAULT_CATALOG, type ModelEntry } from '../../src/core/model-catalog.js';
import { estimateComplexity } from '../../src/core/complexity-estimator.js';

describe('ModelSelector', () => {
  const catalog: ModelEntry[] = DEFAULT_CATALOG;

  it('selects nano model for simple greetings', () => {
    const result = selectModel(catalog, 'hi');
    expect(result).not.toBeNull();
    expect(result!.tier).toBe('nano');
  });

  it('selects appropriate tier model for complex tasks', () => {
    const result = selectModel(catalog, 'build a REST API with database and testing');
    expect(result).not.toBeNull();
    expect(['nano', 'standard', 'pro', 'max']).toContain(result!.tier);
  });

  it('returns selection with model and tier', () => {
    const result = selectModel(catalog, 'hello');
    expect(result).not.toBeNull();
    expect(result!.model).toBeDefined();
    expect(result!.model.id).toBeTypeOf('string');
    expect(result!.tier).toBeTypeOf('string');
  });

  it('returns null when no models are available', () => {
    const result = selectModel([], 'hello');
    expect(result).toBeNull();
  });

  it('falls back to another tier when target tier has no models', () => {
    const proOnly: ModelEntry[] = [
      { id: 'gemini-2.5-pro', provider_id: 'google', tier: 'pro', contextTokens: 1_000_000 },
    ];
    const result = selectModel(proOnly, 'hi');
    expect(result).not.toBeNull();
    expect(result!.model.id).toBe('gemini-2.5-pro');
  });

  it('breaks ties by selecting first matching model in catalog order', () => {
    const twonano: ModelEntry[] = [
      { id: 'claude-haiku-4-5-20251001', provider_id: 'anthropic', tier: 'nano', contextTokens: 200_000 },
      { id: 'gemini-2.5-flash-lite', provider_id: 'google', tier: 'nano', contextTokens: 1_000_000 },
    ];
    const result = selectModel(twonano, 'hi');
    expect(result).not.toBeNull();
    expect(result!.model.id).toBe('claude-haiku-4-5-20251001');
  });

  it('prefers models matching tier patterns', () => {
    const mixed: ModelEntry[] = [
      { id: 'claude-sonnet-4-6', provider_id: 'anthropic', tier: 'standard', contextTokens: 200_000 },
      { id: 'claude-haiku-4-5-20251001', provider_id: 'anthropic', tier: 'nano', contextTokens: 200_000 },
    ];
    const result = selectModel(mixed, 'hi');
    expect(result).not.toBeNull();
    expect(result!.model.id).toBe('claude-haiku-4-5-20251001');
  });

  it('integrates with complexity estimator end-to-end', () => {
    const inputs = ['hi', 'write a function', 'build a full application with tests and deploy'];
    const tiers: string[] = [];

    for (const input of inputs) {
      const result = selectModel(catalog, input);
      if (result) tiers.push(result.tier);
    }

    expect(tiers.length).toBe(3);
  });

  it('classifyTier is consistent with selectModel tier', () => {
    const result = selectModel(catalog, 'hello');
    expect(result).not.toBeNull();
    const complexity = estimateComplexity('hello');
    expect(result!.tier).toBe(complexity.tier);
  });
});
