'use client';

import { useState } from 'react';
import { logHighValueAssetInline } from '@/app/dashboard/actions';
import {
  LEADERSHIP_STEWARD_LABEL,
  LEADERSHIP_STEWARD_VALUE,
  STORAGE_LOCATIONS,
  type StorageLocation
} from '@/lib/high-value-assets';
import type { HighValueAssetView } from '@/components/high-value-asset-list';

// Collapsible dashboard logger for capital equipment over $1,000. Everything the
// club buys is the property of Stanford University, so each high value item must
// be tracked for stewardship. Submits to the inline server action and reports
// the resolved asset to the panel through onLogged, so the list updates in place
// with no navigation or full dashboard revalidate. The form action processes the
// result inline (no effect) so it can both notify the parent and reset fields.
export function HighValueAssetLogger({
  teams,
  canStewardLeadership = false,
  onLogged
}: {
  teams: { id: string; name: string }[];
  canStewardLeadership?: boolean;
  onLogged: (asset: HighValueAssetView) => void;
}) {
  const [open, setOpen] = useState(false);
  const [itemName, setItemName] = useState('');
  const [amount, setAmount] = useState('');
  const [storageLocation, setStorageLocation] = useState<StorageLocation>('robotics_room');
  const [storageLocationOther, setStorageLocationOther] = useState('');
  const [stewardshipNote, setStewardshipNote] = useState('');
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Disables itself while in flight so an impatient double-click can't log twice.
  // Drives the inline action, then resets fields / notifies the panel on success.
  async function handleSubmit(formData: FormData) {
    setPending(true);
    setErrorMessage('');
    try {
      const result = await logHighValueAssetInline(undefined, formData);
      if (result.ok && result.data) {
        onLogged(result.data);
        setItemName('');
        setAmount('');
        setStorageLocation('robotics_room');
        setStorageLocationOther('');
        setStewardshipNote('');
      } else {
        setErrorMessage(result.message || 'Failed to log the high value asset.');
      }
    } finally {
      setPending(false);
    }
  }

  const noteWordCount = stewardshipNote.trim().split(/\s+/).filter(Boolean).length;
  const amountValue = Number(amount);
  const otherMissing = storageLocation === 'other' && !storageLocationOther.trim();
  const submitDisabled =
    !itemName.trim() ||
    !Number.isFinite(amountValue) ||
    amountValue <= 1000 ||
    noteWordCount === 0 ||
    noteWordCount > 30 ||
    otherMissing;

  const singleTeamId = teams.length === 1 ? teams[0].id : '';

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
          <strong style={{ display: 'block' }}>Log high value capital expense</strong>
          <small className="helper">Single capital equipment over $1,000 must be tracked for stewardship.</small>
        </span>
        <span aria-hidden="true" style={{ fontSize: '1.1rem' }}>
          {open ? '▾' : '▸'}
        </span>
      </button>

      {open ? (
        <form action={handleSubmit} className="form-stack" style={{ marginTop: '1rem' }}>
          <div
            style={{
              border: '1.5px solid #8c1515',
              borderRadius: 10,
              padding: '0.85rem 1rem',
              background: '#f9eeee',
              color: '#5f0f0f'
            }}
          >
            <p style={{ margin: 0 }}>
              All equipment costing over $1,000 must be actively logged and tracked for stewardship.
              Everything the club buys is the property of Stanford University and must be stewarded
              properly. <strong>Any untracked equipment above this amount may be permanently reclaimed
              from the team.</strong>
            </p>
          </div>

          {teams.length > 1 || canStewardLeadership ? (
            <div className="field">
              <label className="label" htmlFor="hva-team">
                Stewarded by
              </label>
              <select
                className="select"
                id="hva-team"
                name="steward"
                defaultValue={canStewardLeadership ? LEADERSHIP_STEWARD_VALUE : teams[0]?.id || ''}
                required
              >
                {canStewardLeadership ? (
                  <option value={LEADERSHIP_STEWARD_VALUE}>{LEADERSHIP_STEWARD_LABEL}</option>
                ) : null}
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
              <span className="helper">Which team (or club leadership) stewards this asset.</span>
            </div>
          ) : (
            <input type="hidden" name="steward" value={singleTeamId} />
          )}

          <div className="field">
            <label className="label" htmlFor="hva-item">
              Item / equipment
            </label>
            <input
              className="input"
              id="hva-item"
              name="item_name"
              placeholder="NVIDIA Jetson Orin AGX"
              value={itemName}
              onChange={(event) => setItemName(event.target.value)}
              required
            />
          </div>

          <div className="hq-inline-grid">
            <div className="field">
              <label className="label" htmlFor="hva-amount">
                Cost (USD)
              </label>
              <input
                className="input"
                id="hva-amount"
                name="amount"
                type="number"
                min="1000.01"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required
              />
              <span className="helper">Single items only — must be over $1,000.</span>
            </div>

            <div className="field">
              <label className="label" htmlFor="hva-location">
                Storage location
              </label>
              <select
                className="select"
                id="hva-location"
                name="storage_location"
                value={storageLocation}
                onChange={(event) => setStorageLocation(event.target.value as StorageLocation)}
              >
                {STORAGE_LOCATIONS.map((location) => (
                  <option key={location.value} value={location.value}>
                    {location.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {storageLocation === 'other' ? (
            <div className="field">
              <label className="label" htmlFor="hva-location-other">
                Where (max 50 chars)
              </label>
              <input
                className="input"
                id="hva-location-other"
                name="storage_location_other"
                maxLength={50}
                placeholder="e.g. Building 550, cabinet 3"
                value={storageLocationOther}
                onChange={(event) => setStorageLocationOther(event.target.value)}
                required
              />
            </div>
          ) : null}

          <div className="field">
            <label className="label" htmlFor="hva-note">
              In under 30 words, why was this purchased and how will you ensure it&apos;s stewarded properly?
            </label>
            <textarea
              className="input hq-textarea"
              id="hva-note"
              name="stewardship_note"
              rows={3}
              value={stewardshipNote}
              onChange={(event) => setStewardshipNote(event.target.value)}
              required
            />
            <span className="helper" style={{ color: noteWordCount > 30 ? '#8c1515' : undefined }}>
              {noteWordCount} / 30 words
            </span>
          </div>

          {errorMessage ? (
            <span className="helper" style={{ color: '#8c1515' }}>
              {errorMessage}
            </span>
          ) : null}

          <div className="button-row">
            <button className="button" type="submit" disabled={submitDisabled || pending} aria-busy={pending}>
              {pending ? 'Logging…' : 'Log asset'}
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
