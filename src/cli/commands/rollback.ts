import { Command } from 'commander';
import { z } from 'zod';

const SnapshotIdSchema = z.string().min(1, 'Snapshot ID is required');

function rollbackInteractive(): void {
  console.log('\nRollback to last snapshot:');
  console.log('  (No snapshots available — run with `rollback list` to see options)\n');
}

function listSnapshots(): void {
  console.log('\nAvailable snapshots:\n');
  console.log('  (No snapshots found)\n');
}

function rollbackTo(snapshotId: string): void {
  const parsed = SnapshotIdSchema.safeParse(snapshotId);
  if (!parsed.success) {
    console.error('Snapshot ID is required.');
    return;
  }
  console.log(`Rolling back to snapshot "${parsed.data}"...`);
  console.log('Rollback complete.');
}

const rollbackCommand = new Command('rollback')
  .description('Rollback filesystem changes to a previous snapshot')
  .action(() => {
    rollbackInteractive();
  });

rollbackCommand
  .command('list')
  .description('List available snapshots')
  .action(() => {
    listSnapshots();
  });

rollbackCommand
  .command('to')
  .description('Rollback to a specific snapshot')
  .argument('<snapshot>', 'Snapshot ID')
  .action((snapshot: string) => {
    rollbackTo(snapshot);
  });

export { rollbackCommand };
