'use client';

import { useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { logPurchaseAction } from '@/app/dashboard/actions';
import { BudgetChargeFields } from '@/components/budget-charge-fields';
import type { ChargeCatalog } from '@/lib/budget-charge-routing';
import type { ExtractedReceipt } from '@/lib/openai-receipt';
import { suggestReceiptCharge } from '@/lib/receipt-charge-suggestion';

type TeamOption = { id: string; name: string };
type PaymentMethod = 'credit_card' | 'reimbursement' | 'amazon' | 'unknown';

const maxReceiptBytes = 2 * 1024 * 1024;
const allowedReceiptTypes = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp']);
const missingReceiptWarning =
  'Not submitting a receipt within 2 weeks of purchase may result in a 6 month suspension of credit card privileges. Do you want to continue without uploading one right now?';

function todayPacificDate() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function SaveButton({ scanning }: { scanning: boolean }) {
  const { pending } = useFormStatus();
  return <button className="button" type="submit" disabled={pending || scanning}>{pending ? 'Saving…' : 'Save purchase'}</button>;
}

export function ReceiptFirstPurchaseForm({
  academicYear,
  teams,
  defaultPersonName,
  catalog
}: {
  academicYear: string;
  teams: TeamOption[];
  defaultPersonName: string;
  catalog: ChargeCatalog | null;
}) {
  const [teamId, setTeamId] = useState(teams[0]?.id || '');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('credit_card');
  const [itemName, setItemName] = useState('');
  const [amount, setAmount] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(todayPacificDate);
  const [fileName, setFileName] = useState('');
  const [dragging, setDragging] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState('');
  const [suggestedCharge, setSuggestedCharge] = useState<{ expenseId: string; sourceId: string } | null>(null);
  const [chargeFieldVersion, setChargeFieldVersion] = useState(0);
  const receiptInputRef = useRef<HTMLInputElement>(null);
  const scanRequestRef = useRef(0);
  const editedRef = useRef({ item: false, amount: false, date: false, charge: false });
  const accounts = catalog?.teams[teamId] || [];

  const scanReceipt = async (file: File) => {
    const requestId = ++scanRequestRef.current;
    setScanning(true);
    setScanNote('Reading receipt…');
    try {
      const body = new FormData();
      body.append('image', file);
      body.append('team_id', teamId);
      const response = await fetch('/api/expense/scan', { method: 'POST', body });
      const result = (await response.json().catch(() => null)) as (Partial<ExtractedReceipt> & { error?: string }) | null;
      if (requestId !== scanRequestRef.current) return;
      if (!response.ok || !result) {
        setScanNote(result?.error || 'Could not read this receipt. Enter the details below.');
        return;
      }

      const filled: string[] = [];
      if (result.itemName && !editedRef.current.item) {
        setItemName(result.itemName);
        filled.push('item');
      }
      if (typeof result.amount === 'number' && result.amount > 0 && !editedRef.current.amount) {
        setAmount(result.amount.toFixed(2));
        filled.push('amount');
      }
      if (result.purchasedAt && !editedRef.current.date) {
        setPurchaseDate(result.purchasedAt);
        filled.push('date');
      }
      if (result.category && !editedRef.current.charge) {
        const charge = suggestReceiptCharge(accounts, {
          category: result.category,
          itemName: result.itemName || null,
          merchant: result.merchant || null
        });
        if (charge) {
          setSuggestedCharge(charge);
          setChargeFieldVersion((version) => version + 1);
          filled.push('category');
          if (charge.sourceId) filled.push('funding source');
        }
      }
      setScanNote(filled.length ? `Suggested ${filled.join(', ')}. Review before saving.` : 'No reliable details found. Enter them below.');
    } catch {
      if (requestId === scanRequestRef.current) setScanNote('Could not read this receipt. Enter the details below.');
    } finally {
      if (requestId === scanRequestRef.current) setScanning(false);
    }
  };

  const attachReceipt = (file: File | null | undefined) => {
    if (!file) return;
    if (!allowedReceiptTypes.has(file.type) || file.size > maxReceiptBytes || file.size === 0) {
      scanRequestRef.current += 1;
      setScanning(false);
      if (receiptInputRef.current) receiptInputRef.current.value = '';
      setFileName('');
      setScanNote('Use a PDF, PNG, JPG, or WEBP receipt under 2 MB.');
      return;
    }
    if (receiptInputRef.current?.files?.[0] !== file) {
      const transfer = new DataTransfer();
      transfer.items.add(file);
      if (receiptInputRef.current) receiptInputRef.current.files = transfer.files;
    }
    if (fileName) {
      setItemName('');
      setAmount('');
      setPurchaseDate(todayPacificDate());
    }
    setSuggestedCharge(null);
    setChargeFieldVersion((version) => version + 1);
    editedRef.current = { item: false, amount: false, date: false, charge: false };
    setFileName(file.name);
    void scanReceipt(file);
  };

  return (
    <form
      action={logPurchaseAction}
      className="receipt-first-purchase-form"
      onSubmit={(event) => {
        if (paymentMethod === 'credit_card' && !receiptInputRef.current?.files?.length && !window.confirm(missingReceiptWarning)) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="academic_year" value={academicYear} />
      <div className="purchase-receipt-field">
        <div
          className={`purchase-receipt-drop${dragging ? ' is-dragging' : ''}`}
          onDoubleClick={() => receiptInputRef.current?.click()}
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={(event) => { event.preventDefault(); setDragging(false); }}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            attachReceipt(event.dataTransfer.files?.[0]);
          }}
        >
          <span className="purchase-receipt-icon" aria-hidden="true">⇧</span>
          <span className="purchase-receipt-copy">
            <strong>{fileName || 'Drop your receipt here or double-click to upload it'}</strong>
            <span>{fileName ? 'PDF or image attached' : 'PDF, PNG, JPG, or WEBP · up to 2 MB'}</span>
          </span>
          <button className="button button-secondary purchase-receipt-browse" type="button" onClick={() => receiptInputRef.current?.click()}>
            Browse files
          </button>
        </div>
        <input
          ref={receiptInputRef}
          className="purchase-receipt-input"
          id="purchase-receipt"
          name="receipt"
          type="file"
          accept=".pdf,image/png,image/jpeg,image/webp"
          onChange={(event) => attachReceipt(event.target.files?.[0])}
          aria-label="Upload receipt"
        />
        {scanNote ? <p className="purchase-scan-note" role="status">{scanNote}</p> : null}
      </div>

      <div className="purchase-details-grid">
        <div className="field purchase-team-field">
          <label className="label" htmlFor="purchase-team">Team</label>
          <select
            className="select"
            id="purchase-team"
            name="team_id"
            value={teamId}
            onChange={(event) => {
              scanRequestRef.current += 1;
              setScanning(false);
              setScanNote('');
              setTeamId(event.target.value);
              setSuggestedCharge(null);
            }}
            required
          >
            {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
          </select>
        </div>
        <div className="field purchase-item-field">
          <label className="label" htmlFor="purchase-description">Item name</label>
          <input className="input" id="purchase-description" name="description" value={itemName} onChange={(event) => { editedRef.current.item = true; setItemName(event.target.value); }} placeholder="What was purchased?" required />
        </div>
        <div className="field">
          <label className="label" htmlFor="purchase-amount">Amount</label>
          <input className="input" id="purchase-amount" name="amount" type="number" min="0.01" step="0.01" value={amount} onChange={(event) => { editedRef.current.amount = true; setAmount(event.target.value); }} placeholder="0.00" required />
        </div>
        <div className="field">
          <label className="label" htmlFor="purchase-person">Person</label>
          <input className="input" id="purchase-person" name="person_name" defaultValue={defaultPersonName} placeholder="Who paid?" />
        </div>
        <BudgetChargeFields
          key={`${teamId}:${chargeFieldVersion}`}
          accounts={accounts}
          idPrefix="purchase"
          initialExpenseId={suggestedCharge?.expenseId || ''}
          initialSourceId={suggestedCharge?.sourceId || ''}
          onUserChange={() => { editedRef.current.charge = true; }}
        />
        <div className="field">
          <label className="label" htmlFor="purchase-date">Date</label>
          <input className="input" id="purchase-date" name="purchased_at" type="date" value={purchaseDate} onChange={(event) => { editedRef.current.date = true; setPurchaseDate(event.target.value); }} required />
        </div>
        <div className="field">
          <label className="label" htmlFor="purchase-method">Payment method</label>
          <select className="select" id="purchase-method" name="payment_method" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}>
            <option value="credit_card">Credit card</option>
            <option value="amazon">Amazon</option>
            <option value="reimbursement">Reimbursement</option>
            <option value="unknown">Unknown</option>
          </select>
        </div>
      </div>
      <div className="purchase-form-actions">
        <SaveButton scanning={scanning} />
      </div>
    </form>
  );
}
