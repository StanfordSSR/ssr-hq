// One-off generator: parses the provided finance statement CSV and emits the
// seed migration. Mirrors the parsing in lib/statement-import.ts exactly so the
// seeded dedupe_keys match what an upload of the same file would produce.
import { readFileSync, writeFileSync } from 'node:fs';

const CSV_PATH = '/Users/artashn/Downloads/equipment-purchases.csv';
const OUT_PATH = new URL('../supabase/migrations/040_seed_statement.sql', import.meta.url);
const IMPORT_ID = '11111111-1111-4111-8111-111111111111';

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function parseAmountCents(value) {
  const text = String(value || '').replace(/^\((.*)\)$/, '-$1').replace(/[$,\s]/g, '');
  if (!text) return 0;
  const amount = Number(text);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function normalizePerson(payee) {
  const trimmed = payee.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 2) return `${parts[1]} ${parts[0]}`;
  return trimmed;
}

function parseStatementDate(raw) {
  const t = raw.trim();
  let m = t.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
  if (m) return `20${m[3]}-${m[1]}-${m[2]}`;
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const y = Number(m[1]);
    return y >= 2024 && y <= 2027 ? t : null;
  }
  return null;
}

function makeDedupeKey({ rawDate, amountCents, direction, rawReference, rawBalance }) {
  const ref = rawReference.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 160);
  const balance = rawBalance.replace(/[$,\s]/g, '');
  return `${rawDate}|${amountCents}|${direction}|${balance}|${ref}`;
}

const text = readFileSync(CSV_PATH, 'utf8');
const lines = text.split(/\r?\n/);
const items = [];
for (const line of lines) {
  if (!line.trim()) continue;
  const f = splitCsvLine(line);
  if (f.length < 9) continue;
  const rawDate = (f[0] || '').trim();
  const source = (f[1] || '').trim();
  const payee = (f[2] || '').trim();
  const reference = (f[4] || '').trim();
  const deposit = parseAmountCents(f[5] || '');
  const withdrawal = parseAmountCents(f[6] || '');
  const rawBalance = (f[8] || '').trim();
  if (!rawDate || rawDate.toLowerCase() === 'date') continue;
  if (!reference) continue;
  let direction;
  let amountCents;
  if (withdrawal > 0) {
    direction = 'debit';
    amountCents = withdrawal;
  } else if (deposit > 0) {
    direction = 'credit';
    amountCents = deposit;
  } else continue;
  let referenceNumber = null;
  const sourceRef = source.match(/^R-\d+/);
  if (sourceRef) referenceNumber = sourceRef[0];
  else {
    const rm = reference.match(/R-\d{3,}/);
    if (rm) referenceNumber = rm[0];
  }
  const personName = payee ? normalizePerson(payee) : null;
  let description = reference.replace(/^Journal Import \d+:\s*/i, '');
  description = description.replace(/^R-\d+\s*/, '').trim();
  if (!description) description = reference.trim();
  items.push({
    statementDate: parseStatementDate(rawDate),
    rawDate,
    referenceNumber,
    personName,
    description,
    rawReference: reference,
    amountCents,
    direction,
    dedupeKey: makeDedupeKey({ rawDate, amountCents, direction, rawReference: reference, rawBalance })
  });
}

const seen = new Set();
const unique = [];
for (const item of items) {
  if (seen.has(item.dedupeKey)) continue;
  seen.add(item.dedupeKey);
  unique.push(item);
}

const q = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`);

const valueRows = unique
  .map((item) => {
    const cols = [
      `'${IMPORT_ID}'`,
      q(item.statementDate),
      q(item.rawDate),
      q(item.referenceNumber),
      q(item.personName),
      q(item.description),
      q(item.rawReference),
      String(item.amountCents),
      q(item.direction),
      q(item.dedupeKey),
      `'unmatched'`
    ];
    return `  (${cols.join(', ')})`;
  })
  .join(',\n');

const sql = `-- Seed: official finance-office equipment statement (Sep 2025 – Jun 2026).
-- Generated from equipment-purchases.csv. Safe to re-run (dedupe_key is unique).

insert into public.statement_imports (id, file_name, uploaded_by, item_count)
values ('${IMPORT_ID}', 'equipment-purchases.csv (seed)', null, ${unique.length})
on conflict (id) do nothing;

insert into public.statement_line_items
  (import_id, statement_date, raw_date, reference_number, person_name, description, raw_reference, amount_cents, direction, dedupe_key, status)
values
${valueRows}
on conflict (dedupe_key) do nothing;
`;

writeFileSync(OUT_PATH, sql);
console.log(`Wrote ${unique.length} line items (of ${items.length} parsed) to 040_seed_statement.sql`);
const debits = unique.filter((i) => i.direction === 'debit');
console.log(`Debits: ${debits.length}, Credits: ${unique.length - debits.length}`);
