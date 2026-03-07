import { describe, it, expect } from 'vitest';
import { OpenRouterAdapter } from '../../src/providers/openrouter.js';

describe('OpenRouterAdapter', () => {
  const adapter = new OpenRouterAdapter(() => 'test-key');

  it('has correct id and name', () => {
    expect(adapter.id).toBe('openrouter');
    expect(adapter.name).toBe('OpenRouter');
  });

  it('has correct base URL', () => {
    expect(adapter.baseURL).toBe('https://openrouter.ai/api/v1');
  });

  it('supports streaming', () => {
    expect(adapter.supportsFeature('streaming')).toBe(true);
  });

  it('supports function calling', () => {
    expect(adapter.supportsFeature('function_calling')).toBe(true);
  });

  it('supports system message', () => {
    expect(adapter.supportsFeature('system_message')).toBe(true);
  });

  it('does not support prompt caching', () => {
    expect(adapter.supportsFeature('prompt_caching')).toBe(false);
  });

  it('estimates cost without crashing', () => {
    const cost = adapter.estimateCost({
      model: 'anthropic/claude-sonnet',
      messages: [{ role: 'user', content: 'Hello world' }],
    });
    expect(cost.estimatedInputTokens).toBeGreaterThan(0);
    expect(cost.estimatedOutputTokens).toBeGreaterThan(0);
    expect(cost.estimatedCostUSD).toBeTypeOf('number');
  });

  it('estimates higher input tokens for longer messages', () => {
    const short = adapter.estimateCost({
      model: 'test',
      messages: [{ role: 'user', content: 'Hi' }],
    });
    const long = adapter.estimateCost({
      model: 'test',
      messages: [{ role: 'user', content: 'Hello world, this is a much longer message that should result in more tokens' }],
    });
    expect(long.estimatedInputTokens).toBeGreaterThan(short.estimatedInputTokens);
  });

  it('implements IProviderAdapter interface', () => {
    expect(typeof adapter.fetchAvailableModels).toBe('function');
    expect(typeof adapter.complete).toBe('function');
    expect(typeof adapter.stream).toBe('function');
    expect(typeof adapter.estimateCost).toBe('function');
    expect(typeof adapter.supportsFeature).toBe('function');
  });
});
