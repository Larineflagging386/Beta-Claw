import path from 'node:path';

export const PATHS = {
  root:       process.cwd(),
  beta:       '.beta',
  db:         '.beta/betaclaw.db',
  vault:      '.beta/vault.enc',
  vaultSalt:  '.beta/vault.salt',
  config:     '.beta/config.toon',
  logs:       '.beta/logs',
  snapshots:  '.beta/snapshots',
  sandboxes:  '.beta/sandboxes',
  hooks:      '.beta/hooks',
  skills:     'skills',
  prompts:    'prompts',
  groups:     'groups',
  memory:     (g: string) => `groups/${g}/MEMORY.md`,
  dailyLog:   (g: string, d: string) => `groups/${g}/memory/${d}.md`,
  soul:       (g: string) => `groups/${g}/SOUL.md`,
  heartbeat:  (g: string) => `groups/${g}/HEARTBEAT.md`,
  boot:       (g: string) => `groups/${g}/BOOT.md`,
  workspaces: '.workspaces',
  workspace:  (g: string) => `.workspaces/${g}`,
} as const;

// Backward-compatible individual exports (used by files not yet migrated to PATHS)
export const WORKSPACE       = path.resolve('.workspace');
export const DB_PATH         = path.resolve(PATHS.db);
export const GROUPS_DIR      = path.resolve(PATHS.groups);
export const IMAGES_DIR      = path.join(WORKSPACE, 'images');
export const DOWNLOADS_DIR   = path.join(WORKSPACE, 'downloads');
export const WORK_DIR        = path.join(WORKSPACE, 'work');
export const EXPORTS_DIR     = path.join(WORKSPACE, 'exports');
export const BETA_DIR        = path.resolve(PATHS.beta);
export const CONFIG_PATH     = path.resolve(PATHS.config);
export const LOGS_DIR        = path.resolve(PATHS.logs);
export const VAULT_PATH      = path.resolve(PATHS.vault);
export const SNAPSHOTS_DIR   = path.resolve(PATHS.snapshots);
export const PROMPTS_DIR     = path.resolve(PATHS.prompts);
export const HEARTBEAT_PROMPT_PATH = path.join(PROMPTS_DIR, 'heartbeat', 'heartbeat-prompt.toon');
export const GLOBAL_MEMORY_PATH = path.resolve('betaclaw.md');

export const MEMORY_FILENAME            = 'MEMORY.md';
export const SOUL_FILENAME              = 'SOUL.md';
export const CLAUDE_FILENAME            = 'CLAUDE.md';
export const HEARTBEAT_FILENAME         = 'HEARTBEAT.md';
export const PERSONA_SUPPLEMENT_FILENAME = 'persona-supplement.md';
export const BEHAVIOR_FILENAME          = 'behavior.md';
