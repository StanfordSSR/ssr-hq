import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { updateOwnDisplayNameAction } from '@/app/dashboard/actions';
import { SignatureEnrollment } from '@/components/signature-enrollment';

export default async function PersonalProfilePage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, role, active, is_president, is_financial_officer')
    .eq('id', user.id)
    .single();

  // Anyone may need to sign — team leads approve reimbursements, officers sign
  // budgets/approvals — so signature enrollment is available to all users.
  const { data: sig } = await createAdminClient()
    .from('signature_profiles')
    .select('sample_count')
    .eq('user_id', user.id)
    .maybeSingle();
  const signatureEnrolled = Boolean(sig);
  const signatureSampleCount = sig?.sample_count || 0;

  return (
    <div className="hq-page">
      <section className="hq-page-head">
        <div>
          <p className="hq-eyebrow">Personal settings</p>
          <h1 className="hq-section-title">{profile?.full_name || 'Your profile'}</h1>
          <p className="hq-subtitle">
            This page will later hold personal preferences like display name and avatar.
          </p>
        </div>
      </section>

      <section className="hq-panel">
        <div className="hq-settings-grid">
          <div className="hq-setting-tile">
            <strong>Display name</strong>
            <span>{profile?.full_name || 'Not set'}</span>
          </div>
          <div className="hq-setting-tile">
            <strong>Portal role</strong>
            <span>{profile?.role || 'Unknown'}</span>
          </div>
          <div className="hq-setting-tile">
            <strong>Status</strong>
            <span>{profile?.active ? 'Active' : 'Inactive'}</span>
          </div>
        </div>
      </section>

      <section className="hq-panel hq-surface-muted">
        <div className="hq-section-head">
          <div className="hq-section-head-copy">
            <p className="hq-eyebrow">Profile</p>
            <h2 className="hq-section-title hq-section-title-compact">Edit your name</h2>
          </div>
        </div>

        <form action={updateOwnDisplayNameAction} className="form-stack">
          <div className="field">
            <label className="label" htmlFor="profile-full-name">
              Full name
            </label>
            <input
              className="input"
              id="profile-full-name"
              name="full_name"
              defaultValue={profile?.full_name || ''}
              maxLength={120}
              required
            />
            <span className="helper">This updates how your name appears across the portal.</span>
          </div>

          <div className="button-row">
            <button className="button" type="submit">
              Save name
            </button>
          </div>
        </form>
      </section>

      <section className="hq-panel hq-surface-muted">
        <div className="hq-section-head">
          <div className="hq-section-head-copy">
            <p className="hq-eyebrow">Security</p>
            <h2 className="hq-section-title hq-section-title-compact">Digital signature verification</h2>
            <p className="hq-subtitle">
              Your approval signatures are verified against an enrolled reference of your handwriting.
              Team leads need this to approve higher-value reimbursements, and officers use it to sign
              budgets and approvals. Enroll a few sample signatures here; every future approval you sign
              is automatically checked against them.
            </p>
          </div>
        </div>
        <SignatureEnrollment enrolled={signatureEnrolled} sampleCount={signatureSampleCount} />
      </section>
    </div>
  );
}
