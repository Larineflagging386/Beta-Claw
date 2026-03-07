import { z } from 'zod';

const InputSchema = z.string();

interface PiiScanResult {
  hasPII: boolean;
  redacted: string;
  detections: Array<{
    type: string;
    value: string;
    position: number;
  }>;
}

interface InternalMatch {
  type: string;
  value: string;
  position: number;
  length: number;
}

function luhnCheck(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    const ch = digits[i];
    if (ch === undefined) continue;
    let n = Number(ch);
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    double = !double;
  }
  return sum > 0 && sum % 10 === 0;
}

function execAll(
  re: RegExp,
  input: string,
): Array<{ value: string; position: number }> {
  const results: Array<{ value: string; position: number }> = [];
  const regex = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  let m: RegExpExecArray | null;
  while ((m = regex.exec(input)) !== null) {
    const val = m[0];
    if (val === undefined) continue;
    results.push({ value: val, position: m.index });
  }
  return results;
}

function findCreditCards(
  input: string,
): Array<{ value: string; position: number }> {
  const results: Array<{ value: string; position: number }> = [];
  const seen = new Set<number>();

  for (const m of execAll(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{1,4}\b/g, input)) {
    const digits = m.value.replace(/[\s-]/g, '');
    if (digits.length >= 13 && digits.length <= 19 && luhnCheck(digits)) {
      results.push(m);
      seen.add(m.position);
    }
  }

  for (const m of execAll(/\b3[47]\d{2}[\s-]?\d{6}[\s-]?\d{5}\b/g, input)) {
    if (seen.has(m.position)) continue;
    const digits = m.value.replace(/[\s-]/g, '');
    if (luhnCheck(digits)) {
      results.push(m);
    }
  }

  return results;
}

function findSSNs(
  input: string,
): Array<{ value: string; position: number }> {
  return execAll(/\b\d{3}-\d{2}-\d{4}\b/g, input);
}

function findEmails(
  input: string,
): Array<{ value: string; position: number }> {
  return execAll(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, input);
}

function findPhones(
  input: string,
): Array<{ value: string; position: number }> {
  const results: Array<{ value: string; position: number }> = [];
  const seen = new Set<number>();

  for (const m of execAll(
    /(?:\+?1[\s.-]?)?\(?[2-9]\d{2}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g,
    input,
  )) {
    results.push(m);
    seen.add(m.position);
  }

  for (const m of execAll(/\+[1-9]\d{7,14}\b/g, input)) {
    if (seen.has(m.position)) continue;
    results.push(m);
  }

  return results;
}

function findApiKeys(
  input: string,
): Array<{ value: string; position: number }> {
  const patterns: RegExp[] = [
    /\bsk-[A-Za-z0-9]{20,}\b/g,
    /\bAIza[A-Za-z0-9_-]{35}\b/g,
    /\bghp_[A-Za-z0-9]{36}\b/g,
    /\bsk_live_[A-Za-z0-9]{24,}\b/g,
    /Bearer\s+[A-Za-z0-9._-]{20,}/g,
  ];

  const results: Array<{ value: string; position: number }> = [];
  const seen = new Set<number>();

  for (const re of patterns) {
    for (const m of execAll(re, input)) {
      if (seen.has(m.position)) continue;
      results.push(m);
      seen.add(m.position);
    }
  }

  return results;
}

class PiiDetector {
  scan(input: string): PiiScanResult {
    const validated = InputSchema.parse(input);
    const raw: InternalMatch[] = [
      ...findCreditCards(validated).map((m) => ({ ...m, type: 'credit_card', length: m.value.length })),
      ...findSSNs(validated).map((m) => ({ ...m, type: 'ssn', length: m.value.length })),
      ...findEmails(validated).map((m) => ({ ...m, type: 'email', length: m.value.length })),
      ...findPhones(validated).map((m) => ({ ...m, type: 'phone', length: m.value.length })),
      ...findApiKeys(validated).map((m) => ({ ...m, type: 'api_key', length: m.value.length })),
    ];

    raw.sort((a, b) => a.position - b.position);

    const filtered: InternalMatch[] = [];
    let lastEnd = 0;
    for (const d of raw) {
      if (d.position >= lastEnd) {
        filtered.push(d);
        lastEnd = d.position + d.length;
      }
    }

    let redacted = validated;
    for (const d of [...filtered].reverse()) {
      const tag = `[REDACTED:${d.type.toUpperCase()}]`;
      redacted =
        redacted.slice(0, d.position) +
        tag +
        redacted.slice(d.position + d.length);
    }

    return {
      hasPII: filtered.length > 0,
      redacted,
      detections: filtered.map(({ type, value, position }) => ({
        type,
        value,
        position,
      })),
    };
  }

  detectCreditCards(input: string): string[] {
    return findCreditCards(InputSchema.parse(input)).map((m) => m.value);
  }

  detectSSN(input: string): string[] {
    return findSSNs(InputSchema.parse(input)).map((m) => m.value);
  }

  detectEmails(input: string): string[] {
    return findEmails(InputSchema.parse(input)).map((m) => m.value);
  }

  detectPhones(input: string): string[] {
    return findPhones(InputSchema.parse(input)).map((m) => m.value);
  }

  detectApiKeys(input: string): string[] {
    return findApiKeys(InputSchema.parse(input)).map((m) => m.value);
  }
}

export { PiiDetector };
export type { PiiScanResult };
