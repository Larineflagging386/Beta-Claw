import type { HookHandler } from '../../types.js';
import fs from 'fs';
import path from 'path';

const handler: HookHandler = async (event) => {
  if (event.type !== 'gateway' || event.action !== 'startup') return;

  const groupsDir = path.join(process.cwd(), 'groups');
  if (!fs.existsSync(groupsDir)) return;

  for (const entry of fs.readdirSync(groupsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const bootPath = path.join(groupsDir, entry.name, 'BOOT.md');
    if (!fs.existsSync(bootPath)) continue;
    const content = fs.readFileSync(bootPath, 'utf-8').trim();
    if (content) console.log(`[boot-md] BOOT.md queued for group: ${entry.name}`);
  }
};

export default handler;
