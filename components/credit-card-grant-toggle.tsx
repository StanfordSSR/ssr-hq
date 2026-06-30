'use client';

import { setCreditCardGrantAction } from '@/app/dashboard/actions';

type CreditCardGrantToggleProps = {
  userId: string;
  name: string;
  roleLabel: string;
  email: string | null;
  enabled: boolean;
};

// One access "slider" row. The checkbox is named `enabled`, so when it is
// checked the form posts `enabled=on` and when unchecked it posts nothing
// (read as off by the action). Toggling auto-submits the row's form.
export function CreditCardGrantToggle({ userId, name, roleLabel, email, enabled }: CreditCardGrantToggleProps) {
  return (
    <form action={setCreditCardGrantAction}>
      <input type="hidden" name="user_id" value={userId} />
      <label className="hq-switch">
        <input
          type="checkbox"
          name="enabled"
          defaultChecked={enabled}
          onChange={(event) => {
            // Revoking wipes their signed agreement + FO approval, so they'd have
            // to redo the whole process if re-granted. Confirm before doing it.
            if (!event.currentTarget.checked) {
              const ok = window.confirm(
                `Remove credit-card access for ${name}? This also resets their agreement — if you ` +
                  `grant access again they will have to read and re-sign it and get Financial Officer ` +
                  `approval from scratch.`
              );
              if (!ok) {
                event.currentTarget.checked = true;
                return;
              }
            }
            event.currentTarget.form?.requestSubmit();
          }}
        />
        <span className="hq-switch-track" aria-hidden="true" />
        <span className="hq-switch-copy">
          <strong>{name}</strong>
          <small>
            {roleLabel}
            {email ? ` · ${email}` : ''}
          </small>
        </span>
      </label>
    </form>
  );
}
