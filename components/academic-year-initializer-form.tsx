'use client';

import { useState } from 'react';
import { initializeAcademicYearBudgetsAction } from '@/app/dashboard/actions';

type AcademicYearInitializerFormProps = {
  academicYear: string;
};

export function AcademicYearInitializerForm({ academicYear }: AcademicYearInitializerFormProps) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button className="button-ghost" type="button" onClick={() => setOpen(true)}>
        Initialize {academicYear} budgets
      </button>
    );
  }

  return (
    <form action={initializeAcademicYearBudgetsAction} className="form-stack hq-danger-form">
      <div className="field">
        <label className="label" htmlFor="academic-year-init-confirm">
          Type INITIALIZE
        </label>
        <input className="input" id="academic-year-init-confirm" name="confirm_initialize" required />
      </div>

      <div className="field">
        <label className="label" htmlFor="academic-year-init-cycle">
          Type {academicYear}
        </label>
        <input className="input" id="academic-year-init-cycle" name="confirm_academic_year" required />
      </div>

      <span className="helper">
        This creates a fresh {academicYear} club budget at $0, resets every active team budget for the new cycle to $0,
        and treats prior-year unused team allocations as returned to general fund for closeout tracking.
      </span>

      <div className="hq-inline-editor-actions">
        <button className="button-secondary" type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button className="button" type="submit">
          Initialize new cycle
        </button>
      </div>
    </form>
  );
}
