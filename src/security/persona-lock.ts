import { createHash } from 'node:crypto';
import { z } from 'zod';

const PersonaConfigSchema = z.object({
  name: z.string().min(1),
  tone: z.string().min(1),
  language: z.string().min(1),
  neverDo: z.array(z.string()),
  alwaysDo: z.array(z.string()),
});

type PersonaConfig = z.infer<typeof PersonaConfigSchema>;

interface DriftCheckResult {
  drifted: boolean;
  similarity: number;
  regenerate: boolean;
}

class PersonaLock {
  private readonly config: PersonaConfig;
  private readonly threshold: number;
  private readonly keywords: Set<string>;

  constructor(config: PersonaConfig, threshold?: number) {
    this.config = PersonaConfigSchema.parse(config);
    this.threshold = threshold ?? 0.7;
    this.keywords = this.extractKeywords();
  }

  getHash(): string {
    const canonical = JSON.stringify(this.config, Object.keys(this.config).sort());
    return createHash('sha256').update(canonical).digest('hex');
  }

  verify(hash: string): boolean {
    return this.getHash() === hash;
  }

  generateBlock(): string {
    const lines: string[] = [
      `[PERSONA:${this.config.name}]`,
      `Tone: ${this.config.tone}`,
      `Language: ${this.config.language}`,
    ];

    if (this.config.alwaysDo.length > 0) {
      lines.push('ALWAYS:');
      for (const rule of this.config.alwaysDo) {
        lines.push(`  - ${rule}`);
      }
    }

    if (this.config.neverDo.length > 0) {
      lines.push('NEVER:');
      for (const rule of this.config.neverDo) {
        lines.push(`  - ${rule}`);
      }
    }

    lines.push(`[/PERSONA]`);
    return lines.join('\n');
  }

  checkDrift(output: string): DriftCheckResult {
    const outputWords = new Set(
      output
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter((w) => w.length > 2),
    );

    if (this.keywords.size === 0) {
      return { drifted: false, similarity: 1, regenerate: false };
    }

    let matches = 0;
    for (const kw of this.keywords) {
      if (outputWords.has(kw)) {
        matches++;
      }
    }

    const similarity = matches / this.keywords.size;
    const drifted = similarity < this.threshold;
    const regenerate = drifted;

    return { drifted, similarity, regenerate };
  }

  getConfig(): PersonaConfig {
    return { ...this.config };
  }

  private extractKeywords(): Set<string> {
    const sources = [
      this.config.name,
      this.config.tone,
      this.config.language,
      ...this.config.alwaysDo,
      ...this.config.neverDo,
    ];

    const words = new Set<string>();
    for (const source of sources) {
      const tokens = source
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter((w) => w.length > 2);
      for (const token of tokens) {
        words.add(token);
      }
    }
    return words;
  }
}

export { PersonaLock, PersonaConfigSchema };
export type { PersonaConfig, DriftCheckResult };
