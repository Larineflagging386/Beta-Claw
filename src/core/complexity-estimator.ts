// src/core/complexity-estimator.ts
//
// Weighted signal accumulator — handles any mixture of nano/standard/pro/max signals.
//
// Architecture:
//   Each signal group fires independently and contributes to its tier bucket.
//   Per-group caps prevent any single signal from dominating.
//   A global pro cap prevents three co-occurring pro groups from stacking to max.
//   Standard signals are dampened 70% when pro fires (pro work subsumes "doing something").
//   Nano penalties are zeroed when pro fires (diagnostic intent overrides "hey"/"thanks").
//   A standard floor ensures any message with a real technical signal reaches the standard tier.
//
// Tier thresholds (score 0-100):
//   nano     0 – 19
//   standard 20 – 41
//   pro      42 – 72
//   max      73+

// ─── Types ────────────────────────────────────────────────────────────────────

export type Tier = 'nano' | 'standard' | 'pro' | 'max';

export interface ComplexityResult {
  score:   number;       // 0–100, clamped
  tier:    Tier;
  signals: SignalHit[];  // every group that contributed, for debug/observability
}

export interface SignalHit {
  group:        string;
  matches:      string[];
  contribution: number;
}

// ─── Internal ─────────────────────────────────────────────────────────────────

interface SignalGroup {
  id:       string;
  patterns: RegExp[];
  perMatch: number;   // weight for first match; subsequent matches get 60%
  cap:      number;   // positive = ceiling, negative = floor
  tier:     'nano' | 'standard' | 'pro' | 'max' | 'structural';
}

// ─── Tier Thresholds ─────────────────────────────────────────────────────────

const TIER_THRESHOLDS: [Tier, number][] = [
  ['max',      73],
  ['pro',      42],
  ['standard', 20],
  ['nano',      0],
];

// ─── Global Pro Cap ───────────────────────────────────────────────────────────
// All pro groups combined cannot exceed this. Prevents two heavy pro groups
// (e.g. pro-security + pro-architecture) from crossing the max threshold together.

const GLOBAL_PRO_CAP = 60;

// ─── Signal Groups ────────────────────────────────────────────────────────────

const SIGNAL_GROUPS: SignalGroup[] = [

  // ── NANO: trivial / greeting signals ──────────────────────────────────────
  {
    id: 'nano-trivial',
    patterns: [
      /\b(hi|hey|hello|howdy|yo)\b/i,
      /\b(thanks|thank you|thx|ty)\b/i,
      /\b(ok|okay|sure|yep|nope|yup|nah|lol|lmao|haha)\b/i,
      /\b(good morning|good night|good evening)\b/i,
    ],
    perMatch: -3, cap: -10, tier: 'nano',
  },
  {
    id: 'nano-simple-q',
    // Single-fact lookups. Only penalise; pro-intent overrides via nano neutralisation.
    patterns: [
      /\b(what is|what's|who is|who's|where is|when (is|did|was|were))\b/i,
      /\b(tell me a joke|how are you)\b/i,
    ],
    perMatch: -4, cap: -8, tier: 'nano',
  },

  // ── STANDARD: action verbs and tech nouns ─────────────────────────────────
  {
    id: 'standard-action',
    patterns: [
      /\b(build|create|make|generate|design|scaffold)\b/i,
      /\b(write|draft|compose)\b/i,
      /\b(search|find|look\s*up|fetch|retrieve)\b/i,
      /\b(summarize|explain|describe)\b/i,
      /\b(list|enumerate|show me)\b/i,
      /\b(install|configure|setup|bootstrap)\b/i,
      /\b(convert|transform|parse|format)\b/i,
      /\b(read|load|extract)\b/i,
      /\b(update|edit|modify|change|delete|remove)\b/i,
      /\b(add|append|insert|commit)\b/i,
    ],
    perMatch: 12, cap: 30, tier: 'standard',
  },
  {
    id: 'standard-tech',
    patterns: [
      /\b(script|function|class|component|module|endpoint|route|schema)\b/i,
      /\b(website|app|application|ui|dashboard)\b/i,
      /\b(api|rest|graphql|webhook|socket|http)\b/i,
      /\b(csv|json|xml|yaml|sql|database|db)\b/i,
      /\b(docker|container|image)\b/i,
      /\b(git|commit|branch|merge)\b/i,
      /\b(css|html|div|span|flex|grid|layout|style)\b/i,
      /\b(array|object|string|number|boolean|type|interface)\b/i,
    ],
    perMatch: 10, cap: 25, tier: 'standard',
  },

  // ── PRO-INTENT: unambiguous diagnostic questions ──────────────────────────
  // Carries higher weight because the verb+object pair removes ambiguity.
  // "find" alone = standard; "find the error" = pro.
  {
    id: 'pro-intent',
    patterns: [
      /\b(find|locate|spot|identify|pinpoint)\s+(?:the\s+|an?\s+|this\s+)?(error|bug|issue|problem|crash|failure|cause)\b/i,
      /\bwhy\s+(is\s+it|does\s+it|won'?t\s+it|doesn'?t\s+it|is\s+this|are\s+they|is\s+[a-z])\b/i,
      /\bwhat\s*('s|is)\s+(wrong|broken|failing|crashing)\b/i,
      /\b(where|how)\s+(?:is\s+it|does\s+it|did\s+it).{0,20}(fail|crash|break|error)\b/i,
    ],
    perMatch: 45, cap: 45, tier: 'pro',
  },

  // ── PRO-DEBUG: debugging, errors, and HTTP/system error codes ─────────────
  // Merged with error codes to avoid double-stacking from the same root issue.
  {
    id: 'pro-debug',
    patterns: [
      /\b(debug|fix|repair|resolve|troubleshoot|diagnose)\b/i,
      /\b(error|bug|issue|problem|failure|crash|broken|failing)\b/i,
      /\b(exception|stack\s*trace|traceback)\b/i,
      /\b(not working|doesn't work|fails to)\b/i,
      /\b[45]\d\d\b/,
      /\b(ECONNREFUSED|ENOENT|ETIMEDOUT|EACCES|EPERM|EADDRINUSE)\b/,
      /exit\s*code\s*[1-9]/i,
    ],
    perMatch: 18, cap: 38, tier: 'pro',
  },

  // ── PRO-SECURITY: auth, crypto, access control ────────────────────────────
  {
    id: 'pro-security',
    patterns: [
      /\b(auth(entication|orization)?|oauth|jwt|token|session|cookie)\b/i,
      /\b(security|permission|access\s*control|acl|rbac|cors|csrf|xss)\b/i,
      /\b(encrypt|decrypt|hash|salt|cipher|tls|ssl|cert(ificate)?)\b/i,
      /\b(login|sign[\s-]?(in|up)|password|credential|secret|api[\s-]?key)\b/i,
    ],
    perMatch: 18, cap: 38, tier: 'pro',
  },

  // ── PRO-ARCHITECTURE: system design, performance, deployment ──────────────
  {
    id: 'pro-architecture',
    patterns: [
      /\b(architect(ure)?|design\s*pattern|microservice|event[\s-]driven)\b/i,
      /\b(refactor|restructure|decouple|abstract)\b/i,
      /\b(optimi[sz]e|performance|latency|throughput|memory\s*leak|bottleneck)\b/i,
      /\b(review|audit|assess|evaluate|analy[sz]e)\b/i,
      /\b(migrate|upgrade|rollout)\b/i,
      /\b(deploy|pipeline|ci[\s/]?cd)\b/i,
      /\bproduction\b/i,
    ],
    perMatch: 16, cap: 35, tier: 'pro',
  },

  // ── MAX: whole-system / multi-agent scope ─────────────────────────────────
  {
    id: 'max-scope',
    patterns: [
      /\b(entire\s+(codebase|project|repo(sitory)?|system|application))\b/i,
      /\ball\s+(files|endpoints|services|modules|components|tests)\b/i,
      /\b(multi[\s-]?agent|agent\s+swarm|orchestrat(e|or|ion))\b/i,
      /\b(large[\s-]?scale|enterprise[\s-]?grade|production[\s-]?ready)\b/i,
      /\b(refactor\s+everything|rewrite\s+everything)\b/i,
    ],
    perMatch: 65, cap: 75, tier: 'max',
  },

  // ── STRUCTURAL: code presence ─────────────────────────────────────────────
  {
    id: 'structural-code',
    patterns: [
      /\b\w+\.(py|ts|js|tsx|jsx|sh|bash|rs|go|rb|java|kt|sql|md)\b/i,
      /```/,
      /`[^`]{3,}`/,
      /\w+\.\w+\(/,
    ],
    perMatch: 10, cap: 20, tier: 'structural',
  },

  // ── STRUCTURAL: compound / multi-step task ────────────────────────────────
  {
    id: 'structural-compound',
    patterns: [
      /\b(and\s+then|additionally|and\s+also)\b/i,
      /\b(first[,.]?\s.{3,}second|step\s+[1-9])\b/i,
      /;\s*\w/,
    ],
    perMatch: 8, cap: 16, tier: 'structural',
  },
];

// ─── Word Count Signal ────────────────────────────────────────────────────────

function wordCountContrib(wordCount: number): number {
  if (wordCount <= 3)  return -5;
  if (wordCount <= 6)  return  0;
  if (wordCount <= 15) return  5;
  if (wordCount <= 30) return 10;
  if (wordCount <= 60) return 15;
  return 20;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// ─── Core Estimator ───────────────────────────────────────────────────────────

export function estimateComplexity(message: string): ComplexityResult {
  const text      = message.toLowerCase();
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  const hits:     SignalHit[] = [];

  let nanoC       = 0;
  let standardC   = 0;
  let proC        = 0;
  let maxC        = 0;
  let structuralC = 0;

  // ── Fire all signal groups ────────────────────────────────────────────────
  for (const group of SIGNAL_GROUPS) {
    const matched: string[] = [];
    for (const pattern of group.patterns) {
      const found = text.match(new RegExp(pattern.source, 'gi'));
      if (found) matched.push(...found);
    }
    if (matched.length === 0) continue;

    // Diminishing returns: first match at 100%, every subsequent at 60%.
    // Stops one keyword repeating 10x from faking a higher tier.
    let groupRaw = 0;
    for (let i = 0; i < matched.length; i++) {
      groupRaw += group.perMatch * (i === 0 ? 1.0 : 0.6);
    }

    const contribution = group.cap < 0
      ? clamp(groupRaw, group.cap, 0)
      : clamp(groupRaw, 0, group.cap);

    switch (group.tier) {
      case 'nano':       nanoC       += contribution; break;
      case 'standard':   standardC   += contribution; break;
      case 'pro':        proC        += contribution; break;
      case 'max':        maxC        += contribution; break;
      case 'structural': structuralC += contribution; break;
    }

    hits.push({ group: group.id, matches: [...new Set(matched)], contribution });
  }

  // ── Global pro cap ────────────────────────────────────────────────────────
  proC = clamp(proC, 0, GLOBAL_PRO_CAP);

  // ── Pro fires: neutralise nano and dampen standard ────────────────────────
  // Nano penalty: "hey, debug this" → "hey" shouldn't penalise debugging work.
  // Standard dampening: "fix the error" already implies some action — the action
  // verbs are redundant when pro signals dominate.
  if (proC > 0) {
    nanoC = 0;
    standardC *= 0.3;
  }

  // ── Word count structural signal ──────────────────────────────────────────
  const lengthContrib = wordCountContrib(wordCount);
  structuralC += lengthContrib;
  hits.push({
    group:        'structural-length',
    matches:      [`${wordCount} word${wordCount !== 1 ? 's' : ''}`],
    contribution: lengthContrib,
  });

  // ── Raw score ─────────────────────────────────────────────────────────────
  let raw = nanoC + standardC + proC + maxC + structuralC;

  // ── Standard floor ────────────────────────────────────────────────────────
  // Any message containing a real technical signal (standard-tech or standard-action)
  // gets at least the standard tier, regardless of nano penalties or short length.
  if (standardC > 0 && raw < 20) raw = 20;

  const score = clamp(Math.round(raw), 0, 100);
  const tier  = TIER_THRESHOLDS.find(([, t]) => score >= t)?.[0] ?? 'nano';

  return {
    score,
    tier,
    signals: hits.filter(h => h.contribution !== 0),
  };
}

// ─── classifyTier — compatibility wrapper ────────────────────────────────────

/**
 * Classify a message into a routing tier without returning full signal details.
 * Optional context can bump the tier (e.g. recentToolUse → at least standard).
 */
export function classifyTier(
  message: string,
  context?: { recentToolUse?: boolean },
): Tier {
  const result = estimateComplexity(message);
  if (context?.recentToolUse && result.tier === 'nano') return 'standard';
  return result.tier;
}

// ─── suggestWebSearch — context intelligence hint ─────────────────────────────

const WEB_SEARCH_TRIGGERS = [
  /\b(latest|newest|recent|current|today|now|2025|2026)\b/i,
  /\b(news|price|stock|weather|score|standings|release)\b/i,
  /\b(what happened|who won|is .+ still|has .+ been)\b/i,
];

/**
 * Returns a tool hint string if the message looks like it needs live data,
 * or null if no web search nudge is needed.
 */
export function suggestWebSearch(
  message: string,
  _lastAssistant?: string,
): string | null {
  if (WEB_SEARCH_TRIGGERS.some(r => r.test(message))) {
    return 'web_search';
  }
  return null;
}

// ─── Explain helper ───────────────────────────────────────────────────────────

export function explainComplexity(message: string): string {
  const { score, tier, signals } = estimateComplexity(message);
  return [
    `Score: ${score}/100  →  ${tier.toUpperCase()}`,
    `Input: "${message.slice(0, 80)}${message.length > 80 ? '…' : ''}"`,
    'Signals:',
    ...signals.map(s => {
      const sign = s.contribution >= 0 ? '+' : '';
      return `  ${(sign + Math.round(s.contribution)).padStart(4)}  [${s.group}]  → ${s.matches.slice(0, 4).join(', ')}`;
    }),
  ].join('\n');
}
