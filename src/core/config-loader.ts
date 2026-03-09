import fs from 'node:fs';
import path from 'node:path';
import { decode } from './toon-serializer.js';

export interface betaclawConfig {
  version: string;
  profile: 'micro' | 'lite' | 'standard' | 'full';
  executionMode: 'isolated' | 'full_control';
  triggerWord: string;
  persona: string;
  personaStyle: 'concise' | 'detailed' | 'technical' | 'casual';
  provider: string;
  cliEnabled: boolean;
  httpEnabled: boolean;
  httpPort: number;
  vaultEnabled: boolean;
  piiRedaction: boolean;
  injectionDetection: boolean;
  personaLock: boolean;
  maxWorkingTokens: number;
  summarizeThreshold: number;
  ragChunkSize: number;
  ragChunkOverlap: number;
}

const DEFAULTS: betaclawConfig = {
  version: '2.0.0',
  profile: 'standard',
  executionMode: 'isolated',
  triggerWord: '@rem',
  persona: 'rem',
  personaStyle: 'concise',
  provider: '',
  cliEnabled: true,
  httpEnabled: false,
  httpPort: 3210,
  vaultEnabled: false,
  piiRedaction: true,
  injectionDetection: true,
  personaLock: true,
  maxWorkingTokens: 8192,
  summarizeThreshold: 0.85,
  ragChunkSize: 500,
  ragChunkOverlap: 50,
};

type ToonRecord = Record<string, unknown>;

function nested(val: unknown): ToonRecord {
  if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
    return val as ToonRecord;
  }
  return {};
}

function toBool(val: unknown, fallback: boolean): boolean {
  if (val === true || val === 'true') return true;
  if (val === false || val === 'false') return false;
  return fallback;
}

let _config: betaclawConfig | null = null;

export function loadConfig(configPath?: string): betaclawConfig {
  const filePath = configPath ?? path.join(process.cwd(), '.beta', 'config.toon');
  if (!fs.existsSync(filePath)) return { ...DEFAULTS };

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = decode<ToonRecord>(raw);
    const d = parsed.data;

    const persona = nested(d['persona']);
    const channels = nested(d['channels']);
    const cli = nested(channels['cli']);
    const http = nested(channels['http']);
    const security = nested(d['security']);
    const memory = nested(d['memory']);

    return {
      version:            String(d['version'] ?? DEFAULTS.version),
      profile:            (d['profile'] as betaclawConfig['profile']) ?? DEFAULTS.profile,
      executionMode:      (d['executionMode'] as betaclawConfig['executionMode']) ?? DEFAULTS.executionMode,
      triggerWord:        String(d['triggerWord'] ?? DEFAULTS.triggerWord),
      persona:            String(persona['name'] ?? DEFAULTS.persona),
      personaStyle:       (persona['style'] as betaclawConfig['personaStyle']) ?? DEFAULTS.personaStyle,
      provider:           String(d['provider'] ?? DEFAULTS.provider),
      cliEnabled:         toBool(cli['enabled'], DEFAULTS.cliEnabled),
      httpEnabled:        toBool(http['enabled'], DEFAULTS.httpEnabled),
      httpPort:           Number(http['port'] ?? DEFAULTS.httpPort),
      vaultEnabled:       toBool(security['vaultEnabled'], DEFAULTS.vaultEnabled),
      piiRedaction:       toBool(security['piiRedaction'], DEFAULTS.piiRedaction),
      injectionDetection: toBool(security['injectionDetection'], DEFAULTS.injectionDetection),
      personaLock:        toBool(security['personaLock'], DEFAULTS.personaLock),
      maxWorkingTokens:   Number(memory['maxWorkingTokens'] ?? DEFAULTS.maxWorkingTokens),
      summarizeThreshold: Number(memory['summarizeThreshold'] ?? DEFAULTS.summarizeThreshold),
      ragChunkSize:       Number(memory['ragChunkSize'] ?? DEFAULTS.ragChunkSize),
      ragChunkOverlap:    Number(memory['ragChunkOverlap'] ?? DEFAULTS.ragChunkOverlap),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function getConfig(): betaclawConfig {
  if (!_config) _config = loadConfig();
  return _config;
}

export function reloadConfig(): betaclawConfig {
  _config = loadConfig();
  return _config;
}
