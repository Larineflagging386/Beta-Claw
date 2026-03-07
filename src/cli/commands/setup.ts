import { Command } from 'commander';
import { z } from 'zod';

const ExecutionModeSchema = z.enum(['isolated', 'swarm', 'pipeline']);

interface SetupOptions {
  reset?: boolean;
  mode?: string;
}

function runSetup(options: SetupOptions): void {
  if (options.reset) {
    console.log('Resetting all configuration...');
    console.log('Configuration reset to defaults.');
    return;
  }

  if (options.mode) {
    const parsed = ExecutionModeSchema.safeParse(options.mode);
    if (!parsed.success) {
      console.error(`Invalid mode: "${options.mode}". Valid: isolated, swarm, pipeline`);
      return;
    }
    console.log(`Execution mode set to "${parsed.data}".`);
    return;
  }

  console.log('\nMicroClaw Setup Wizard\n');
  console.log('Steps:');
  console.log('  1. Configure AI provider');
  console.log('  2. Set execution mode');
  console.log('  3. Configure channels');
  console.log('  4. Install default skills');
  console.log('\n(Interactive setup — placeholder implementation)\n');
}

const setupCommand = new Command('setup')
  .description('Run onboarding wizard')
  .option('--reset', 'Reset all configuration')
  .option('--mode <mode>', 'Set execution mode (isolated|swarm|pipeline)')
  .action((options: SetupOptions) => {
    runSetup(options);
  });

export { setupCommand };
