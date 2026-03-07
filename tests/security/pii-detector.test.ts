import { describe, it, expect } from 'vitest';
import { PiiDetector } from '../../src/security/pii-detector.js';

describe('PiiDetector', () => {
  const detector = new PiiDetector();

  it('detects and redacts valid credit card numbers (Luhn)', () => {
    const result = detector.scan('My card is 4111111111111111 please charge it');
    expect(result.hasPII).toBe(true);
    expect(result.detections).toHaveLength(1);
    expect(result.detections[0]!.type).toBe('credit_card');
    expect(result.detections[0]!.value).toBe('4111111111111111');
    expect(result.redacted).toBe('My card is [REDACTED:CREDIT_CARD] please charge it');
  });

  it('does not detect credit card numbers that fail Luhn', () => {
    const cards = detector.detectCreditCards('Not a card: 4111111111111112');
    expect(cards).toHaveLength(0);
  });

  it('detects formatted credit card with dashes', () => {
    const cards = detector.detectCreditCards('Card: 4111-1111-1111-1111');
    expect(cards).toHaveLength(1);
    expect(cards[0]).toBe('4111-1111-1111-1111');
  });

  it('detects SSN patterns (123-45-6789)', () => {
    const result = detector.scan('SSN is 123-45-6789 on file');
    expect(result.hasPII).toBe(true);
    expect(result.detections).toHaveLength(1);
    expect(result.detections[0]!.type).toBe('ssn');
    expect(result.detections[0]!.value).toBe('123-45-6789');
    expect(result.redacted).toBe('SSN is [REDACTED:SSN] on file');
  });

  it('detects email addresses', () => {
    const result = detector.scan('Contact me at user@example.com for info');
    expect(result.hasPII).toBe(true);
    expect(result.detections[0]!.type).toBe('email');
    expect(result.detections[0]!.value).toBe('user@example.com');
    expect(result.redacted).toBe('Contact me at [REDACTED:EMAIL] for info');
  });

  it('detects phone numbers', () => {
    const result = detector.scan('Call me at (555) 123-4567 anytime');
    expect(result.hasPII).toBe(true);
    expect(result.detections[0]!.type).toBe('phone');
    expect(result.redacted).toContain('[REDACTED:PHONE]');
  });

  it('detects API keys (sk-...)', () => {
    const key = 'sk-proj1234567890abcdefghijklmn';
    const result = detector.scan(`My key is ${key} keep it safe`);
    expect(result.hasPII).toBe(true);
    expect(result.detections[0]!.type).toBe('api_key');
    expect(result.redacted).toContain('[REDACTED:API_KEY]');
  });

  it('detects Bearer tokens', () => {
    const keys = detector.detectApiKeys('Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abcdefghij');
    expect(keys.length).toBeGreaterThanOrEqual(1);
  });

  it('leaves normal text unchanged', () => {
    const result = detector.scan('Hello, how are you doing today?');
    expect(result.hasPII).toBe(false);
    expect(result.redacted).toBe('Hello, how are you doing today?');
    expect(result.detections).toHaveLength(0);
  });

  it('detects multiple PII types in one message', () => {
    const result = detector.scan(
      'Email: user@example.com, SSN: 123-45-6789, Card: 4111111111111111',
    );
    expect(result.hasPII).toBe(true);
    expect(result.detections.length).toBeGreaterThanOrEqual(3);

    const types = result.detections.map((d) => d.type);
    expect(types).toContain('email');
    expect(types).toContain('ssn');
    expect(types).toContain('credit_card');
  });

  it('produces correct redacted output format', () => {
    const result = detector.scan('SSN: 123-45-6789');
    expect(result.redacted).toBe('SSN: [REDACTED:SSN]');
  });

  it('returns no detections for empty input', () => {
    const result = detector.scan('');
    expect(result.hasPII).toBe(false);
    expect(result.detections).toHaveLength(0);
    expect(result.redacted).toBe('');
  });

  it('detects credit cards with spaces', () => {
    const cards = detector.detectCreditCards('Card: 4111 1111 1111 1111');
    expect(cards).toHaveLength(1);
    expect(cards[0]).toBe('4111 1111 1111 1111');
  });
});
