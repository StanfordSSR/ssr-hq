// Parsing and auto-matching for official finance-office statement CSVs.
// Pure module (no server-only imports) so it can be reused anywhere.

export type ParsedStatementItem = {
  rawDate: string;
  statementDate: string | null;
  referenceNumber: string | null;
  personName: string | null;
  description: string;
  rawReference: string;
  amountCents: number;
  direction: 'debit' | 'credit';
  dedupeKey: string;
};

export type StatementScopeSuggestion = {
  scope: 'team' | 'leadership' | 'unknown';
  teamHint: string | null;
};

export type MatchablePurchase = {
  id: string;
  description: string;
  amount_cents: number;
};

// Auto-match tolerance: amounts must agree within this fraction.
export const STATEMENT_MATCH_TOLERANCE = 0.03;

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

export function parseStatementAmountCents(value: string): number {
  const text = String(value || '')
    .replace(/^\((.*)\)$/, '-$1')
    .replace(/[$,\s]/g, '');
  if (!text) return 0;
  const amount = Number(text);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

// Finance office payee column is "Last, First" — flip it to "First Last".
function normalizePerson(payee: string): string | null {
  const trimmed = payee.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 2) {
    return `${parts[1]} ${parts[0]}`;
  }
  return trimmed;
}

function parseStatementDate(raw: string): string | null {
  const t = raw.trim();
  let m = t.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
  if (m) {
    return `20${m[3]}-${m[1]}-${m[2]}`;
  }
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const year = Number(m[1]);
    // The export occasionally mangles years (e.g. 2002, 2005); only trust plausible ones.
    return year >= 2024 && year <= 2027 ? t : null;
  }
  return null;
}

export function makeStatementDedupeKey(item: {
  rawDate: string;
  amountCents: number;
  direction: string;
  rawReference: string;
  rawBalance: string;
}): string {
  const ref = item.rawReference.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 160);
  // Running balance is unique per row, so legitimately-identical line items stay distinct
  // while re-uploading the same statement remains idempotent.
  const balance = item.rawBalance.replace(/[$,\s]/g, '');
  return `${item.rawDate}|${item.amountCents}|${item.direction}|${balance}|${ref}`;
}

export function parseStatementCsv(text: string): ParsedStatementItem[] {
  const lines = text.split(/\r?\n/);
  const items: ParsedStatementItem[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    const fields = splitCsvLine(line);
    if (fields.length < 9) continue;

    const rawDate = (fields[0] || '').trim();
    const source = (fields[1] || '').trim();
    const payee = (fields[2] || '').trim();
    const reference = (fields[4] || '').trim();
    const deposit = parseStatementAmountCents(fields[5] || '');
    const withdrawal = parseStatementAmountCents(fields[6] || '');
    const rawBalance = (fields[8] || '').trim();

    if (!rawDate || rawDate.toLowerCase() === 'date') continue;
    if (!reference) continue;

    let direction: 'debit' | 'credit';
    let amountCents: number;
    if (withdrawal > 0) {
      direction = 'debit';
      amountCents = withdrawal;
    } else if (deposit > 0) {
      direction = 'credit';
      amountCents = deposit;
    } else {
      continue;
    }

    let referenceNumber: string | null = null;
    const sourceRef = source.match(/^R-\d+/);
    if (sourceRef) {
      referenceNumber = sourceRef[0];
    } else {
      const refMatch = reference.match(/R-\d{3,}/);
      if (refMatch) referenceNumber = refMatch[0];
    }

    const personName = payee ? normalizePerson(payee) : null;

    let description = reference.replace(/^Journal Import \d+:\s*/i, '');
    description = description.replace(/^R-\d+\s*/, '').trim();
    if (!description) description = reference.trim();

    const dedupeKey = makeStatementDedupeKey({ rawDate, amountCents, direction, rawReference: reference, rawBalance });

    items.push({
      rawDate,
      statementDate: parseStatementDate(rawDate),
      referenceNumber,
      personName,
      description,
      rawReference: reference,
      amountCents,
      direction,
      dedupeKey
    });
  }

  return items;
}

const STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'this',
  'that',
  'used',
  'using',
  'order',
  'invoice',
  'receipt',
  'equipment',
  'parts',
  'part',
  'item',
  'items',
  'purchase',
  'charge',
  'club',
  'team',
  'robotics'
]);

export function tokenizeStatementText(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length >= 4 && !STOPWORDS.has(token))
  );
}

// Keyword groups used to pre-suggest where an unaccounted item belongs.
const TEAM_HINTS: Array<{ hint: string; patterns: RegExp }> = [
  { hint: 'skyrunners', patterns: /skyrunner/i },
  { hint: 'builderbot', patterns: /builderbot|builder bot/i },
  { hint: 'battlebots', patterns: /battlebot|combat robot/i },
  { hint: 'escape', patterns: /escape/i },
  { hint: 'robosub', patterns: /robosub|submarine|hydrophone|thruster|\bsub\b|penetrator/i },
  { hint: 'conservation', patterns: /conservation|ecodrone|eco drone|\bshark|camera tag/i }
];

const LEADERSHIP_PATTERN =
  /website|framer|resend|mailchimp|hackathon|workspace|\bcloud\b|digitalocean|cloudflare|\bdomain\b|\bapi\b|doordash|dashpass|documentation tool|tariff|international transaction|desktop computer|robotics room|fire exting|festifall|tabling|google workspace/i;

export function suggestStatementScope(description: string): StatementScopeSuggestion {
  for (const team of TEAM_HINTS) {
    if (team.patterns.test(description)) {
      return { scope: 'team', teamHint: team.hint };
    }
  }
  if (LEADERSHIP_PATTERN.test(description)) {
    return { scope: 'leadership', teamHint: null };
  }
  return { scope: 'unknown', teamHint: null };
}

// Find the best logged purchase for a statement item, or null when none is close enough.
export function findStatementMatch(
  item: { amountCents: number; description: string },
  purchases: MatchablePurchase[]
): MatchablePurchase | null {
  if (item.amountCents <= 0) return null;
  const itemTokens = tokenizeStatementText(item.description);

  let best: { purchase: MatchablePurchase; diff: number; overlap: number } | null = null;
  for (const purchase of purchases) {
    const diff = Math.abs(purchase.amount_cents - item.amountCents);
    if (diff / item.amountCents > STATEMENT_MATCH_TOLERANCE) continue;

    const purchaseTokens = tokenizeStatementText(purchase.description || '');
    let overlap = 0;
    for (const token of itemTokens) {
      if (purchaseTokens.has(token)) overlap += 1;
    }
    if (overlap === 0) continue;

    if (!best || diff < best.diff || (diff === best.diff && overlap > best.overlap)) {
      best = { purchase, diff, overlap };
    }
  }

  return best?.purchase || null;
}
