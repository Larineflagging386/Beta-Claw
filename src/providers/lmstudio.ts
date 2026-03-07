import { z } from 'zod';
import { OpenAICompatAdapter } from './openai-compat.js';
import type { SecretAccessor } from './openai-compat.js';
import type { ModelCatalogResponse, ProviderFeature } from './interface.js';

const LMStudioModelsResponseSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      object: z.string().optional(),
    }),
  ),
});

class LMStudioAdapter extends OpenAICompatAdapter {
  constructor(getApiKey: SecretAccessor = () => '', baseURL = 'http://localhost:1234/v1') {
    super(
      {
        id: 'lmstudio',
        name: 'LM Studio',
        baseURL,
        features: new Set<ProviderFeature>([
          'streaming',
          'function_calling',
          'system_message',
        ]),
        staticModels: [],
        defaultInputCost: 0,
        defaultOutputCost: 0,
      },
      getApiKey,
    );
  }

  override async fetchAvailableModels(): Promise<ModelCatalogResponse> {
    try {
      const response = await fetch(`${this.baseURL}/models`, {
        headers: this.buildHeaders(),
      });

      if (!response.ok) {
        return this.emptyModelCatalog();
      }

      const raw: unknown = await response.json();
      const parsed = LMStudioModelsResponseSchema.parse(raw);

      return {
        models: parsed.data.map((m) => ({
          id: m.id,
          name: m.id,
          contextWindow: 4096,
          inputCostPer1M: 0,
          outputCostPer1M: 0,
          capabilities: ['streaming', 'function_calling'],
          deprecated: false,
        })),
        fetchedAt: Math.floor(Date.now() / 1000),
        providerID: this.id,
      };
    } catch {
      return this.emptyModelCatalog();
    }
  }

  protected override buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const apiKey = this.getApiKey();
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    return headers;
  }

  private emptyModelCatalog(): ModelCatalogResponse {
    return {
      models: [],
      fetchedAt: Math.floor(Date.now() / 1000),
      providerID: this.id,
    };
  }
}

export { LMStudioAdapter };
