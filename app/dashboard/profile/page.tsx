import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';

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
    </div>
  );
}