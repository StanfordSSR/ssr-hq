'use client';

import { useState } from 'react';
import { rolloverAcademicYearAction } from '@/app/dashboard/actions';

type AcademicYearInitializerFormProps = {
  nextAcademicYear: string;
};

export function AcademicYearInitializerForm({ nextAcademicYear }: AcademicYearInitializerFormProps) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button className="button-ghost" type="button" onClick={() => setOpen(true)}>
        Roll over to {nextAcademicYear}
      </button>
    );
  }

  return (
    <form action={rolloverAcademicYearAction} className="form-stack hq-danger-form">
      <div className="field">
        <label className="label" htmlFor="academic-year-init-confirm">
          Type ROLLOVER
        </label>
        <input className="input" id="academic-year-init-confirm" name="confirm_rollover" required />
      </div>

      <div className="field">
        <label className="label" htmlFor="academic-year-init-cycle">
          Type {nextAcademicYear}
        </label>
        <input className="input" id="academic-year-init-cycle" name="confirm_next_academic_year" required />
      </div>

      <span className="helper">
        This rolls the portal into {nextAcademicYear}, creates a fresh club budget at $0, resets every active team budget
        for the new cycle to $0, and treats prior-year unused team allocations as returned to general fund for closeout
        tracking only.
      </span>

      <div className="hq-inline-editor-actions">
        <button className="button-secondary" type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button className="button" type="submit">
          Roll over year
        </button>
      </div>
    </form>
  );
}
