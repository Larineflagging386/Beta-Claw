import { OpenAICompatAdapter } from './openai-compat.js';
import type { SecretAccessor } from './openai-compat.js';
import type { ProviderFeature } from './interface.js';

const PERPLEXITY_MODELS = [
  {
    id: 'llama-3.1-sonar-large-128k-online',
    name: 'Sonar Large 128K Online',
    contextWindow: 128_000,
    inputCostPer1M: 1.0,
    outputCostPer1M: 1.0,
    capabilities: ['streaming', 'system_message'],
  },
  {
    id: 'llama-3.1-sonar-small-128k-online',
    name: 'Sonar Small 128K Online',
    contextWindow: 128_000,
    inputCostPer1M: 0.2,
    outputCostPer1M: 0.2,
    capabilities: ['streaming', 'system_message'],
  },
];

class PerplexityAdapter extends OpenAICompatAdapter {
  constructor(getApiKey: SecretAccessor) {
    super(
      {
        id: 'perplexity',
        name: 'Perplexity AI',
        baseURL: 'https://api.perplexity.ai',
        features: new Set<ProviderFeature>([
          'streaming',
          'system_message',
        ]),
        staticModels: [...PERPLEXITY_MODELS],
        defaultInputCost: 1.0,
        defaultOutputCost: 1.0,
      },
      getApiKey,
    );
  }
}

export { PerplexityAdapter };
