import type { HookHandler } from '../../types.js';
import fs from 'fs';
import { PATHS } from '../../../core/paths.js';

const handler: HookHandler = async (event) => {
  if (event.type !== 'command') return;
  const logPath = `${PATHS.logs}/commands.log`;
  fs.mkdirSync(PATHS.logs, { recursive: true });
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
