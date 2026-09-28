// ASSU has temporarily disabled the club cards. Keep storage and approval state
// intact so access can be restored with a deliberate code change and deploy.
export const CREDIT_CARD_ENABLED = false;

export const CREDIT_CARD_PAUSED_MESSAGE =
  'Shared credit card access is temporarily paused while ASSU disables the cards.';

export function requireCreditCardEnabled(): void {
  if (!CREDIT_CARD_ENABLED) {
    throw new Error(CREDIT_CARD_PAUSED_MESSAGE);
  }
}

export function pausedCardResponse(): Response {
  return Response.json(
    { error: CREDIT_CARD_PAUSED_MESSAGE },
    { status: 503, headers: { 'Cache-Control': 'no-store' } }
  );
}
