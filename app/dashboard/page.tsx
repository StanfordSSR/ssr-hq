import { Header } from '@/components/header';
import { deactivateLeadAction, inviteLeadAction, signOutAction } from '@/app/dashboard/actions';
import { Profile, requireSignedInUser } from '@/lib/auth';

export default async function DashboardPage() {
  const { supabase, user } = await requireSignedInUser();

  const { data: me } = await supabase
    .from('profiles')
    .select('id, full_name, role, active, created_at')
    .eq('id', user.id)
    .single<Profile>();

  const isAdmin = me?.role === 'admin' && me.active;

  const { data: profiles } = isAdmin
    ? await supabase
        .from('profiles')
        .select('id, full_name, role, active, created_at')
        .order('created_at', { ascending: true })
    : { data: [] as Profile[] };

  const admins = (profiles || []).filter((profile) => profile.role === 'admin' && profile.active).length;
  const leads = (profiles || []).filter((profile) => profile.role === 'team_lead' && profile.active).length;
  const inactive = (profiles || []).filter((profile) => !profile.active).length;

  return (
    <>
      <Header
        action={
          <form action={signOutAction}>
            <button className="button-ghost" type="submit">
              Sign out
            </button>
          </form>
        }
      />

      <main className="page-shell layout">
        <aside className="sidebar">
          <div className="panel">
            <div className="kicker">Signed in as</div>
            <h3 style={{ marginBottom: 6 }}>{me?.full_name || user.email}</h3>
            <p style={{ marginTop: 0 }}>{user.email}</p>
            <div className={`badge ${isAdmin ? 'badge-admin' : 'badge-team'}`}>{isAdmin ? 'Admin' : 'Team lead'}</div>
            <p className="helper" style={{ marginTop: 16 }}>
              This starter focuses on access control first. Next layers are funding requests, receipts, reports,
              budget ledgers, and member activity logs.
            </p>
          </div>
        </aside>

        <section className="content-stack">
          <div className="content-card">
            <div className="section-head">
              <div>
                <div className="kicker">Command deck</div>
                <h2 style={{ margin: '6px 0 0' }}>Welcome to Stanford Student Robotics HQ</h2>
              </div>
            </div>

            {isAdmin ? (
              <div className="metric-row">
                <div className="metric-card">
                  <strong>{admins}</strong>
                  <span>active admins</span>
                </div>
                <div className="metric-card">
                  <strong>{leads}</strong>
                  <span>active team leads</span>
                </div>
                <div className="metric-card">
                  <strong>{inactive}</strong>
                  <span>inactive accounts</span>
                </div>
              </div>
            ) : (
              <p className="empty-note">
                You are logged in successfully. Once you add your team modules, this dashboard can become the home
                for team reports, receipts, purchase requests, and quarterly funding forms.
              </p>
            )}
          </div>

          {isAdmin ? (
            <>
              <div className="content-card">
                <div className="section-head">
                  <div>
                    <div className="kicker">Access control</div>
                    <h3 style={{ margin: '6px 0 0' }}>Invite an admin or team lead</h3>
                  </div>
                </div>

                <form action={inviteLeadAction} className="form-stack">
                  <div className="field">
                    <label className="label" htmlFor="full_name">
                      Full name
                    </label>
                    <input className="input" id="full_name" name="full_name" placeholder="Avery Builder" />
                  </div>

                  <div className="field">
                    <label className="label" htmlFor="email">
                      Email
                    </label>
                    <input className="input" id="email" name="email" type="email" placeholder="lead@stanford.edu" required />
                  </div>

                  <div className="field">
                    <label className="label" htmlFor="role">
                      Role
                    </label>
                    <select className="select" id="role" name="role" defaultValue="team_lead">
                      <option value="team_lead">Team lead</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>

                  <div className="button-row">
                    <button className="button" type="submit">
                      Send invite
                    </button>
                  </div>
                </form>
              </div>

              <div className="content-card">
                <div className="section-head">
                  <div>
                    <div className="kicker">User directory</div>
                    <h3 style={{ margin: '6px 0 0' }}>Current HQ access</h3>
                  </div>
                </div>

                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Role</th>
                        <th>Status</th>
                        <th>Created</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(profiles || []).map((profile) => (
                        <tr key={profile.id}>
                          <td>
                            <div style={{ color: '#eef4ff', fontWeight: 700 }}>{profile.full_name || 'Pending setup'}</div>
                            <div>{profile.id === user.id ? 'You' : profile.id.slice(0, 8)}</div>
                          </td>
                          <td>
                            <span className={`badge ${profile.role === 'admin' ? 'badge-admin' : 'badge-team'}`}>
                              {profile.role === 'admin' ? 'Admin' : 'Team lead'}
                            </span>
                          </td>
                          <td>
                            {profile.active ? <span className="badge badge-team">Active</span> : <span className="badge badge-off">Inactive</span>}
                          </td>
                          <td>{new Date(profile.created_at).toLocaleDateString()}</td>
                          <td>
                            {profile.id !== user.id && profile.active ? (
                              <form action={deactivateLeadAction}>
                                <input type="hidden" name="target_id" value={profile.id} />
                                <button className="button-ghost" type="submit">
                                  Deactivate
                                </button>
                              </form>
                            ) : (
                              <span className="helper">No action</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : null}
        </section>
      </main>
    </>
  );
}
