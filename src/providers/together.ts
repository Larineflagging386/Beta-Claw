import { OpenAICompatAdapter } from './openai-compat.js';
import type { SecretAccessor } from './openai-compat.js';
import type { ProviderFeature } from './interface.js';

const TOGETHER_MODELS = [
  {
    id: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
    name: 'LLaMA 3.1 70B Instruct Turbo',
    contextWindow: 128_000,
    inputCostPer1M: 0.88,
    outputCostPer1M: 0.88,
    capabilities: ['streaming', 'function_calling', 'json_mode', 'system_message'],
  },
  {
    id: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
    name: 'LLaMA 3.1 8B Instruct Turbo',
    contextWindow: 128_000,
    inputCostPer1M: 0.18,
    outputCostPer1M: 0.18,
    capabilities: ['streaming', 'function_calling', 'json_mode', 'system_message'],
  },
  {
    id: 'mistralai/Mixtral-8x7B-Instruct-v0.1',
    name: 'Mixtral 8x7B Instruct v0.1',
    contextWindow: 32_768,
    inputCostPer1M: 0.6,
    outputCostPer1M: 0.6,
    capabilities: ['streaming', 'json_mode', 'system_message'],
  },
];

class TogetherAdapter extends OpenAICompatAdapter {
  constructor(getApiKey: SecretAccessor) {
    super(
      {
        id: 'together',
        name: 'Together AI',
        baseURL: 'https://api.together.xyz/v1',
        features: new Set<ProviderFeature>([
          'streaming',
          'function_calling',
          'json_mode',
          'system_message',
        ]),
        staticModels: [...TOGETHER_MODELS],
        defaultInputCost: 0.88,
        defaultOutputCost: 0.88,
      },
      getApiKey,
    );
  }
}

export { TogetherAdapter };
