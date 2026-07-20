'use client';

import { useEffect, useRef, useState } from 'react';

type TeamOption = { id: string; name: string };

type PurchaseType = 'equipment' | 'event_food' | 'travel' | 'other';
type TravelSubtype = 'vehicle_rental' | 'gas_reimbursement' | 'food';

const NAME_STORAGE_KEY = 'ssr_submitter_name';

const OFF_CAMPUS_NOTICE =
  "We noticed you're not on campus. Please confirm you are following all relevant policy when it comes to orders not shipped to campus.";

const GAS_MIN_ATTACHMENTS = 2;

const PURCHASE_TYPE_OPTIONS: Array<{ value: PurchaseType; label: string }> = [
  { value: 'equipment', label: 'Equipment' },
  { value: 'event_food', label: 'Event food' },
  { value: 'travel', label: 'Travel' },
  { value: 'other', label: 'Other' }
];

const TRAVEL_SUBTYPE_OPTIONS: Array<{ value: TravelSubtype; label: string }> = [
  { value: 'vehicle_rental', label: 'Vehicle rental' },
  { value: 'gas_reimbursement', label: 'Gas reimbursement' },
  { value: 'food', label: 'Food' }
];

export function SubmitReimbursementForm({
  teams,
  offCampus = false
}: {
  teams: TeamOption[];
  offCampus?: boolean;
}) {
  const [teamId, setTeamId] = useState(teams[0]?.id || '');
  const [submitterName, setSubmitterName] = useState('');
  const [purchaseType, setPurchaseType] = useState<PurchaseType | ''>('');
  const [travelSubtype, setTravelSubtype] = useState<TravelSubtype | ''>('');
  const [itemName, setItemName] = useState('');
  const [amount, setAmount] = useState('');
  const [reimbursementNumber, setReimbursementNumber] = useState('');
  const [receipts, setReceipts] = useState<File[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [scanning, setScanning] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // Shown when HQ geolocates the submitter outside the Bay Area (either at page
  // load, or re-flagged by the server at submit time). Must be acknowledged.
  const [showOffCampus, setShowOffCampus] = useState(offCampus);
  const [offCampusAck, setOffCampusAck] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const isGasReimbursement = purchaseType === 'travel' && travelSubtype === 'gas_reimbursement';
  const gasNeedsMoreFiles = isGasReimbursement && receipts.length < GAS_MIN_ATTACHMENTS;

  // Auto-fill the member's name across visits.
  useEffect(() => {
    const saved = window.localStorage.getItem(NAME_STORAGE_KEY);
    if (saved) setSubmitterName(saved);
  }, []);

  // Preview the first attached image (if any).
  useEffect(() => {
    const firstImage = receipts.find((file) => file.type.startsWith('image/'));
    if (!firstImage) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(firstImage);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [receipts]);

  const scanReceipt = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      // PDFs and non-images can still be attached, just not auto-read.
      setScanNote('Attached. Enter the item and amount manually.');
      return;
    }
    setScanning(true);
    setScanNote(null);
    setError(null);
    try {
      const body = new FormData();
      body.append('image', file);
      const response = await fetch('/api/submit/extract', { method: 'POST', body });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setScanNote(data?.error || 'Could not read the receipt — enter the details manually.');
        return;
      }
      const filledItem = typeof data.itemName === 'string' && data.itemName.trim();
      const filledAmount = typeof data.amount === 'number' && data.amount > 0;
      const filledRnum = typeof data.reimbursementNumber === 'string' && data.reimbursementNumber.trim();
      if (filledItem) setItemName(data.itemName);
      if (filledAmount) setAmount(String(data.amount));
      if (filledRnum) setReimbursementNumber(data.reimbursementNumber);
      setScanNote(
        filledItem || filledAmount || filledRnum
          ? 'Scanned ✓ — double-check the values below before submitting.'
          : "Couldn't read this one clearly — enter the details manually."
      );
    } catch {
      setScanNote('Network error scanning the receipt — enter the details manually.');
    } finally {
      setScanning(false);
    }
  };

  const addFiles = (incoming: FileList | File[] | null | undefined) => {
    if (!incoming) return;
    const files = Array.from(incoming);
    if (files.length === 0) return;
    setReceipts((current) => {
      const wasEmpty = current.length === 0;
      // De-dupe by name + size so re-selecting doesn't stack duplicates.
      const seen = new Set(current.map((file) => `${file.name}:${file.size}`));
      const merged = [...current];
      for (const file of files) {
        const key = `${file.name}:${file.size}`;
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(file);
        }
      }
      // Auto-scan the first image only on the first upload, to fill item/amount.
      if (wasEmpty) {
        const firstImage = files.find((file) => file.type.startsWith('image/'));
        if (firstImage) void scanReceipt(firstImage);
        else setScanNote('Attached. Enter the item and amount manually.');
      }
      return merged;
    });
  };

  const removeFile = (index: number) => {
    setReceipts((current) => current.filter((_, i) => i !== index));
  };

  const handlePaste = (event: React.ClipboardEvent) => {
    const item = Array.from(event.clipboardData.items).find((i) => i.type.startsWith('image/'));
    if (item) {
      const file = item.getAsFile();
      if (file) {
        event.preventDefault();
        addFiles([file]);
      }
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!purchaseType) {
      setError('Choose a purchase type.');
      return;
    }
    if (purchaseType === 'travel' && !travelSubtype) {
      setError('Choose a travel type.');
      return;
    }
    if (gasNeedsMoreFiles) {
      setError(
        'Gas reimbursements require at least two files: your route driven with mileage, and your gas receipt(s).'
      );
      return;
    }
    if (showOffCampus && !offCampusAck) {
      setError('Please confirm the off-campus policy notice before submitting.');
      return;
    }

    setSubmitting(true);

    try {
      const body = new FormData();
      body.append('team_id', teamId);
      body.append('submitter_name', submitterName);
      body.append('purchase_type', purchaseType);
      if (purchaseType === 'travel') body.append('travel_subtype', travelSubtype);
      body.append('item_name', itemName);
      body.append('amount', amount);
      body.append('reimbursement_number', reimbursementNumber);
      body.append('off_campus_ack', showOffCampus && offCampusAck ? 'true' : 'false');
      for (const file of receipts) body.append('receipt', file);

      const response = await fetch('/api/submit', { method: 'POST', body });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        // Server geolocated this submission off-campus even if the page didn't —
        // reveal the notice and make them confirm before retrying.
        if (data?.requireOffCampusAck) {
          setShowOffCampus(true);
          setOffCampusAck(false);
        }
        setError(data?.error || 'Could not submit. Please try again.');
        setSubmitting(false);
        return;
      }

      window.localStorage.setItem(NAME_STORAGE_KEY, submitterName.trim());
      setDone(data?.message || 'Submitted! Your team lead has been notified.');
    } catch {
      setError('Network error. Please try again.');
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="form-stack">
        <h2 style={{ marginBottom: 0 }}>Thanks, {submitterName.split(' ')[0] || 'submitted'}!</h2>
        <p className="helper">{done}</p>
        <button
          type="button"
          className="button"
          onClick={() => {
            setDone(null);
            setPurchaseType('');
            setTravelSubtype('');
            setItemName('');
            setAmount('');
            setReimbursementNumber('');
            setReceipts([]);
            setScanNote(null);
            setSubmitting(false);
          }}
        >
          Submit another
        </button>
      </div>
    );
  }

  return (
    <form className="form-stack" onSubmit={handleSubmit} onPaste={handlePaste}>
      <div className="field">
        <label className="label" htmlFor="team_id">
          Team
        </label>
        <select
          className="select"
          id="team_id"
          value={teamId}
          onChange={(event) => setTeamId(event.target.value)}
          required
        >
          {teams.length === 0 ? <option value="">No teams available</option> : null}
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label className="label" htmlFor="submitter_name">
          Your name
        </label>
        <input
          className="input"
          id="submitter_name"
          value={submitterName}
          onChange={(event) => setSubmitterName(event.target.value)}
          placeholder="As it appears on your team roster"
          autoComplete="name"
          required
        />
        <span className="helper">Must match your name on the team roster.</span>
      </div>

      <div className="field">
        <label className="label" htmlFor="purchase_type">
          Purchase type
        </label>
        <select
          className="select"
          id="purchase_type"
          value={purchaseType}
          onChange={(event) => {
            const next = event.target.value as PurchaseType | '';
            setPurchaseType(next);
            if (next !== 'travel') setTravelSubtype('');
          }}
          required
        >
          <option value="" disabled>
            Select a type…
          </option>
          {PURCHASE_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {purchaseType === 'travel' ? (
        <div className="field">
          <label className="label" htmlFor="travel_subtype">
            Travel type
          </label>
          <select
            className="select"
            id="travel_subtype"
            value={travelSubtype}
            onChange={(event) => setTravelSubtype(event.target.value as TravelSubtype | '')}
            required
          >
            <option value="" disabled>
              Select a travel type…
            </option>
            {TRAVEL_SUBTYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {isGasReimbursement ? (
        <div
          style={{
            border: '1.5px solid #8c1515',
            background: '#f7ecec',
            borderRadius: 10,
            padding: '0.9rem 1rem'
          }}
        >
          <strong style={{ display: 'block', marginBottom: '0.4rem' }}>Gas reimbursement requirements</strong>
          <p className="helper" style={{ margin: '0 0 0.5rem' }}>
            You must upload <strong>both</strong> your attachment of the route driven with mileage,
            <strong> and</strong> your gas receipts. The robotics club reimburses your{' '}
            <strong>actual gas cost</strong> from the receipts you upload — <strong>not</strong> a
            per-mile mileage rate.
          </p>
          <p className="helper" style={{ margin: 0 }}>
            Attach at least two files below (route/mileage + gas receipts).
          </p>
        </div>
      ) : null}

      <div className="field">
        <label className="label" htmlFor="receipt">
          {isGasReimbursement ? 'Attachments (route/mileage + gas receipts)' : 'Receipt (optional)'}
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
            addFiles(event.dataTransfer.files);
          }}
          style={{
            border: `1.5px dashed ${dragging ? '#8c1515' : '#c9bcbc'}`,
            borderRadius: 10,
            padding: previewUrl ? '0.75rem' : '1.25rem',
            textAlign: 'center',
            cursor: 'pointer',
            background: dragging ? '#f3e9e9' : '#faf7f7',
            transition: 'background 0.15s, border-color 0.15s'
          }}
        >
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="Receipt preview" style={{ maxHeight: 180, maxWidth: '100%', borderRadius: 6 }} />
          ) : (
            <span className="helper" style={{ display: 'block' }}>
              {scanning
                ? 'Reading receipt…'
                : dragging
                  ? 'Drop the files to attach them'
                  : isGasReimbursement
                    ? 'Drag & drop, paste, or click to upload multiple files.'
                    : 'Drag & drop, paste a screenshot, or click to upload. You can add more than one.'}
            </span>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          id="receipt"
          multiple
          accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
          style={{ display: 'none' }}
          onChange={(event) => {
            addFiles(event.target.files);
            // Reset so re-selecting the same file re-triggers onChange.
            event.target.value = '';
          }}
        />
        {receipts.length > 0 ? (
          <ul className="hq-attachment-list">
            {receipts.map((file, index) => (
              <li key={`${file.name}:${file.size}:${index}`} className="hq-attachment-item">
                <span className="hq-attachment-name">
                  {index === 0 ? '★ ' : ''}
                  {file.name}
                </span>
                <button
                  type="button"
                  className="hq-attachment-remove"
                  onClick={() => removeFile(index)}
                  aria-label={`Remove ${file.name}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {scanNote ? <span className="helper">{scanNote}</span> : null}
        {gasNeedsMoreFiles ? (
          <span className="helper" style={{ color: '#8c1515' }}>
            Attach at least {GAS_MIN_ATTACHMENTS} files: your route with mileage and your gas receipt(s).
          </span>
        ) : null}
      </div>

      <div className="field">
        <label className="label" htmlFor="item_name">
          Item / purchase
        </label>
        <input
          className="input"
          id="item_name"
          value={itemName}
          onChange={(event) => setItemName(event.target.value)}
          placeholder="Motor controller, team pizza, Zipcar…"
          required
        />
      </div>

      <div className="hq-inline-grid">
        <div className="field">
          <label className="label" htmlFor="amount">
            Amount (USD)
          </label>
          <input
            className="input"
            id="amount"
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0.00"
            required
          />
        </div>

        <div className="field">
          <label className="label" htmlFor="reimbursement_number">
            Granted R-number
          </label>
          <input
            className="input"
            id="reimbursement_number"
            value={reimbursementNumber}
            onChange={(event) => setReimbursementNumber(event.target.value)}
            placeholder="R-119704"
            required
          />
        </div>
      </div>

      {showOffCampus ? (
        <div
          style={{
            border: '1.5px solid #8c1515',
            background: '#f7ecec',
            borderRadius: 10,
            padding: '0.9rem 1rem'
          }}
        >
          <strong style={{ display: 'block', marginBottom: '0.4rem' }}>Off-campus notice</strong>
          <p className="helper" style={{ margin: '0 0 0.6rem' }}>
            {OFF_CAMPUS_NOTICE}
          </p>
          <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={offCampusAck}
              onChange={(event) => setOffCampusAck(event.target.checked)}
              style={{ marginTop: '0.2rem', flexShrink: 0 }}
            />
            <span style={{ fontWeight: 600 }}>
              I confirm I&apos;m following all relevant policy for orders not shipped to campus.
            </span>
          </label>
        </div>
      ) : null}

      <button
        className="button"
        type="submit"
        disabled={submitting || scanning || gasNeedsMoreFiles || (showOffCampus && !offCampusAck)}
      >
        {submitting ? 'Submitting…' : 'Submit reimbursement'}
      </button>

      {error ? (
        <p className="helper" style={{ color: '#8c1515' }}>
          {error}
        </p>
      ) : (
        <p className="helper">
          Your lead gets a Slack notification to approve or reject. Once approved, it&apos;s logged to
          your team&apos;s budget.
        </p>
      )}
    </form>
  );
}
