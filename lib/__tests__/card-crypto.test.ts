import { describe, it, expect } from 'vitest';

// A fixed, deterministic 32-byte key (base64) so the test does not depend on a
// real secret. Must be set BEFORE importing lib/card-crypto (which reads the
// key through lib/env at module load time via getKey()).
process.env.CARD_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

const { encryptCard, decryptCard, cardConfigured } = await import('@/lib/card-crypto');

const SAMPLE_CARD = JSON.stringify({
  number: '4242424242424242',
  expiry: '08/29',
  cvv: '123',
  cardholder: 'Stanford Student Robotics'
});

describe('card-crypto', () => {
  it('round-trips encrypt/decrypt back to the original plaintext', () => {
    expect(decryptCard(encryptCard(SAMPLE_CARD))).toBe(SAMPLE_CARD);
  });

  it('produces a different ciphertext each time (random IV)', () => {
    const a = encryptCard(SAMPLE_CARD);
    const b = encryptCard(SAMPLE_CARD);
    expect(a).not.toBe(b);
    // Both still decrypt to the same plaintext.
    expect(decryptCard(a)).toBe(SAMPLE_CARD);
    expect(decryptCard(b)).toBe(SAMPLE_CARD);
  });

  it('reports that the card is configured when a valid key is present', () => {
    expect(cardConfigured()).toBe(true);
  });
});
