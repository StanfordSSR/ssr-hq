// Shared, forgiving confirmation matching for destructive actions.
//
// The UI displays fallbacks like "Unnamed user" when a profile has no name, so
// the server must accept whatever the admin can actually see and type — never
// compare against a raw nullable column. Matching is trimmed and
// case-insensitive, and accepts the display name, the stored name, or the
// account email.

const UNNAMED_FALLBACKS = ['Unnamed user', 'Unnamed lead', 'Unnamed member'];

function normalize(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function confirmationMatches(
  provided: string,
  identity: { fullName?: string | null; email?: string | null }
): boolean {
  const typed = normalize(provided);
  if (!typed) return false;

  const candidates = [identity.fullName, identity.email, ...(identity.fullName ? [] : UNNAMED_FALLBACKS)];
  return candidates.some((candidate) => normalize(candidate) === typed);
}
