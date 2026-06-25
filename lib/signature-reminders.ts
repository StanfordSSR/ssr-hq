import { createAdminClient } from '@/lib/supabase-admin';
import { env } from '@/lib/env';
import {
  SLACKBOT_SYSTEM_TEAM_ID,
  SLACKBOT_SYSTEM_TEAM_NAME,
  sendSlackbotNotification
} from '@/lib/slackbot';
import { getReimbursementSettings } from '@/lib/reimbursements';

type SignerProfile = { id: string; full_name: string | null; email: string | null };

// Nudges everyone who signs in HQ — active team leads, presidents, financial
// officers — who hasn't enrolled a verification signature. Runs from the daily
// cron but only sends to a given user once per the admin-configured interval.
export async function runSignatureEnrollmentReminderCron() {
  const settings = await getReimbursementSettings();
  if (!settings.signatureReminderEnabled) {
    return { reminded: 0, skipped: 'disabled' as const };
  }

  const admin = createAdminClient();

  const [{ data: officers }, { data: leadMemberships }, { data: enrolledRows }, { data: reminderRows }] =
    await Promise.all([
      admin
        .from('profiles')
        .select('id, full_name, email')
        .eq('active', true)
        .or(
          'role.eq.president,role.eq.vice_president,role.eq.financial_officer,is_president.eq.true,is_vice_president.eq.true,is_financial_officer.eq.true'
        ),
      admin.from('team_memberships').select('user_id').eq('team_role', 'lead').eq('is_active', true),
      admin.from('signature_profiles').select('user_id'),
      admin.from('signature_enrollment_reminders').select('user_id, last_sent_at')
    ]);

  const leadIds = Array.from(new Set((leadMemberships || []).map((m) => m.user_id)));
  let leadProfiles: SignerProfile[] = [];
  if (leadIds.length > 0) {
    const { data } = await admin
      .from('profiles')
      .select('id, full_name, email')
      .in('id', leadIds)
      .eq('active', true);
    leadProfiles = (data as SignerProfile[]) || [];
  }

  // Union of all signing roles, de-duped by id.
  const signers = new Map<string, SignerProfile>();
  for (const p of (officers as SignerProfile[]) || []) signers.set(p.id, p);
  for (const p of leadProfiles) signers.set(p.id, p);

  const enrolled = new Set((enrolledRows || []).map((r) => r.user_id));
  const lastSent = new Map((reminderRows || []).map((r) => [r.user_id, r.last_sent_at as string]));
  const intervalMs = settings.signatureReminderIntervalDays * 24 * 60 * 60 * 1000;
  const now = Date.now();

  const due = Array.from(signers.values()).filter((p) => {
    if (!p.email) return false;
    if (enrolled.has(p.id)) return false;
    const last = lastSent.get(p.id);
    if (!last) return true;
    return now - new Date(last).getTime() >= intervalMs;
  });

  if (due.length === 0) {
    return { reminded: 0 };
  }

  const enrollUrl = `${env.siteUrl}/dashboard/profile`;
  try {
    await sendSlackbotNotification({
      idempotency_key: `signature_reminder:${new Date().toISOString().slice(0, 10)}`,
      type: 'manual_message',
      team_id: SLACKBOT_SYSTEM_TEAM_ID,
      team_name: SLACKBOT_SYSTEM_TEAM_NAME,
      recipient_emails: due.map((p) => (p.email as string).toLowerCase()),
      title: 'Enroll your approval signature',
      message:
        "You approve things in SSR HQ (reimbursements, budgets) but haven't enrolled a verification " +
        `signature yet. It takes about a minute — enroll in Personal settings: ${enrollUrl}`,
      cta_label: 'Enroll signature',
      cta_url: enrollUrl,
      metadata: { source: 'signature_enrollment_reminder', count: due.length }
    });
  } catch (error) {
    console.error('Signature reminder push failed:', error);
    return { reminded: 0, error: true as const };
  }

  const sentAt = new Date().toISOString();
  const { error } = await admin
    .from('signature_enrollment_reminders')
    .upsert(due.map((p) => ({ user_id: p.id, last_sent_at: sentAt })), { onConflict: 'user_id' });
  if (error) {
    console.error('Failed to record signature reminders:', error.message);
  }

  return { reminded: due.length };
}
