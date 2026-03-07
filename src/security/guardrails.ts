import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { MicroClawDB } from '../db.js';
import { PersonaLock } from './persona-lock.js';

const SeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);
type Severity = z.infer<typeof SeveritySchema>;

interface GuardrailEvent {
  type: string;
  severity: Severity;
  details: string;
}

interface GuardrailResult {
  allowed: boolean;
  modified: boolean;
  content: string;
  events: GuardrailEvent[];
}

const INJECTION_PATTERNS: ReadonlyArray<{ pattern: RegExp; severity: Severity }> = [
  { pattern: /ignore\s+(all\s+)?previous\s+instructions/i, severity: 'critical' },
  { pattern: /ignore\s+(all\s+)?above\s+instructions/i, severity: 'critical' },
  { pattern: /disregard\s+(all\s+)?(previous|prior|above)\s+instructions/i, severity: 'critical' },
  { pattern: /you\s+are\s+now\s+(?:a|an)\s+/i, severity: 'high' },
  { pattern: /override\s+(system|safety)\s+(prompt|instructions)/i, severity: 'critical' },
  { pattern: /forget\s+(everything|all)\s+(you|about)/i, severity: 'high' },
  { pattern: /act\s+as\s+(?:if\s+)?(?:you\s+(?:are|were)\s+)?(?:a\s+)?different/i, severity: 'high' },
  { pattern: /\bsystem\s*:\s*/i, severity: 'medium' },
  { pattern: /\bDAN\s+mode\b/i, severity: 'critical' },
  { pattern: /jailbreak/i, severity: 'critical' },
];

const PII_PATTERNS: ReadonlyArray<{ pattern: RegExp; label: string }> = [
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, label: 'EMAIL' },
  { pattern: /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g, label: 'SSN' },
  { pattern: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, label: 'PHONE' },
  { pattern: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, label: 'CREDIT_CARD' },
];

const SECRET_PATTERNS: ReadonlyArray<{ pattern: RegExp; label: string }> = [
  { pattern: /\b(sk-[a-zA-Z0-9]{20,})\b/g, label: 'OPENAI_KEY' },
  { pattern: /\b(sk-ant-[a-zA-Z0-9-]{20,})\b/g, label: 'ANTHROPIC_KEY' },
  { pattern: /\b(ghp_[a-zA-Z0-9]{36,})\b/g, label: 'GITHUB_TOKEN' },
  { pattern: /\b(xoxb-[a-zA-Z0-9-]{20,})\b/g, label: 'SLACK_TOKEN' },
  { pattern: /\bAIza[a-zA-Z0-9_-]{35}\b/g, label: 'GOOGLE_API_KEY' },
  { pattern: /\b(AKIA[A-Z0-9]{16})\b/g, label: 'AWS_ACCESS_KEY' },
  { pattern: /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/g, label: 'PRIVATE_KEY' },
];

class Guardrails {
  private readonly db: MicroClawDB;

  constructor(db: MicroClawDB, _vaultDir?: string) {
    this.db = db;
  }

  processInput(input: string, groupId: string): GuardrailResult {
    const events: GuardrailEvent[] = [];
    let content = input;
    let allowed = true;
    let modified = false;

    for (const { pattern, severity } of INJECTION_PATTERNS) {
      if (pattern.test(input)) {
        events.push({
          type: 'injection_attempt',
          severity,
          details: `Matched injection pattern: ${pattern.source}`,
        });
        if (severity === 'critical' || severity === 'high') {
          allowed = false;
        }
      }
    }

    for (const { pattern, label } of PII_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      if (regex.test(content)) {
        const replaceRegex = new RegExp(pattern.source, pattern.flags);
        content = content.replace(replaceRegex, `[REDACTED:${label}]`);
        modified = true;
        events.push({
          type: 'pii_detected',
          severity: 'medium',
          details: `Redacted ${label}`,
        });
      }
    }

    for (const event of events) {
      this.logSecurityEvent(event, groupId, !allowed);
    }

    return { allowed, modified, content, events };
  }

  processOutput(output: string, groupId: string, persona?: PersonaLock): GuardrailResult {
    const events: GuardrailEvent[] = [];
    let content = output;
    let allowed = true;
    let modified = false;

    for (const { pattern, label } of SECRET_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      if (regex.test(content)) {
        const replaceRegex = new RegExp(pattern.source, pattern.flags);
        content = content.replace(replaceRegex, `[REDACTED:${label}]`);
        modified = true;
        events.push({
          type: 'secret_leak',
          severity: 'critical',
          details: `Redacted leaked ${label}`,
        });
      }
    }

    if (persona) {
      const driftResult = persona.checkDrift(output);
      if (driftResult.drifted) {
        events.push({
          type: 'persona_drift',
          severity: 'medium',
          details: `Persona drift detected (similarity: ${driftResult.similarity.toFixed(2)})`,
        });
      }
    }

    for (const event of events) {
      this.logSecurityEvent(event, groupId, !allowed);
    }

    return { allowed, modified, content, events };
  }

  prePromptCheck(persona: PersonaLock, personaHash: string): boolean {
    return persona.verify(personaHash);
  }

  private logSecurityEvent(event: GuardrailEvent, groupId: string, blocked: boolean): void {
    this.db.insertSecurityEvent({
      id: uuidv4(),
      event_type: event.type,
      group_id: groupId,
      severity: event.severity,
      details: event.details,
      blocked: blocked ? 1 : 0,
    });
  }
}

export { Guardrails };
export type { GuardrailResult, GuardrailEvent };
