import { describe, it, expect } from 'vitest';
import { estimateComplexity } from '../../src/core/complexity-estimator.js';

describe('ComplexityEstimator', () => {
  describe('score range', () => {
    it('returns a score between 0 and 100', () => {
      const result = estimateComplexity('hello');
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it('always returns integer scores', () => {
      const inputs = ['hi', 'build a full stack app', 'analyze and optimize the database'];
      for (const input of inputs) {
        const result = estimateComplexity(input);
        expect(Number.isInteger(result.score)).toBe(true);
      }
    });
  });

  describe('tier classification', () => {
    it('classifies simple greetings as nano', () => {
      const result = estimateComplexity('hi');
      expect(result.tier).toBe('nano');
    });

    it('classifies "hello" as nano', () => {
      const result = estimateComplexity('hello there');
      expect(result.tier).toBe('nano');
    });

    it('classifies "say hi" as nano', () => {
      const result = estimateComplexity('say hi to John');
      expect(result.tier).toBe('nano');
    });

    it('classifies "yes" as nano', () => {
      const result = estimateComplexity('yes');
      expect(result.tier).toBe('nano');
    });

    it('classifies "thanks" as nano', () => {
      const result = estimateComplexity('thanks');
      expect(result.tier).toBe('nano');
    });

    it('classifies simple questions as nano or standard', () => {
      const result = estimateComplexity('what time is it');
      expect(['nano', 'standard']).toContain(result.tier);
    });

    it('classifies research tasks as standard or higher', () => {
      const result = estimateComplexity('search for the latest AI news and summarize it');
      expect(['standard', 'pro', 'max']).toContain(result.tier);
    });

    it('classifies multi-step coding as pro or higher', () => {
      const result = estimateComplexity(
        'build a REST API with authentication, implement the database schema, write tests, and deploy to production',
      );
      expect(['pro', 'max']).toContain(result.tier);
    });

    it('classifies complex analysis tasks as pro or max', () => {
      const result = estimateComplexity(
        'analyze the codebase architecture, identify performance bottlenecks, implement optimizations, debug the failing tests, and deploy the fixes',
      );
      expect(['pro', 'max']).toContain(result.tier);
    });

    it('classifies simple file operations as standard', () => {
      const result = estimateComplexity('read the config file');
      expect(['nano', 'standard']).toContain(result.tier);
    });
  });

  describe('performance', () => {
    it('runs in under 1ms for short inputs', () => {
      const start = performance.now();
      for (let i = 0; i < 100; i++) {
        estimateComplexity('hello world');
      }
      const elapsed = performance.now() - start;
      expect(elapsed / 100).toBeLessThan(1);
    });

    it('runs in under 1ms for long inputs', () => {
      const longInput = 'build a comprehensive full-stack web application with authentication, database migrations, API endpoints, testing, deployment pipeline, monitoring, logging, and error handling '.repeat(5);
      const start = performance.now();
      for (let i = 0; i < 100; i++) {
        estimateComplexity(longInput);
      }
      const elapsed = performance.now() - start;
      expect(elapsed / 100).toBeLessThan(1);
    });
  });

  describe('breakdown factors', () => {
    it('includes all breakdown components', () => {
      const result = estimateComplexity('analyze the code');
      expect(result.breakdown).toHaveProperty('tokenFactor');
      expect(result.breakdown).toHaveProperty('verbComplexity');
      expect(result.breakdown).toHaveProperty('toolDependency');
      expect(result.breakdown).toHaveProperty('reasoningDensity');
      expect(result.breakdown).toHaveProperty('accuracyNeeded');
    });

    it('tokenFactor increases with message length', () => {
      const short = estimateComplexity('hi');
      const long = estimateComplexity('a '.repeat(250));
      expect(long.breakdown.tokenFactor).toBeGreaterThan(short.breakdown.tokenFactor);
    });

    it('verbComplexity is low for simple verbs', () => {
      const result = estimateComplexity('say hello');
      expect(result.breakdown.verbComplexity).toBeLessThanOrEqual(0.3);
    });

    it('verbComplexity is high for complex verbs', () => {
      const result = estimateComplexity('implement the architecture');
      expect(result.breakdown.verbComplexity).toBeGreaterThanOrEqual(0.6);
    });

    it('toolDependency increases with tool-related keywords', () => {
      const noTools = estimateComplexity('tell me a joke');
      const withTools = estimateComplexity('search the web, read the file, execute the script, and save results');
      expect(withTools.breakdown.toolDependency).toBeGreaterThan(noTools.breakdown.toolDependency);
    });

    it('accuracyNeeded increases with factual keywords', () => {
      const creative = estimateComplexity('write me a poem');
      const factual = estimateComplexity('what is the current price of bitcoin today, verify the exact data');
      expect(factual.breakdown.accuracyNeeded).toBeGreaterThan(creative.breakdown.accuracyNeeded);
    });
  });

  describe('web search detection', () => {
    it('detects web search need for "search" queries', () => {
      const result = estimateComplexity('search for recent AI developments');
      expect(result.webSearchNeeded).toBe(true);
    });

    it('detects web search need for "latest" queries', () => {
      const result = estimateComplexity('what is the latest version of Node.js');
      expect(result.webSearchNeeded).toBe(true);
    });

    it('detects web search need for price queries', () => {
      const result = estimateComplexity('what is the price of gold today');
      expect(result.webSearchNeeded).toBe(true);
    });

    it('does not flag creative tasks for web search', () => {
      const result = estimateComplexity('write me a haiku about cats');
      expect(result.webSearchNeeded).toBe(false);
    });
  });

  describe('20 classification examples (PRD requirement)', () => {
    const examples: Array<{ input: string; expectedTier: string[] }> = [
      { input: 'hi', expectedTier: ['nano'] },
      { input: 'thanks!', expectedTier: ['nano'] },
      { input: 'yes', expectedTier: ['nano'] },
      { input: 'good morning', expectedTier: ['nano'] },
      { input: 'ok bye', expectedTier: ['nano'] },
      { input: 'what is 2+2', expectedTier: ['nano', 'standard'] },
      { input: 'tell me a joke', expectedTier: ['nano', 'standard'] },
      { input: 'summarize this article', expectedTier: ['nano', 'standard'] },
      { input: 'search for python tutorials', expectedTier: ['nano', 'standard', 'pro'] },
      { input: 'read the config file and tell me what it says', expectedTier: ['nano', 'standard', 'pro'] },
      { input: 'write a function to sort an array', expectedTier: ['standard', 'pro'] },
      { input: 'explain quantum computing', expectedTier: ['nano', 'standard'] },
      { input: 'create a web scraper for news articles', expectedTier: ['standard', 'pro'] },
      { input: 'debug the authentication module and fix the failing tests', expectedTier: ['standard', 'pro', 'max'] },
      { input: 'implement a REST API with database integration', expectedTier: ['standard', 'pro', 'max'] },
      { input: 'analyze the codebase and optimize performance', expectedTier: ['standard', 'pro', 'max'] },
      { input: 'build a full CI/CD pipeline with testing, deployment, and monitoring', expectedTier: ['standard', 'pro', 'max'] },
      { input: 'design and implement a distributed cache with replication', expectedTier: ['standard', 'pro', 'max'] },
      { input: 'refactor the entire module architecture, implement new patterns, and deploy', expectedTier: ['pro', 'max'] },
      { input: 'create a comprehensive testing strategy, implement unit and integration tests, debug failures, and generate coverage reports', expectedTier: ['standard', 'pro', 'max'] },
    ];

    examples.forEach(({ input, expectedTier }, i) => {
      it(`example ${i + 1}: "${input.substring(0, 40)}..." → ${expectedTier.join('/')}`, () => {
        const result = estimateComplexity(input);
        expect(expectedTier).toContain(result.tier);
      });
    });
  });
});
