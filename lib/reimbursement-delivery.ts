export type DeliveryStatus = 'untracked' | 'pending' | 'delivered' | 'partial' | 'failed' | 'unknown';
export type DeliveryResult = { email: string; ok: boolean; error?: string };

export function normalizeRecipientEmails(emails: string[]) {
  return [...new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean))];
}

export function parseDeliveryAck(value: unknown, key: string, recipients: string[]): DeliveryResult[] | null {
  if (!value || typeof value !== 'object') return null;
  const response = value as Record<string, unknown>;
  if (response.idempotency_key !== key || response.type !== 'reimbursement_approval' || !Array.isArray(response.results)) {
    return null;
  }

  const expected = new Set(recipients);
  const results: DeliveryResult[] = [];
  for (const entry of response.results) {
    if (!entry || typeof entry !== 'object') return null;
    const row = entry as Record<string, unknown>;
    if (typeof row.email !== 'string' || typeof row.ok !== 'boolean') return null;
    const email = row.email.trim().toLowerCase();
    if (!expected.delete(email)) return null;
    results.push({ email, ok: row.ok, ...(typeof row.error === 'string' ? { error: row.error } : {}) });
  }

  const delivered = results.filter((result) => result.ok).length;
  if (expected.size || response.delivered !== delivered || response.failed !== results.length - delivered || response.ok !== (delivered === results.length)) {
    return null;
  }
  return results;
}

export function mergeDeliveryResults(recipients: string[], previous: DeliveryResult[], current: DeliveryResult[]) {
  const prior = new Map(previous.filter((result) => result.ok).map((result) => [result.email, result]));
  const latest = new Map(current.map((result) => [result.email, result]));
  return recipients.map((email) => prior.get(email) || latest.get(email) || { email, ok: false, error: 'Not attempted' });
}

export function deliveryStatus(results: DeliveryResult[]): DeliveryStatus {
  if (results.length > 0 && results.every((result) => result.ok)) return 'delivered';
  return results.some((result) => result.ok) ? 'partial' : 'failed';
}
