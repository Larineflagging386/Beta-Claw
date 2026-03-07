/**
 * Zero-LLM-call complexity estimator. Scores 0-100 in <1ms.
 *
 * Score =
 *   (0.15 x normalize(token_count, 0, 500))
 * + (0.25 x verb_complexity_score)
 * + (0.30 x tool_dependency_depth)
 * + (0.20 x reasoning_keyword_density)
 * + (0.10 x historical_accuracy_needed)
 */

interface ComplexityResult {
  score: number;
  tier: 'nano' | 'standard' | 'pro' | 'max';
  breakdown: {
    tokenFactor: number;
    verbComplexity: number;
    toolDependency: number;
    reasoningDensity: number;
    accuracyNeeded: number;
  };
  webSearchNeeded: boolean;
}

interface ComplexityThresholds {
  nanoMax: number;
  standardMax: number;
  proMax: number;
}

const DEFAULT_THRESHOLDS: ComplexityThresholds = {
  nanoMax: 20,
  standardMax: 60,
  proMax: 85,
};

const SIMPLE_VERBS = new Set([
  'say', 'tell', 'hi', 'hello', 'hey', 'greet', 'thanks', 'thank',
  'ok', 'yes', 'no', 'bye', 'good', 'nice', 'cool', 'great',
  'what', 'when', 'where', 'who', 'how', 'why',
]);

const COMPLEX_VERBS = new Set([
  'build', 'create', 'implement', 'develop', 'architect', 'design',
  'refactor', 'optimize', 'migrate', 'deploy', 'configure', 'integrate',
  'analyze', 'evaluate', 'compare', 'benchmark', 'audit', 'review',
  'debug', 'fix', 'troubleshoot', 'diagnose', 'investigate',
  'write', 'generate', 'produce', 'compose', 'draft',
  'transform', 'convert', 'parse', 'serialize', 'deserialize',
  'schedule', 'automate', 'orchestrate', 'coordinate',
]);

const REASONING_KEYWORDS = new Set([
  'analyze', 'explain', 'reason', 'think', 'consider', 'evaluate',
  'compare', 'contrast', 'assess', 'judge', 'determine', 'conclude',
  'prove', 'derive', 'deduce', 'infer', 'hypothesize',
  'implement', 'algorithm', 'architecture', 'pattern', 'strategy',
  'complex', 'complicated', 'difficult', 'challenging', 'advanced',
  'step-by-step', 'detailed', 'comprehensive', 'thorough', 'in-depth',
  'multiple', 'several', 'various', 'different', 'alternative',
  'debug', 'error', 'bug', 'issue', 'problem', 'exception',
]);

const TOOL_INDICATORS = new Set([
  'search', 'find', 'look up', 'google', 'browse', 'fetch',
  'file', 'read', 'write', 'save', 'create', 'delete', 'modify',
  'run', 'execute', 'install', 'compile', 'test', 'deploy',
  'send', 'email', 'message', 'notify', 'post',
  'code', 'script', 'program', 'function', 'class', 'module',
  'database', 'query', 'sql', 'api', 'endpoint', 'request',
  'download', 'upload', 'transfer', 'sync',
]);

const ACCURACY_KEYWORDS = new Set([
  'fact', 'accurate', 'correct', 'precise', 'exact', 'true', 'verify',
  'source', 'citation', 'reference', 'evidence', 'proof', 'data',
  'statistic', 'number', 'date', 'year', 'price', 'cost',
  'current', 'latest', 'recent', 'today', 'now', 'update',
  'news', 'event', 'announcement', 'release',
  'legal', 'medical', 'scientific', 'technical', 'official',
]);

const WEB_SEARCH_INDICATORS = new Set([
  'search', 'google', 'look up', 'find online', 'browse',
  'latest', 'current', 'recent', 'today', 'news',
  'price', 'weather', 'stock', 'score', 'results',
  'what is', 'who is', 'where is',
]);

function estimateComplexity(
  input: string,
  thresholds: ComplexityThresholds = DEFAULT_THRESHOLDS,
): ComplexityResult {
  const lower = input.toLowerCase();
  const words = lower.split(/\s+/).filter((w) => w.length > 0);
  const wordCount = words.length;

  const tokenEstimate = Math.ceil(input.length / 4);
  const tokenFactor = Math.min(tokenEstimate / 500, 1.0);

  let verbScore = 0.3;
  const wordSet = new Set(words);
  let hasSimple = false;
  let hasComplex = false;

  for (const word of wordSet) {
    if (SIMPLE_VERBS.has(word)) hasSimple = true;
    if (COMPLEX_VERBS.has(word)) hasComplex = true;
  }

  if (hasComplex && !hasSimple) verbScore = 0.9;
  else if (hasComplex && hasSimple) verbScore = 0.6;
  else if (hasSimple && !hasComplex) verbScore = 0.1;

  if (lower.includes(' and ') && hasComplex) verbScore = Math.min(verbScore + 0.2, 1.0);
  if (lower.includes('then ') && hasComplex) verbScore = Math.min(verbScore + 0.15, 1.0);

  let toolCount = 0;
  for (const indicator of TOOL_INDICATORS) {
    if (lower.includes(indicator)) toolCount++;
  }
  const toolDependency = Math.min(toolCount / 5, 1.0);

  let reasoningCount = 0;
  for (const keyword of REASONING_KEYWORDS) {
    if (lower.includes(keyword)) reasoningCount++;
  }
  const reasoningDensity = wordCount > 0
    ? Math.min(reasoningCount / Math.max(wordCount * 0.15, 3), 1.0)
    : 0;

  let accuracyCount = 0;
  for (const keyword of ACCURACY_KEYWORDS) {
    if (lower.includes(keyword)) accuracyCount++;
  }
  const accuracyNeeded = Math.min(accuracyCount / 3, 1.0);

  const rawScore =
    0.15 * tokenFactor +
    0.25 * verbScore +
    0.30 * toolDependency +
    0.20 * reasoningDensity +
    0.10 * accuracyNeeded;

  const score = Math.round(Math.min(rawScore * 100, 100));

  let tier: 'nano' | 'standard' | 'pro' | 'max';
  if (score <= thresholds.nanoMax) tier = 'nano';
  else if (score <= thresholds.standardMax) tier = 'standard';
  else if (score <= thresholds.proMax) tier = 'pro';
  else tier = 'max';

  let webSearchNeeded = false;
  for (const indicator of WEB_SEARCH_INDICATORS) {
    if (lower.includes(indicator)) {
      webSearchNeeded = true;
      break;
    }
  }

  return {
    score,
    tier,
    breakdown: {
      tokenFactor,
      verbComplexity: verbScore,
      toolDependency,
      reasoningDensity,
      accuracyNeeded,
    },
    webSearchNeeded,
  };
}

export { estimateComplexity, DEFAULT_THRESHOLDS };
export type { ComplexityResult, ComplexityThresholds };
