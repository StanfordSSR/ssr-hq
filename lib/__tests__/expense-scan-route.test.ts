import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/expense/scan/route';
import { getViewerContext } from '@/lib/auth';
import { getLeadTeamIds } from '@/lib/lead-state';
import { extractReceiptFields } from '@/lib/openai-receipt';

vi.mock('@/lib/auth', () => ({ getViewerContext: vi.fn() }));
vi.mock('@/lib/lead-state', () => ({ getLeadTeamIds: vi.fn() }));
vi.mock('@/lib/env', () => ({ env: { openaiApiKey: 'test-key' } }));
vi.mock('@/lib/openai-receipt', () => ({
  extractReceiptFields: vi.fn(),
  isSupportedReceiptUpload: (type: string) => type === 'image/png',
  RECEIPT_EXTRACT_MAX_BYTES: 6 * 1024 * 1024
}));

function scanRequest(teamId: string) {
  const body = new FormData();
  body.set('team_id', teamId);
  body.set('image', new File(['receipt'], 'receipt.png', { type: 'image/png' }));
  return new NextRequest('http://localhost/api/expense/scan', { method: 'POST', body });
}

describe('expense receipt scan access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getViewerContext).mockResolvedValue({ currentRole: 'team_lead', user: { id: 'lead-1' } } as Awaited<ReturnType<typeof getViewerContext>>);
    vi.mocked(getLeadTeamIds).mockResolvedValue(['my-team']);
    vi.mocked(extractReceiptFields).mockResolvedValue({ itemName: 'Part', amount: 12, merchant: null, reimbursementNumber: null, category: 'equipment', purchasedAt: '2026-10-11' });
  });

  it('rejects a lead scanning for a team they do not lead', async () => {
    const response = await POST(scanRequest('another-team'));
    expect(response.status).toBe(403);
    expect(extractReceiptFields).not.toHaveBeenCalled();
  });

  it('lets an active lead scan for their team', async () => {
    const response = await POST(scanRequest('my-team'));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ itemName: 'Part', category: 'equipment', purchasedAt: '2026-10-11' });
  });
});
