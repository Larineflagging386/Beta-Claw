import { OpenAICompatAdapter } from './openai-compat.js';
import type { SecretAccessor } from './openai-compat.js';
import type { ProviderFeature } from './interface.js';

const MISTRAL_MODELS = [
  {
    id: 'mistral-large-latest',
    name: 'Mistral Large',
    contextWindow: 128_000,
    inputCostPer1M: 2.0,
    outputCostPer1M: 6.0,
    capabilities: ['streaming', 'function_calling', 'json_mode', 'system_message'],
  },
  {
    id: 'mistral-medium-latest',
    name: 'Mistral Medium',
    contextWindow: 32_000,
    inputCostPer1M: 2.7,
    outputCostPer1M: 8.1,
    capabilities: ['streaming', 'function_calling', 'json_mode', 'system_message'],
  },
  {
    id: 'mistral-small-latest',
    name: 'Mistral Small',
    contextWindow: 128_000,
    inputCostPer1M: 0.2,
    outputCostPer1M: 0.6,
    capabilities: ['streaming', 'function_calling', 'json_mode', 'system_message'],
  },
  {
    id: 'open-mistral-7b',
    name: 'Open Mistral 7B',
    contextWindow: 32_000,
    inputCostPer1M: 0.25,
    outputCostPer1M: 0.25,
    capabilities: ['streaming', 'json_mode', 'system_message'],
  },
];

class MistralAdapter extends OpenAICompatAdapter {
  constructor(getApiKey: SecretAccessor) {
    super(
      {
        id: 'mistral',
        name: 'Mistral AI',
        baseURL: 'https://api.mistral.ai/v1',
        features: new Set<ProviderFeature>([
          'streaming',
          'function_calling',
          'json_mode',
          'system_message',
        ]),
        staticModels: [...MISTRAL_MODELS],
        defaultInputCost: 2.0,
        defaultOutputCost: 6.0,
      },
      getApiKey,
    );
  }
}

export { MistralAdapter };
