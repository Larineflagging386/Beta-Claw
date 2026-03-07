import { z } from 'zod';
import { MicroClawDB } from '../db.js';
import { encode } from '../core/toon-serializer.js';
import crypto from 'node:crypto';

const MessageInputSchema = z.object({
  role: z.string(),
  content: z.string(),
});

type MessageInput = z.output<typeof MessageInputSchema>;

interface CompactionResult {
  summary: string;
  keyFacts: string[];
  messagesCompacted: number;
  tokensBefore: number;
  tokensAfter: number;
  reductionPercent: number;
}

const ACTION_WORDS = new Set([
  'should', 'must', 'will', 'need', 'decide', 'agreed', 'confirm',
  'approve', 'reject', 'plan', 'implement', 'fix', 'change', 'update',
  'create', 'delete', 'remove', 'build', 'deploy', 'configure',
  'resolved', 'concluded', 'determined', 'chosen', 'selected',
]);

function scoreSentence(sentence: string, role: string): number {
  const lower = sentence.toLowerCase();
  let score = 0;

  for (const word of ACTION_WORDS) {
    if (lower.includes(word)) score += 2;
  }

  if (lower.includes('?')) score += 1;

  if (role === 'assistant') score += 1;

  score += Math.min(sentence.length / 50, 3);

  return score;
}

function splitSentences(text: string): string[] {
  const raw = text.split(/(?<=[.!?])\s+/);
  return raw
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

class Compactor {
  private readonly db: MicroClawDB;

  constructor(db: MicroClawDB) {
    this.db = db;
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  summarize(messages: MessageInput[]): string {
    const validated = messages.map((m) => MessageInputSchema.parse(m));

    if (validated.length === 0) return '';

    const scored: Array<{ sentence: string; score: number }> = [];

    for (const msg of validated) {
      const sentences = splitSentences(msg.content);
      for (const sentence of sentences) {
        scored.push({ sentence, score: scoreSentence(sentence, msg.role) });
      }
    }

    if (scored.length === 0) return '';

    scored.sort((a, b) => b.score - a.score);

    const totalChars = validated.reduce((sum, m) => sum + m.content.length, 0);
    const targetChars = Math.ceil(totalChars * 0.3);

    const selected: string[] = [];
    let charCount = 0;

    for (const item of scored) {
      if (charCount >= targetChars) break;
      selected.push(item.sentence);
      charCount += item.sentence.length;
    }

    const summaryText = selected.join(' ');
    return encode('summary', { text: summaryText });
  }

  extractFacts(summary: string): string[] {
    if (!summary || summary.trim().length === 0) return [];

    const textMatch = /text:([^\n}]+|[\s\S]*?\|)/m.exec(summary);
    const plainText = textMatch ? textMatch[1]!.trim() : summary;

    const sentences = splitSentences(plainText);

    return sentences.filter((s) => {
      const lower = s.toLowerCase();
      for (const word of ACTION_WORDS) {
        if (lower.includes(word)) return true;
      }
      return false;
    });
  }

  compact(
    groupId: string,
    sessionId: string,
    messages: MessageInput[],
  ): CompactionResult {
    const validated = messages.map((m) => MessageInputSchema.parse(m));

    const allContent = validated.map((m) => m.content).join(' ');
    const tokensBefore = this.estimateTokens(allContent);

    const summary = this.summarize(validated);
    const keyFacts = this.extractFacts(summary);

    const tokensAfter = this.estimateTokens(summary);
    const reductionPercent =
      tokensBefore > 0
        ? Math.round(((tokensBefore - tokensAfter) / tokensBefore) * 100)
        : 0;

    this.storeSessionSummary(sessionId, summary, keyFacts, tokensAfter);

    this.db.insertSession({
      id: sessionId,
      group_id: groupId,
      summary,
      key_facts: encode('facts', { items: keyFacts }),
      token_count: tokensAfter,
      started_at: Math.floor(Date.now() / 1000),
    });

    return {
      summary,
      keyFacts,
      messagesCompacted: validated.length,
      tokensBefore,
      tokensAfter,
      reductionPercent,
    };
  }

  storeSessionSummary(
    sessionId: string,
    summary: string,
    keyFacts: string[],
    tokenCount: number,
  ): void {
    const chunkId = `compaction-${sessionId}-${crypto.randomUUID()}`;
    const storedContent = encode('session-summary', {
      sessionId,
      summary,
      keyFacts,
      tokenCount,
    });
    this.db.insertMemoryChunk(chunkId, storedContent, sessionId, 'compaction');
  }

  getLatestSummary(
    groupId: string,
  ): { summary: string; keyFacts: string[] } | null {
    const session = this.db.getLatestSession(groupId);
    if (!session || !session.summary) return null;

    const keyFactsRaw = session.key_facts;
    let keyFacts: string[] = [];

    if (keyFactsRaw) {
      const itemsMatch = /items:\[([^\]]*)\]/m.exec(keyFactsRaw);
      if (itemsMatch && itemsMatch[1]) {
        keyFacts = itemsMatch[1]
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
      }
    }

    return { summary: session.summary, keyFacts };
  }
}

export { Compactor };
export type { CompactionResult, MessageInput };
export { MessageInputSchema };
