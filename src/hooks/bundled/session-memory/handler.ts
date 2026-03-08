import type { HookHandler } from '../../types.js';
import fs from 'fs';
import path from 'path';

const handler: HookHandler = async (event) => {
  if (event.type !== 'command') return;
  if (event.action !== 'new' && event.action !== 'reset') return;
  const { groupId, sessionId } = event.context;
  if (!groupId) return;

  const date    = new Date().toISOString().slice(0, 10);
  const logDir  = path.join(process.cwd(), 'groups', groupId, 'memory');
  const logPath = path.join(logDir, `${date}.md`);

  fs.mkdirSync(logDir, { recursive: true });
  fs.appendFileSync(logPath,
    `\n## Session ended ${event.timestamp.toISOString()}\nSession: ${sessionId ?? 'unknown'}\n`,
    'utf-8');

  event.messages.push('💾 Session saved to memory.');
};

export default handler;
