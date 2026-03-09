import { describe, it, expect } from 'vitest';
import { encode, decode, parseAll, ToonParseError } from '../../src/core/toon-serializer.js';

describe('TOON Serializer', () => {
  describe('encode', () => {
    it('encodes a simple object', () => {
      const result = encode('task', { id: 't_a3b2', type: 'code_gen' });
      expect(result).toContain('@task{');
      expect(result).toContain('id:t_a3b2');
      expect(result).toContain('type:code_gen');
      expect(result).toContain('}');
    });

    it('encodes boolean values', () => {
      const result = encode('config', { enabled: true, verbose: false });
      expect(result).toContain('enabled:true');
      expect(result).toContain('verbose:false');
    });

    it('encodes null values', () => {
      const result = encode('state', { lastRun: null });
      expect(result).toContain('lastRun:null');
    });

    it('encodes numeric values', () => {
      const result = encode('metrics', { count: 42, ratio: 3.14 });
      expect(result).toContain('count:42');
      expect(result).toContain('ratio:3.14');
    });

    it('encodes array values', () => {
      const result = encode('result', { items: ['val1', 'val2', 'val3'] });
      expect(result).toContain('items:[val1, val2, val3]');
    });

    it('encodes empty array', () => {
      const result = encode('result', { items: [] });
      expect(result).toContain('items:[]');
    });

    it('encodes multi-line strings with pipe syntax', () => {
      const result = encode('prompt', { text: 'Line one\nLine two' });
      expect(result).toContain('|');
      expect(result).toContain('Line one');
      expect(result).toContain('Line two');
    });

    it('encodes nested objects', () => {
      const result = encode('task', {
        id: 't_a3b2',
        ctx: { lang: 'python', files: 3 },
      });
      expect(result).toContain('@task{');
      expect(result).toContain('id:t_a3b2');
      expect(result).toContain('@_nested{');
      expect(result).toContain('lang:python');
      expect(result).toContain('files:3');
    });

    it('encodes empty object', () => {
      const result = encode('empty', {});
      expect(result).toBe('@empty{}');
    });
  });

  describe('decode', () => {
    it('decodes a simple object', () => {
      const input = '@task{\n  id:t_a3b2\n  type:code_gen\n}';
      const result = decode(input);
      expect(result.type).toBe('task');
      expect(result.data).toEqual({ id: 't_a3b2', type: 'code_gen' });
    });

    it('decodes boolean values', () => {
      const input = '@config{\n  enabled:true\n  verbose:false\n}';
      const result = decode(input);
      expect(result.data).toEqual({ enabled: true, verbose: false });
    });

    it('decodes null values', () => {
      const input = '@state{\n  lastRun:null\n}';
      const result = decode(input);
      expect(result.data).toEqual({ lastRun: null });
    });

    it('decodes numeric values', () => {
      const input = '@metrics{\n  count:42\n  ratio:3.14\n  negative:-7\n}';
      const result = decode(input);
      expect(result.data).toEqual({ count: 42, ratio: 3.14, negative: -7 });
    });

    it('decodes array values', () => {
      const input = '@result{\n  items:[val1, val2, val3]\n  flags:[ok, cached, fast]\n}';
      const result = decode(input);
      expect(result.data['items']).toEqual(['val1', 'val2', 'val3']);
      expect(result.data['flags']).toEqual(['ok', 'cached', 'fast']);
    });

    it('decodes empty arrays', () => {
      const input = '@result{\n  items:[]\n}';
      const result = decode(input);
      expect(result.data['items']).toEqual([]);
    });

    it('decodes nested objects', () => {
      const input = '@task{\n  id:t_a3b2\n  type:code_gen\n  ctx:@ctx{\n    lang:python\n    files:3\n  }\n}';
      const result = decode(input);
      expect(result.type).toBe('task');
      expect(result.data['id']).toBe('t_a3b2');
      expect(result.data['ctx']).toEqual({ lang: 'python', files: 3 });
    });

    it('decodes multi-line strings', () => {
      const input = '@prompt{\n  text:|\n    Line one of prompt\n    Line two of prompt\n  |\n}';
      const result = decode(input);
      expect(result.data['text']).toBe('Line one of prompt\nLine two of prompt');
    });

    it('skips comments', () => {
      const input = '# This is a comment\n@task{\n  # Another comment\n  id:t_a3b2\n}';
      const result = decode(input);
      expect(result.type).toBe('task');
      expect(result.data).toEqual({ id: 't_a3b2' });
    });

    it('handles whitespace variations', () => {
      const input = '  @task{  \n  id:hello  \n  }  ';
      const result = decode(input);
      expect(result.data).toEqual({ id: 'hello' });
    });

    it('decodes deeply nested objects', () => {
      const input = '@a{\n  b:@b{\n    c:@c{\n      d:deep\n    }\n  }\n}';
      const result = decode(input);
      expect(result.data['b']).toEqual({ c: { d: 'deep' } });
    });

    it('decodes arrays with numeric values', () => {
      const input = '@data{\n  scores:[1, 2, 3, 4, 5]\n}';
      const result = decode(input);
      expect(result.data['scores']).toEqual([1, 2, 3, 4, 5]);
    });

    it('decodes arrays with boolean values', () => {
      const input = '@data{\n  flags:[true, false, true]\n}';
      const result = decode(input);
      expect(result.data['flags']).toEqual([true, false, true]);
    });

    it('decodes mixed-type arrays', () => {
      const input = '@data{\n  mixed:[hello, 42, true, null]\n}';
      const result = decode(input);
      expect(result.data['mixed']).toEqual(['hello', 42, true, null]);
    });
  });

  describe('round-trip encode/decode', () => {
    it('round-trips simple values', () => {
      const original = { name: 'test', count: 42, active: true, deleted: null };
      const encoded = encode('item', original);
      const decoded = decode(encoded);
      expect(decoded.type).toBe('item');
      expect(decoded.data).toEqual(original);
    });

    it('round-trips arrays', () => {
      const original = { items: ['a', 'b', 'c'], flags: ['ok'] };
      const encoded = encode('list', original);
      const decoded = decode(encoded);
      expect(decoded.type).toBe('list');
      expect(decoded.data['items']).toEqual(['a', 'b', 'c']);
      expect(decoded.data['flags']).toEqual(['ok']);
    });

    it('round-trips negative numbers', () => {
      const original = { temp: -10, offset: -3.5 };
      const encoded = encode('sensor', original);
      const decoded = decode(encoded);
      expect(decoded.data['temp']).toBe(-10);
      expect(decoded.data['offset']).toBe(-3.5);
    });

    it('round-trips empty arrays', () => {
      const original = { items: [] };
      const encoded = encode('list', original);
      const decoded = decode(encoded);
      expect(decoded.data['items']).toEqual([]);
    });

    it('round-trips multi-line strings', () => {
      const original = { prompt: 'Hello world\nSecond line\nThird line' };
      const encoded = encode('msg', original);
      const decoded = decode(encoded);
      expect(decoded.data['prompt']).toBe('Hello world\nSecond line\nThird line');
    });

    it('round-trips task routing briefs (real-world payload)', () => {
      const original = {
        id: 't_abc123',
        type: 'code_gen',
        priority: 2,
        tools: ['read_file', 'write_file', 'run_code'],
        cached: false,
      };
      const encoded = encode('task', original);
      const decoded = decode(encoded);
      expect(decoded.type).toBe('task');
      expect(decoded.data['id']).toBe('t_abc123');
      expect(decoded.data['type']).toBe('code_gen');
      expect(decoded.data['priority']).toBe(2);
      expect(decoded.data['tools']).toEqual(['read_file', 'write_file', 'run_code']);
      expect(decoded.data['cached']).toBe(false);
    });
  });

  describe('parseAll', () => {
    it('parses multiple blocks from a single string', () => {
      const input = '@task{\n  id:t1\n}\n@result{\n  status:ok\n}';
      const results = parseAll(input);
      expect(results).toHaveLength(2);
      expect(results[0]!.type).toBe('task');
      expect(results[0]!.data).toEqual({ id: 't1' });
      expect(results[1]!.type).toBe('result');
      expect(results[1]!.data).toEqual({ status: 'ok' });
    });

    it('parses blocks with comments between them', () => {
      const input = '# First block\n@a{\n  x:1\n}\n# Second block\n@b{\n  y:2\n}';
      const results = parseAll(input);
      expect(results).toHaveLength(2);
      expect(results[0]!.data).toEqual({ x: 1 });
      expect(results[1]!.data).toEqual({ y: 2 });
    });

    it('returns empty array for empty input', () => {
      const results = parseAll('');
      expect(results).toHaveLength(0);
    });

    it('returns empty array for comment-only input', () => {
      const results = parseAll('# just a comment\n# another');
      expect(results).toHaveLength(0);
    });

    it('parses a single block', () => {
      const results = parseAll('@single{\n  val:ok\n}');
      expect(results).toHaveLength(1);
      expect(results[0]!.type).toBe('single');
    });

    it('handles LLM output with multiple agent results', () => {
      const input = `
@planner_result{
  subtasks:[research, execute, compose]
  complexity:65
}
@research_result{
  findings:relevant data found
  sources:3
  cached:true
}
@execution_result{
  status:success
  output:code compiled
}`;
      const results = parseAll(input);
      expect(results).toHaveLength(3);
      expect(results[0]!.type).toBe('planner_result');
      expect(results[1]!.type).toBe('research_result');
      expect(results[2]!.type).toBe('execution_result');
    });
  });

  describe('error handling', () => {
    it('throws ToonParseError on missing @', () => {
      expect(() => decode('task{ id:1 }')).toThrow(ToonParseError);
    });

    it('throws on missing opening brace', () => {
      expect(() => decode('@task id:1 }')).toThrow(ToonParseError);
    });

    it('throws on missing closing brace', () => {
      expect(() => decode('@task{ id:1')).toThrow(ToonParseError);
    });

    it('throws on empty type name', () => {
      expect(() => decode('@{ id:1 }')).toThrow(ToonParseError);
    });

    it('throws on unterminated array', () => {
      expect(() => decode('@t{ items:[a, b')).toThrow(ToonParseError);
    });

    it('provides position info in error', () => {
      try {
        decode('not a toon string');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ToonParseError);
        expect((err as ToonParseError).position).toBeTypeOf('number');
      }
    });
  });

  describe('edge cases', () => {
    it('handles keys with hyphens', () => {
      const input = '@config{\n  trigger-word:@rem\n  max-tokens:4096\n}';
      const result = decode(input);
      expect(result.data['trigger-word']).toBe('@rem');
      expect(result.data['max-tokens']).toBe(4096);
    });

    it('handles keys with underscores', () => {
      const input = '@config{\n  cache_size:8000\n  is_active:true\n}';
      const result = decode(input);
      expect(result.data['cache_size']).toBe(8000);
      expect(result.data['is_active']).toBe(true);
    });

    it('handles empty string values', () => {
      const input = '@item{\n  name:\n  other:val\n}';
      const result = decode(input);
      expect(result.data['name']).toBe('');
      expect(result.data['other']).toBe('val');
    });

    it('handles string values that look numeric but have non-numeric chars', () => {
      const input = '@id{\n  hash:abc123\n  version:v2.0\n}';
      const result = decode(input);
      expect(result.data['hash']).toBe('abc123');
      expect(result.data['version']).toBe('v2.0');
    });

    it('handles large integer values', () => {
      const input = '@data{\n  timestamp:1704067200\n}';
      const result = decode(input);
      expect(result.data['timestamp']).toBe(1704067200);
    });

    it('handles empty nested object', () => {
      const input = '@wrapper{\n  inner:@inner{}\n}';
      const result = decode(input);
      expect(result.data['inner']).toEqual({});
    });

    it('produces shorter output than equivalent JSON', () => {
      const payload = {
        id: 't_a3b2',
        type: 'code_gen',
        priority: 2,
        cached: false,
        tools: ['read_file', 'write_file', 'run_code'],
      };
      const toonStr = encode('task', payload);
      const jsonStr = JSON.stringify(payload);
      expect(toonStr.length).toBeLessThan(jsonStr.length);
    });
  });

  describe('real-world payloads', () => {
    it('handles session summary format', () => {
      const input = `@session{
  id:sess_abc123
  group_id:grp_001
  token_count:1500
  model_used:claude-sonnet
  summary:|\n    User asked about weather.\n    Agent searched and responded with forecast.\n  |
}`;
      const result = decode(input);
      expect(result.type).toBe('session');
      expect(result.data['id']).toBe('sess_abc123');
      expect(result.data['token_count']).toBe(1500);
      expect(typeof result.data['summary']).toBe('string');
    });

    it('handles guardrail config format', () => {
      const input = `@guardrail{
  rule:never_reveal_secrets
  applies_to:[env_vars, api_keys, vault_contents, internal_config]
  response_if_asked:I don't have access to configuration secrets.
}`;
      const result = decode(input);
      expect(result.type).toBe('guardrail');
      expect(result.data['rule']).toBe('never_reveal_secrets');
      expect(result.data['applies_to']).toEqual([
        'env_vars',
        'api_keys',
        'vault_contents',
        'internal_config',
      ]);
    });

    it('handles betaclaw config format', () => {
      const input = `@betaclaw{
  version:2.0.0
  profile:standard
  executionMode:isolated
  triggerWord:@rem
}`;
      const result = decode(input);
      expect(result.type).toBe('betaclaw');
      expect(result.data['version']).toBe('2.0.0');
      expect(result.data['profile']).toBe('standard');
    });

    it('handles agent task brief format', () => {
      const input = `@task{
  id:t_research_001
  type:web_search
  query:latest AI news
  maxResults:5
  cached:false
}`;
      const result = decode(input);
      expect(result.type).toBe('task');
      expect(result.data['id']).toBe('t_research_001');
      expect(result.data['maxResults']).toBe(5);
    });
  });
});
