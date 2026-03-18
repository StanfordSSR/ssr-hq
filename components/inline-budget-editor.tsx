'use client';

import { useState } from 'react';

type InlineBudgetEditorProps = {
  action: (formData: FormData) => Promise<void>;
  academicYear: string;
  fieldName: string;
  hiddenName?: string;
  hiddenValue?: string;
  label: string;
  value: number;
  confirmMessage: string;
};

export function InlineBudgetEditor({
  action,
  academicYear,
  fieldName,
  hiddenName,
  hiddenValue,
  label,
  value,
  confirmMessage
}: InlineBudgetEditorProps) {
  const [editing, setEditing] = useState(false);

  return (
    <div className="hq-inline-editor">
      {!editing ? (
        <button className="hq-inline-editor-button" type="button" onClick={() => setEditing(true)}>
          <span>{label}</span>
          <strong>${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</strong>
          <small>Edit</small>
        </button>
      ) : (
        <form
          action={action}
          className="hq-inline-editor-form"
          onSubmit={(event) => {
            if (!window.confirm(confirmMessage)) {
              event.preventDefault();
              return;
            }

            setEditing(false);
          }}
        >
          <input type="hidden" name="academic_year" value={academicYear} />
          {hiddenName && hiddenValue ? <input type="hidden" name={hiddenName} value={hiddenValue} /> : null}
          <input
            className="input"
            name={fieldName}
            type="number"
            min="0"
            step="0.01"
            defaultValue={value.toFixed(2)}
            autoFocus
            required
          />
          <div className="hq-inline-editor-actions">
            <button className="button-secondary" type="button" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button className="button" type="submit">
              Confirm
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
