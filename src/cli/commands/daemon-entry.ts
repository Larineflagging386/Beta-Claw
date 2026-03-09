/**
 * Daemon entry point — launched as a forked child process.
 * Loads providers and channels from environment, then runs the orchestrator.
 */
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';

dotenv.config();

const PID_FILE = path.join('.beta', 'betaclaw.pid');

function warnLegacyPaths(): void {
  const legacyDb = 'betaclaw.db';
  const legacyGroups = 'groups';
  if (fs.existsSync(legacyDb)) {
    console.warn(
      `\n[betaclaw] MIGRATION NOTICE: Found legacy database at ./${legacyDb}\n` +
      `  Data is now stored in .workspace/db/betaclaw.db\n` +
      `  To migrate, run:\n` +
      `    mkdir -p .workspace/db && mv betaclaw.db .workspace/db/betaclaw.db\n`,
    );
  }
  if (fs.existsSync(legacyGroups) && fs.statSync(legacyGroups).isDirectory()) {
    console.warn(
      `[betaclaw] MIGRATION NOTICE: Found legacy groups/ directory at ./groups/\n` +
      `  Groups are now stored in .workspace/groups/\n` +
      `  To migrate, run:\n` +
      `    mkdir -p .workspace && mv groups .workspace/groups\n`,
    );
  }
}

async function main(): Promise<void> {
  warnLegacyPaths();
  const { betaclawDB } = await import('../../db.js');
  const { Orchestrator } = await import('../../core/orchestrator.js');
  const { ProviderRegistry } = await import('../../core/provider-registry.js');
  const { registerAvailableProviders } = await import('../../core/provider-init.js');
  const { WhatsAppChannel } = await import('../../channels/whatsapp.js');
  const { TelegramChannel } = await import('../../channels/telegram.js');
  const { DiscordChannel } = await import('../../channels/discord.js');

  const { DB_PATH } = await import('../../core/paths.js');
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new betaclawDB(DB_PATH);
  const orchestrator = new Orchestrator();

  const sharedRegistry = new ProviderRegistry();
  registerAvailableProviders(sharedRegistry);
  for (const id of sharedRegistry.listIds()) {
    const p = sharedRegistry.get(id);
    if (p) orchestrator.registerProvider(p);
  }

  if (process.env['WHATSAPP_ENABLED'] === 'true' || fs.existsSync('.beta/whatsapp-auth')) {
    orchestrator.registerChannel(new WhatsAppChannel());
  }

  if (process.env['TELEGRAM_BOT_TOKEN']) {
    try {
      orchestrator.registerChannel(new TelegramChannel());
    } catch { /* not available */ }
  }

  if (process.env['DISCORD_BOT_TOKEN']) {
    try {
      orchestrator.registerChannel(new DiscordChannel());
    } catch { /* not available */ }
  }

  await orchestrator.start();

  const shutdown = async (): Promise<void> => {
    await orchestrator.stop();
    db.close();
    try { fs.unlinkSync(PID_FILE); } catch { /* already gone */ }
    process.exit(0);
  };

  process.on('SIGINT', () => { void shutdown(); });
  process.on('SIGTERM', () => { void shutdown(); });
}

main().catch((err) => {
  console.error('Daemon fatal error:', err);
  process.exit(1);
});
