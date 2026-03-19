import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase-admin';
import { getReceiptLinks } from '@/lib/receipt-workflow';
import { formatDateLabel } from '@/lib/academic-calendar';
import { getViewerContext } from '@/lib/auth';

type Team = {
  id: string;
  name: string;
};

type ReceiptPurchase = {
  id: string;
  team_id: string;
  description: string;
  amount_cents: number;
  purchased_at: string;
  receipt_path: string | null;
};

function readSingle(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || '' : value || '';
}

function getPacificNow() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === 'year')?.value || '0');
  const month = Number(parts.find((part) => part.type === 'month')?.value || '1');
  const day = Number(parts.find((part) => part.type === 'day')?.value || '1');
  return { year, month, day };
}

function getLastCompleteMonthValue() {
  const now = getPacificNow();
  const month = now.month === 1 ? 12 : now.month - 1;
  const year = now.month === 1 ? now.year - 1 : now.year;
  return `${year}-${String(month).padStart(2, '0')}`;
}

function getMonthRange(monthValue: string) {
  const match = monthValue.match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const start = new Date(Date.UTC(year, monthIndex, 1));
  const end = new Date(Date.UTC(year, monthIndex + 1, 0, 23, 59, 59, 999));

  return { start, end };
}

function formatMonthLabel(monthValue: string) {
  const range = getMonthRange(monthValue);
  if (!range) {
    return monthValue;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Los_Angeles'
  }).format(range.start);
}

function buildQueryString(current: Record<string, string>, updates: Record<string, string>) {
  const params = new URLSearchParams(current);

  for (const [key, value] of Object.entries(updates)) {
    if (!value) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
  }

  return params.toString();
}

export default async function ReceiptsPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) || {};
  const admin = createAdminClient();
  const { currentRole } = await getViewerContext();
  const canView = currentRole === 'admin' || currentRole === 'president' || currentRole === 'financial_officer';

  if (!canView) {
    redirect('/dashboard');
  }

  const selectedMonth = readSingle(params.month) || getLastCompleteMonthValue();
  const selectedSort = readSingle(params.sort) === 'amount' ? 'amount' : 'chronological';
  const monthRange = getMonthRange(selectedMonth);

  if (!monthRange) {
    redirect('/dashboard/receipts');
  }

  const [{ data: teamsData }, { data: purchasesData }] = await Promise.all([
    admin.from('teams').select('id, name').eq('is_active', true).order('name'),
    admin
      .from('purchase_logs')
      .select('id, team_id, description, amount_cents, purchased_at, receipt_path')
      .not('receipt_path', 'is', null)
      .gte('purchased_at', monthRange.start.toISOString())
      .lte('purchased_at', monthRange.end.toISOString())
  ]);

  const teams = (teamsData || []) as Team[];
  const teamNameMap = new Map(teams.map((team) => [team.id, team.name]));
  const purchases = ((purchasesData || []) as ReceiptPurchase[])
    .filter((purchase) => Boolean(purchase.receipt_path))
    .sort((a, b) => {
      if (selectedSort === 'amount') {
        return b.amount_cents - a.amount_cents;
      }

      return new Date(b.purchased_at).getTime() - new Date(a.purchased_at).getTime();
    });

  const receiptLinks = await getReceiptLinks(purchases.map((purchase) => purchase.receipt_path));
  const currentParams = {
    month: selectedMonth,
    sort: selectedSort
  };

  return (
    <div className="hq-page">
      <section className="hq-page-head">
        <div className="hq-page-head-copy">
          <p className="hq-eyebrow">
            {currentRole === 'admin' ? 'Admin' : currentRole === 'president' ? 'President' : 'Financial officer'}
          </p>
          <h1 className="hq-page-title">Receipts</h1>
          <p className="hq-subtitle">
            Review receipt-backed purchases from the most recently completed month, or switch months and sorting below.
          </p>
        </div>
      </section>

      <section className="hq-panel hq-surface-muted">
        <div className="hq-block-head">
          <h3>{formatMonthLabel(selectedMonth)}</h3>
          <span className="hq-inline-note">{purchases.length} receipt-backed purchases</span>
        </div>

        <form method="get" className="hq-finance-filter-row">
          <div className="field">
            <label className="label" htmlFor="receipts-month">
              Month
            </label>
            <input className="input" id="receipts-month" name="month" type="month" defaultValue={selectedMonth} />
          </div>

          <div className="field">
            <label className="label" htmlFor="receipts-sort">
              Sort by
            </label>
            <select className="select" id="receipts-sort" name="sort" defaultValue={selectedSort}>
              <option value="chronological">Chronological</option>
              <option value="amount">Amount</option>
            </select>
          </div>

          <div className="button-row">
            <button className="button-secondary" type="submit">
              Apply
            </button>
          </div>
        </form>

        {purchases.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Item</th>
                  <th>Amount</th>
                  <th>Team</th>
                  <th>Receipt</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((purchase) => (
                  <tr key={purchase.id}>
                    <td>{formatDateLabel(new Date(purchase.purchased_at))}</td>
                    <td style={{ fontWeight: 700 }}>{purchase.description}</td>
                    <td>${(purchase.amount_cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td>{teamNameMap.get(purchase.team_id) || 'Unknown team'}</td>
                    <td>
                      {purchase.receipt_path && receiptLinks.get(purchase.receipt_path) ? (
                        <Link href={receiptLinks.get(purchase.receipt_path)!} target="_blank">
                          View receipt
                        </Link>
                      ) : (
                        'Receipt unavailable'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-note">No receipt-backed purchases were logged for {formatMonthLabel(selectedMonth)}.</p>
        )}

        <div className="hq-pagination hq-receipts-jump">
          <Link href={`/dashboard/receipts?${buildQueryString(currentParams, { month: getLastCompleteMonthValue() })}`}>
            Jump to last completed month
          </Link>
        </div>
      </section>
    </div>
  );
}
