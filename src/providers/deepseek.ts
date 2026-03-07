import { OpenAICompatAdapter } from './openai-compat.js';
import type { SecretAccessor } from './openai-compat.js';
import type { ProviderFeature } from './interface.js';

const DEEPSEEK_MODELS = [
  {
    id: 'deepseek-chat',
    name: 'DeepSeek Chat',
    contextWindow: 128_000,
    inputCostPer1M: 0.14,
    outputCostPer1M: 0.28,
    capabilities: ['streaming', 'function_calling', 'json_mode', 'system_message'],
  },
  {
    id: 'deepseek-coder',
    name: 'DeepSeek Coder',
    contextWindow: 128_000,
    inputCostPer1M: 0.14,
    outputCostPer1M: 0.28,
    capabilities: ['streaming', 'function_calling', 'json_mode', 'system_message'],
  },
  {
    id: 'deepseek-reasoner',
    name: 'DeepSeek Reasoner',
    contextWindow: 128_000,
    inputCostPer1M: 0.55,
    outputCostPer1M: 2.19,
    capabilities: ['streaming', 'system_message'],
  },
];

class DeepSeekAdapter extends OpenAICompatAdapter {
  constructor(getApiKey: SecretAccessor) {
    super(
      {
        id: 'deepseek',
        name: 'DeepSeek',
        baseURL: 'https://api.deepseek.com/v1',
        features: new Set<ProviderFeature>([
          'streaming',
          'function_calling',
          'json_mode',
          'system_message',
        ]),
        staticModels: [...DEEPSEEK_MODELS],
        defaultInputCost: 0.14,
        defaultOutputCost: 0.28,
      },
      getApiKey,
    );
  }
}

export { DeepSeekAdapter };
