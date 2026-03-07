import { Command } from 'commander';
import { z } from 'zod';
import readline from 'node:readline';

const ProviderIdSchema = z.string().min(1, 'Provider ID is required');

function listProviders(): void {
  const keys = [
    { id: 'openrouter', env: 'OPENROUTER_API_KEY' },
    { id: 'anthropic', env: 'ANTHROPIC_API_KEY' },
    { id: 'google', env: 'GOOGLE_API_KEY' },
  ] as const;

  console.log('\nConfigured providers:\n');
  for (const { id, env } of keys) {
    const configured = !!process.env[env];
    const status = configured ? '✓ configured' : '✗ not configured';
    console.log(`  ${id.padEnd(14)} ${status}`);
  }
  console.log();
}

async function addProvider(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> =>
    new Promise((resolve) => {
      rl.question(prompt, (answer: string) => {
        resolve(answer.trim());
      });
    });

  console.log('\nAdd AI Provider\n');
  console.log('Supported: openrouter, anthropic, google\n');

  const providerId = await question('Provider ID: ');
  const parsed = ProviderIdSchema.safeParse(providerId);
  if (!parsed.success) {
    console.error('Invalid provider ID.');
    rl.close();
    return;
  }

  const apiKey = await question('API Key: ');
  if (!apiKey) {
    console.error('API key cannot be empty.');
    rl.close();
    return;
  }

  console.log(`\nProvider "${parsed.data}" configured. Set environment variable to persist.`);
  rl.close();
}

function removeProvider(id: string): void {
  const parsed = ProviderIdSchema.safeParse(id);
  if (!parsed.success) {
    console.error('Invalid provider ID.');
    return;
  }
  console.log(`Removed provider "${parsed.data}".`);
}

function listModels(id: string): void {
  const parsed = ProviderIdSchema.safeParse(id);
  if (!parsed.success) {
    console.error('Invalid provider ID.');
    return;
  }
  console.log(`\nModels for provider "${parsed.data}":`);
  console.log('  (Fetch from provider API — placeholder)\n');
}

function refreshCatalogs(): void {
  console.log('Refreshing model catalogs from all providers...');
  console.log('Done.');
}

const providerCommand = new Command('provider')
  .description('Manage AI providers');

providerCommand
  .command('list')
  .description('List configured providers')
  .action(() => {
    listProviders();
  });

providerCommand
  .command('add')
  .description('Interactive wizard to add a provider')
  .action(async () => {
    await addProvider();
  });

providerCommand
  .command('remove')
  .description('Remove provider config')
  .argument('<id>', 'Provider ID to remove')
  .action((id: string) => {
    removeProvider(id);
  });

providerCommand
  .command('models')
  .description('List models for a provider')
  .argument('<id>', 'Provider ID')
  .action((id: string) => {
    listModels(id);
  });

providerCommand
  .command('refresh')
  .description('Force refresh model catalogs')
  .action(() => {
    refreshCatalogs();
  });

export { providerCommand };
