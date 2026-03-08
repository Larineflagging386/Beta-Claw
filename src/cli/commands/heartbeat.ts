import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { MicroClawDB } from '../../db.js';
import { DB_PATH, GROUPS_DIR, HEARTBEAT_FILENAME } from '../../core/paths.js';

function getDB(): MicroClawDB | null {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    console.log('Database not found. Run `microclaw start` first.');
    return null;
  }
  return new MicroClawDB(DB_PATH);
}

const heartbeatCommand = new Command('heartbeat')
  .description('Manage heartbeat system (now, status, pause, resume)');

heartbeatCommand
  .command('now')
  .description('Trigger an immediate heartbeat tick')
  .option('--agent <id>', 'Target a specific group/agent')
  .action(async (options: { agent?: string }) => {
    const db = getDB();
    if (!db) return;

    try {
      if (options.agent) {
        const cfg = db.getHeartbeatConfig(options.agent);
        if (!cfg) {
          console.log(`No heartbeat config for group "${options.agent}".`);
          return;
        }
        console.log(`Triggering heartbeat for ${options.agent}...`);
        const hbPath = path.join(GROUPS_DIR, options.agent, HEARTBEAT_FILENAME);
        if (!fs.existsSync(hbPath)) {
          console.log('  HEARTBEAT.md not found — tick skipped (zero cost).');
          return;
        }
        console.log('  Heartbeat triggered. Check logs for result.');
      } else {
        const configs = db.getAllHeartbeatConfigs();
        if (configs.length === 0) {
          console.log('No heartbeat configurations found.');
          return;
        }
        console.log(`Triggering heartbeat for ${configs.length} group(s)...`);
        for (const cfg of configs) {
          console.log(`  → ${cfg.group_id}`);
        }
        console.log('Heartbeats triggered. Check logs for results.');
      }
    } finally {
      db.close();
    }
  });

heartbeatCommand
  .command('status')
  .description('Show heartbeat status for all groups')
  .action(() => {
    const db = getDB();
    if (!db) return;

    try {
      const configs = db.getAllHeartbeatConfigs();
      if (configs.length === 0) {
        console.log('No heartbeat configurations found.');
        return;
      }

      console.log('\nHeartbeat Status\n');
      for (const cfg of configs) {
        const enabled = cfg.enabled === 1;
        const lastTick = cfg.last_tick
          ? new Date(cfg.last_tick * 1000).toISOString()
          : 'never';
        const interval = `${Math.round(cfg.every_ms / 60_000)}m`;
        const target = cfg.target ?? 'none';
        const model = cfg.model ?? 'nano (default)';

        console.log(`  ${cfg.group_id}:`);
        console.log(`    Enabled:   ${enabled ? 'yes' : 'no (paused)'}`);
        console.log(`    Interval:  ${interval}`);
        console.log(`    Model:     ${model}`);
        console.log(`    Target:    ${target}`);
        console.log(`    Last tick: ${lastTick}`);
        console.log(`    Light ctx: ${cfg.light_context === 1 ? 'yes' : 'no'}`);
        console.log();
      }

      const logs = db.getHeartbeatLogs(configs[0]!.group_id, 5);
      if (logs.length > 0) {
        console.log('  Recent ticks:');
        for (const log of logs) {
          const ts = new Date(log.tick_at * 1000).toISOString();
          const status = log.skipped ? `skipped (${log.skip_reason ?? 'unknown'})` : (log.response_type ?? 'unknown');
          const tokens = log.tokens_used ? ` | ${log.tokens_used} tok` : '';
          console.log(`    ${ts} — ${status}${tokens}`);
        }
        console.log();
      }
    } finally {
      db.close();
    }
  });

heartbeatCommand
  .command('pause')
  .description('Pause heartbeat for a group')
  .option('--agent <id>', 'Target group ID')
  .action((options: { agent?: string }) => {
    const db = getDB();
    if (!db) return;

    try {
      const groupId = options.agent;
      if (!groupId) {
        const configs = db.getAllHeartbeatConfigs();
        for (const cfg of configs) {
          db.setHeartbeatEnabled(cfg.group_id, false);
        }
        console.log(`Paused heartbeat for ${configs.length} group(s).`);
        return;
      }

      db.setHeartbeatEnabled(groupId, false);
      console.log(`Heartbeat paused for ${groupId}.`);
    } finally {
      db.close();
    }
  });

heartbeatCommand
  .command('resume')
  .description('Resume heartbeat for a group')
  .option('--agent <id>', 'Target group ID')
  .action((options: { agent?: string }) => {
    const db = getDB();
    if (!db) return;

    try {
      const groupId = options.agent;
      if (!groupId) {
        const configs = db.getAllHeartbeatConfigs();
        for (const cfg of configs) {
          db.setHeartbeatEnabled(cfg.group_id, true);
        }
        console.log(`Resumed heartbeat for ${configs.length} group(s).`);
        return;
      }

      db.setHeartbeatEnabled(groupId, true);
      console.log(`Heartbeat resumed for ${groupId}.`);
    } finally {
      db.close();
    }
  });

export { heartbeatCommand };
