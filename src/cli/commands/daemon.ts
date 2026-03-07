import { Command } from 'commander';

const daemonCommand = new Command('start')
  .description('Start MicroClaw daemon')
  .option('--foreground', 'Run in foreground')
  .action((_options) => {
    console.log('MicroClaw daemon start (placeholder — full implementation in Phase 8)');
  });

export { daemonCommand };
