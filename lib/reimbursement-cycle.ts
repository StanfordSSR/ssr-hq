export function pacificToday(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function validatePurchaseDate(value: string, academicYear: string, today = pacificToday()) {
  const parsed = new Date(`${value}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== value) {
    return 'Enter the date you made the purchase.';
  }
  const start = `${academicYear.slice(0, 4)}-09-01`;
  if (value < start) return `This budget cycle covers purchases from September 1, ${academicYear.slice(0, 4)} onward.`;
  if (value > today) return 'The purchase date cannot be in the future.';
  return null;
}

export function purchaseDateTimestamp(value: string) {
  // Noon UTC is still the same calendar date in every US Pacific season.
  return new Date(`${value}T12:00:00Z`).toISOString();
}
