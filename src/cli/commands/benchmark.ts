import { Command } from 'commander';
import { z } from 'zod';

const BenchmarkResultSchema = z.object({
  name: z.string(),
  tokensJson: z.number(),
  tokensToon: z.number(),
  savings: z.string(),
});

type BenchmarkResult = z.infer<typeof BenchmarkResultSchema>;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function runBenchmark(): void {
  console.log('\nMicroClaw Benchmark — TOON vs JSON Token Usage\n');

  const testCases = [
    {
      name: 'Simple object',
      json: '{"name":"Alice","age":30,"active":true}',
      toon: 'name=Alice age=30 active=true',
    },
    {
      name: 'Nested object',
      json: '{"user":{"name":"Bob","settings":{"theme":"dark","lang":"en"}}}',
      toon: 'user.name=Bob user.settings.theme=dark user.settings.lang=en',
    },
    {
      name: 'Array data',
      json: '{"items":["alpha","beta","gamma","delta"]}',
      toon: 'items=[alpha,beta,gamma,delta]',
    },
    {
      name: 'Tool call',
      json: '{"tool":"search","args":{"query":"latest news","limit":10}}',
      toon: 'tool=search args.query="latest news" args.limit=10',
    },
    {
      name: 'Complex prompt',
      json: '{"system":"You are helpful","messages":[{"role":"user","content":"Hello"},{"role":"assistant","content":"Hi"}]}',
      toon: 'system="You are helpful" messages.0.role=user messages.0.content=Hello messages.1.role=assistant messages.1.content=Hi',
    },
  ];

  const results: BenchmarkResult[] = [];

  for (const tc of testCases) {
    const tokensJson = estimateTokens(tc.json);
    const tokensToon = estimateTokens(tc.toon);
    const savings = tokensJson > 0
      ? `${(((tokensJson - tokensToon) / tokensJson) * 100).toFixed(1)}%`
      : '0%';

    const result = BenchmarkResultSchema.parse({
      name: tc.name,
      tokensJson,
      tokensToon,
      savings,
    });
    results.push(result);
  }

  console.log('  Test Case'.padEnd(22) + 'JSON'.padEnd(8) + 'TOON'.padEnd(8) + 'Savings');
  console.log('  ' + '-'.repeat(44));

  for (const r of results) {
    console.log(
      `  ${r.name.padEnd(20)}${String(r.tokensJson).padEnd(8)}${String(r.tokensToon).padEnd(8)}${r.savings}`,
    );
  }

  const start = performance.now();
  for (let i = 0; i < 10000; i++) {
    estimateTokens('Sample complexity estimation input for benchmarking');
  }
  const elapsed = (performance.now() - start).toFixed(2);
  console.log(`\n  Complexity estimator: 10,000 iterations in ${elapsed}ms`);

  const promptSample = 'You are a helpful AI assistant. Please answer the following question clearly and concisely.';
  const promptTokens = estimateTokens(promptSample);
  console.log(`  Sample prompt tokens: ${promptTokens}`);
  console.log();
}

const benchmarkCommand = new Command('benchmark')
  .description('Run token usage benchmark (TOON vs JSON)')
  .action(() => {
    runBenchmark();
  });

export { benchmarkCommand };
