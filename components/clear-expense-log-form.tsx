'use client';

import { useState } from 'react';
import { clearTeamExpenseLogAction } from '@/app/dashboard/actions';

type ClearExpenseLogFormProps = {
  teamId: string;
  teamName: string;
};

export function ClearExpenseLogForm({ teamId, teamName }: ClearExpenseLogFormProps) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button className="button-ghost" type="button" onClick={() => setOpen(true)}>
        Clear expense log
      </button>
    );
  }

  return (
    <form action={clearTeamExpenseLogAction} className="form-stack hq-danger-form">
      <input type="hidden" name="team_id" value={teamId} />
      <div className="field">
        <label className="label" htmlFor={`clear-confirm-${teamId}`}>
          Type DELETE
        </label>
        <input className="input" id={`clear-confirm-${teamId}`} name="confirm_delete" required />
      </div>

      <div className="field">
        <label className="label" htmlFor={`clear-team-${teamId}`}>
          Type {teamName}
        </label>
        <input className="input" id={`clear-team-${teamId}`} name="confirm_team_name" required />
      </div>

      <span className="helper">This permanently deletes every purchase logged for {teamName}.</span>

      <div className="hq-inline-editor-actions">
        <button className="button-secondary" type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button className="button" type="submit">
          Permanently clear
        </button>
      </div>
    </form>
  );
}
