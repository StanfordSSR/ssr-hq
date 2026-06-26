'use client';

import { useState } from 'react';
import { logHighValueAssetAction } from '@/app/dashboard/actions';
import { STORAGE_LOCATIONS, type StorageLocation } from '@/lib/high-value-assets';

// Collapsible dashboard logger for capital equipment over $1,000. Everything the
// club buys is the property of Stanford University, so each high value item must
// be tracked for stewardship. Posts to logHighValueAssetAction, which authorizes
// the acting team lead (or an admin) for the chosen team.
export function HighValueAssetLogger({ teams }: { teams: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [itemName, setItemName] = useState('');
  const [amount, setAmount] = useState('');
  const [storageLocation, setStorageLocation] = useState<StorageLocation>('robotics_room');
  const [storageLocationOther, setStorageLocationOther] = useState('');
  const [stewardshipNote, setStewardshipNote] = useState('');

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
        <form action={logHighValueAssetAction} className="form-stack" style={{ marginTop: '1rem' }}>
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

          {teams.length > 1 ? (
            <div className="field">
              <label className="label" htmlFor="hva-team">
                Team
              </label>
              <select className="select" id="hva-team" name="team_id" defaultValue={teams[0]?.id || ''} required>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <input type="hidden" name="team_id" value={singleTeamId} />
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

          <div className="button-row">
            <button className="button" type="submit" disabled={submitDisabled}>
              Log asset
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
