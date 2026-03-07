import { Command } from 'commander';
import { z } from 'zod';

const GroupIdSchema = z.string().min(1).optional();
const SearchQuerySchema = z.string().min(1, 'Search query is required');

function showMemory(groupId?: string): void {
  const parsed = GroupIdSchema.safeParse(groupId);
  if (!parsed.success) {
    console.error('Invalid group ID.');
    return;
  }
  const scope = parsed.data ? `group "${parsed.data}"` : 'all groups';
  console.log(`\nEpisodic memory for ${scope}:`);
  console.log('  (No memories stored yet)\n');
}

function searchMemory(query: string): void {
  const parsed = SearchQuerySchema.safeParse(query);
  if (!parsed.success) {
    console.error('Search query is required.');
    return;
  }
  console.log(`\nSearching semantic memory for: "${parsed.data}"`);
  console.log('  (No results found)\n');
}

function clearMemory(groupId?: string): void {
  const parsed = GroupIdSchema.safeParse(groupId);
  if (!parsed.success) {
    console.error('Invalid group ID.');
    return;
  }
  const scope = parsed.data ? `group "${parsed.data}"` : 'all groups';
  console.log(`Cleared episodic memory for ${scope}.`);
}

function exportMemory(groupId?: string): void {
  const parsed = GroupIdSchema.safeParse(groupId);
  if (!parsed.success) {
    console.error('Invalid group ID.');
    return;
  }
  const scope = parsed.data ? `group "${parsed.data}"` : 'all groups';
  console.log(`Exporting memory for ${scope} to JSON...`);
  console.log('  (Export placeholder — no data)');
}

const memoryCommand = new Command('memory')
  .description('Manage episodic and semantic memory');

memoryCommand
  .command('show')
  .description('Show episodic memory')
  .argument('[groupId]', 'Optional group ID to filter')
  .action((groupId?: string) => {
    showMemory(groupId);
  });

memoryCommand
  .command('search')
  .description('Search semantic memory')
  .argument('<query>', 'Search query')
  .action((query: string) => {
    searchMemory(query);
  });

memoryCommand
  .command('clear')
  .description('Clear memory')
  .argument('[groupId]', 'Optional group ID to clear')
  .action((groupId?: string) => {
    clearMemory(groupId);
  });

memoryCommand
  .command('export')
  .description('Export memory to JSON')
  .argument('[groupId]', 'Optional group ID to export')
  .action((groupId?: string) => {
    exportMemory(groupId);
  });

export { memoryCommand };
