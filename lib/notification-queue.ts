import { createAdminClient } from '@/lib/supabase-admin';
import { buildInviteConfirmLink } from '@/lib/invite-links';
import {
  formatDateLabel,
  formatCountdown,
  formatPacificDateKey,
  getNextReportState
} from '@/lib/academic-calendar';
import { recordAuditEvent } from '@/lib/audit';
import { env } from '@/lib/env';
import { sendInviteReminderEmail, sendReceiptDigestEmail, sendReportReminderEmail } from '@/lib/notifications';
import { normalizeReminderDays } from '@/lib/purchases';
import { getReceiptNotificationSettings } from '@/lib/receipt-workflow';
import { formatQuarterKey, formatQuarterReportTitle } from '@/lib/reports';

type QueueRow = {
  id: string;
  notification_type: 'receipt' | 'report' | 'invite';
  team_id: string;
  source_key: string;
  scheduled_for: string;
  status: 'queued' | 'sent' | 'cancelled' | 'failed';
  payload: Record<string, unknown>;
};

const STALE_QUEUE_MS = 12 * 60 * 60 * 1000;

function parseOffset(value: string) {
  const match = value.match(/GMT([+-]\d{1,2})(?::?(\d{2}))?/);
  if (!match) {
    return '-08:00';
  }

  const sign = match[1].startsWith('-') ? '-' : '+';
  const hourValue = match[1].replace(/^[+-]/, '').padStart(2, '0');
  const minutes = match[2] || '00';
  return `${sign}${hourValue}:${minutes}`;
}

function pacificDateParts(date: Date) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: lookup.year,
    month: lookup.month,
    day: lookup.day
  };
}

function pacificOffset(date: Date) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    timeZoneName: 'shortOffset'
  });
  const part = formatter.formatToParts(date).find((entry) => entry.type === 'timeZoneName')?.value || 'GMT-8';
  return parseOffset(part);
}

function atPacificTime(date: Date, hour: number, minute = 0) {
  const parts = pacificDateParts(date);
  const offset = pacificOffset(date);
  return new Date(`${parts.year}-${parts.month}-${parts.day}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00${offset}`);
}

function pacificHour(date: Date) {
  return Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      hour: '2-digit',
      hour12: false
    }).format(date)
  );
}

function pacificRunKey(date: Date) {
  return `daily-reminders:${formatPacificDateKey(date)}`;
}

async function claimCronRun(date: Date) {
  const admin = createAdminClient();
  const runKey = pacificRunKey(date);
  const { error } = await admin.from('cron_run_logs').insert({
    job_name: 'daily-reminders',
    run_key: runKey
  });

  if (error) {
    if (error.code === '23505') {
      return false;
    }
    throw new Error(error.message);
  }

  return true;
}

export async function getQueuedNotificationCount() {
  const admin = createAdminClient();
  const { count } = await admin
    .from('notification_queue')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'queued');
  return count || 0;
}

async function syncReceiptQueue() {
  const admin = createAdminClient();
  const settings = await getReceiptNotificationSettings();
  const { data: existingRowsData } = await admin
    .from('notification_queue')
    .select('id, notification_type, team_id, source_key, scheduled_for, status, payload')
    .eq('notification_type', 'receipt');
  const existingRows = (existingRowsData || []) as QueueRow[];

  if (!settings.emailEnabled || settings.reminderDays.length === 0) {
    const queuedIds = existingRows.filter((row) => row.status === 'queued').map((row) => row.id);
    if (queuedIds.length > 0) {
      await admin.from('notification_queue').update({ status: 'cancelled' }).in('id', queuedIds);
    }
    return;
  }

  const { data: leadMemberships } = await admin
    .from('team_memberships')
    .select('team_id')
    .eq('team_role', 'lead')
    .eq('is_active', true);
  const activeLeadTeamIds = new Set((leadMemberships || []).map((membership) => membership.team_id));
  const { data: purchasesData } = await admin
    .from('purchase_logs')
    .select('id, team_id, description, purchased_at')
    .eq('payment_method', 'credit_card')
    .eq('receipt_not_needed', false)
    .is('receipt_path', null);
  const purchases =
    ((purchasesData || []) as Array<{ id: string; team_id: string; description: string; purchased_at: string }>).filter(
      (purchase) => activeLeadTeamIds.has(purchase.team_id)
    );

  const validRows = purchases.flatMap((purchase) =>
    settings.reminderDays.map((reminderDay) => {
      const scheduledFor = atPacificTime(
        new Date(new Date(purchase.purchased_at).getTime() + reminderDay * 24 * 60 * 60 * 1000),
        18
      ).toISOString();

      return {
        notification_type: 'receipt' as const,
        team_id: purchase.team_id,
        source_key: `receipt:${purchase.id}:${reminderDay}`,
        scheduled_for: scheduledFor,
        status: 'queued' as const,
        payload: {
          purchaseId: purchase.id,
          itemName: purchase.description,
          purchasedAt: purchase.purchased_at,
          reminderDay
        }
      };
    })
  );

  const validKeys = new Set(validRows.map((row) => row.source_key));

  for (const row of validRows) {
    const existing = existingRows.find((entry) => entry.source_key === row.source_key);
    if (!existing) {
      await admin.from('notification_queue').insert(row);
      continue;
    }

    if (existing.status !== 'sent') {
      await admin
        .from('notification_queue')
        .update({
          team_id: row.team_id,
          scheduled_for: row.scheduled_for,
          status: 'queued',
          payload: row.payload
        })
        .eq('id', existing.id);
    }
  }

  const invalidQueuedIds = existingRows
    .filter((row) => row.status === 'queued' && !validKeys.has(row.source_key))
    .map((row) => row.id);
  const staleQueuedIds = existingRows
    .filter((row) => row.status === 'queued' && new Date(row.scheduled_for).getTime() < Date.now() - STALE_QUEUE_MS)
    .map((row) => row.id);
  const cancelIds = Array.from(new Set([...invalidQueuedIds, ...staleQueuedIds]));
  if (cancelIds.length > 0) {
    await admin.from('notification_queue').update({ status: 'cancelled' }).in('id', cancelIds);
  }
}

async function syncReportQueue() {
  const admin = createAdminClient();
  const { data: settings } = await admin
    .from('report_notification_settings')
    .select('email_enabled, reminder_days')
    .eq('id', 1)
    .maybeSingle();
  const { data: existingRowsData } = await admin
    .from('notification_queue')
    .select('id, notification_type, team_id, source_key, scheduled_for, status, payload')
    .eq('notification_type', 'report');
  const existingRows = (existingRowsData || []) as QueueRow[];
  if (settings && settings.email_enabled === false) {
    const queuedIds = existingRows.filter((row) => row.status === 'queued').map((row) => row.id);
    if (queuedIds.length > 0) {
      await admin.from('notification_queue').update({ status: 'cancelled' }).in('id', queuedIds);
    }
    return;
  }
  const reminderDays = normalizeReminderDays(settings?.reminder_days || [14, 7, 1]);
  if (reminderDays.length === 0) {
    const queuedIds = existingRows.filter((row) => row.status === 'queued').map((row) => row.id);
    if (queuedIds.length > 0) {
      await admin.from('notification_queue').update({ status: 'cancelled' }).in('id', queuedIds);
    }
    return;
  }
  const reportState = await getNextReportState(new Date());
  if (reportState.reportState === 'closed') {
    const queuedIds = existingRows.filter((row) => row.status === 'queued').map((row) => row.id);
    if (queuedIds.length > 0) {
      await admin.from('notification_queue').update({ status: 'cancelled' }).in('id', queuedIds);
    }
    return;
  }
  const { academicYear, quarter } = formatQuarterKey(reportState);
  const { data: leadMemberships } = await admin
    .from('team_memberships')
    .select('team_id')
    .eq('team_role', 'lead')
    .eq('is_active', true);
  const teamIds = Array.from(new Set((leadMemberships || []).map((membership) => membership.team_id)));

  const { data: submittedReports } = await admin
    .from('team_reports')
    .select('team_id')
    .eq('academic_year', academicYear)
    .eq('quarter', quarter)
    .eq('status', 'submitted');
  const submittedTeamIds = new Set((submittedReports || []).map((report) => report.team_id));

  const validRows = teamIds
    .filter((teamId) => !submittedTeamIds.has(teamId))
    .flatMap((teamId) =>
      reminderDays.map((reminderDay) => ({
        notification_type: 'report' as const,
        team_id: teamId,
        source_key: `report:${teamId}:${academicYear}:${quarter}:${reminderDay}`,
        scheduled_for: atPacificTime(
          new Date(reportState.dueAt.getTime() - reminderDay * 24 * 60 * 60 * 1000),
          18
        ).toISOString(),
        status: 'queued' as const,
        payload: {
          academicYear,
          quarter,
          reminderDay,
          dueAt: reportState.dueAt.toISOString()
        }
      }))
    );

  const validKeys = new Set(validRows.map((row) => row.source_key));

  for (const row of validRows) {
    const existing = existingRows.find((entry) => entry.source_key === row.source_key);
    if (!existing) {
      await admin.from('notification_queue').insert(row);
      continue;
    }

    if (existing.status !== 'sent') {
      await admin
        .from('notification_queue')
        .update({
          team_id: row.team_id,
          scheduled_for: row.scheduled_for,
          status: 'queued',
          payload: row.payload
        })
        .eq('id', existing.id);
    }
  }

  const invalidQueuedIds = existingRows
    .filter((row) => row.status === 'queued' && !validKeys.has(row.source_key))
    .map((row) => row.id);
  const staleQueuedIds = existingRows
    .filter((row) => row.status === 'queued' && new Date(row.scheduled_for).getTime() < Date.now() - STALE_QUEUE_MS)
    .map((row) => row.id);
  const cancelIds = Array.from(new Set([...invalidQueuedIds, ...staleQueuedIds]));
  if (cancelIds.length > 0) {
    await admin.from('notification_queue').update({ status: 'cancelled' }).in('id', cancelIds);
  }
}

async function syncInviteQueue() {
  const admin = createAdminClient();
  const { data: existingRowsData } = await admin
    .from('notification_queue')
    .select('id, notification_type, team_id, source_key, scheduled_for, status, payload')
    .eq('notification_type', 'invite');
  const existingRows = (existingRowsData || []) as QueueRow[];
  const { data: leadMemberships } = await admin
    .from('team_memberships')
    .select('team_id, user_id')
    .eq('team_role', 'lead')
    .eq('is_active', true);
  const leadTeamMap = new Map<string, string>();

  for (const membership of leadMemberships || []) {
    if (!leadTeamMap.has(membership.user_id)) {
      leadTeamMap.set(membership.user_id, membership.team_id);
    }
  }

  const pendingLeadIds = Array.from(leadTeamMap.keys());
  if (pendingLeadIds.length === 0) {
    const queuedIds = existingRows.filter((row) => row.status === 'queued').map((row) => row.id);
    if (queuedIds.length > 0) {
      await admin.from('notification_queue').update({ status: 'cancelled' }).in('id', queuedIds);
    }
    return;
  }

  const [{ data: profilesData }, { data: authUsers }] = await Promise.all([
    admin
      .from('profiles')
      .select('id, full_name, email, role, active')
      .in('id', pendingLeadIds)
      .eq('active', true),
    admin.auth.admin.listUsers()
  ]);
  const authUserMap = new Map(authUsers.users.map((authUser) => [authUser.id, authUser]));

  const validRows = (profilesData || []).flatMap((profile) => {
    const authUser = authUserMap.get(profile.id);
    const teamId = leadTeamMap.get(profile.id);

    if (!teamId || !authUser?.email || authUser.last_sign_in_at) {
      return [];
    }

    const createdAt = new Date(authUser.created_at || Date.now());
    const daysSinceInvite = Math.max(0, Math.floor((Date.now() - createdAt.getTime()) / (24 * 60 * 60 * 1000)));
    const nextReminderDay = Math.max(3, (Math.floor(daysSinceInvite / 3) + 1) * 3);
    const scheduledFor = atPacificTime(
      new Date(createdAt.getTime() + nextReminderDay * 24 * 60 * 60 * 1000),
      18
    ).toISOString();

    return [
      {
        notification_type: 'invite' as const,
        team_id: teamId,
        source_key: `invite:${profile.id}:${nextReminderDay}`,
        scheduled_for: scheduledFor,
        status: 'queued' as const,
        payload: {
          profileId: profile.id,
          fullName: profile.full_name,
          email: authUser.email,
          role: profile.role,
          reminderDay: nextReminderDay
        }
      }
    ];
  });

  const validKeys = new Set(validRows.map((row) => row.source_key));

  for (const row of validRows) {
    const existing = existingRows.find((entry) => entry.source_key === row.source_key);
    if (!existing) {
      await admin.from('notification_queue').insert(row);
      continue;
    }

    if (existing.status !== 'sent') {
      await admin
        .from('notification_queue')
        .update({
          team_id: row.team_id,
          scheduled_for: row.scheduled_for,
          status: 'queued',
          payload: row.payload
        })
        .eq('id', existing.id);
    }
  }

  const invalidQueuedIds = existingRows
    .filter((row) => row.status === 'queued' && !validKeys.has(row.source_key))
    .map((row) => row.id);
  const staleQueuedIds = existingRows
    .filter((row) => row.status === 'queued' && new Date(row.scheduled_for).getTime() < Date.now() - STALE_QUEUE_MS)
    .map((row) => row.id);
  const cancelIds = Array.from(new Set([...invalidQueuedIds, ...staleQueuedIds]));
  if (cancelIds.length > 0) {
    await admin.from('notification_queue').update({ status: 'cancelled' }).in('id', cancelIds);
  }
}

export async function syncNotificationQueue() {
  await syncReceiptQueue();
  await syncReportQueue();
  await syncInviteQueue();
}

export async function processQueuedNotificationsBatch(now = new Date()) {
  await syncNotificationQueue();

  const admin = createAdminClient();
  const { data: dueRowsData } = await admin
    .from('notification_queue')
    .select('id, notification_type, team_id, source_key, scheduled_for, status, payload')
    .eq('status', 'queued')
    .lte('scheduled_for', now.toISOString())
    .order('scheduled_for', { ascending: true });
  const dueRows = (dueRowsData || []) as QueueRow[];
  if (dueRows.length === 0) {
    return { sentGroups: 0 };
  }

  const teamIds = Array.from(new Set(dueRows.map((row) => row.team_id)));
  const [{ data: teamsData }, { data: leadMemberships }, { data: authUsers }] = await Promise.all([
    admin.from('teams').select('id, name').in('id', teamIds),
    admin
      .from('team_memberships')
      .select('team_id, user_id')
      .in('team_id', teamIds)
      .eq('team_role', 'lead')
      .eq('is_active', true),
    admin.auth.admin.listUsers()
  ]);
  const teamNameMap = new Map((teamsData || []).map((team) => [team.id, team.name]));
  const emailMap = new Map(authUsers.users.map((authUser) => [authUser.id, authUser.email || '']));
  const leadEmailsByTeam = new Map<string, string[]>();
  for (const membership of leadMemberships || []) {
    if (!leadEmailsByTeam.has(membership.team_id)) {
      leadEmailsByTeam.set(membership.team_id, []);
    }
    const email = emailMap.get(membership.user_id);
    if (email) {
      leadEmailsByTeam.get(membership.team_id)!.push(email);
    }
  }

  const grouped = new Map<string, QueueRow[]>();
  for (const row of dueRows) {
    const key = `${row.notification_type}:${row.team_id}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(row);
  }

  let sentGroups = 0;
  for (const [key, rows] of grouped.entries()) {
    const [notificationType, teamId] = key.split(':');
    const teamName = teamNameMap.get(teamId) || 'your team';
    const recipientEmails =
      notificationType === 'invite'
        ? Array.from(new Set(rows.map((row) => String(row.payload.email || '')).filter(Boolean)))
        : Array.from(new Set(leadEmailsByTeam.get(teamId) || []));
    if (recipientEmails.length === 0) {
      await admin
        .from('notification_queue')
        .update({ status: 'failed' })
        .in(
          'id',
          rows.map((row) => row.id)
        );

      await recordAuditEvent({
        actorId: null,
        action: 'email.failed',
        targetType: 'notification_queue',
        summary: `Skipped ${notificationType} reminder batch for ${teamName} because no lead email recipients were available.`,
        details: {
          notificationType,
          teamId
        }
      });
      continue;
    }

    if (notificationType === 'receipt') {
      const items = Array.from(
        new Map(
          rows.map((row) => {
            const payload = row.payload as {
              purchaseId: string;
              itemName: string;
              purchasedAt: string;
              reminderDay: number;
            };
            const purchasedAt = new Date(payload.purchasedAt);
            const deadline = new Date(purchasedAt.getTime() + 14 * 24 * 60 * 60 * 1000);
            const daysOpen = Math.floor((now.getTime() - purchasedAt.getTime()) / (24 * 60 * 60 * 1000));
            const daysLeft = Math.ceil((deadline.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

            return [
              payload.purchaseId,
              {
                itemName: payload.itemName,
                purchasedAt: formatDateLabel(purchasedAt),
                reminderDay: payload.reminderDay,
                deadlineLabel: formatDateLabel(deadline),
                timeLeftLabel: daysLeft > 0 ? formatCountdown(deadline, now) : `${Math.abs(daysLeft)} day${Math.abs(daysLeft) === 1 ? '' : 's'} overdue`,
                daysOpen
              }
            ];
          })
        ).values()
      );

      await sendReceiptDigestEmail({
        to: recipientEmails,
        teamName,
        items,
        uploadLink: `${env.siteUrl}/dashboard/expenses`
      });

      await recordAuditEvent({
        actorId: null,
        action: 'email.sent',
        targetType: 'notification_queue',
        summary: `Sent receipt reminder batch for ${teamName}.`,
        details: {
          notificationType,
          itemCount: items.length,
          recipients: recipientEmails.length
        }
      });
    }

    if (notificationType === 'report') {
      const latest = rows.sort(
        (a, b) =>
          new Date((a.payload as { dueAt: string }).dueAt).getTime() -
          new Date((b.payload as { dueAt: string }).dueAt).getTime()
      )[0]!;
      const payload = latest.payload as { academicYear: string; quarter: string; dueAt: string };
      const dueAt = new Date(payload.dueAt);

      await sendReportReminderEmail({
        to: recipientEmails,
        teamName,
        reportTitle: formatQuarterReportTitle(payload.quarter),
        dueDateLabel: formatDateLabel(dueAt),
        timeLeftLabel: formatCountdown(dueAt, now),
        reportLink: `${env.siteUrl}/dashboard/reports`
      });

      await recordAuditEvent({
        actorId: null,
        action: 'email.sent',
        targetType: 'notification_queue',
        summary: `Sent report reminder batch for ${teamName}.`,
        details: {
          notificationType,
          academicYear: payload.academicYear,
          quarter: payload.quarter,
          recipients: recipientEmails.length
        }
      });
    }

    if (notificationType === 'invite') {
      for (const row of rows) {
        const email = String(row.payload.email || '');
        const fullName = String(row.payload.fullName || '');
        const role = String(row.payload.role || 'team_lead');

        const generated = await admin.auth.admin.generateLink({
          type: 'invite',
          email,
          options: {
            redirectTo: `${env.siteUrl}/auth/callback`,
            data: {
              full_name: fullName,
              role
            }
          }
        });

        if (generated.error || !generated.data?.properties) {
          throw new Error(generated.error?.message || 'Failed to regenerate invite link.');
        }

        await sendInviteReminderEmail({
          to: email,
          fullName,
          teamName,
          actionLink: buildInviteConfirmLink(generated.data.properties)
        });

        await recordAuditEvent({
          actorId: null,
          action: 'email.sent',
          targetType: 'notification_queue',
          targetId: row.id,
          summary: `Sent invite reminder for ${teamName}.`,
          details: {
            notificationType,
            recipient: email
          }
        });
      }
    }

    await admin
      .from('notification_queue')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .in(
        'id',
        rows.map((row) => row.id)
      );
    sentGroups += 1;
  }

  return { sentGroups };
}

export async function runQueuedNotificationsCron(now = new Date()) {
  if (pacificHour(now) !== 18) {
    return {
      ok: true,
      skipped: 'outside_batch_window',
      pacificDate: formatPacificDateKey(now)
    };
  }

  const claimed = await claimCronRun(now);
  if (!claimed) {
    return {
      ok: true,
      skipped: 'already_ran',
      pacificDate: formatPacificDateKey(now)
    };
  }

  const result = await processQueuedNotificationsBatch(now);
  return {
    ok: true,
    ...result,
    pacificDate: formatPacificDateKey(now)
  };
}
