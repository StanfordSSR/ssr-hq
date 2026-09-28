import { describe, expect, it } from 'vitest';
import type { NextRequest } from 'next/server';
import { POST as revealCard } from '@/app/api/credit-card/reveal/route';
import { POST as firstViewed } from '@/app/api/credit-card/first-viewed/route';
import { POST as screenshotSignal } from '@/app/api/credit-card/screenshot-signal/route';
import {
  approveCardRegion,
  canAccessCard,
  deleteCreditCard,
  evaluateCardViewGate,
  getDecryptedCard,
  markCardFirstViewed,
  recordCardViewSignature,
  setCardGrant,
  setCreditCard
} from '@/lib/credit-card';
import { CREDIT_CARD_ENABLED, CREDIT_CARD_PAUSED_MESSAGE } from '@/lib/credit-card-status';

describe('temporary credit card pause', () => {
  it('blocks the reveal and audit endpoints before authentication or database access', async () => {
    expect(CREDIT_CARD_ENABLED).toBe(false);
    const responses = await Promise.all([
      revealCard({} as NextRequest),
      firstViewed(),
      screenshotSignal({} as NextRequest)
    ]);

    for (const response of responses) {
      expect(response.status).toBe(503);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(await response.json()).toEqual({ error: CREDIT_CARD_PAUSED_MESSAGE });
    }
  });

  it('denies card access and decryption without touching stored data', async () => {
    expect(await canAccessCard('test-user')).toBe(false);
    expect(await evaluateCardViewGate('test-user', new Headers())).toEqual({ state: 'no_access' });
    await expect(getDecryptedCard()).rejects.toThrow(CREDIT_CARD_PAUSED_MESSAGE);
  });

  it('blocks card and approval state changes', async () => {
    await expect(
      setCreditCard(
        { number: '4111111111111111', expiry: '08/29', cvv: '123', cardholder: 'Test' },
        '',
        'test-user'
      )
    ).rejects.toThrow(CREDIT_CARD_PAUSED_MESSAGE);
    await expect(deleteCreditCard()).rejects.toThrow(CREDIT_CARD_PAUSED_MESSAGE);
    await expect(setCardGrant('test-user', true, 'admin')).rejects.toThrow(CREDIT_CARD_PAUSED_MESSAGE);
    await expect(recordCardViewSignature('test-user', 'US-CA', 'US')).rejects.toThrow(CREDIT_CARD_PAUSED_MESSAGE);
    await expect(markCardFirstViewed('test-user')).rejects.toThrow(CREDIT_CARD_PAUSED_MESSAGE);
    await expect(approveCardRegion('test-user', 'US-CA', 'admin')).rejects.toThrow(CREDIT_CARD_PAUSED_MESSAGE);
  });
});
