'use client';

import { deleteCreditCardAction } from '@/app/dashboard/actions';

// Delete-only control for the shared card. Confirms in the browser before
// submitting, since deleting is irreversible (the card can never be re-viewed,
// only re-entered from scratch).
export function CreditCardDeleteButton() {
  return (
    <form
      action={deleteCreditCardAction}
      onSubmit={(event) => {
        if (
          !window.confirm(
            'Delete the saved card? This cannot be undone. You will have to re-enter the full card details to set a new one.'
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <button className="button-secondary" type="submit">
        Delete card
      </button>
    </form>
  );
}
