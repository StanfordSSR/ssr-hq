import { env } from '@/lib/env';

export function buildInviteConfirmLink(properties: {
  hashed_token?: string | null;
  verification_type?: string | null;
}) {
  const tokenHash = properties.hashed_token;
  const type = properties.verification_type;

  if (!tokenHash || !type) {
    throw new Error('Invite link is missing verification details.');
  }

  const confirmUrl = new URL('/auth/confirm', env.siteUrl);
  confirmUrl.searchParams.set('token_hash', tokenHash);
  confirmUrl.searchParams.set('type', type);
  confirmUrl.searchParams.set('next', '/dashboard');
  return confirmUrl.toString();
}
