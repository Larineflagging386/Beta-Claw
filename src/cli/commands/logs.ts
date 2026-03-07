import { Command } from 'commander';
import { z } from 'zod';

const LogLevelSchema = z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']);
const GroupIdSchema = z.string().min(1).optional();

interface LogOptions {
  follow?: boolean;
  level?: string;
  group?: string;
}

function showLogs(options: LogOptions): void {
  if (options.level) {
    const parsed = LogLevelSchema.safeParse(options.level);
    if (!parsed.success) {
      console.error(`Invalid log level: "${options.level}". Valid: trace, debug, info, warn, error, fatal`);
      return;
    }
  }

  if (options.group) {
    const parsed = GroupIdSchema.safeParse(options.group);
    if (!parsed.success) {
      console.error('Invalid group ID.');
      return;
    }
  }

  const filters: string[] = [];
  if (options.level) filters.push(`level=${options.level}`);
  if (options.group) filters.push(`group=${options.group}`);
  const filterStr = filters.length > 0 ? ` (${filters.join(', ')})` : '';

  if (options.follow) {
    console.log(`Tailing logs${filterStr}... (Ctrl+C to stop)\n`);
  } else {
    console.log(`\nRecent logs${filterStr}:\n`);
    console.log('  (No log entries found)\n');
  }
}

const logsCommand = new Command('logs')
  .description('View application logs')
  .option('--follow', 'Tail logs in real-time')
  .option('--level <level>', 'Filter by log level (trace|debug|info|warn|error|fatal)')
  .option('--group <id>', 'Filter by group ID')
  .action((options: LogOptions) => {
    showLogs(options);
  });

export { logsCommand };
