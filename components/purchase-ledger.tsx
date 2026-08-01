'use client';

import { useMemo, useState } from 'react';

export type PurchaseLedgerRow = {
  id: string;
  teamName: string;
  description: string;
  amountCents: number;
  purchasedAt: string;
  personName: string;
  paymentMethod: 'reimbursement' | 'credit_card' | 'amazon' | 'unknown';
  category: 'equipment' | 'food' | 'travel' | 'registration';
};

const paymentMethodLabel: Record<PurchaseLedgerRow['paymentMethod'], string> = {
  credit_card: 'Credit card',
  amazon: 'Amazon',
  reimbursement: 'Reimbursement',
  unknown: 'Unknown'
};

const categoryLabel: Record<PurchaseLedgerRow['category'], string> = {
  equipment: 'Equipment',
  food: 'Food',
  travel: 'Travel',
  registration: 'Registration'
};

type SortKey = 'purchasedAt' | 'teamName' | 'description' | 'amountCents' | 'personName' | 'paymentMethod' | 'category';

function money(cents: number) {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Compact, sortable, scrollable ledger of every purchase in the current
// selection. Defaults to newest first; clicking a column header sorts by it
// (clicking the active column flips the direction).
export function PurchaseLedger({
  rows,
  showTeam,
  title = 'All purchases',
  subtitle
}: {
  rows: PurchaseLedgerRow[];
  showTeam: boolean;
  title?: string;
  subtitle?: string;
}) {
  const [sortKey, setSortKey] = useState<SortKey>('purchasedAt');
  const [ascending, setAscending] = useState(false);

  const columns = useMemo(
    () =>
      (
        [
          { key: 'purchasedAt', label: 'Date', numeric: false },
          showTeam ? { key: 'teamName', label: 'Team', numeric: false } : null,
          { key: 'description', label: 'Item', numeric: false },
          { key: 'amountCents', label: 'Amount', numeric: true },
          { key: 'personName', label: 'Person', numeric: false },
          { key: 'paymentMethod', label: 'Method', numeric: false },
          { key: 'category', label: 'Category', numeric: false }
        ] as Array<{ key: SortKey; label: string; numeric: boolean } | null>
      ).filter((column): column is { key: SortKey; label: string; numeric: boolean } => column !== null),
    [showTeam]
  );

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      let result: number;
      if (sortKey === 'amountCents') {
        result = a.amountCents - b.amountCents;
      } else if (sortKey === 'purchasedAt') {
        result = Date.parse(a.purchasedAt) - Date.parse(b.purchasedAt);
      } else if (sortKey === 'paymentMethod') {
        result = paymentMethodLabel[a.paymentMethod].localeCompare(paymentMethodLabel[b.paymentMethod]);
      } else if (sortKey === 'category') {
        result = categoryLabel[a.category].localeCompare(categoryLabel[b.category]);
      } else {
        result = String(a[sortKey]).localeCompare(String(b[sortKey]));
      }
      // Stable tie-break so equal keys keep a predictable newest-first order.
      if (result === 0) {
        result = Date.parse(a.purchasedAt) - Date.parse(b.purchasedAt);
      }
      return ascending ? result : -result;
    });
    return copy;
  }, [rows, sortKey, ascending]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setAscending((current) => !current);
      return;
    }
    setSortKey(key);
    // Dates and amounts are most useful biggest/newest first; text A–Z.
    setAscending(key !== 'purchasedAt' && key !== 'amountCents');
  };

  const total = rows.reduce((sum, row) => sum + row.amountCents, 0);

  return (
    <section className="hq-panel hq-surface-muted hq-ledger-panel">
      <div className="hq-block-head">
        <div className="hq-section-head-copy">
          <p className="hq-eyebrow">Purchase log</p>
          <h3>{title}</h3>
        </div>
        <strong>
          {rows.length} purchase{rows.length === 1 ? '' : 's'} · {money(total)}
        </strong>
      </div>

      {subtitle ? <p className="helper">{subtitle}</p> : null}

      {rows.length === 0 ? (
        <p className="empty-note">No purchases match this selection.</p>
      ) : (
        <div className="hq-ledger-scroll">
          <table className="hq-ledger-table">
            <thead>
              <tr>
                {columns.map((column) => {
                  const active = sortKey === column.key;
                  return (
                    <th
                      key={column.key}
                      className={column.numeric ? 'hq-ledger-numeric' : undefined}
                      aria-sort={active ? (ascending ? 'ascending' : 'descending') : 'none'}
                    >
                      <button
                        type="button"
                        className={`hq-ledger-sort${active ? ' hq-ledger-sort-active' : ''}`}
                        onClick={() => toggleSort(column.key)}
                      >
                        {column.label}
                        <span aria-hidden="true">{active ? (ascending ? ' ▲' : ' ▼') : ''}</span>
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr key={row.id}>
                  <td>{new Date(row.purchasedAt).toLocaleDateString('en-US')}</td>
                  {showTeam ? <td>{row.teamName}</td> : null}
                  <td style={{ fontWeight: 700 }}>{row.description}</td>
                  <td className="hq-ledger-numeric">{money(row.amountCents)}</td>
                  <td>{row.personName}</td>
                  <td>{paymentMethodLabel[row.paymentMethod]}</td>
                  <td>{categoryLabel[row.category]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
