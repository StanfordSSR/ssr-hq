import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { updateOwnDisplayNameAction } from '@/app/dashboard/actions';

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
    .select('id, full_name, role, active')
    .eq('id', user.id)
    .single();

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
    </div>
  );
}
