import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { formatAcademicYear } from '@/lib/academic-calendar';
import { logPurchaseAction } from '@/app/dashboard/actions';

type Team = {
  id: string;
  name: string;
};

type Purchase = {
  id: string;
  team_id: string;
  description: string;
  amount_cents: number;
  created_at: string;
};

export default async function PurchasesPage() {
  const supabase = await createClient();
  const admin = createAdminClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: me } = await supabase
    .from('profiles')
    .select('id, full_name, role, active')
    .eq('id', user.id)
    .single();

  if (!me?.active) {
    redirect('/login');
  }

  const { data: memberships } = await admin
    .from('team_memberships')
    .select('team_id')
    .eq('user_id', user.id)
    .eq('team_role', 'lead')
    .eq('is_active', true);

  const myTeamIds = (memberships || []).map((membership) => membership.team_id);

  if (myTeamIds.length === 0) {
    return (
      <div className="hq-page">
        <section className="hq-page-head">
          <div className="hq-page-head-copy">
            <p className="hq-eyebrow">Lead portal</p>
            <h1 className="hq-page-title">Log purchase</h1>
            <p className="hq-subtitle">You need an active team before you can log purchases.</p>
          </div>
        </section>
      </div>
    );
  }

  const { data: teamsData } = await admin.from('teams').select('id, name').in('id', myTeamIds).order('name');
  const teams = (teamsData || []) as Team[];
  const teamNameMap = new Map(teams.map((team) => [team.id, team.name]));

  const { data: purchasesData } = await admin
    .from('purchase_logs')
    .select('id, team_id, description, amount_cents, created_at')
    .in('team_id', myTeamIds)
    .order('created_at', { ascending: false });

  const purchases = (purchasesData || []) as Purchase[];

  return (
    <div className="hq-page">
      <section className="hq-page-head">
        <div className="hq-page-head-copy">
          <p className="hq-eyebrow">Lead portal</p>
          <h1 className="hq-page-title">Log purchase</h1>
          <p className="hq-subtitle">Track spending as it happens so your dashboard and finance view stay current.</p>
        </div>
      </section>

      <div className="hq-lead-grid">
        <section className="hq-panel hq-lead-block">
          <div className="hq-block-head">
            <h3>New purchase</h3>
          </div>

          <form action={logPurchaseAction} className="form-stack">
            <input type="hidden" name="academic_year" value={formatAcademicYear(new Date())} />
            <div className="field">
              <label className="label" htmlFor="purchase-team">
                Team
              </label>
              <select className="select" id="purchase-team" name="team_id" defaultValue={teams[0]?.id || ''} required>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="label" htmlFor="purchase-amount">
                Amount
              </label>
              <input className="input" id="purchase-amount" name="amount" type="number" min="0.01" step="0.01" required />
            </div>

            <div className="field">
              <label className="label" htmlFor="purchase-description">
                Description
              </label>
              <input className="input" id="purchase-description" name="description" placeholder="Motor controller, fabrication material, shipping..." required />
            </div>

            <div className="button-row">
              <button className="button" type="submit">
                Save purchase
              </button>
            </div>
          </form>
        </section>

        <section className="hq-panel hq-lead-block">
          <div className="hq-block-head">
            <h3>Recent purchases</h3>
          </div>

          {purchases.length > 0 ? (
            <div className="hq-summary-list">
              {purchases.slice(0, 8).map((purchase) => (
                <div key={purchase.id} className="hq-summary-row">
                  <span>{teamNameMap.get(purchase.team_id) || 'Unknown team'}</span>
                  <strong>{purchase.description}</strong>
                  <strong>${(purchase.amount_cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-note">No purchases logged yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}
