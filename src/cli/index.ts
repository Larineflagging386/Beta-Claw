import { Command } from 'commander';
import { chatCommand } from './commands/chat.js';
import { daemonCommand } from './commands/daemon.js';

const program = new Command();

program
  .name('microclaw')
  .description('Open, provider-agnostic AI agent runtime')
  .version('2.0.0');

program.addCommand(chatCommand);
program.addCommand(daemonCommand);

program.parse();
