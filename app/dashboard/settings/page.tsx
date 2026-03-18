import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { formatAcademicYear } from '@/lib/academic-calendar';

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: me } = await supabase
    .from('profiles')
    .select('id, role, active')
    .eq('id', user.id)
    .single();

  if (!me?.active || me.role !== 'admin') {
    redirect('/dashboard');
  }

  return (
    <div className="hq-page">
      <section className="hq-page-head">
        <div className="hq-page-head-copy">
          <p className="hq-eyebrow">Admin</p>
          <h1 className="hq-page-title">Club settings</h1>
          <p className="hq-subtitle">A home for club-wide operating settings, cycle references, and future portal controls.</p>
        </div>
      </section>

      <section className="hq-panel">
        <div className="hq-settings-grid">
          <div className="hq-setting-tile">
            <strong>Current academic cycle</strong>
            <span>{formatAcademicYear(new Date())}</span>
          </div>
          <div className="hq-setting-tile">
            <strong>Task assignment</strong>
            <span>Managed from the Assign Tasks page.</span>
          </div>
          <div className="hq-setting-tile">
            <strong>Team branding</strong>
            <span>Team logos can be updated from Manage Teams and the lead dashboard.</span>
          </div>
        </div>
      </section>
    </div>
  );
}
