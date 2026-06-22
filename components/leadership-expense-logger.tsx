'use client';

import { useRef, useState } from 'react';
import { logPurchaseAction } from '@/app/dashboard/actions';

// Collapsible quick-logger for club leadership / operations expenses, surfaced
// on the dashboard for admins and presidents. Posts to the shared
// logPurchaseAction with expense_type=leadership (no team). Credit-card
// purchases reveal a drag-and-drop receipt uploader.
export function LeadershipExpenseLogger({
  academicYear,
  personName
}: {
  academicYear: string;
  personName: string;
}) {
  const [open, setOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'credit_card' | 'reimbursement'>('credit_card');
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const assignFile = (file: File | null | undefined) => {
    if (!file) return;
    const dt = new DataTransfer();
    dt.items.add(file);
    if (fileInputRef.current) fileInputRef.current.files = dt.files;
    setFileName(file.name);
  };

  return (
    <section className="hq-panel hq-surface-muted">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          display: 'flex',
          width: '100%',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          textAlign: 'left',
          font: 'inherit',
          color: 'inherit'
        }}
      >
        <span>
          <strong style={{ display: 'block' }}>Log a leadership / operations expense</strong>
          <small className="helper">Club-wide spending not tied to a team.</small>
        </span>
        <span aria-hidden="true" style={{ fontSize: '1.1rem' }}>
          {open ? '▾' : '▸'}
        </span>
      </button>

      {open ? (
        <form
          action={logPurchaseAction}
          className="form-stack"
          style={{ marginTop: '1rem' }}
          onSubmit={(event) => {
            if (paymentMethod === 'credit_card' && !fileInputRef.current?.files?.length) {
              if (!window.confirm('No receipt attached. Log this credit-card expense without one?')) {
                event.preventDefault();
              }
            }
          }}
        >
          <input type="hidden" name="expense_type" value="leadership" />
          <input type="hidden" name="academic_year" value={academicYear} />
          <input type="hidden" name="person_name" value={personName} />

          <div className="field">
            <label className="label" htmlFor="leadership-item">
              Item
            </label>
            <input
              className="input"
              id="leadership-item"
              name="description"
              placeholder="What was purchased?"
              required
            />
          </div>

          <div className="hq-inline-grid">
            <div className="field">
              <label className="label" htmlFor="leadership-amount">
                Amount (USD)
              </label>
              <input
                className="input"
                id="leadership-amount"
                name="amount"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0.00"
                required
              />
            </div>

            <div className="field">
              <label className="label" htmlFor="leadership-method">
                Payment method
              </label>
              <select
                className="select"
                id="leadership-method"
                name="payment_method"
                value={paymentMethod}
                onChange={(event) =>
                  setPaymentMethod(event.target.value as 'credit_card' | 'reimbursement')
                }
              >
                <option value="credit_card">Credit card</option>
                <option value="reimbursement">Reimbursement</option>
              </select>
            </div>
          </div>

          <div className="field">
            <label className="label" htmlFor="leadership-category">
              Category
            </label>
            <select className="select" id="leadership-category" name="category" defaultValue="equipment">
              <option value="equipment">Equipment</option>
              <option value="food">Food</option>
              <option value="travel">Travel</option>
              <option value="registration">Registration</option>
            </select>
          </div>

          {paymentMethod === 'credit_card' ? (
            <div className="field">
              <label className="label" htmlFor="leadership-receipt">
                Receipt
              </label>
              <div
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (!dragging) setDragging(true);
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  setDragging(false);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  assignFile(event.dataTransfer.files?.[0]);
                }}
                style={{
                  border: `1.5px dashed ${dragging ? '#8c1515' : '#c9bcbc'}`,
                  borderRadius: 10,
                  padding: '1rem',
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: dragging ? '#f3e9e9' : '#faf7f7'
                }}
              >
                <span className="helper" style={{ display: 'block' }}>
                  {fileName ? `Attached: ${fileName}` : 'Drag & drop an image or PDF, or click to upload.'}
                </span>
              </div>
              <input
                ref={fileInputRef}
                id="leadership-receipt"
                type="file"
                name="receipt"
                accept=".pdf,image/png,image/jpeg,image/webp"
                style={{ display: 'none' }}
                onChange={(event) => setFileName(event.target.files?.[0]?.name ?? null)}
              />
              <span className="helper">Receipts must be under 2 MB.</span>
            </div>
          ) : null}

          <div className="button-row">
            <button className="button" type="submit">
              Log expense
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
