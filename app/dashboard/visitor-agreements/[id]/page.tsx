import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase-admin';
import { getViewerContext } from '@/lib/auth';
import { VisitorContractBody, ACKNOWLEDGEMENTS } from '@/components/visitor-contract-body';
import { formatAgreementDate, type VisitorAgreement } from '@/lib/visitor-agreements';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Signed visitor agreement — Stanford Student Robotics HQ'
};

function formatSignedTimestamp(value: string | null): string {
  if (!value) return 'Not signed';
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  }).format(new Date(value));
}

// Stroke metrics derived from the captured pen path: stroke count, total point
// count, and total drawing duration in seconds.
function strokeMetrics(strokes: VisitorAgreement['participant_signature_strokes']) {
  if (!strokes || strokes.length === 0) {
    return { strokeCount: 0, pointCount: 0, durationSeconds: 0 };
  }
  let pointCount = 0;
  let minT = Infinity;
  let maxT = -Infinity;
  for (const stroke of strokes) {
    for (const point of stroke) {
      pointCount += 1;
      if (typeof point.t === 'number') {
        if (point.t < minT) minT = point.t;
        if (point.t > maxT) maxT = point.t;
      }
    }
  }
  const durationSeconds =
    Number.isFinite(minT) && Number.isFinite(maxT) && maxT > minT ? (maxT - minT) / 1000 : 0;
  return { strokeCount: strokes.length, pointCount, durationSeconds };
}

export default async function SignedVisitorAgreementPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { currentRole } = await getViewerContext();
  if (currentRole !== 'admin' && currentRole !== 'president') {
    redirect('/dashboard');
  }

  const { id } = await params;
  const admin = createAdminClient();
  const { data } = await admin.from('visitor_agreements').select('*').eq('id', id).maybeSingle();
  const agreement = (data as VisitorAgreement | null) ?? null;
  if (!agreement) {
    redirect('/dashboard/settings');
  }

  const participantName = agreement.participant_name || 'External participant';
  const accessStart = formatAgreementDate(agreement.access_start);
  const accessEnd = formatAgreementDate(agreement.access_end);
  const acknowledgements = Array.isArray(agreement.acknowledgements)
    ? agreement.acknowledgements
    : [];
  const geo = agreement.signer_geo;
  const meta = agreement.signer_meta;
  const metrics = strokeMetrics(agreement.participant_signature_strokes);

  const geoParts = geo
    ? [geo.city, geo.region, geo.country].filter(Boolean).join(', ')
    : '';
  const geoCoords =
    geo && typeof geo.latitude === 'number' && typeof geo.longitude === 'number'
      ? `${geo.latitude.toFixed(4)}, ${geo.longitude.toFixed(4)}`
      : '';
  const screenSize =
    meta && typeof meta.screenW === 'number' && typeof meta.screenH === 'number'
      ? `${meta.screenW} × ${meta.screenH}`
      : '—';

  return (
    <div className="hq-page">
      <section className="hq-page-head">
        <div className="hq-page-head-copy">
          <p className="hq-eyebrow">Visitor agreement</p>
          <h1 className="hq-page-title">Signed external participant agreement</h1>
          <p className="hq-subtitle">{participantName}</p>
        </div>
        <div className="hq-page-head-actions">
          <Link href="/dashboard/settings" className="button-secondary">
            Back to settings
          </Link>
        </div>
      </section>

      <section className="hq-panel">
        <div className="hq-block-head">
          <h3>Participant details</h3>
        </div>
        <div className="hq-summary-list">
          <div className="hq-summary-row">
            <span>Full legal name</span>
            <strong>{agreement.participant_name || '—'}</strong>
          </div>
          <div className="hq-summary-row">
            <span>Affiliated university</span>
            <strong>{agreement.participant_university || '—'}</strong>
          </div>
          <div className="hq-summary-row">
            <span>Date of birth</span>
            <strong>
              {agreement.participant_dob ? formatAgreementDate(agreement.participant_dob) : '—'}
            </strong>
          </div>
          <div className="hq-summary-row">
            <span>Email</span>
            <strong>{agreement.participant_email || '—'}</strong>
          </div>
          <div className="hq-summary-row">
            <span>Phone</span>
            <strong>{agreement.participant_phone || '—'}</strong>
          </div>
        </div>
      </section>

      <section
        className="hq-panel"
        style={{ lineHeight: 1.75, color: '#231f20', maxWidth: 760 }}
      >
        <VisitorContractBody
          issuerName={agreement.issuer_name}
          accessStart={accessStart}
          accessEnd={accessEnd}
        />
      </section>

      <section className="hq-panel hq-surface-muted">
        <div className="hq-block-head">
          <h3>§15 acknowledgments</h3>
        </div>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, lineHeight: 1.7 }}>
          {ACKNOWLEDGEMENTS.map((text, index) => (
            <li
              key={index}
              style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', margin: '0 0 0.5rem' }}
            >
              <span
                aria-hidden="true"
                style={{ color: acknowledgements[index] === true ? '#3f7d3f' : '#9a8f8f', fontWeight: 700 }}
              >
                {acknowledgements[index] === true ? '✓' : '—'}
              </span>
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="hq-panel">
        <div className="hq-block-head">
          <h3>Participant signature</h3>
        </div>
        {agreement.participant_signature ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={agreement.participant_signature}
            alt={`Signature of ${participantName}`}
            style={{
              maxWidth: 360,
              width: '100%',
              border: '1px solid #e0d4d4',
              borderRadius: 8,
              background: '#ffffff'
            }}
          />
        ) : (
          <p className="empty-note">No signature on file.</p>
        )}
      </section>

      <section className="hq-panel hq-surface-muted">
        <div className="hq-block-head">
          <h3>Signing evidence</h3>
        </div>
        <div className="hq-summary-list">
          <div className="hq-summary-row">
            <span>Signed</span>
            <strong>{formatSignedTimestamp(agreement.signed_at)}</strong>
          </div>
          <div className="hq-summary-row">
            <span>Signer IP</span>
            <strong>{agreement.signer_ip || '—'}</strong>
          </div>
          <div className="hq-summary-row">
            <span>User agent</span>
            <strong style={{ wordBreak: 'break-word' }}>
              {agreement.signer_user_agent || '—'}
            </strong>
          </div>
          <div className="hq-summary-row">
            <span>Geo location</span>
            <strong>{geoParts || 'Unknown'}</strong>
          </div>
          <div className="hq-summary-row">
            <span>Coordinates</span>
            <strong>{geoCoords || '—'}</strong>
          </div>
          <div className="hq-summary-row">
            <span>Device language</span>
            <strong>{meta?.language || '—'}</strong>
          </div>
          <div className="hq-summary-row">
            <span>Device timezone</span>
            <strong>{meta?.timezone || '—'}</strong>
          </div>
          <div className="hq-summary-row">
            <span>Screen size</span>
            <strong>{screenSize}</strong>
          </div>
          <div className="hq-summary-row">
            <span>Platform</span>
            <strong>{meta?.platform || '—'}</strong>
          </div>
          <div className="hq-summary-row">
            <span>Signature strokes</span>
            <strong>{metrics.strokeCount}</strong>
          </div>
          <div className="hq-summary-row">
            <span>Signature points</span>
            <strong>{metrics.pointCount}</strong>
          </div>
          <div className="hq-summary-row">
            <span>Signing duration</span>
            <strong>{metrics.durationSeconds.toFixed(1)}s</strong>
          </div>
        </div>
        <p className="helper">
          Behavioral biometrics (the timed pen path), geo location, and device context are captured
          at signing as evidence of intent.
        </p>
      </section>

      <section className="hq-panel">
        <div className="hq-block-head">
          <h3>Issuing president</h3>
        </div>
        <div className="hq-summary-list">
          <div className="hq-summary-row">
            <span>Issued by</span>
            <strong>{agreement.issuer_name}</strong>
          </div>
        </div>
        {agreement.issuer_signature ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={agreement.issuer_signature}
            alt={`Signature of ${agreement.issuer_name}`}
            style={{
              maxWidth: 360,
              width: '100%',
              marginTop: '0.75rem',
              border: '1px solid #e0d4d4',
              borderRadius: 8,
              background: '#ffffff'
            }}
          />
        ) : (
          <p className="empty-note">No issuer signature on file.</p>
        )}
      </section>
    </div>
  );
}
