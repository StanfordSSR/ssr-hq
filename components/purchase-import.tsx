'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { importPurchasesAction } from '@/app/dashboard/actions';
import {
  detectPurchaseCategory,
  normalizePaymentMethod,
  normalizePurchaseDate,
  parsePurchaseAmount
} from '@/lib/purchases';

type TeamOption = {
  id: string;
  name: string;
};

type PurchaseImportProps = {
  teams: TeamOption[];
  defaultTeamId: string;
  academicYear: string;
};

type ParsedSheet = {
  fileName: string;
  headers: string[];
  rows: Record<string, unknown>[];
};

type MappingState = {
  item: string;
  amount: string;
  person: string;
  date: string;
  payment: string;
};

type PaymentMethod = 'credit_card' | 'reimbursement' | 'amazon' | 'unknown';

type PreparedPurchase = {
  rowNumber: number;
  description: string;
  amount: number;
  personName?: string;
  purchasedAt?: string;
  paymentMethod: PaymentMethod;
  category: 'equipment' | 'food' | 'travel';
};

const initialState = {
  message: '',
  addedAmount: 0,
  skippedRows: [] as number[]
};

const mappingFields: Array<{ key: keyof MappingState; label: string; required?: boolean }> = [
  { key: 'item', label: 'Item name', required: true },
  { key: 'amount', label: 'Cost', required: true },
  { key: 'person', label: 'Person' },
  { key: 'date', label: 'Date' },
  { key: 'payment', label: 'Payment source' }
];

const guessColumn = (headers: string[], patterns: RegExp[]) =>
  headers.find((header) => patterns.some((pattern) => pattern.test(header.toLowerCase()))) || '';

const readCellText = (value: unknown) => String(value ?? '').trim();

export function PurchaseImport({ teams, defaultTeamId, academicYear }: PurchaseImportProps) {
  const [parsed, setParsed] = useState<ParsedSheet | null>(null);
  const [teamId, setTeamId] = useState(defaultTeamId);
  const [paymentMappings, setPaymentMappings] = useState<Record<string, PaymentMethod>>({});
  const [fileError, setFileError] = useState('');
  const [mapping, setMapping] = useState<MappingState>({
    item: '',
    amount: '',
    person: '',
    date: '',
    payment: ''
  });
  const [state, formAction, pending] = useActionState(importPurchasesAction, initialState);

  const paymentCandidates = useMemo(() => {
    if (!parsed || !mapping.payment) return [];
    const counts = new Map<string, number>();
    for (const row of parsed.rows) {
      const value = readCellText(row[mapping.payment]);
      if (!value) continue;
      counts.set(value, (counts.get(value) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([value]) => value);
  }, [parsed, mapping.payment]);

  useEffect(() => {
    if (paymentCandidates.length === 0) {
      return;
    }

    setPaymentMappings((current) => {
      const next = { ...current };
      let changed = false;

      for (const candidate of paymentCandidates) {
        if (!next[candidate] || next[candidate] === 'unknown') {
          next[candidate] = normalizePaymentMethod(candidate);
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [paymentCandidates]);

  const preparedPayload = useMemo(() => {
    if (!parsed || !mapping.item || !mapping.amount) {
      return { purchases: [] as PreparedPurchase[], skippedRows: [] as number[] };
    }

    const skippedRows: number[] = [];
    const purchases: PreparedPurchase[] = [];

    for (const [index, row] of parsed.rows.entries()) {
      const rowNumber = index + 2;
      const description = readCellText(row[mapping.item]);
      const amount = parsePurchaseAmount(row[mapping.amount]);

      if (!description || !Number.isFinite(amount) || amount < 0.5) {
        skippedRows.push(rowNumber);
        continue;
      }

      const paymentSource = mapping.payment ? readCellText(row[mapping.payment]) : '';
      const paymentMethod = paymentSource
        ? paymentMappings[paymentSource] || normalizePaymentMethod(paymentSource)
        : 'unknown';

      purchases.push({
        rowNumber,
        description,
        amount,
        personName: mapping.person ? readCellText(row[mapping.person]) : '',
        purchasedAt: mapping.date ? normalizePurchaseDate(row[mapping.date]) : '',
        paymentMethod,
        category: detectPurchaseCategory(description)
      });
    }

    return {
      purchases,
      skippedRows
    };
  }, [parsed, mapping, paymentMappings]);

  const importAmount = useMemo(
    () => preparedPayload.purchases.reduce((sum, purchase) => sum + purchase.amount, 0),
    [preparedPayload]
  );

  const handleFile = async (file: File) => {
    setFileError('');

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const firstSheet = workbook.SheetNames[0];

    if (!firstSheet) {
      setParsed(null);
      setFileError('This file does not contain a readable worksheet.');
      return;
    }

    const worksheet = workbook.Sheets[firstSheet];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
      raw: false,
      defval: ''
    });
    const headers = Object.keys(rows[0] || {});

    if (headers.length === 0) {
      setParsed(null);
      setFileError('No columns were found in this file.');
      return;
    }

    const normalizedRows = rows.map((row) => Object.fromEntries(headers.map((header) => [header, row[header] ?? ''])));

    setParsed({ fileName: file.name, headers, rows: normalizedRows });
    setTeamId(defaultTeamId || teams[0]?.id || '');
    setMapping({
      item: guessColumn(headers, [/item/, /name/, /description/, /purchase/]),
      amount: guessColumn(headers, [/amount/, /cost/, /price/, /total/, /subtotal/]),
      person: guessColumn(headers, [/name/, /person/, /buyer/, /paid by/, /purchaser/]),
      date: guessColumn(headers, [/date/, /purchased/, /transaction/, /posted/]),
      payment: guessColumn(headers, [/payment/, /method/, /source/, /card/, /reimb/, /account/])
    });
    setPaymentMappings({});
  };

  return (
    <div className="hq-import-panel">
      <div className="hq-block-head">
        <h3>Import purchases</h3>
        <span className="hq-inline-note">CSV or XLSX</span>
      </div>

      <p className="helper">
        Upload a spreadsheet, confirm the column mapping, and we&apos;ll import every valid row into your team&apos;s
        purchase log.
      </p>

      <div className="field">
        <label className="label" htmlFor="purchase-import-file">
          CSV or XLSX file
        </label>
        <input
          className="input"
          id="purchase-import-file"
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void handleFile(file);
            }
          }}
        />
      </div>

      {fileError ? <p className="empty-note">{fileError}</p> : null}

      {parsed ? (
        <form action={formAction} className="form-stack">
          <input type="hidden" name="academic_year" value={academicYear} />
          <input type="hidden" name="team_id" value={teamId} />
          <input type="hidden" name="import_payload" value={JSON.stringify(preparedPayload)} />

          <div className="hq-import-meta">
            <div className="hq-import-stat">
              <span>File</span>
              <strong>{parsed.fileName}</strong>
            </div>
            <div className="hq-import-stat">
              <span>Ready to import</span>
              <strong>{preparedPayload.purchases.length} rows</strong>
            </div>
            <div className="hq-import-stat">
              <span>Skipped</span>
              <strong>{preparedPayload.skippedRows.length} rows</strong>
            </div>
          </div>

          <div className="field">
            <label className="label" htmlFor="import-team">
              Team
            </label>
            <select
              className="select"
              id="import-team"
              value={teamId}
              onChange={(event) => setTeamId(event.target.value)}
            >
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </div>

          <div className="hq-import-mapping-grid">
            {mappingFields.map((field) => (
              <div className="field" key={field.key}>
                <label className="label" htmlFor={`mapping-${field.key}`}>
                  {field.label}
                  {field.required ? ' *' : ''}
                </label>
                <select
                  className="select"
                  id={`mapping-${field.key}`}
                  value={mapping[field.key]}
                  onChange={(event) =>
                    setMapping((current) => ({
                      ...current,
                      [field.key]: event.target.value
                    }))
                  }
                >
                  <option value="">Unassigned</option>
                  {parsed.headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {paymentCandidates.length > 0 ? (
            <div className="hq-import-mapping-grid">
              {paymentCandidates.map((candidate) => (
                <div key={candidate} className="field">
                  <label className="label" htmlFor={`payment-map-${candidate}`}>
                    Payment source: {candidate}
                  </label>
                  <select
                    className="select"
                    id={`payment-map-${candidate}`}
                    value={paymentMappings[candidate] || 'unknown'}
                    onChange={(event) =>
                      setPaymentMappings((current) => ({
                        ...current,
                        [candidate]: event.target.value as PaymentMethod
                      }))
                    }
                  >
                    <option value="credit_card">Credit card</option>
                    <option value="amazon">Amazon</option>
                    <option value="reimbursement">Reimbursement</option>
                    <option value="unknown">Unknown</option>
                  </select>
                </div>
              ))}
            </div>
          ) : null}

          <div className="hq-import-summary">
            <span>
              Ready to add <strong>${importAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
            </span>
            {preparedPayload.skippedRows.length > 0 ? (
              <span>Rows skipped on review: {preparedPayload.skippedRows.join(', ')}</span>
            ) : (
              <span>No skipped rows detected.</span>
            )}
          </div>

          <p className="helper">
            Required mappings: item name and cost. Rows without both, or rows under $0.50, will be skipped.
          </p>

          <div className="button-row">
            <button
              className="button-secondary"
              type="submit"
              disabled={!mapping.item || !mapping.amount || preparedPayload.purchases.length === 0 || pending}
            >
              {pending ? 'Importing...' : 'Import purchases'}
            </button>
          </div>

          {state.message ? (
            <div className="hq-import-summary">
              <strong>{state.message}</strong>
              <span>${state.addedAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} added.</span>
              {state.skippedRows.length > 0 ? <span>Skipped rows: {state.skippedRows.join(', ')}</span> : null}
            </div>
          ) : null}
        </form>
      ) : (
        <p className="helper">Upload a file to map columns before importing.</p>
      )}
    </div>
  );
}
