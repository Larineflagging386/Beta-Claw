import {
  randomBytes,
  pbkdf2Sync,
  createCipheriv,
  createDecipheriv,
} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const PBKDF2_ITERATIONS = 100_000;
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const ALGORITHM = 'aes-256-gcm';

const SecretStoreSchema = z.record(z.string(), z.string());

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');
}

function encrypt(plaintext: Buffer, key: Buffer): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]);
}

function decrypt(ciphertext: Buffer, key: Buffer): Buffer {
  const iv = ciphertext.subarray(0, IV_LENGTH);
  const authTag = ciphertext.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = ciphertext.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

class Vault {
  private readonly vaultDir: string;
  private readonly saltPath: string;
  private readonly encPath: string;
  private derivedKey: Buffer | null = null;

  constructor(vaultDir?: string) {
    this.vaultDir = vaultDir ?? '.micro';
    this.saltPath = path.join(this.vaultDir, 'vault.salt');
    this.encPath = path.join(this.vaultDir, 'vault.enc');
  }

  init(passphrase: string): void {
    if (this.isInitialized()) {
      throw new Error('Vault already initialized');
    }
    fs.mkdirSync(this.vaultDir, { recursive: true });

    const salt = randomBytes(SALT_LENGTH);
    fs.writeFileSync(this.saltPath, salt);

    const key = deriveKey(passphrase, salt);
    this.derivedKey = key;

    const emptyStore: Record<string, string> = {};
    this.writeStore(emptyStore);
  }

  unlock(passphrase: string): void {
    if (!this.isInitialized()) {
      throw new Error('Vault not initialized');
    }

    const salt = fs.readFileSync(this.saltPath);
    const key = deriveKey(passphrase, Buffer.from(salt));

    const ciphertext = fs.readFileSync(this.encPath);
    try {
      const plainBuf = decrypt(Buffer.from(ciphertext), key);
      SecretStoreSchema.parse(JSON.parse(plainBuf.toString('utf8')));
      plainBuf.fill(0);
    } catch {
      throw new Error('Failed to unlock vault: wrong passphrase or corrupted data');
    }

    this.derivedKey = key;
  }

  setSecret(name: string, value: string): void {
    this.ensureUnlocked();
    const store = this.readStore();
    store[name] = value;
    this.writeStore(store);
  }

  getSecret(name: string): string {
    this.ensureUnlocked();
    const store = this.readStore();
    const value = store[name];
    if (value === undefined) {
      throw new Error(`Secret '${name}' not found`);
    }
    return value;
  }

  removeSecret(name: string): void {
    this.ensureUnlocked();
    const store = this.readStore();
    if (!(name in store)) {
      throw new Error(`Secret '${name}' not found`);
    }
    delete store[name];
    this.writeStore(store);
  }

  listSecretNames(): string[] {
    this.ensureUnlocked();
    const store = this.readStore();
    return Object.keys(store);
  }

  rotate(oldPassphrase: string, newPassphrase: string): void {
    if (!this.isInitialized()) {
      throw new Error('Vault not initialized');
    }

    const salt = fs.readFileSync(this.saltPath);
    const oldKey = deriveKey(oldPassphrase, Buffer.from(salt));

    const ciphertext = fs.readFileSync(this.encPath);
    let plainBuf: Buffer;
    try {
      plainBuf = decrypt(Buffer.from(ciphertext), oldKey);
    } catch {
      oldKey.fill(0);
      throw new Error('Failed to rotate: wrong old passphrase');
    }
    oldKey.fill(0);

    const store = SecretStoreSchema.parse(JSON.parse(plainBuf.toString('utf8')));
    plainBuf.fill(0);

    const newSalt = randomBytes(SALT_LENGTH);
    fs.writeFileSync(this.saltPath, newSalt);

    const newKey = deriveKey(newPassphrase, newSalt);
    this.derivedKey = newKey;

    this.writeStore(store);
  }

  isInitialized(): boolean {
    return fs.existsSync(this.saltPath) && fs.existsSync(this.encPath);
  }

  isUnlocked(): boolean {
    return this.derivedKey !== null;
  }

  private ensureUnlocked(): void {
    if (!this.derivedKey) {
      throw new Error('Vault is locked');
    }
  }

  private readStore(): Record<string, string> {
    const ciphertext = fs.readFileSync(this.encPath);
    const plainBuf = decrypt(Buffer.from(ciphertext), this.derivedKey!);
    const store = SecretStoreSchema.parse(JSON.parse(plainBuf.toString('utf8')));
    plainBuf.fill(0);
    return store;
  }

  private writeStore(store: Record<string, string>): void {
    const json = JSON.stringify(store);
    const plainBuf = Buffer.from(json, 'utf8');
    const ciphertext = encrypt(plainBuf, this.derivedKey!);
    plainBuf.fill(0);
    fs.writeFileSync(this.encPath, ciphertext);
  }
}

export { Vault };
