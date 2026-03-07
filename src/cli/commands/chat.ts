import { Command } from 'commander';
import readline from 'node:readline';
import dotenv from 'dotenv';
import { MicroClawDB } from '../../db.js';
import { ProviderRegistry } from '../../core/provider-registry.js';
import { ModelCatalog } from '../../core/model-catalog.js';
import { estimateComplexity } from '../../core/complexity-estimator.js';
import { selectModel } from '../../core/model-selector.js';
import { OpenRouterAdapter } from '../../providers/openrouter.js';
import { AnthropicAdapter } from '../../providers/anthropic.js';
import { OpenAIAdapter } from '../../providers/openai.js';
import { GoogleAdapter } from '../../providers/google.js';
import { GroqAdapter } from '../../providers/groq.js';
import { MistralAdapter } from '../../providers/mistral.js';
import { CohereAdapter } from '../../providers/cohere.js';
import { TogetherAdapter } from '../../providers/together.js';
import { DeepSeekAdapter } from '../../providers/deepseek.js';
import { PerplexityAdapter } from '../../providers/perplexity.js';
import { OllamaAdapter } from '../../providers/ollama.js';
import { LMStudioAdapter } from '../../providers/lmstudio.js';
import { v4 as uuidv4 } from 'uuid';

interface ChatOptions {
  group?: string;
  model?: string;
  provider?: string;
  noPersona?: boolean;
}

const PROVIDER_ENV_MAP: Array<{
  envVar: string;
  name: string;
  create: (getKey: () => string) => InstanceType<typeof OpenRouterAdapter> | InstanceType<typeof AnthropicAdapter> | InstanceType<typeof OpenAIAdapter> | InstanceType<typeof GoogleAdapter> | InstanceType<typeof GroqAdapter> | InstanceType<typeof MistralAdapter> | InstanceType<typeof CohereAdapter> | InstanceType<typeof TogetherAdapter> | InstanceType<typeof DeepSeekAdapter> | InstanceType<typeof PerplexityAdapter>;
}> = [
  { envVar: 'OPENROUTER_API_KEY', name: 'OpenRouter', create: (g) => new OpenRouterAdapter(g) },
  { envVar: 'ANTHROPIC_API_KEY', name: 'Anthropic', create: (g) => new AnthropicAdapter(g) },
  { envVar: 'OPENAI_API_KEY', name: 'OpenAI', create: (g) => new OpenAIAdapter(g) },
  { envVar: 'GOOGLE_API_KEY', name: 'Google Gemini', create: (g) => new GoogleAdapter(g) },
  { envVar: 'GROQ_API_KEY', name: 'Groq', create: (g) => new GroqAdapter(g) },
  { envVar: 'MISTRAL_API_KEY', name: 'Mistral', create: (g) => new MistralAdapter(g) },
  { envVar: 'COHERE_API_KEY', name: 'Cohere', create: (g) => new CohereAdapter(g) },
  { envVar: 'TOGETHER_API_KEY', name: 'Together AI', create: (g) => new TogetherAdapter(g) },
  { envVar: 'DEEPSEEK_API_KEY', name: 'DeepSeek', create: (g) => new DeepSeekAdapter(g) },
  { envVar: 'PERPLEXITY_API_KEY', name: 'Perplexity', create: (g) => new PerplexityAdapter(g) },
];

function loadEnv(): void {
  dotenv.config();
}

function registerAvailableProviders(registry: ProviderRegistry): string[] {
  const registered: string[] = [];

  for (const entry of PROVIDER_ENV_MAP) {
    const key = process.env[entry.envVar];
    if (key) {
      const envVar = entry.envVar;
      registry.register(entry.create(() => {
        const k = process.env[envVar];
        if (!k) throw new Error(`${envVar} not set`);
        return k;
      }));
      registered.push(entry.name);
    }
  }

  try {
    const ollamaAdapter = new OllamaAdapter();
    registry.register(ollamaAdapter);
    registered.push('Ollama (local)');
  } catch {
    // Ollama not available
  }

  try {
    const lmStudioAdapter = new LMStudioAdapter();
    registry.register(lmStudioAdapter);
    registered.push('LM Studio (local)');
  } catch {
    // LM Studio not available
  }

  return registered;
}

async function startChat(options: ChatOptions): Promise<void> {
  loadEnv();

  const db = new MicroClawDB('microclaw.db');
  const registry = new ProviderRegistry();
  const registered = registerAvailableProviders(registry);

  if (registry.size() === 0) {
    console.log(
      '\n  No AI providers configured.\n\n' +
      '  Run "microclaw setup" to configure a provider, or set one of these:\n\n' +
      '    OPENROUTER_API_KEY   200+ models via one key (recommended)\n' +
      '    ANTHROPIC_API_KEY    Claude models\n' +
      '    OPENAI_API_KEY       GPT-4o, o3\n' +
      '    GOOGLE_API_KEY       Gemini models\n' +
      '    GROQ_API_KEY         Ultra-fast Llama/Mixtral\n' +
      '    DEEPSEEK_API_KEY     Cost-efficient coding models\n\n' +
      '  Or install Ollama for local models: https://ollama.ai\n',
    );
    db.close();
    return;
  }

  if (options.provider && registry.has(options.provider)) {
    registry.setDefault(options.provider);
  }

  const catalog = new ModelCatalog(db, registry);

  console.log('\nMicroClaw v2.0 — Interactive Chat');
  console.log(`Providers: ${registered.join(', ')}`);
  console.log('Loading models...');

  await catalog.refreshAll();

  const modelCount = catalog.getAllModels().length;
  console.log(`Models loaded: ${modelCount}`);

  const groupId = options.group ?? 'default';

  if (!db.getGroup(groupId)) {
    db.insertGroup({
      id: groupId,
      channel: 'cli',
      name: groupId === 'default' ? 'CLI Chat' : groupId,
      trigger_word: '@Andy',
      execution_mode: 'isolated',
    });
  }

  const sessionId = `sess_${uuidv4()}`;
  db.insertSession({
    id: sessionId,
    group_id: groupId,
    started_at: Math.floor(Date.now() / 1000),
  });

  const conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  const defaultProvider = registry.getDefault();
  console.log(`Default provider: ${defaultProvider?.name ?? 'auto-select'}`);
  console.log('Type /quit to exit, /status for system info\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'You > ',
  });

  rl.prompt();

  rl.on('line', async (line: string) => {
    const input = line.trim();
    if (!input) {
      rl.prompt();
      return;
    }

    if (input === '/quit' || input === '/exit') {
      console.log('\nGoodbye!');
      db.endSession(sessionId, 'Chat ended by user', '', conversationHistory.length);
      db.close();
      rl.close();
      return;
    }

    if (input === '/status') {
      const models = catalog.getAllModels();
      const providers = registry.listIds();
      console.log(`\n  Providers: ${providers.join(', ')}`);
      console.log(`  Models loaded: ${models.length}`);
      console.log(`  Group: ${groupId}`);
      console.log(`  Session: ${sessionId}`);
      console.log(`  Messages: ${conversationHistory.length}\n`);
      rl.prompt();
      return;
    }

    const complexity = estimateComplexity(input);
    const selection = selectModel(catalog, complexity);

    if (!selection) {
      console.log('\nNo models available. Check your API key configuration.\n');
      rl.prompt();
      return;
    }

    const provider = registry.get(selection.model.provider_id);
    if (!provider) {
      console.log(`\nProvider ${selection.model.provider_id} not available.\n`);
      rl.prompt();
      return;
    }

    const modelId = options.model ?? selection.model.model_id;

    db.insertMessage({
      id: `msg_${uuidv4()}`,
      group_id: groupId,
      sender_id: 'user',
      content: input,
      timestamp: Math.floor(Date.now() / 1000),
      channel: 'cli',
      processed: 0,
    });

    conversationHistory.push({ role: 'user', content: input });

    try {
      process.stdout.write(`\nMC [${modelId}] > `);

      let fullResponse = '';

      try {
        for await (const chunk of provider.stream({
          model: modelId,
          messages: conversationHistory,
          maxTokens: 2048,
        })) {
          process.stdout.write(chunk.content);
          fullResponse += chunk.content;
          if (chunk.done) break;
        }
      } catch {
        const response = await provider.complete({
          model: modelId,
          messages: conversationHistory,
          maxTokens: 2048,
        });
        fullResponse = response.content;
        process.stdout.write(fullResponse);
      }

      console.log('\n');

      conversationHistory.push({ role: 'assistant', content: fullResponse });

      db.insertMessage({
        id: `msg_${uuidv4()}`,
        group_id: groupId,
        sender_id: 'assistant',
        content: fullResponse,
        timestamp: Math.floor(Date.now() / 1000),
        channel: 'cli',
        processed: 1,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.log(`\nError: ${errorMsg}\n`);
    }

    rl.prompt();
  });

  rl.on('close', () => {
    db.endSession(sessionId, 'Session closed', '', conversationHistory.length);
    db.close();
  });
}

const chatCommand = new Command('chat')
  .description('Open interactive chat session')
  .option('--group <id>', 'Chat in specific group context')
  .option('--model <id>', 'Override model for session')
  .option('--provider <id>', 'Use specific provider')
  .option('--no-persona', 'Disable persona for debug session')
  .action(async (options: ChatOptions) => {
    await startChat(options);
  });

export { chatCommand };
