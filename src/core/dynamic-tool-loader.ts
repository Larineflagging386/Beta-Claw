import { z } from 'zod';

const INTENT_CATEGORIES = [
  'web_search', 'code_exec', 'file_ops',
  'memory_read', 'memory_write', 'automation',
  'browser', 'system_cmd', 'session_mgmt',
  'skills', 'general',
] as const;

type IntentCategory = (typeof INTENT_CATEGORIES)[number];

const IntentCategorySchema = z.enum(INTENT_CATEGORIES);
const ClassifyInputSchema = z.string().min(1);

interface IntentResult {
  category: IntentCategory;
  confidence: number;
  tools: string[];
}

const AMBIGUITY_THRESHOLD = 0.6;

const TOOL_MAP: Record<IntentCategory, readonly string[]> = {
  web_search:   ['web_search', 'web_fetch', 'download'],
  code_exec:    ['exec', 'python', 'node', 'write', 'read'],
  file_ops:     ['read', 'write', 'append', 'delete', 'list', 'search'],
  memory_read:  ['memory_read', 'memory_search'],
  memory_write: ['memory_write', 'append'],
  automation:   ['cron', 'scheduler', 'heartbeat'],
  browser:      ['browser', 'web_fetch'],
  system_cmd:   ['process', 'exec', 'config', 'env', 'logs'],
  session_mgmt: ['session', 'context', 'history'],
  skills:       ['get_skill'],
  general:      ['web_search', 'memory_search', 'exec'],
};

interface KeywordRule {
  readonly pattern: RegExp;
  readonly weight: number;
}

const SCORED_CATEGORIES = INTENT_CATEGORIES.filter(
  (c): c is Exclude<IntentCategory, 'general'> => c !== 'general',
);

const INTENT_RULES: Record<Exclude<IntentCategory, 'general'>, readonly KeywordRule[]> = {
  web_search: [
    { pattern: /\bsearch\b/, weight: 0.35 },
    { pattern: /\bgoogle\b/, weight: 0.6 },
    { pattern: /\blook\s*up\b/, weight: 0.4 },
    { pattern: /\bbrowse\b/, weight: 0.4 },
    { pattern: /\bweb\b/, weight: 0.25 },
    { pattern: /\binternet\b/, weight: 0.3 },
    { pattern: /\bnews\b/, weight: 0.25 },
    { pattern: /\bwebsite\b/, weight: 0.3 },
    { pattern: /\bonline\b/, weight: 0.2 },
  ],
  code_exec: [
    { pattern: /\b(?:python|javascript|typescript|rust|java|ruby|golang|php|perl|swift|kotlin)\b/, weight: 0.35 },
    { pattern: /\bscript\b/, weight: 0.35 },
    { pattern: /\bcode\b/, weight: 0.3 },
    { pattern: /\bprogram\b/, weight: 0.3 },
    { pattern: /\bexecute\b/, weight: 0.35 },
    { pattern: /\bcompile\b/, weight: 0.4 },
    { pattern: /\bdebug\b/, weight: 0.3 },
    { pattern: /\brun\b/, weight: 0.2 },
    { pattern: /\bfunction\b/, weight: 0.2 },
  ],
  file_ops: [
    { pattern: /\bfile\b/, weight: 0.35 },
    { pattern: /\bread\b/, weight: 0.25 },
    { pattern: /\bsave\b/, weight: 0.3 },
    { pattern: /\bdelete\b/, weight: 0.3 },
    { pattern: /\bdirectory\b/, weight: 0.4 },
    { pattern: /\bfolder\b/, weight: 0.4 },
    { pattern: /\brename\b/, weight: 0.35 },
    { pattern: /\bcopy\b/, weight: 0.3 },
    { pattern: /\blist\s+(?:files|dir(?:ector(?:y|ies))?)\b/, weight: 0.5 },
    { pattern: /\b\w+\.[a-z]{2,5}\b/, weight: 0.35 },
  ],
  memory_read: [
    { pattern: /\brecall\b/, weight: 0.5 },
    { pattern: /\bmemory\b/, weight: 0.35 },
    { pattern: /\bwhat\s+did\s+(?:i|we|you)\b/, weight: 0.4 },
    { pattern: /\bprevious(?:ly)?\b/, weight: 0.25 },
    { pattern: /\bhistory\b/, weight: 0.3 },
    { pattern: /\blast\s+(?:time|conversation|session)\b/, weight: 0.4 },
    { pattern: /\bremember\b/, weight: 0.2 },
  ],
  memory_write: [
    { pattern: /\bremember\s+this\b/, weight: 0.6 },
    { pattern: /\bsave\s+this\b/, weight: 0.5 },
    { pattern: /\bstore\b/, weight: 0.35 },
    { pattern: /\bmemorize\b/, weight: 0.6 },
    { pattern: /\bnote\s+(?:this|that|down)\b/, weight: 0.5 },
    { pattern: /\bkeep\s+track\b/, weight: 0.5 },
    { pattern: /\bdon'?t\s+forget\b/, weight: 0.5 },
  ],
  automation: [
    { pattern: /\bcron\b/, weight: 0.6 },
    { pattern: /\bschedule\b/, weight: 0.4 },
    { pattern: /\brecurring\b/, weight: 0.5 },
    { pattern: /\beveryd?\s?(?:day|hour|minute|week)\b/, weight: 0.5 },
    { pattern: /\bheartbeat\b/, weight: 0.6 },
    { pattern: /\bremind(?:er)?\b/, weight: 0.3 },
    { pattern: /\btimer\b/, weight: 0.35 },
    { pattern: /\balarm\b/, weight: 0.35 },
  ],
  browser: [
    { pattern: /\bbrowser\b/, weight: 0.6 },
    { pattern: /\bscreenshot\b/, weight: 0.5 },
    { pattern: /\bclick\b/, weight: 0.3 },
    { pattern: /\bnavigate\b/, weight: 0.4 },
    { pattern: /\bopen\s+(?:the\s+)?(?:page|url|site|website)\b/, weight: 0.5 },
    { pattern: /\bscrape\b/, weight: 0.5 },
    { pattern: /\bextract\s+(?:from\s+)?(?:page|website)\b/, weight: 0.4 },
  ],
  system_cmd: [
    { pattern: /\binstall\b/, weight: 0.35 },
    { pattern: /\bpackage\b/, weight: 0.25 },
    { pattern: /\bsystem\b/, weight: 0.25 },
    { pattern: /\bcommand\b/, weight: 0.3 },
    { pattern: /\bterminal\b/, weight: 0.4 },
    { pattern: /\bshell\b/, weight: 0.4 },
    { pattern: /\bsudo\b/, weight: 0.6 },
    { pattern: /\bapt(?:-get)?\b/, weight: 0.5 },
    { pattern: /\bnpm\b/, weight: 0.35 },
    { pattern: /\bpip\b/, weight: 0.35 },
    { pattern: /\bprocess(?:es)?\b/, weight: 0.3 },
    { pattern: /\blog(?:s)?\b/, weight: 0.25 },
  ],
  session_mgmt: [
    { pattern: /\bsession\b/, weight: 0.5 },
    { pattern: /\bcontext\b/, weight: 0.35 },
    { pattern: /\bhistory\b/, weight: 0.3 },
    { pattern: /\bclear\s+(?:conversation|chat|context)\b/, weight: 0.6 },
    { pattern: /\breset\b/, weight: 0.3 },
    { pattern: /\bwho\s+am\s+i\b/, weight: 0.4 },
  ],
  skills: [
    { pattern: /^\//, weight: 0.8 },
    { pattern: /\bskill\b/, weight: 0.5 },
    { pattern: /\badd-\w+\b/, weight: 0.6 },
    { pattern: /\bsetup\b/, weight: 0.4 },
    { pattern: /\bcustomize\b/, weight: 0.5 },
    { pattern: /\bstatus\b/, weight: 0.3 },
  ],
};

function scoreIntent(input: string, rules: readonly KeywordRule[]): number {
  let score = 0;
  for (const { pattern, weight } of rules) {
    if (pattern.test(input)) {
      score += weight;
    }
  }
  return Math.min(score, 1.0);
}

function classifyIntent(input: string): IntentResult {
  const validated = ClassifyInputSchema.parse(input);
  const lower = validated.toLowerCase();

  let bestCategory: IntentCategory = 'general';
  let bestScore = 0;

  for (const category of SCORED_CATEGORIES) {
    const rules = INTENT_RULES[category];
    const score = scoreIntent(lower, rules);
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  if (bestScore < AMBIGUITY_THRESHOLD) {
    return {
      category: 'general',
      confidence: Math.round(bestScore * 100) / 100,
      tools: [...TOOL_MAP.general],
    };
  }

  return {
    category: bestCategory,
    confidence: Math.round(bestScore * 100) / 100,
    tools: [...TOOL_MAP[bestCategory]],
  };
}

function getToolsForIntent(category: IntentCategory): string[] {
  const validated = IntentCategorySchema.parse(category);
  return [...TOOL_MAP[validated]];
}

export {
  classifyIntent,
  getToolsForIntent,
  TOOL_MAP,
  AMBIGUITY_THRESHOLD,
  INTENT_CATEGORIES,
};
export type { IntentCategory, IntentResult };
