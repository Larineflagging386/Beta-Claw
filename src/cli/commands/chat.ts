import { Command } from 'commander';
import readline from 'node:readline';
import { MicroClawDB } from '../../db.js';
import { ProviderRegistry } from '../../core/provider-registry.js';
import { ModelCatalog } from '../../core/model-catalog.js';
import { estimateComplexity } from '../../core/complexity-estimator.js';
import { selectModel } from '../../core/model-selector.js';
import { OpenRouterAdapter } from '../../providers/openrouter.js';
import { AnthropicAdapter } from '../../providers/anthropic.js';
import { v4 as uuidv4 } from 'uuid';

interface ChatOptions {
  group?: string;
  model?: string;
  provider?: string;
}

async function startChat(options: ChatOptions): Promise<void> {
  const db = new MicroClawDB('microclaw.db');
  const registry = new ProviderRegistry();

  registerAvailableProviders(registry);

  if (registry.size() === 0) {
    console.log(
      '\nNo API keys configured. Set one of these environment variables:\n' +
      '  OPENROUTER_API_KEY  (recommended — access 200+ models)\n' +
      '  ANTHROPIC_API_KEY   (Claude models)\n' +
      '\nThen run: microclaw chat\n',
    );
    db.close();
    return;
  }

  if (options.provider && registry.has(options.provider)) {
    registry.setDefault(options.provider);
  }

  const catalog = new ModelCatalog(db, registry);
  await catalog.refreshAll();

  const groupId = options.group ?? 'cli-default';

  if (!db.getGroup(groupId)) {
    db.insertGroup({
      id: groupId,
      channel: 'cli',
      name: 'CLI Chat',
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

  console.log('\nMicroClaw v2.0 — Interactive Chat');
  console.log(`Provider: ${registry.getDefault()?.name ?? 'none'}`);
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

function registerAvailableProviders(registry: ProviderRegistry): void {
  const openrouterKey = process.env['OPENROUTER_API_KEY'];
  if (openrouterKey) {
    registry.register(new OpenRouterAdapter(() => {
      const key = process.env['OPENROUTER_API_KEY'];
      if (!key) throw new Error('OPENROUTER_API_KEY not set');
      return key;
    }));
  }

  const anthropicKey = process.env['ANTHROPIC_API_KEY'];
  if (anthropicKey) {
    registry.register(new AnthropicAdapter(() => {
      const key = process.env['ANTHROPIC_API_KEY'];
      if (!key) throw new Error('ANTHROPIC_API_KEY not set');
      return key;
    }));
  }
}

const chatCommand = new Command('chat')
  .description('Open interactive chat session')
  .option('--group <id>', 'Chat in specific group context')
  .option('--model <id>', 'Override model for session')
  .option('--provider <id>', 'Use specific provider')
  .action(async (options: ChatOptions) => {
    await startChat(options);
  });

export { chatCommand };
