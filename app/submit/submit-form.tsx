'use client';

import { useEffect, useRef, useState } from 'react';

type TeamOption = { id: string; name: string };

const NAME_STORAGE_KEY = 'ssr_submitter_name';

export function SubmitReimbursementForm({ teams }: { teams: TeamOption[] }) {
  const [teamId, setTeamId] = useState(teams[0]?.id || '');
  const [submitterName, setSubmitterName] = useState('');
  const [itemName, setItemName] = useState('');
  const [amount, setAmount] = useState('');
  const [reimbursementNumber, setReimbursementNumber] = useState('');
  const [receipt, setReceipt] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-fill the member's name across visits.
  useEffect(() => {
    const saved = window.localStorage.getItem(NAME_STORAGE_KEY);
    if (saved) setSubmitterName(saved);
  }, []);

  useEffect(() => {
    if (!receipt) {
      setPreviewUrl(null);
      return;
    }
    if (!receipt.type.startsWith('image/')) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(receipt);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [receipt]);

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
      if (filledItem) setItemName(data.itemName);
      if (filledAmount) setAmount(String(data.amount));
      setScanNote(
        filledItem || filledAmount
          ? 'Scanned ✓ — double-check the values below before submitting.'
          : "Couldn't read this one clearly — enter the details manually."
      );
    } catch {
      setScanNote('Network error scanning the receipt — enter the details manually.');
    } finally {
      setScanning(false);
    }
  };

  const handleFile = (file: File | null | undefined) => {
    if (!file) return;
    setReceipt(file);
    void scanReceipt(file);
  };

  const handlePaste = (event: React.ClipboardEvent) => {
    const item = Array.from(event.clipboardData.items).find((i) => i.type.startsWith('image/'));
    if (item) {
      const file = item.getAsFile();
      if (file) {
        event.preventDefault();
        handleFile(file);
      }
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const body = new FormData();
      body.append('team_id', teamId);
      body.append('submitter_name', submitterName);
      body.append('item_name', itemName);
      body.append('amount', amount);
      body.append('reimbursement_number', reimbursementNumber);
      if (receipt) body.append('receipt', receipt);

      const response = await fetch('/api/submit', { method: 'POST', body });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
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
            setItemName('');
            setAmount('');
            setReimbursementNumber('');
            setReceipt(null);
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
        <label className="label" htmlFor="receipt">
          Receipt (optional)
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
          style={{
            border: '1.5px dashed #c9bcbc',
            borderRadius: 10,
            padding: previewUrl ? '0.75rem' : '1.25rem',
            textAlign: 'center',
            cursor: 'pointer',
            background: '#faf7f7'
          }}
        >
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="Receipt preview" style={{ maxHeight: 180, maxWidth: '100%', borderRadius: 6 }} />
          ) : (
            <span className="helper" style={{ display: 'block' }}>
              {scanning ? 'Reading receipt…' : 'Paste a screenshot here, or click to upload.'}
            </span>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          id="receipt"
          accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
          style={{ display: 'none' }}
          onChange={(event) => handleFile(event.target.files?.[0])}
        />
        {scanNote ? <span className="helper">{scanNote}</span> : null}
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

      <button className="button" type="submit" disabled={submitting || scanning}>
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
