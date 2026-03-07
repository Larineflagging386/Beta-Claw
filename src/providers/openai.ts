import { OpenAICompatAdapter } from './openai-compat.js';
import type { SecretAccessor } from './openai-compat.js';
import type { ProviderFeature } from './interface.js';

const OPENAI_MODELS = [
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    contextWindow: 128_000,
    inputCostPer1M: 2.5,
    outputCostPer1M: 10.0,
    capabilities: ['streaming', 'function_calling', 'vision', 'prompt_caching', 'json_mode', 'structured_output', 'system_message'],
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    contextWindow: 128_000,
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.6,
    capabilities: ['streaming', 'function_calling', 'vision', 'json_mode', 'structured_output', 'system_message'],
  },
  {
    id: 'o3',
    name: 'O3',
    contextWindow: 200_000,
    inputCostPer1M: 10.0,
    outputCostPer1M: 40.0,
    capabilities: ['streaming', 'function_calling', 'system_message'],
  },
  {
    id: 'o3-mini',
    name: 'O3 Mini',
    contextWindow: 200_000,
    inputCostPer1M: 1.1,
    outputCostPer1M: 4.4,
    capabilities: ['streaming', 'function_calling', 'system_message'],
  },
  {
    id: 'gpt-4-turbo',
    name: 'GPT-4 Turbo',
    contextWindow: 128_000,
    inputCostPer1M: 10.0,
    outputCostPer1M: 30.0,
    capabilities: ['streaming', 'function_calling', 'vision', 'json_mode', 'system_message'],
  },
];

class OpenAIAdapter extends OpenAICompatAdapter {
  constructor(getApiKey: SecretAccessor) {
    super(
      {
        id: 'openai',
        name: 'OpenAI',
        baseURL: 'https://api.openai.com/v1',
        features: new Set<ProviderFeature>([
          'streaming',
          'function_calling',
          'vision',
          'prompt_caching',
          'json_mode',
          'structured_output',
          'system_message',
        ]),
        staticModels: [...OPENAI_MODELS],
        defaultInputCost: 2.5,
        defaultOutputCost: 10.0,
      },
      getApiKey,
    );
  }
}

export { OpenAIAdapter };
