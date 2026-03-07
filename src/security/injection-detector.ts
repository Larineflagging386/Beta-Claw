import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

const InputSchema = z.string();
const FilePathSchema = z.string().min(1);

interface InjectionScanResult {
  blocked: boolean;
  layer: 1 | 2 | 3 | null;
  pattern?: string;
  confidence: number;
  needsSemanticCheck: boolean;
}

const HOMOGLYPH_MAP = new Map<string, string>([
  ['\u0410', 'A'], ['\u0412', 'B'], ['\u0421', 'C'], ['\u0415', 'E'],
  ['\u041D', 'H'], ['\u041A', 'K'], ['\u041C', 'M'], ['\u041E', 'O'],
  ['\u0420', 'P'], ['\u0422', 'T'], ['\u0425', 'X'],
  ['\u0430', 'a'], ['\u0435', 'e'], ['\u043E', 'o'], ['\u0440', 'p'],
  ['\u0441', 'c'], ['\u0443', 'y'], ['\u0445', 'x'], ['\u0456', 'i'],
  ['\u0455', 's'],
]);

const ZERO_WIDTH_RE = /[\u200B\u200C\u200D\u200E\u200F\uFEFF\u00AD\u2060]/g;
const BASE64_RE = /(?:[A-Za-z0-9+/]{4}){4,}(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?/;
const CODE_BLOCK_RE = /```[\s\S]*?```/g;
const INLINE_CODE_RE = /`[^`]+`/g;

const ROLE_INJECTION_PATTERNS: readonly RegExp[] = [
  /(?:^|\n)\s*system\s*:/im,
  /\bsystem\s+prompt\s*:/i,
  /(?:^|\n)\s*assistant\s*:/im,
];

class InjectionDetector {
  private patterns: string[] = [];
  private readonly patternsPath: string;

  constructor(patternsPath?: string) {
    this.patternsPath =
      patternsPath ??
      resolve(process.cwd(), 'prompts', 'guardrails', 'injection-patterns.txt');
    this.loadPatterns();
  }

  loadPatterns(): void {
    const validPath = FilePathSchema.parse(this.patternsPath);
    const raw = z.string().parse(readFileSync(validPath, 'utf-8'));
    this.patterns = raw
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'));
  }

  scan(input: string): InjectionScanResult {
    const validated = InputSchema.parse(input);

    const stripped = validated
      .replace(CODE_BLOCK_RE, '')
      .replace(INLINE_CODE_RE, '');

    // Layer 1 — pattern matching (case-insensitive)
    const layer1Match = this.matchPatterns(stripped);
    if (layer1Match !== null) {
      return {
        blocked: true,
        layer: 1,
        pattern: layer1Match,
        confidence: 0.9,
        needsSemanticCheck: false,
      };
    }

    // Layer 2 — structural analysis

    // 2a: zero-width character evasion
    const withoutZW = stripped.replace(ZERO_WIDTH_RE, '');
    if (withoutZW.length !== stripped.length) {
      const zwMatch = this.matchPatterns(withoutZW);
      if (zwMatch !== null) {
        return {
          blocked: true,
          layer: 2,
          pattern: 'zero-width character evasion',
          confidence: 0.85,
          needsSemanticCheck: false,
        };
      }
    }

    // 2b: unicode homoglyph attack
    const normalized = this.normalizeUnicode(withoutZW);
    if (normalized !== withoutZW) {
      const hgMatch = this.matchPatterns(normalized);
      if (hgMatch !== null) {
        return {
          blocked: true,
          layer: 2,
          pattern: 'unicode homoglyph attack',
          confidence: 0.85,
          needsSemanticCheck: false,
        };
      }
    }

    // 2c: nested role declarations
    for (const re of ROLE_INJECTION_PATTERNS) {
      if (re.test(normalized)) {
        return {
          blocked: true,
          layer: 2,
          pattern: 'nested role declaration',
          confidence: 0.75,
          needsSemanticCheck: true,
        };
      }
    }

    // 2d: base64-encoded instructions
    const decoded = this.checkBase64(normalized);
    if (decoded !== null) {
      const b64Match = this.matchPatterns(decoded);
      if (b64Match !== null) {
        return {
          blocked: true,
          layer: 2,
          pattern: 'base64-encoded injection',
          confidence: 0.85,
          needsSemanticCheck: false,
        };
      }
    }

    return {
      blocked: false,
      layer: null,
      confidence: 0.1,
      needsSemanticCheck: validated.length > 500,
    };
  }

  normalizeUnicode(input: string): string {
    let result = '';
    for (const char of input) {
      const replacement = HOMOGLYPH_MAP.get(char);
      result += replacement ?? char;
    }
    return result;
  }

  checkBase64(input: string): string | null {
    const re = new RegExp(BASE64_RE.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(input)) !== null) {
      const raw = m[0];
      if (raw === undefined) continue;
      try {
        const decoded = Buffer.from(raw, 'base64').toString('utf-8');
        const printable = decoded.replace(/[^\x20-\x7E]/g, '');
        if (decoded.length >= 10 && printable.length / decoded.length > 0.8) {
          return decoded;
        }
      } catch {
        continue;
      }
    }
    return null;
  }

  private matchPatterns(text: string): string | null {
    const lower = text.toLowerCase();
    for (const pattern of this.patterns) {
      if (lower.includes(pattern.toLowerCase())) {
        return pattern;
      }
    }
    return null;
  }
}

export { InjectionDetector };
export type { InjectionScanResult };
