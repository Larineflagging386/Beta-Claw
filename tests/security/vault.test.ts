import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Vault } from '../../src/security/vault.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

function tmpVaultDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'betaclaw-vault-test-'));
}

describe('Vault', () => {
  let vaultDir: string;
  let vault: Vault;

  beforeEach(() => {
    vaultDir = tmpVaultDir();
    vault = new Vault(vaultDir);
  });

  afterEach(() => {
    fs.rmSync(vaultDir, { recursive: true, force: true });
  });

  it('init creates vault files', () => {
    vault.init('test-passphrase');
    expect(fs.existsSync(path.join(vaultDir, 'vault.salt'))).toBe(true);
    expect(fs.existsSync(path.join(vaultDir, 'vault.enc'))).toBe(true);
  });

  it('set and get a secret round-trips correctly', () => {
    vault.init('passphrase');
    vault.setSecret('API_KEY', 'sk-abc123');
    const value = vault.getSecret('API_KEY');
    expect(value).toBe('sk-abc123');
  });

  it('get nonexistent secret throws', () => {
    vault.init('passphrase');
    expect(() => vault.getSecret('MISSING')).toThrow("Secret 'MISSING' not found");
  });

  it('remove secret deletes it from the store', () => {
    vault.init('passphrase');
    vault.setSecret('TO_DELETE', 'value');
    vault.removeSecret('TO_DELETE');
    expect(() => vault.getSecret('TO_DELETE')).toThrow("Secret 'TO_DELETE' not found");
  });

  it('list secret names returns names but not values', () => {
    vault.init('passphrase');
    vault.setSecret('KEY_A', 'val_a');
    vault.setSecret('KEY_B', 'val_b');
    const names = vault.listSecretNames();
    expect(names).toContain('KEY_A');
    expect(names).toContain('KEY_B');
    expect(names).not.toContain('val_a');
    expect(names).not.toContain('val_b');
  });

  it('rotate changes passphrase and re-encrypts', () => {
    vault.init('old-pass');
    vault.setSecret('PERSIST', 'should-survive');
    vault.rotate('old-pass', 'new-pass');

    const vault2 = new Vault(vaultDir);
    vault2.unlock('new-pass');
    expect(vault2.getSecret('PERSIST')).toBe('should-survive');
  });

  it('wrong passphrase fails to unlock', () => {
    vault.init('correct-pass');
    vault.setSecret('SECRET', 'hidden');

    const vault2 = new Vault(vaultDir);
    expect(() => vault2.unlock('wrong-pass')).toThrow();
  });

  it('isInitialized returns false before init, true after', () => {
    expect(vault.isInitialized()).toBe(false);
    vault.init('passphrase');
    expect(vault.isInitialized()).toBe(true);
  });

  it('isUnlocked returns false before unlock, true after init', () => {
    expect(vault.isUnlocked()).toBe(false);
    vault.init('passphrase');
    expect(vault.isUnlocked()).toBe(true);
  });

  it('unlock sets unlocked state on a fresh instance', () => {
    vault.init('passphrase');

    const vault2 = new Vault(vaultDir);
    expect(vault2.isUnlocked()).toBe(false);
    vault2.unlock('passphrase');
    expect(vault2.isUnlocked()).toBe(true);
  });

  it('init throws if already initialized', () => {
    vault.init('passphrase');
    expect(() => vault.init('passphrase')).toThrow('Vault already initialized');
  });

  it('setSecret throws when vault is locked', () => {
    vault.init('passphrase');
    const locked = new Vault(vaultDir);
    expect(() => locked.setSecret('X', 'Y')).toThrow('Vault is locked');
  });
});
