'use client';

import { useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { logPurchaseAction } from '@/app/dashboard/actions';

type TeamOption = { id: string; name: string };

// Disables itself while the server action runs so a double-click can't log twice.
function ExpenseSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="button" type="submit" disabled={pending} aria-busy={pending}>
      {pending ? 'Logging…' : 'Log team expense'}
    </button>
  );
}

// Collapsible logger for presidents / financial officers to log an expense to
// ANY team (not just one they lead). Posts to the shared logPurchaseAction with
// expense_type=team and a chosen team_id. Credit-card purchases reveal a
// drag-and-drop receipt uploader that auto-fills item / amount / category.
export function TeamExpenseLogger({
  teams,
  academicYear,
  personName
}: {
  teams: TeamOption[];
  academicYear: string;
  personName: string;
}) {
  const [open, setOpen] = useState(false);
  const [teamId, setTeamId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'credit_card' | 'reimbursement'>('credit_card');
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Controlled so a scanned receipt can auto-fill them (and the user can edit).
  const [item, setItem] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('equipment');
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);

  // Read an attached receipt (image OR PDF) and auto-fill item / amount /
  // category. Failures are silent-ish: the fields just stay editable.
  const scanReceipt = async (file: File) => {
    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf';
    if (!isImage && !isPdf) {
      setScanNote('Unsupported file — enter the details below.');
      return;
    }
    setScanning(true);
    setScanNote('Reading receipt…');
    try {
      const body = new FormData();
      body.append('image', file);
      const response = await fetch('/api/expense/scan', { method: 'POST', body });
      const data = (await response.json().catch(() => null)) as
        | { itemName?: string | null; amount?: number | null; category?: string | null; error?: string }
        | null;
      if (!response.ok || !data) {
        setScanNote(data?.error || 'Could not read the receipt. Enter the details below.');
        return;
      }
      const filled: string[] = [];
      if (data.itemName) {
        setItem(data.itemName);
        filled.push('item');
      }
      if (typeof data.amount === 'number' && data.amount > 0) {
        setAmount(data.amount.toFixed(2));
        filled.push('amount');
      }
      if (data.category) {
        setCategory(data.category);
        filled.push('category');
      }
      setScanNote(
        filled.length
          ? `Auto-filled ${filled.join(', ')} from the receipt — please double-check.`
          : 'Could not read the details — please enter them below.'
      );
    } catch {
      setScanNote('Could not read the receipt. Enter the details below.');
    } finally {
      setScanning(false);
    }
  };

  const assignFile = (file: File | null | undefined) => {
    if (!file) return;
    const dt = new DataTransfer();
    dt.items.add(file);
    if (fileInputRef.current) fileInputRef.current.files = dt.files;
    setFileName(file.name);
    void scanReceipt(file);
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
          <strong style={{ display: 'block' }}>Log a team expense</strong>
          <small className="helper">Log a purchase to any team&rsquo;s budget.</small>
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
          <input type="hidden" name="expense_type" value="team" />
          <input type="hidden" name="academic_year" value={academicYear} />
          <input type="hidden" name="person_name" value={personName} />

          <div className="field">
            <label className="label" htmlFor="team-expense-team">
              Team
            </label>
            <select
              className="select"
              id="team-expense-team"
              name="team_id"
              value={teamId}
              onChange={(event) => setTeamId(event.target.value)}
              required
            >
              <option value="" disabled>
                Choose a team…
              </option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="label" htmlFor="team-expense-item">
              Item
            </label>
            <input
              className="input"
              id="team-expense-item"
              name="description"
              placeholder="What was purchased?"
              value={item}
              onChange={(event) => setItem(event.target.value)}
              required
            />
          </div>

          <div className="hq-inline-grid">
            <div className="field">
              <label className="label" htmlFor="team-expense-amount">
                Amount (USD)
              </label>
              <input
                className="input"
                id="team-expense-amount"
                name="amount"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required
              />
            </div>

            <div className="field">
              <label className="label" htmlFor="team-expense-method">
                Payment method
              </label>
              <select
                className="select"
                id="team-expense-method"
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
            <label className="label" htmlFor="team-expense-category">
              Category
            </label>
            <select
              className="select"
              id="team-expense-category"
              name="category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="equipment">Equipment</option>
              <option value="food">Food</option>
              <option value="travel">Travel</option>
              <option value="registration">Registration</option>
            </select>
          </div>

          {paymentMethod === 'credit_card' ? (
            <div className="field">
              <label className="label" htmlFor="team-expense-receipt">
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
                id="team-expense-receipt"
                type="file"
                name="receipt"
                accept=".pdf,image/png,image/jpeg,image/webp"
                style={{ display: 'none' }}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  setFileName(file?.name ?? null);
                  if (file) void scanReceipt(file);
                }}
              />
              {scanNote ? (
                <span
                  className="helper"
                  style={{ color: scanning ? '#8a5a00' : '#3a6f4f', fontWeight: 600 }}
                >
                  {scanNote}
                </span>
              ) : (
                <span className="helper">
                  Attach a receipt image or PDF to auto-fill the item, amount, and category. Receipts
                  must be under 2 MB.
                </span>
              )}
            </div>
          ) : null}

          <div className="button-row">
            <ExpenseSubmitButton />
          </div>
        </form>
      ) : null}
    </section>
  );
}
