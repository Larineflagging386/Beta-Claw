import { OpenAICompatAdapter } from './openai-compat.js';
import type { SecretAccessor } from './openai-compat.js';
import type { ProviderFeature } from './interface.js';

const GROQ_MODELS = [
  {
    id: 'llama-3.1-70b-versatile',
    name: 'LLaMA 3.1 70B Versatile',
    contextWindow: 128_000,
    inputCostPer1M: 0.59,
    outputCostPer1M: 0.79,
    capabilities: ['streaming', 'function_calling', 'json_mode', 'system_message'],
  },
  {
    id: 'llama-3.1-8b-instant',
    name: 'LLaMA 3.1 8B Instant',
    contextWindow: 128_000,
    inputCostPer1M: 0.05,
    outputCostPer1M: 0.08,
    capabilities: ['streaming', 'function_calling', 'json_mode', 'system_message'],
  },
  {
    id: 'mixtral-8x7b-32768',
    name: 'Mixtral 8x7B',
    contextWindow: 32_768,
    inputCostPer1M: 0.24,
    outputCostPer1M: 0.24,
    capabilities: ['streaming', 'function_calling', 'json_mode', 'system_message'],
  },
  {
    id: 'gemma2-9b-it',
    name: 'Gemma 2 9B IT',
    contextWindow: 8_192,
    inputCostPer1M: 0.2,
    outputCostPer1M: 0.2,
    capabilities: ['streaming', 'json_mode', 'system_message'],
  },
];

class GroqAdapter extends OpenAICompatAdapter {
  constructor(getApiKey: SecretAccessor) {
    super(
      {
        id: 'groq',
        name: 'Groq',
        baseURL: 'https://api.groq.com/openai/v1',
        features: new Set<ProviderFeature>([
          'streaming',
          'function_calling',
          'json_mode',
          'system_message',
        ]),
        staticModels: [...GROQ_MODELS],
        defaultInputCost: 0.59,
        defaultOutputCost: 0.79,
      },
      getApiKey,
    );
  }
}

export { GroqAdapter };
