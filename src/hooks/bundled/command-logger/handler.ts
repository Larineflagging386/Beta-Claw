import type { HookHandler } from '../../types.js';
import fs from 'fs';
import path from 'path';

const handler: HookHandler = async (event) => {
  if (event.type !== 'command') return;

  const logDir  = path.join(process.cwd(), '.beta', 'logs');
  const logPath = path.join(logDir, 'commands.log');

  fs.mkdirSync(logDir, { recursive: true });
  fs.appendFileSync(logPath,
    JSON.stringify({
      ts:      event.timestamp.toISOString(),
      action:  event.action,
      session: event.sessionKey,
      group:   event.context.groupId,
      sender:  event.context.senderId,
    }) + '\n',
    'utf-8');
};

export default handler;
