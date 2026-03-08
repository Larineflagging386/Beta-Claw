import type { HookHandler } from '../../types.js';
import fs from 'fs';
import { PATHS } from '../../../core/paths.js';

const handler: HookHandler = async (event) => {
  if (event.type !== 'gateway' || event.action !== 'startup') return;
  try {
    const groups = fs.readdirSync(PATHS.groups, { withFileTypes: true })
      .filter(e => e.isDirectory()).map(e => e.name);
    for (const g of groups) {
      const bootPath = PATHS.boot(g);
      if (!fs.existsSync(bootPath)) continue;
      const content = fs.readFileSync(bootPath, 'utf-8').trim();
      if (content) console.log(`[boot-md] BOOT.md queued for group: ${g}`);
    }
  } catch { /* no groups dir yet */ }
};

export default handler;
