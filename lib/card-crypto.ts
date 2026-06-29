import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import { env } from '@/lib/env';

function getKey(): Buffer {
  const raw = env.cardEncryptionKey;
  if (!raw) throw new Error('Card storage is not configured (missing CARD_ENCRYPTION_KEY).');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('CARD_ENCRYPTION_KEY must be base64 of 32 bytes.');
  return key;
}

export function encryptCard(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

export function decryptCard(blob: string): string {
  const data = Buffer.from(blob, 'base64');
  const iv = data.subarray(0, 12);
  const tag = data.subarray(12, 28);
  const ciphertext = data.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

export function cardConfigured(): boolean {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}
