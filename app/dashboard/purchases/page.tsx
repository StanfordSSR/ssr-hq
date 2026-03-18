import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { formatAcademicYear, formatDateLabel } from '@/lib/academic-calendar';
import { PurchaseImport } from '@/components/purchase-import';
import { ManualPurchaseForm } from '@/components/manual-purchase-form';
import { getReceiptTaskState } from '@/lib/purchases';

type Team = {
  id: string;
  name: string;
};

type Purchase = {
  id: string;
  team_id: string;
  description: string;
  amount_cents: number;
  purchased_at: string;
  person_name: string | null;
  payment_method: 'reimbursement' | 'credit_card' | 'amazon' | 'unknown';
  category: 'equipment' | 'food' | 'travel';
  receipt_path: string | null;
  receipt_not_needed: boolean;
};

const paymentMethodLabel: Record<Purchase['payment_method'], string> = {
  reimbursement: 'Reimbursement',
  credit_card: 'Credit card',
  amazon: 'Amazon',
  unknown: 'Unknown'
};

const categoryLabel: Record<Purchase['category'], string> = {
  equipment: 'Equipment',
  food: 'Food',
  travel: 'Travel'
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

  const isAdmin = me.role === 'admin';

  const { data: memberships } = isAdmin
    ? { data: [] }
    : await admin
        .from('team_memberships')
        .select('team_id')
        .eq('user_id', user.id)
        .eq('team_role', 'lead')
        .eq('is_active', true);

  const myTeamIds = isAdmin ? [] : (memberships || []).map((membership) => membership.team_id);
  const { data: teamsData } = isAdmin
    ? await admin.from('teams').select('id, name').order('name')
    : await admin.from('teams').select('id, name').in('id', myTeamIds).order('name');
  const teams = (teamsData || []) as Team[];

  if (teams.length === 0) {
    return (
      <div className="hq-page">
        <section className="hq-page-head">
          <div className="hq-page-head-copy">
            <p className="hq-eyebrow">{isAdmin ? 'Admin' : 'Lead portal'}</p>
            <h1 className="hq-page-title">{isAdmin ? 'Purchase log' : 'Log purchase'}</h1>
            <p className="hq-subtitle">
              {isAdmin ? 'Create a team before logging purchases.' : 'You need an active team before you can log purchases.'}
            </p>
          </div>
        </section>
      </div>
    );
  }

  const academicYear = formatAcademicYear(new Date());
  const accessibleTeamIds = teams.map((team) => team.id);
  const teamNameMap = new Map<string, string>(teams.map((team) => [team.id, team.name]));

  const { data: purchasesData } = await admin
    .from('purchase_logs')
    .select(
      'id, team_id, description, amount_cents, purchased_at, person_name, payment_method, category, receipt_path, receipt_not_needed'
    )
    .in('team_id', accessibleTeamIds)
    .order('purchased_at', { ascending: false });

  const purchases = (purchasesData || []) as Purchase[];
  const totalLogged = purchases.reduce((sum, purchase) => sum + purchase.amount_cents, 0) / 100;

  return (
    <div className="hq-page">
      <section className="hq-page-head">
        <div className="hq-page-head-copy">
          <p className="hq-eyebrow">{isAdmin ? 'Admin' : 'Lead portal'}</p>
          <h1 className="hq-page-title">{isAdmin ? 'Purchase log' : 'Log purchase'}</h1>
          <p className="hq-subtitle">
            Track spending as it happens and import historical purchases when you need to backfill data.
          </p>
        </div>
      </section>

      <section className="hq-purchase-overview">
        <div className="hq-purchase-stat">
          <span>Current cycle</span>
          <strong>{academicYear}</strong>
        </div>
        <div className="hq-purchase-stat">
          <span>Purchases logged</span>
          <strong>{purchases.length}</strong>
        </div>
        <div className="hq-purchase-stat">
          <span>Recorded spend</span>
          <strong>${totalLogged.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
        </div>
      </section>

      <div className="hq-purchases-layout">
        <section className="hq-panel hq-surface-muted hq-purchase-panel">
          <div className="hq-block-head">
            <h3>New purchase</h3>
            <span className="hq-inline-note">Manual entry</span>
          </div>

          <ManualPurchaseForm academicYear={academicYear} teams={teams} defaultPersonName={me.full_name || ''} />
        </section>

        <section className="hq-panel hq-surface-muted hq-purchase-panel">
          <PurchaseImport teams={teams} defaultTeamId={teams[0]?.id || ''} academicYear={academicYear} />
        </section>
      </div>

      <section className="hq-panel hq-surface-muted">
        <div className="hq-block-head">
          <h3>Recent purchases</h3>
        </div>

        {purchases.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Item</th>
                  <th>Amount</th>
                  <th>Person</th>
                  <th>Payment method</th>
                  <th>Category</th>
                  <th>Receipt</th>
                  <th>Team</th>
                </tr>
              </thead>
              <tbody>
                {purchases.slice(0, 25).map((purchase) => (
                  <tr key={purchase.id}>
                    <td>{formatDateLabel(new Date(purchase.purchased_at))}</td>
                    <td style={{ fontWeight: 700 }}>{purchase.description}</td>
                    <td>${(purchase.amount_cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td>{purchase.person_name || 'Unknown'}</td>
                    <td>{paymentMethodLabel[purchase.payment_method]}</td>
                    <td>{categoryLabel[purchase.category]}</td>
                    <td>
                      {(() => {
                        const receiptState = getReceiptTaskState({
                          paymentMethod: purchase.payment_method,
                          purchasedAt: purchase.purchased_at,
                          receiptPath: purchase.receipt_path,
                          receiptNotNeeded: purchase.receipt_not_needed
                        });

                        if (!receiptState.required) {
                          return purchase.receipt_not_needed ? 'Not needed' : 'Not required';
                        }

                        if (receiptState.uploaded) {
                          return 'Uploaded';
                        }

                        return receiptState.overdue ? 'Overdue' : 'Pending';
                      })()}
                    </td>
                    <td>{teamNameMap.get(purchase.team_id) || 'Unknown team'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-note">No purchases logged yet.</p>
        )}
      </section>
    </div>
  );
}
