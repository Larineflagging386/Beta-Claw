import { z } from 'zod';
import type {
  IProviderAdapter,
  CompletionRequest,
  CompletionResponse,
  CompletionChunk,
  TokenCost,
  ModelCatalogResponse,
  ProviderFeature,
} from './interface.js';

const OllamaTagsResponseSchema = z.object({
  models: z.array(
    z.object({
      name: z.string(),
      model: z.string().optional(),
      size: z.number().optional(),
      details: z
        .object({
          parameter_size: z.string().optional(),
          quantization_level: z.string().optional(),
          family: z.string().optional(),
        })
        .optional(),
    }),
  ),
});

const OllamaChatResponseSchema = z.object({
  model: z.string(),
  message: z.object({
    role: z.string(),
    content: z.string(),
  }),
  done: z.boolean(),
  total_duration: z.number().optional(),
  eval_count: z.number().int().optional(),
  prompt_eval_count: z.number().int().optional(),
});

const OllamaStreamChunkSchema = z.object({
  model: z.string().optional(),
  message: z
    .object({
      role: z.string(),
      content: z.string(),
    })
    .optional(),
  done: z.boolean(),
  eval_count: z.number().int().optional(),
  prompt_eval_count: z.number().int().optional(),
});

type SecretAccessor = () => string;

class OllamaAdapter implements IProviderAdapter {
  readonly id = 'ollama';
  readonly name = 'Ollama';
  readonly baseURL: string;

  private readonly getApiKey: SecretAccessor;

  constructor(getApiKey: SecretAccessor = () => '', baseURL = 'http://localhost:11434') {
    this.getApiKey = getApiKey;
    this.baseURL = baseURL;
  }

  async fetchAvailableModels(): Promise<ModelCatalogResponse> {
    try {
      const headers = this.buildHeaders();
      const response = await fetch(`${this.baseURL}/api/tags`, { headers });

      if (!response.ok) {
        return this.emptyModelCatalog();
      }

      const raw: unknown = await response.json();
      const parsed = OllamaTagsResponseSchema.parse(raw);

      return {
        models: parsed.models.map((m) => ({
          id: m.name,
          name: m.name,
          contextWindow: 4096,
          inputCostPer1M: 0,
          outputCostPer1M: 0,
          capabilities: ['streaming'],
          deprecated: false,
        })),
        fetchedAt: Math.floor(Date.now() / 1000),
        providerID: this.id,
      };
    } catch {
      return this.emptyModelCatalog();
    }
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    const body = this.buildRequestBody(req);
    body['stream'] = false;

    const response = await fetch(`${this.baseURL}/api/chat`, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama completion failed: ${response.status} ${errorText}`);
    }

    const raw: unknown = await response.json();
    const parsed = OllamaChatResponseSchema.parse(raw);

    const inputTokens = parsed.prompt_eval_count ?? 0;
    const outputTokens = parsed.eval_count ?? 0;

    return {
      content: parsed.message.content,
      model: parsed.model,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
      finishReason: 'stop',
    };
  }

  async *stream(req: CompletionRequest): AsyncIterable<CompletionChunk> {
    const body = this.buildRequestBody(req);
    body['stream'] = true;

    const response = await fetch(`${this.baseURL}/api/chat`, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama stream failed: ${response.status} ${errorText}`);
    }

    if (!response.body) {
      throw new Error('Ollama stream returned no body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          try {
            const chunk = OllamaStreamChunkSchema.parse(JSON.parse(trimmed));
            const content = chunk.message?.content ?? '';

            if (chunk.done) {
              const inputTokens = chunk.prompt_eval_count ?? 0;
              const outputTokens = chunk.eval_count ?? 0;
              yield {
                content,
                done: true,
                usage: {
                  inputTokens,
                  outputTokens,
                  totalTokens: inputTokens + outputTokens,
                },
              };
            } else {
              yield { content, done: false };
            }
          } catch {
            // skip malformed chunks
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  estimateCost(req: CompletionRequest): TokenCost {
    const avgCharsPerToken = 4;
    const inputChars =
      req.messages.reduce((sum, m) => sum + m.content.length, 0) +
      (req.systemPrompt?.length ?? 0);
    const estimatedInputTokens = Math.ceil(inputChars / avgCharsPerToken);
    const estimatedOutputTokens = req.maxTokens ?? Math.ceil(estimatedInputTokens * 0.5);

    return {
      estimatedInputTokens,
      estimatedOutputTokens,
      estimatedCostUSD: 0,
    };
  }

  supportsFeature(feature: ProviderFeature): boolean {
    const supported: Set<ProviderFeature> = new Set([
      'streaming',
      'system_message',
    ]);
    return supported.has(feature);
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const apiKey = this.getApiKey();
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    return headers;
  }

  private buildRequestBody(req: CompletionRequest): Record<string, unknown> {
    const messages: Array<{ role: string; content: string }> = [];

    if (req.systemPrompt) {
      messages.push({ role: 'system', content: req.systemPrompt });
    }

    for (const msg of req.messages) {
      messages.push({ role: msg.role, content: msg.content });
    }

    const body: Record<string, unknown> = {
      model: req.model,
      messages,
    };

    if (req.temperature !== undefined) {
      body['options'] = { temperature: req.temperature };
    }

    return body;
  }

  private emptyModelCatalog(): ModelCatalogResponse {
    return {
      models: [],
      fetchedAt: Math.floor(Date.now() / 1000),
      providerID: this.id,
    };
  }
}

export { OllamaAdapter };
