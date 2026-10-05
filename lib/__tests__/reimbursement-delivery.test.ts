import { describe, expect, it } from 'vitest';
import {
  deliveryStatus,
  mergeDeliveryResults,
  normalizeRecipientEmails,
  parseDeliveryAck
} from '@/lib/reimbursement-delivery';

const key = 'reimbursement_approval:example';
const recipients = ['lead@stanford.edu', 'colead@stanford.edu'];

describe('reimbursement delivery acknowledgements', () => {
  it('deduplicates reviewer emails', () => {
    expect(normalizeRecipientEmails([' LEAD@stanford.edu ', 'lead@stanford.edu', '', 'colead@stanford.edu']))
      .toEqual(recipients);
  });

  it('accepts a complete per-recipient acknowledgement, including partial failure', () => {
    const ack = {
      ok: false,
      idempotency_key: key,
      type: 'reimbursement_approval',
      delivered: 1,
      failed: 1,
      results: [
        { email: recipients[0], ok: true },
        { email: recipients[1], ok: false, error: 'Slack user not found' }
      ]
    };
    expect(parseDeliveryAck(ack, key, recipients)).toEqual(ack.results);
    expect(deliveryStatus(ack.results)).toBe('partial');
  });

  it('rejects incomplete or misleading acknowledgements', () => {
    const base = {
      ok: true,
      idempotency_key: key,
      type: 'reimbursement_approval',
      delivered: 2,
      failed: 0,
      results: recipients.map((email) => ({ email, ok: true }))
    };
    expect(parseDeliveryAck({ ...base, results: base.results.slice(0, 1) }, key, recipients)).toBeNull();
    expect(parseDeliveryAck({ ...base, delivered: 1 }, key, recipients)).toBeNull();
    expect(parseDeliveryAck({ ...base, idempotency_key: 'wrong' }, key, recipients)).toBeNull();
    expect(parseDeliveryAck({ ...base, results: [base.results[0], base.results[0]] }, key, recipients)).toBeNull();
  });

  it('keeps confirmed recipients successful across retries', () => {
    const merged = mergeDeliveryResults(recipients,
      [{ email: recipients[0], ok: true }, { email: recipients[1], ok: false }],
      [{ email: recipients[1], ok: true }]
    );
    expect(merged).toEqual(recipients.map((email) => ({ email, ok: true })));
    expect(deliveryStatus(merged)).toBe('delivered');
  });
});
