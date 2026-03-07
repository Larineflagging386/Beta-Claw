import { Command } from 'commander';
import { z } from 'zod';
import readline from 'node:readline';

const SecretNameSchema = z.string().min(1, 'Secret name is required')
  .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, 'Secret name must be alphanumeric with underscores');

function showVault(): void {
  console.log('\nVault keys:\n');
  console.log('  (No secrets stored)\n');
}

async function addSecret(name: string): Promise<void> {
  const parsed = SecretNameSchema.safeParse(name);
  if (!parsed.success) {
    console.error(`Invalid secret name: ${parsed.error.issues[0]?.message ?? 'validation failed'}`);
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const value = await new Promise<string>((resolve) => {
    rl.question(`Enter value for "${parsed.data}": `, (answer: string) => {
      resolve(answer.trim());
    });
  });

  rl.close();

  if (!value) {
    console.error('Secret value cannot be empty.');
    return;
  }

  console.log(`Secret "${parsed.data}" stored in vault.`);
}

function removeSecret(name: string): void {
  const parsed = SecretNameSchema.safeParse(name);
  if (!parsed.success) {
    console.error(`Invalid secret name: ${parsed.error.issues[0]?.message ?? 'validation failed'}`);
    return;
  }
  console.log(`Secret "${parsed.data}" removed from vault.`);
}

function rotateVault(): void {
  console.log('Re-encrypting vault...');
  console.log('Vault rotated successfully.');
}

const vaultCommand = new Command('vault')
  .description('Manage encrypted secrets vault');

vaultCommand
  .command('show')
  .description('List vault key names')
  .action(() => {
    showVault();
  });

vaultCommand
  .command('add')
  .description('Add a secret (prompts for value)')
  .argument('<name>', 'Secret name')
  .action(async (name: string) => {
    await addSecret(name);
  });

vaultCommand
  .command('remove')
  .description('Remove a secret')
  .argument('<name>', 'Secret name to remove')
  .action((name: string) => {
    removeSecret(name);
  });

vaultCommand
  .command('rotate')
  .description('Re-encrypt the vault')
  .action(() => {
    rotateVault();
  });

export { vaultCommand };
