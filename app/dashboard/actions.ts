'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase-admin';
import {
  ACTIVE_ROLE_COOKIE,
  getViewerContext,
  profileHasAdminRole,
  profileHasFinancialOfficerRole,
  profileHasPresidentRole,
  profileHasVicePresidentRole,
  requireAdmin,
  requireAdminOrPresident,
  requireSignedInUser,
  type AppRole
} from '@/lib/auth';
import {
  DEFAULT_EOY_QUESTIONS,
  EOY_CLASS_YEARS,
  EOY_REPORT_TITLE,
  emptyEoyReportData,
  eoyMemberKey,
  getEoyReportSettings,
  getEoyReportState,
  getEoySummerBlock,
  getEoyTeamMembers,
  getTeamAnnualBudgetCents,
  getYearFundsSpentCents,
  yearSummaryWordLimit,
  type EoyMemberRef,
  type EoyQuestionConfig,
  type EoyReportData
} from '@/lib/eoy-report';
import { notifyTeamLeadsOfExpense } from '@/lib/team-expense-notify';
import {
  getAcademicCalendarSettings,
  getCurrentAcademicYear,
  formatDateLabel,
  formatAcademicYear,
  formatPacificDateKey,
  getNextAcademicYear,
  getPreviousAcademicYear,
  getReportingWindow
} from '@/lib/academic-calendar';
import {
  sendFinancialOfficerInviteEmail,
  sendInviteEmail,
  sendInviteReminderEmail,
  sendPresidentInviteEmail,
  sendVicePresidentInviteEmail,
  sendReceiptDigestEmail,
  sendReportReminderEmail,
  sendTaskEmails
} from '@/lib/notifications';
import { env } from '@/lib/env';
import { buildInviteConfirmLink } from '@/lib/invite-links';
import { confirmationMatches } from '@/lib/confirmation';
import {
  buildSignatureProfile,
  extractSignatureFeatures,
  MIN_ENROLL_SAMPLES,
  parseStrokes,
  verifySignature,
  type SignatureProfile,
  type SignatureStroke
} from '@/lib/signature-verify';
import {
  detectPurchaseCategory,
  normalizeReminderDays,
  normalizePaymentMethod,
  normalizePurchaseDate,
  parsePurchaseAmount,
  RECEIPT_ALLOWED_TYPES,
  RECEIPT_BUCKET,
  RECEIPT_MAX_BYTES,
  sanitizeStorageFileName
} from '@/lib/purchases';
import {
  countWords,
  formatQuarterKey,
  formatQuarterReportTitle,
  getOpenReportContext,
  normalizeReportQuestions
} from '@/lib/reports';
import { recordAuditEvent } from '@/lib/audit';
import { syncInviteQueue, syncNotificationQueue } from '@/lib/notification-queue';
import {
  getSlackbotFallbackContext,
  sendSlackbotNotification,
  SLACKBOT_SYSTEM_TEAM_ID,
  SLACKBOT_SYSTEM_TEAM_NAME
} from '@/lib/slackbot';
import {
  findStatementMatch,
  parseStatementCsv,
  type MatchablePurchase
} from '@/lib/statement-import';
import {
  computePlanRollup,
  getActiveBudgetPlan,
  getBudgetPlanSettings,
  getBudgetSetupState,
  getPlanBundle,
  getQuarterDeclarationState
} from '@/lib/budget-plan';
import { LEADERSHIP_STEWARD_LABEL, storageLocationLabel } from '@/lib/high-value-assets';
import {
  approveCardRegion,
  cardReadTokenSatisfied,
  deleteCreditCard,
  evaluateCardViewGate,
  getCardAgreement,
  getCreditCardApproverEmails,
  isCardGrantEnabled,
  recordCardViewSignature,
  resolveCardAgreementTeamLabel,
  setCardGrant,
  setCreditCard,
  verifyUserSignature,
  type CreditCardFields
} from '@/lib/credit-card';

const REVALIDATE_PATHS = {
  dashboard: ['/dashboard'],
  finances: ['/dashboard', '/dashboard/finances'],
  purchases: ['/dashboard', '/dashboard/expenses', '/dashboard/purchases', '/dashboard/finances', '/dashboard/tasks'],
  purchaseReceipt: ['/dashboard', '/dashboard/expenses', '/dashboard/purchases', '/dashboard/tasks'],
  reports: ['/dashboard', '/dashboard/reports', '/dashboard/settings'],
  eoyReports: ['/dashboard', '/dashboard/reports/eoy', '/dashboard/settings'],
  settings: ['/dashboard/settings'],
  reconciliation: ['/dashboard/settings', '/dashboard/finances', '/dashboard/expenses', '/dashboard/purchases'],
  budgetPlan: ['/dashboard/finances', '/dashboard/finances/plan', '/dashboard'],
  settingsAndReports: ['/dashboard/settings', '/dashboard/reports'],
  settingsDashboardReportsTasks: ['/dashboard', '/dashboard/settings', '/dashboard/reports', '/dashboard/tasks'],
  tasks: ['/dashboard', '/dashboard/tasks'],
  teamsAndMembers: ['/dashboard', '/dashboard/teams', '/dashboard/members'],
  members: ['/dashboard', '/dashboard/members'],
  profile: ['/dashboard', '/dashboard/profile', '/dashboard/members'],
  deleteLead: ['/dashboard', '/dashboard/members', '/dashboard/teams', '/dashboard/tasks', '/dashboard/reports'],
  presidentRole: ['/dashboard', '/dashboard/settings', '/dashboard/members'],
  vicePresidentRole: ['/dashboard', '/dashboard/settings', '/dashboard/members'],
  financialOfficerRole: ['/dashboard', '/dashboard/settings', '/dashboard/finances', '/dashboard/purchases', '/dashboard/expenses']
} satisfies Record<string, string[]>;

function revalidatePaths(paths: string[]) {
  for (const path of new Set(paths)) {
    revalidatePath(path);
  }
}

async function syncQueueAndRevalidate(paths: string[]) {
  await syncNotificationQueue();
  revalidatePaths(paths);
}

async function syncInviteQueueAndRevalidate(paths: string[]) {
  await syncInviteQueue();
  revalidatePaths(paths);
}

function isNextRedirect(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'digest' in error &&
    typeof (error as { digest?: unknown }).digest === 'string' &&
    (error as { digest: string }).digest.includes('NEXT_REDIRECT')
  );
}

function getActionErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

async function getActionReturnPath(fallbackPath: string) {
  const referer = (await headers()).get('referer');

  if (!referer) {
    return fallbackPath;
  }

  try {
    const current = new URL(referer, env.siteUrl);
    const site = new URL(env.siteUrl);

    if (current.origin !== site.origin) {
      return fallbackPath;
    }

    return `${current.pathname}${current.search}`;
  } catch {
    return fallbackPath;
  }
}

function buildStatusPath(path: string, status: 'success' | 'error', message: string) {
  const url = new URL(path, env.siteUrl);
  url.searchParams.set('status', status);
  url.searchParams.set('message', message);
  return `${url.pathname}${url.search}`;
}

async function redirectWithActionStatus(status: 'success' | 'error', message: string, fallbackPath: string) {
  const nextPath = await getActionReturnPath(fallbackPath);
  redirect(buildStatusPath(nextPath, status, message));
}

async function runRedirectingAction(options: {
  fallbackPath: string;
  successMessage: string;
  action: () => Promise<void>;
}) {
  try {
    await options.action();
  } catch (error) {
    if (isNextRedirect(error)) {
      throw error;
    }

    await redirectWithActionStatus('error', getActionErrorMessage(error), options.fallbackPath);
  }

  await redirectWithActionStatus('success', options.successMessage, options.fallbackPath);
}

async function requireActiveProfile() {
  const { user, profile, currentRole, availableRoles } = await getViewerContext();
  return { user, profile, currentRole, availableRoles };
}

async function requireLeadTeam(teamId: string) {
  const { user, profile, currentRole } = await requireActiveProfile();
  if (currentRole === 'admin') {
    return { user, profile, currentRole };
  }

  if (currentRole !== 'team_lead') {
    redirect('/dashboard');
  }

  const admin = createAdminClient();
  const { data: membership } = await admin
    .from('team_memberships')
    .select('id')
    .eq('team_id', teamId)
    .eq('user_id', user.id)
    .eq('team_role', 'lead')
    .eq('is_active', true)
    .maybeSingle();

  if (!membership) {
    redirect('/dashboard');
  }

  return { user, profile, currentRole };
}

type ActionResult<T = void> =
  | { ok: true; message: string; data?: T }
  | { ok: false; message: string };

async function runInlineAction<T>(action: () => Promise<T>, successMessage: string): Promise<ActionResult<T>> {
  try {
    const data = await action();
    return { ok: true, message: successMessage, data };
  } catch (error) {
    return { ok: false, message: getActionErrorMessage(error) };
  }
}

async function uploadReceiptToStorage({
  purchaseId,
  teamId,
  file,
  existingPath
}: {
  purchaseId: string;
  teamId: string;
  file: File;
  existingPath?: string | null;
}) {
  if (!file.size) {
    throw new Error('A receipt file is required.');
  }

  if (file.size > RECEIPT_MAX_BYTES) {
    throw new Error('Receipt files must be under 2 MB.');
  }

  if (file.type && !RECEIPT_ALLOWED_TYPES.includes(file.type)) {
    throw new Error('Receipt files must be a PDF, PNG, JPG, or WEBP.');
  }

  const extension = file.name.includes('.') ? file.name.split('.').pop() || 'pdf' : 'pdf';
  const safeName = sanitizeStorageFileName(file.name.replace(/\.[^.]+$/, ''));
  const path = `${teamId}/${purchaseId}-${Date.now()}-${safeName}.${extension.toLowerCase()}`;
  const admin = createAdminClient();
  const fileBuffer = Buffer.from(await file.arrayBuffer());

  const { error } = await admin.storage.from(RECEIPT_BUCKET).upload(path, fileBuffer, {
    contentType: file.type || undefined,
    upsert: true
  });

  if (error) {
    throw new Error(error.message);
  }

  if (existingPath && existingPath !== path) {
    await admin.storage.from(RECEIPT_BUCKET).remove([existingPath]);
  }

  return {
    path,
    fileName: file.name
  };
}

async function getTeamMemberCount(teamId: string) {
  const admin = createAdminClient();
  const [{ count: membershipCount }, { count: rosterCount }] = await Promise.all([
    admin
      .from('team_memberships')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', teamId)
      .eq('is_active', true),
    admin
      .from('team_roster_members')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', teamId)
  ]);

  return (membershipCount || 0) + (rosterCount || 0);
}

export async function sendManualSlackPushAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/settings',
    successMessage: 'Slack push sent.',
    action: async () => {
      const { profile } = await requireAdmin();
      const recipientToken = String(formData.get('recipient_token') || '').trim();
      const rawMessage = String(formData.get('message') || '').trim();

      if (!recipientToken) {
        throw new Error('Choose a recipient to message.');
      }

      if (!rawMessage) {
        throw new Error('Enter a message to send.');
      }

      if (rawMessage.length > 400) {
        throw new Error('Slack pushes should stay under 400 characters.');
      }

      const admin = createAdminClient();
      const [recipientKind, recipientId] = recipientToken.split(':');
      if (!recipientKind || !recipientId) {
        throw new Error('Choose a valid recipient.');
      }

      let recipient:
        | {
            id: string;
            full_name: string | null;
            email: string | null;
            team_id?: string | null;
          }
        | null = null;
      let leadMembership: { team_id: string } | null = null;

      if (recipientKind === 'profile') {
        const [{ data: profileRecipient }, { data: leadMembershipData }] = await Promise.all([
          admin
            .from('profiles')
            .select('id, full_name, email')
            .eq('id', recipientId)
            .eq('active', true)
            .maybeSingle(),
          admin
            .from('team_memberships')
            .select('team_id')
            .eq('user_id', recipientId)
            .eq('team_role', 'lead')
            .eq('is_active', true)
            .limit(1)
            .maybeSingle()
        ]);

        recipient = profileRecipient;
        leadMembership = leadMembershipData;
      } else if (recipientKind === 'roster') {
        const { data: rosterRecipient } = await admin
          .from('team_roster_members')
          .select('id, full_name, stanford_email, team_id')
          .eq('id', recipientId)
          .maybeSingle();
        recipient = rosterRecipient
          ? {
              id: rosterRecipient.id,
              full_name: rosterRecipient.full_name,
              email: rosterRecipient.stanford_email,
              team_id: rosterRecipient.team_id
            }
          : null;
      } else {
        throw new Error('Choose a valid recipient.');
      }

      if (!recipient?.email) {
        throw new Error('That recipient does not have an email on file.');
      }

      let teamContext = getSlackbotFallbackContext();
      if (leadMembership?.team_id) {
        const { data: resolvedTeam } = await admin
          .from('teams')
          .select('id, name')
          .eq('id', leadMembership.team_id)
          .maybeSingle();
        if (resolvedTeam) {
          teamContext = {
            teamId: resolvedTeam.id,
            teamName: resolvedTeam.name
          };
        }
      } else if (recipient.team_id) {
        const { data: resolvedTeam } = await admin
          .from('teams')
          .select('id, name')
          .eq('id', recipient.team_id)
          .maybeSingle();
        if (resolvedTeam) {
          teamContext = {
            teamId: resolvedTeam.id,
            teamName: resolvedTeam.name
          };
        }
      }

      const idempotencyKey = `manual_slack_push:${recipientKind}:${recipientId}:${Date.now()}`;
      const senderName = profile.full_name || 'SSR HQ admin';

      const result = await sendSlackbotNotification({
        idempotency_key: idempotencyKey,
        type: 'manual_message',
        team_id: teamContext.teamId,
        team_name: teamContext.teamName,
        recipient_emails: [recipient.email.toLowerCase()],
        title: 'Message from SSR HQ',
        message: rawMessage,
        metadata: {
          source: 'hq_admin_manual_push',
          senderProfileId: profile.id,
          senderName,
          recipientKind,
          recipientId
        }
      });

      await recordAuditEvent({
        actorId: profile.id,
        action: 'slack.sent',
        targetType: recipientKind === 'profile' ? 'profile' : 'team_roster_member',
        targetId: recipient.id,
        summary: `Sent Slack push to ${recipient.full_name || recipient.email}.`,
        details: {
          delivered: result.delivered || 0,
          failed: result.failed || 0,
          recipientEmail: recipient.email,
          teamContext: teamContext.teamName
        }
      });

      revalidatePaths(REVALIDATE_PATHS.settings);
    }
  });
}

// --- Shared credit card (admin-only) ---------------------------------------
// One-time encrypted card entry the admin can never re-view (delete-only) plus
// per-user access switches. No card data is ever logged, audited, or returned
// to the client: only inside the encrypted `cipher` column.

function normalizeCardDigits(value: string) {
  return value.replace(/[\s-]/g, '');
}

export async function setCreditCardAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/settings',
    successMessage: 'Saved the card securely.',
    action: async () => {
      const { user } = await requireAdmin();

      const number = normalizeCardDigits(String(formData.get('card_number') || '').trim());
      const expiry = String(formData.get('expiry') || '').trim();
      const cvv = String(formData.get('cvv') || '').trim();
      const cardholder = String(formData.get('cardholder') || '').trim();
      const label = String(formData.get('label') || '').trim();

      if (!/^\d{12,19}$/.test(number)) {
        throw new Error('Card number must be 12 to 19 digits.');
      }

      if (!/^(0[1-9]|1[0-2])\/(\d{2}|\d{4})$/.test(expiry)) {
        throw new Error('Expiry must be in MM/YY or MM/YYYY format.');
      }

      if (!/^\d{3,4}$/.test(cvv)) {
        throw new Error('CVV must be 3 or 4 digits.');
      }

      if (!cardholder) {
        throw new Error('Cardholder name is required.');
      }

      const fields: CreditCardFields = { number, expiry, cvv, cardholder };
      await setCreditCard(fields, label, user.id);

      await recordAuditEvent({
        actorId: user.id,
        action: 'credit_card.set',
        targetType: 'credit_card',
        targetId: '1',
        summary: 'Saved the shared club credit card.',
        // Never include any card data here — only the (non-sensitive) label.
        details: { label: label || null }
      });

      revalidatePaths(REVALIDATE_PATHS.settings);
    }
  });
}

export async function deleteCreditCardAction(_formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/settings',
    successMessage: 'Deleted the card.',
    action: async () => {
      const { user } = await requireAdmin();
      await deleteCreditCard();

      await recordAuditEvent({
        actorId: user.id,
        action: 'credit_card.deleted',
        targetType: 'credit_card',
        targetId: '1',
        summary: 'Deleted the shared club credit card.'
      });

      revalidatePaths(REVALIDATE_PATHS.settings);
    }
  });
}

export async function setCreditCardGrantAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/settings',
    successMessage: 'Updated card access.',
    action: async () => {
      const { user } = await requireAdmin();
      const userId = String(formData.get('user_id') || '').trim();
      const rawEnabled = String(formData.get('enabled') || '').trim().toLowerCase();
      const enabled = rawEnabled === 'on' || rawEnabled === 'true';

      if (!userId) {
        throw new Error('Missing user.');
      }

      await setCardGrant(userId, enabled, user.id);

      await recordAuditEvent({
        actorId: user.id,
        action: 'credit_card.grant_updated',
        targetType: 'credit_card_grant',
        targetId: userId,
        summary: enabled
          ? 'Granted credit-card access for a user.'
          : 'Revoked credit-card access and reset the user’s agreement.',
        details: { userId, enabled, agreementReset: !enabled }
      });

      revalidatePaths(REVALIDATE_PATHS.settings);
    }
  });
}

// --- Credit card access agreement + approval state machine -----------------
// A granted user signs the agreement (their drawn signature is verified) → it
// goes to the Financial Officer to approve (FO signs) → access becomes
// effective. Admins are notified and can OVERRIDE (grant without an FO
// signature). Slack pushes are best-effort and never block the action.

const CREDIT_CARD_APPROVALS_PATH = '/dashboard/credit-card/approvals';
const CREDIT_CARD_PATH = '/dashboard/credit-card';

// getCreditCardApproverEmails (active Financial Officers + admins) now lives in
// lib/credit-card.ts so the screenshot-signal API can reuse it too.

async function getProfileEmail(userId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.from('profiles').select('email').eq('id', userId).maybeSingle();
  return data?.email ? data.email.toLowerCase() : null;
}

export async function signCreditCardAgreementAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/credit-card',
    successMessage: 'Signed — sent to the Financial Officer for approval.',
    action: async () => {
      const { user, profile } = await requireActiveProfile();

      if (!(await isCardGrantEnabled(user.id))) {
        throw new Error("You don't have credit card access.");
      }

      // Idempotent: if they've already signed, just bounce back to the page.
      const existing = await getCardAgreement(user.id);
      if (existing) {
        return;
      }

      const signature = String(formData.get('signature') || '').trim();
      const strokes = formData.get('strokes');
      if (!signature) {
        throw new Error('Draw your signature to sign the agreement.');
      }

      // Enforce the minimum reading time server-side too, so the requirement
      // can't be bypassed by editing the page or disabling JavaScript.
      const readToken = String(formData.get('read_token') || '');
      if (!cardReadTokenSatisfied(readToken, Date.now())) {
        throw new Error(
          'Please take at least two minutes to read the agreement before signing, then try again.'
        );
      }

      const { score } = await verifyUserSignature(user.id, strokes);
      const teamLabel = await resolveCardAgreementTeamLabel(user.id);

      const admin = createAdminClient();
      const { error } = await admin.from('credit_card_agreements').insert({
        user_id: user.id,
        status: 'pending_fo',
        user_team_name: teamLabel,
        user_signature: signature,
        user_signature_score: score
      });
      if (error) {
        throw new Error(error.message);
      }

      // Notify all active Financial Officers + admins (best-effort).
      try {
        const emails = await getCreditCardApproverEmails();
        if (emails.length > 0) {
          await sendSlackbotNotification({
            idempotency_key: `credit_card_agreement_signed:${user.id}`,
            type: 'manual_message',
            team_id: SLACKBOT_SYSTEM_TEAM_ID,
            team_name: SLACKBOT_SYSTEM_TEAM_NAME,
            recipient_emails: emails,
            title: 'Credit card access request',
            message: `${profile.full_name || 'A team lead'} signed the credit card agreement and needs approval.`,
            cta_label: 'Review request',
            cta_url: `${env.siteUrl}${CREDIT_CARD_APPROVALS_PATH}`,
            metadata: { user_id: user.id }
          });
        }
      } catch (error) {
        console.error('Credit card agreement Slack push failed:', error);
      }

      await recordAuditEvent({
        actorId: user.id,
        action: 'credit_card.agreement_signed',
        targetType: 'credit_card_agreement',
        targetId: user.id,
        summary: 'Signed the credit card access agreement.',
        details: { teamLabel }
      });

      revalidatePaths(['/dashboard', '/dashboard/credit-card', CREDIT_CARD_APPROVALS_PATH]);
    }
  });
}

export async function approveCreditCardAgreementAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: CREDIT_CARD_APPROVALS_PATH,
    successMessage: 'Approved — access granted.',
    action: async () => {
      const { user, profile, currentRole } = await requireActiveProfile();
      const isFinancialOfficer =
        currentRole === 'financial_officer' || profileHasFinancialOfficerRole(profile);
      if (!isFinancialOfficer) {
        throw new Error('Only a financial officer can approve.');
      }

      const targetUserId = String(formData.get('user_id') || '').trim();
      if (!targetUserId) {
        throw new Error('Missing the requesting user.');
      }

      const signature = String(formData.get('signature') || '').trim();
      const strokes = formData.get('strokes');
      if (!signature) {
        throw new Error('Draw your signature to approve access.');
      }

      // The FO signs with their OWN enrolled signature.
      await verifyUserSignature(user.id, strokes);

      const agreement = await getCardAgreement(targetUserId);
      if (!agreement) {
        throw new Error('That request no longer exists.');
      }
      if (agreement.status !== 'pending_fo') {
        throw new Error('That request has already been decided.');
      }

      const admin = createAdminClient();
      const { error } = await admin
        .from('credit_card_agreements')
        .update({
          status: 'approved',
          fo_user_id: user.id,
          fo_signed_at: new Date().toISOString(),
          fo_signature: signature
        })
        .eq('user_id', targetUserId)
        .eq('status', 'pending_fo');
      if (error) {
        throw new Error(error.message);
      }

      // Notify the requesting user (best-effort).
      try {
        const email = await getProfileEmail(targetUserId);
        if (email) {
          await sendSlackbotNotification({
            idempotency_key: `credit_card_agreement_approved:${targetUserId}`,
            type: 'manual_message',
            team_id: SLACKBOT_SYSTEM_TEAM_ID,
            team_name: SLACKBOT_SYSTEM_TEAM_NAME,
            recipient_emails: [email],
            title: 'Credit card access approved',
            message: `${profile.full_name || 'The Financial Officer'} approved your credit card access.`,
            cta_label: 'Open credit card',
            cta_url: `${env.siteUrl}/dashboard/credit-card`,
            metadata: { user_id: targetUserId }
          });
        }
      } catch (error) {
        console.error('Credit card approval Slack push failed:', error);
      }

      await recordAuditEvent({
        actorId: user.id,
        action: 'credit_card.agreement_approved',
        targetType: 'credit_card_agreement',
        targetId: targetUserId,
        summary: 'Approved a credit card access request.',
        details: { requestingUserId: targetUserId }
      });

      revalidatePaths(['/dashboard', '/dashboard/credit-card', CREDIT_CARD_APPROVALS_PATH]);
    }
  });
}

export async function overrideCreditCardAgreementAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: CREDIT_CARD_APPROVALS_PATH,
    successMessage: 'Override applied — access granted.',
    action: async () => {
      const { user } = await requireAdmin();

      const targetUserId = String(formData.get('user_id') || '').trim();
      if (!targetUserId) {
        throw new Error('Missing the requesting user.');
      }

      const agreement = await getCardAgreement(targetUserId);
      if (!agreement) {
        throw new Error('That request no longer exists.');
      }
      if (agreement.status !== 'pending_fo') {
        throw new Error('That request has already been decided.');
      }

      const admin = createAdminClient();
      const { error } = await admin
        .from('credit_card_agreements')
        .update({
          status: 'overridden',
          override_by: user.id,
          override_at: new Date().toISOString()
        })
        .eq('user_id', targetUserId)
        .eq('status', 'pending_fo');
      if (error) {
        throw new Error(error.message);
      }

      // Notify the requesting user (best-effort).
      try {
        const email = await getProfileEmail(targetUserId);
        if (email) {
          await sendSlackbotNotification({
            idempotency_key: `credit_card_agreement_overridden:${targetUserId}`,
            type: 'manual_message',
            team_id: SLACKBOT_SYSTEM_TEAM_ID,
            team_name: SLACKBOT_SYSTEM_TEAM_NAME,
            recipient_emails: [email],
            title: 'Credit card access granted',
            message: 'An admin granted your credit card access.',
            cta_label: 'Open credit card',
            cta_url: `${env.siteUrl}/dashboard/credit-card`,
            metadata: { user_id: targetUserId }
          });
        }
      } catch (error) {
        console.error('Credit card override Slack push failed:', error);
      }

      await recordAuditEvent({
        actorId: user.id,
        action: 'credit_card.agreement_overridden',
        targetType: 'credit_card_agreement',
        targetId: targetUserId,
        summary: 'Overrode a credit card access request (granted without FO signature).',
        details: { requestingUserId: targetUserId }
      });

      revalidatePaths(['/dashboard', '/dashboard/credit-card', CREDIT_CARD_APPROVALS_PATH]);
    }
  });
}

// --- Phase 3: secure card view gate actions --------------------------------

// The monthly / new-location re-verification: an approved viewer signs (their
// drawn signature is verified against their enrolled profile) to unlock the
// secure card view. The gate is recomputed server-side so a stale page can't
// sign from a location/state that isn't actually allowed.
export async function signCardViewAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: CREDIT_CARD_PATH,
    successMessage: 'Verified — you can view the card.',
    action: async () => {
      const { user } = await requireActiveProfile();

      const gate = await evaluateCardViewGate(user.id, await headers());
      // Only a viewer who is otherwise cleared (just needs to sign) or already
      // OK may sign. Any blocked/no-access state means signing isn't valid here.
      if (gate.state !== 'require_sign' && gate.state !== 'ok') {
        throw new Error('You are not able to view the card from here right now.');
      }

      const strokes = formData.get('strokes');
      await verifyUserSignature(user.id, strokes);
      await recordCardViewSignature(user.id, gate.regionKey, gate.country);

      await recordAuditEvent({
        actorId: user.id,
        action: 'credit_card.view_signed',
        targetType: 'credit_card',
        targetId: '1',
        summary: 'Signed the monthly / new-location verification to view the shared card.',
        details: { regionKey: gate.regionKey, country: gate.country }
      });

      revalidatePaths([CREDIT_CARD_PATH]);
    }
  });
}

// A Financial Officer approves a viewer's new location so they can view the card
// from there. Notifies the viewer (best-effort) and audits the approval.
export async function approveCardRegionAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: CREDIT_CARD_APPROVALS_PATH,
    successMessage: 'Approved this location.',
    action: async () => {
      const { user, profile, currentRole } = await requireActiveProfile();
      const isFinancialOfficer =
        currentRole === 'financial_officer' || profileHasFinancialOfficerRole(profile);
      if (!isFinancialOfficer) {
        throw new Error('Only a financial officer can approve a location.');
      }

      const targetUserId = String(formData.get('user_id') || '').trim();
      const regionKey = String(formData.get('region_key') || '').trim();
      if (!targetUserId || !regionKey) {
        throw new Error('Missing the request to approve.');
      }

      await approveCardRegion(targetUserId, regionKey, user.id);

      // Notify the requesting user (best-effort).
      try {
        const email = await getProfileEmail(targetUserId);
        if (email) {
          await sendSlackbotNotification({
            idempotency_key: `credit_card_region_approved:${targetUserId}:${regionKey}`,
            type: 'manual_message',
            team_id: SLACKBOT_SYSTEM_TEAM_ID,
            team_name: SLACKBOT_SYSTEM_TEAM_NAME,
            recipient_emails: [email],
            title: 'Credit card location approved',
            message: `${profile.full_name || 'The Financial Officer'} approved viewing the credit card from your new location.`,
            cta_label: 'Open credit card',
            cta_url: `${env.siteUrl}${CREDIT_CARD_PATH}`,
            metadata: { user_id: targetUserId, region_key: regionKey }
          });
        }
      } catch (error) {
        console.error('Credit card region approval Slack push failed:', error);
      }

      await recordAuditEvent({
        actorId: user.id,
        action: 'credit_card.region_approved',
        targetType: 'credit_card_region_approval',
        targetId: targetUserId,
        summary: 'Approved a credit card viewing location.',
        details: { requestingUserId: targetUserId, regionKey }
      });

      revalidatePaths([CREDIT_CARD_PATH, CREDIT_CARD_APPROVALS_PATH]);
    }
  });
}

async function getQuarterFundsSpent(teamId: string, academicYear: string, quarter: string) {
  const window = await getReportingWindow(academicYear, quarter);
  if (!window) {
    return 0;
  }

  const admin = createAdminClient();
  const { data: purchasesData } = await admin
    .from('purchase_logs')
    .select('amount_cents, purchased_at')
    .eq('team_id', teamId)
    .eq('academic_year', academicYear);

  const startKey = formatPacificDateKey(window.start);
  const endKey = formatPacificDateKey(window.end);

  return ((purchasesData || []) as Array<{ amount_cents: number; purchased_at: string }>).reduce((sum, purchase) => {
    const purchaseKey = formatPacificDateKey(new Date(purchase.purchased_at));
    if (purchaseKey < startKey || purchaseKey > endKey) {
      return sum;
    }

    return sum + purchase.amount_cents;
  }, 0);
}

function formatCurrencyFromCents(cents: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2
  }).format(cents / 100);
}

function buildPurchaseDedupKey(input: {
  description: string;
  amountCents: number;
  purchasedAt: string;
  personName?: string | null;
  paymentMethod: 'reimbursement' | 'credit_card' | 'amazon' | 'unknown';
}) {
  return [
    input.description.trim().toLowerCase(),
    input.amountCents,
    input.purchasedAt.slice(0, 10),
    (input.personName || '').trim().toLowerCase(),
    input.paymentMethod
  ].join('::');
}

async function createPortalInviteProfile({
  email,
  fullName,
  role
}: {
  email: string;
  fullName: string;
  role: 'team_lead' | 'president' | 'vice_president' | 'financial_officer';
}) {
  const admin = createAdminClient();
  const invite = await admin.auth.admin.generateLink({
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

  let generated: NonNullable<typeof invite.data>;
  if (invite.error) {
    // The email already has an account (e.g. someone self-registered before the
    // invite). Don't fail — assign the role to the existing account and send a
    // working login link instead.
    if (/regist|already|exist/i.test(invite.error.message)) {
      const magic = await admin.auth.admin.generateLink({
        type: 'magiclink',
        email,
        options: { redirectTo: `${env.siteUrl}/auth/callback` }
      });
      if (magic.error || !magic.data?.user?.id || !magic.data.properties) {
        throw new Error(
          magic.error?.message || 'That email is already registered and a login link could not be generated.'
        );
      }
      generated = magic.data;
    } else {
      throw new Error(invite.error.message);
    }
  } else if (!invite.data?.properties?.action_link || !invite.data.user?.id) {
    throw new Error('Failed to generate invite link.');
  } else {
    generated = invite.data;
  }

  const { error: profileError } = await admin.from('profiles').upsert({
    id: generated.user.id,
    full_name: fullName || null,
    email,
    role,
    is_admin: role === 'president' ? false : undefined,
    is_president: role === 'president',
    is_vice_president: role === 'vice_president',
    is_financial_officer: role === 'financial_officer',
    active: true
  });

  if (profileError) {
    throw new Error(profileError.message);
  }

  return {
    admin,
    generated,
    actionLink: buildInviteConfirmLink(generated.properties)
  };
}

async function saveTeamReport(formData: FormData, status: 'draft' | 'submitted') {
  const teamId = String(formData.get('team_id') || '').trim();
  const academicYear = String(formData.get('academic_year') || '').trim();
  const quarter = String(formData.get('quarter') || '').trim();

  if (!teamId || !academicYear || !quarter) {
    throw new Error('Missing report context.');
  }

  const { user } = await requireLeadTeam(teamId);
  const admin = createAdminClient();
  const { data: questionsData } = await admin
    .from('report_questions')
    .select('id, prompt, field_type, word_limit, sort_order')
    .eq('is_active', true)
    .order('sort_order');
  const questions =
    (questionsData || []) as Array<{
      id: string;
      prompt: string;
      field_type: 'short_text' | 'long_text' | 'member_count' | 'funds_spent';
      word_limit: number;
      sort_order: number;
    }>;

  if (questions.length === 0) {
    throw new Error('No report questions are configured yet.');
  }

  if (status === 'submitted') {
    const { reportState, canSubmit } = await getOpenReportContext();
    const expected = formatQuarterKey(reportState);
    if (!canSubmit || expected.academicYear !== academicYear || expected.quarter !== quarter) {
      throw new Error('This report is not currently open for submission.');
    }
  }

  const memberCount = await getTeamMemberCount(teamId);
  const quarterFundsSpentCents = await getQuarterFundsSpent(teamId, academicYear, quarter);
  const answers = questions.map((question) => {
    const rawAnswer =
      question.field_type === 'member_count'
        ? String(memberCount)
        : question.field_type === 'funds_spent'
          ? formatCurrencyFromCents(quarterFundsSpentCents)
        : String(formData.get(`question_${question.id}`) || '').trim();

    if (question.field_type !== 'member_count' && question.field_type !== 'funds_spent' && countWords(rawAnswer) > question.word_limit) {
      throw new Error(`"${question.prompt}" exceeds its ${question.word_limit} word limit.`);
    }

    return {
      question_id: question.id,
      answer: rawAnswer
    };
  });

  const { data: report, error: reportError } = await admin
    .from('team_reports')
    .upsert(
      {
        team_id: teamId,
        academic_year: academicYear,
        quarter,
        status,
        submitted_at: status === 'submitted' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
        updated_by: user.id
      },
      { onConflict: 'team_id,academic_year,quarter' }
    )
    .select('id')
    .single();

  if (reportError || !report) {
    throw new Error(reportError?.message || 'Failed to save report.');
  }

  const { error: answersError } = await admin.from('team_report_answers').upsert(
    answers.map((answer) => ({
      report_id: report.id,
      question_id: answer.question_id,
      answer: answer.answer,
      updated_at: new Date().toISOString()
    })),
    { onConflict: 'report_id,question_id' }
  );

  if (answersError) {
    throw new Error(answersError.message);
  }

  await recordAuditEvent({
    actorId: user.id,
    action: `report.${status}`,
    targetType: 'team_report',
    targetId: report.id,
    summary: `${status === 'submitted' ? 'Submitted' : 'Saved draft for'} ${formatQuarterReportTitle(quarter)}.`,
    details: {
      teamId,
      academicYear,
      quarter,
      memberCount,
      quarterFundsSpentCents
    }
  });

  await syncQueueAndRevalidate(REVALIDATE_PATHS.reports);
}

export async function updateClubBudgetAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/finances',
    successMessage: 'Updated the total club budget.',
    action: async () => {
      const { user } = await requireAdmin();
      const academicYear = String(formData.get('academic_year') || '').trim();
      const totalBudget = Number(formData.get('total_budget') || 0);

      if (!academicYear) {
        throw new Error('Academic year is required.');
      }

      const admin = createAdminClient();
      const totalBudgetCents = Math.max(0, Math.round(totalBudget * 100));
      const { error } = await admin.from('club_budgets').upsert({
        academic_year: academicYear,
        total_budget_cents: totalBudgetCents
      });

      if (error) {
        throw new Error(error.message);
      }

      await recordAuditEvent({
        actorId: user.id,
        action: 'budget.club.updated',
        targetType: 'club_budget',
        targetId: academicYear,
        summary: `Updated total club budget for ${academicYear}.`,
        details: {
          academicYear,
          totalBudgetCents
        }
      });

      revalidatePaths(REVALIDATE_PATHS.finances);
    }
  });
}

export async function updateTeamBudgetAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/finances',
    successMessage: 'Updated the team budget.',
    action: async () => {
      const { user } = await requireAdmin();
      const academicYear = String(formData.get('academic_year') || '').trim();
      const teamId = String(formData.get('team_id') || '').trim();
      const annualBudget = Number(formData.get('annual_budget') || 0);

      if (!academicYear || !teamId) {
        throw new Error('Team and academic year are required.');
      }

      const admin = createAdminClient();
      const annualBudgetCents = Math.max(0, Math.round(annualBudget * 100));
      const { error } = await admin.from('team_budgets').upsert({
        team_id: teamId,
        academic_year: academicYear,
        annual_budget_cents: annualBudgetCents
      });

      if (error) {
        throw new Error(error.message);
      }

      await recordAuditEvent({
        actorId: user.id,
        action: 'budget.team.updated',
        targetType: 'team_budget',
        targetId: teamId,
        summary: `Updated annual team budget for ${academicYear}.`,
        details: {
          teamId,
          academicYear,
          annualBudgetCents
        }
      });

      revalidatePaths(REVALIDATE_PATHS.finances);
    }
  });
}

export async function updateAcademicRolloverSettingsAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/settings',
    successMessage: 'Updated academic year rollover settings.',
    action: async () => {
      const { user } = await requireAdmin();
      const autoRolloverEnabled = String(formData.get('auto_rollover_enabled') || '') === 'on';
      const settings = await getAcademicCalendarSettings();
      const admin = createAdminClient();
      const { error } = await admin.from('academic_calendar_settings').upsert({
        id: 1,
        current_academic_year: settings.storedAcademicYear,
        auto_rollover_enabled: autoRolloverEnabled,
        updated_at: new Date().toISOString()
      });

      if (error) {
        throw new Error(error.message);
      }

      await recordAuditEvent({
        actorId: user.id,
        action: 'settings.academic_rollover.updated',
        targetType: 'academic_calendar_settings',
        targetId: '1',
        summary: `Turned academic year auto-rollover ${autoRolloverEnabled ? 'on' : 'off'}.`,
        details: {
          autoRolloverEnabled,
          storedAcademicYear: settings.storedAcademicYear,
          effectiveAcademicYear: settings.effectiveAcademicYear
        }
      });

      revalidatePaths(REVALIDATE_PATHS.settingsDashboardReportsTasks.concat(REVALIDATE_PATHS.finances));
    }
  });
}

export async function rolloverAcademicYearAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/settings',
    successMessage: 'Rolled over to the next academic year.',
    action: async () => {
      const { user } = await requireAdmin();
      const settings = await getAcademicCalendarSettings();
      const currentAcademicYear = settings.effectiveAcademicYear;
      const nextAcademicYear = getNextAcademicYear(currentAcademicYear);
      const confirmPhrase = String(formData.get('confirm_rollover') || '').trim();
      const confirmYear = String(formData.get('confirm_next_academic_year') || '').trim();

      if (confirmPhrase !== 'ROLLOVER') {
        throw new Error('Type ROLLOVER to confirm the year transition.');
      }

      if (confirmYear !== nextAcademicYear) {
        throw new Error(`Type ${nextAcademicYear} exactly to confirm the new cycle.`);
      }

      const admin = createAdminClient();
      const [
        { data: teamsData },
        { data: nextClubBudget },
        { data: nextTeamBudgets },
        { data: currentClubBudget },
        { data: currentTeamBudgets },
        { data: currentPurchases }
      ] = await Promise.all([
        admin.from('teams').select('id').eq('is_active', true),
        admin.from('club_budgets').select('academic_year, total_budget_cents').eq('academic_year', nextAcademicYear).maybeSingle(),
        admin.from('team_budgets').select('team_id, annual_budget_cents').eq('academic_year', nextAcademicYear),
        admin.from('club_budgets').select('total_budget_cents').eq('academic_year', currentAcademicYear).maybeSingle(),
        admin.from('team_budgets').select('annual_budget_cents').eq('academic_year', currentAcademicYear),
        admin.from('purchase_logs').select('amount_cents').eq('academic_year', currentAcademicYear)
      ]);

      if (nextClubBudget || (nextTeamBudgets || []).length > 0) {
        throw new Error(
          `${nextAcademicYear} budget setup already exists. That cycle has already been rolled over.`
        );
      }

      const activeTeams = teamsData || [];
      const previousAllocatedCents = (currentTeamBudgets || []).reduce(
        (sum, budget) => sum + budget.annual_budget_cents,
        0
      );
      const previousSpentCents = (currentPurchases || []).reduce(
        (sum, purchase) => sum + purchase.amount_cents,
        0
      );
      const returnedToGeneralFundCents = Math.max(0, previousAllocatedCents - previousSpentCents);
      const previousGeneralFundBalanceCents = Math.max(
        0,
        (currentClubBudget?.total_budget_cents || 0) - previousAllocatedCents
      );

      const { error: settingsError } = await admin.from('academic_calendar_settings').upsert({
        id: 1,
        current_academic_year: nextAcademicYear,
        auto_rollover_enabled: settings.autoRolloverEnabled,
        updated_at: new Date().toISOString()
      });

      if (settingsError) {
        throw new Error(settingsError.message);
      }

      const { error: clubBudgetError } = await admin.from('club_budgets').upsert({
        academic_year: nextAcademicYear,
        total_budget_cents: 0
      });

      if (clubBudgetError) {
        throw new Error(clubBudgetError.message);
      }

      if (activeTeams.length > 0) {
        const { error: teamBudgetError } = await admin.from('team_budgets').upsert(
          activeTeams.map((team) => ({
            team_id: team.id,
            academic_year: nextAcademicYear,
            annual_budget_cents: 0
          })),
          { onConflict: 'team_id,academic_year' }
        );

        if (teamBudgetError) {
          throw new Error(teamBudgetError.message);
        }
      }

      await recordAuditEvent({
        actorId: user.id,
        action: 'budget.cycle.rolled_over',
        targetType: 'academic_year',
        targetId: nextAcademicYear,
        summary: `Rolled over from ${currentAcademicYear} to ${nextAcademicYear}.`,
        details: {
          previousAcademicYear: currentAcademicYear,
          nextAcademicYear,
          activeTeamCount: activeTeams.length,
          nextClubBudgetCents: 0,
          previousClubBudgetCents: currentClubBudget?.total_budget_cents || 0,
          previousAllocatedCents,
          previousSpentCents,
          returnedToGeneralFundCents,
          previousGeneralFundBalanceCents,
          autoRolloverEnabled: settings.autoRolloverEnabled
        }
      });

      revalidatePaths(
        REVALIDATE_PATHS.finances.concat(
          REVALIDATE_PATHS.settings,
          REVALIDATE_PATHS.dashboard,
          REVALIDATE_PATHS.reports,
          REVALIDATE_PATHS.tasks,
          REVALIDATE_PATHS.purchases
        )
      );
    }
  });
}

export async function logPurchaseAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/purchases',
    successMessage: 'Logged the purchase.',
    action: async () => {
      const expenseType =
        String(formData.get('expense_type') || 'team').trim() === 'leadership' ? 'leadership' : 'team';
      const teamId = String(formData.get('team_id') || '').trim();
      const amount = parsePurchaseAmount(formData.get('amount'));
      const description = String(formData.get('description') || '').trim();
      const academicYear = String(formData.get('academic_year') || (await getCurrentAcademicYear())).trim();
      const personName = String(formData.get('person_name') || '').trim();
      const purchasedAt = String(formData.get('purchased_at') || '').trim();
      const paymentMethod = normalizePaymentMethod(String(formData.get('payment_method') || 'unknown'));
      const categoryValue = String(formData.get('category') || 'equipment').trim();
      const receiptFile = formData.get('receipt');
      const category =
        categoryValue === 'food' ||
        categoryValue === 'travel' ||
        categoryValue === 'equipment' ||
        categoryValue === 'registration'
          ? categoryValue
          : detectPurchaseCategory(description);

      if (!description) {
        throw new Error('A description is required.');
      }

      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error('Amount must be greater than zero.');
      }

      const { user, currentRole } = await requireActiveProfile();

      if (expenseType === 'leadership') {
        if (
          currentRole !== 'admin' &&
          currentRole !== 'president' &&
          currentRole !== 'vice_president' &&
          currentRole !== 'financial_officer'
        ) {
          throw new Error('Only financial officers, presidents, vice presidents, or admins can log leadership expenses.');
        }
      } else {
        if (!teamId) {
          throw new Error('Team and description are required.');
        }
        // Admins, financial officers, and presidents can log to ANY team; team
        // leads can only log to a team they lead.
        if (
          currentRole !== 'admin' &&
          currentRole !== 'financial_officer' &&
          currentRole !== 'president'
        ) {
          await requireLeadTeam(teamId);
        }
      }

      const effectiveTeamId = expenseType === 'leadership' ? null : teamId;
      const purchaseId = crypto.randomUUID();
      let receiptPath: string | null = null;
      let receiptFileName: string | null = null;
      let receiptUploadedAt: string | null = null;

      if (receiptFile instanceof File && receiptFile.size > 0) {
        const uploaded = await uploadReceiptToStorage({
          purchaseId,
          teamId: effectiveTeamId || 'leadership',
          file: receiptFile
        });
        receiptPath = uploaded.path;
        receiptFileName = uploaded.fileName;
        receiptUploadedAt = new Date().toISOString();
      }

      const admin = createAdminClient();
      const amountCents = Math.round(amount * 100);
      const { error } = await admin.from('purchase_logs').insert({
        id: purchaseId,
        team_id: effectiveTeamId,
        expense_type: expenseType,
        created_by: user.id,
        academic_year: academicYear,
        amount_cents: amountCents,
        description,
        person_name: personName || null,
        purchased_at: normalizePurchaseDate(purchasedAt) || new Date().toISOString(),
        payment_method: paymentMethod,
        category,
        receipt_path: receiptPath,
        receipt_file_name: receiptFileName,
        receipt_uploaded_at: receiptUploadedAt
      });

      if (error) {
        throw new Error(error.message);
      }

      await recordAuditEvent({
        actorId: user.id,
        action: 'purchase.logged',
        targetType: 'purchase_log',
        targetId: purchaseId,
        summary: `Logged ${expenseType === 'leadership' ? 'leadership' : 'team'} purchase "${description}".`,
        details: {
          teamId: effectiveTeamId,
          expenseType,
          academicYear,
          amountCents,
          paymentMethod,
          category,
          receiptUploaded: Boolean(receiptPath)
        }
      });

      if (receiptPath) {
        await recordAuditEvent({
          actorId: user.id,
          action: 'file.uploaded',
          targetType: 'purchase_receipt',
          targetId: purchaseId,
          summary: `Uploaded receipt for "${description}".`,
          details: {
            teamId: effectiveTeamId,
            fileName: receiptFileName,
            receiptPath
          }
        });
      }

      // If this is a team expense logged by someone who isn't a lead of that
      // team, notify the team's leads with the amount + remaining budget. The
      // notifier self-skips when the logger is a lead. Best-effort.
      if (expenseType === 'team' && effectiveTeamId) {
        try {
          await notifyTeamLeadsOfExpense({
            teamId: effectiveTeamId,
            academicYear,
            purchaseId,
            loggedById: user.id,
            loggedByName: personName,
            loggedAsRole: currentRole,
            loggedAmountCents: amountCents,
            description
          });
        } catch (error) {
          console.error('Team expense lead notification failed:', error);
        }
      }

      await syncQueueAndRevalidate(REVALIDATE_PATHS.purchases);
    }
  });
}

// Shared core for removing a high value asset (admin-only). Returns the removed
// asset id so inline callers can drop the row from the on-page list without a
// full dashboard revalidate. The redirecting and inline actions both call this.
async function removeHighValueAsset(formData: FormData): Promise<{ id: string }> {
  const { user } = await requireAdmin();
  const assetId = String(formData.get('asset_id') || '').trim();
  if (!assetId) {
    throw new Error('Missing asset id.');
  }

  const admin = createAdminClient();
  const { data: asset } = await admin
    .from('high_value_assets')
    .select('id, item_name, team_id, steward_scope, amount_cents')
    .eq('id', assetId)
    .maybeSingle();
  if (!asset) {
    throw new Error('That high value asset no longer exists.');
  }

  const { error } = await admin.from('high_value_assets').delete().eq('id', assetId);
  if (error) {
    throw new Error(error.message);
  }

  await recordAuditEvent({
    actorId: user.id,
    action: 'high_value_asset.removed',
    targetType: 'high_value_asset',
    targetId: assetId,
    summary: `Removed high value asset "${asset.item_name}".`,
    details: {
      teamId: asset.team_id,
      stewardScope: asset.steward_scope,
      amountCents: asset.amount_cents
    }
  });

  return { id: assetId };
}

export async function deleteHighValueAssetAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard',
    successMessage: 'Removed the high value asset.',
    action: async () => {
      await removeHighValueAsset(formData);
      revalidatePaths(['/dashboard']);
    }
  });
}

// Inline (non-redirecting) variant of deleteHighValueAssetAction. Returns the
// removed id so the panel can filter it out of state in place.
export async function removeHighValueAssetInline(_prev: unknown, formData: FormData) {
  return runInlineAction(() => removeHighValueAsset(formData), 'Removed the high value asset.');
}

// Resolved, list-ready view of a logged asset, matching HighValueAssetView in
// components/high-value-asset-list.tsx. The inline logging action returns this
// so the panel can prepend the new row without re-fetching the dashboard.
type HighValueAssetViewResult = {
  id: string;
  teamName: string;
  itemName: string;
  amountCents: number;
  locationLabel: string;
  loggedByName: string;
  createdAt: string;
  stewardshipNote: string;
};

// Shared core for logging a high value asset. Runs validation, authorization,
// dedupe, and insert, then returns a fully-resolved view object. Both the
// redirecting and inline actions call this so the logic can't diverge.
async function createHighValueAsset(formData: FormData): Promise<HighValueAssetViewResult> {
  const steward = String(formData.get('steward') || '').trim();
  const itemName = String(formData.get('item_name') || '').trim();
  const amount = parsePurchaseAmount(formData.get('amount'));
  const storageLocation = String(formData.get('storage_location') || '').trim();
  const storageLocationOther = String(formData.get('storage_location_other') || '').trim();
  const stewardshipNote = String(formData.get('stewardship_note') || '').trim();

  if (!itemName) {
    throw new Error('An item / equipment name is required.');
  }

  const amountCents = Math.round(amount * 100);
  if (!Number.isFinite(amount) || amountCents <= 100000) {
    throw new Error('High value asset logging is for single items over $1,000.');
  }

  if (
    storageLocation !== 'robotics_room' &&
    storageLocation !== 'lab64' &&
    storageLocation !== 'chip' &&
    storageLocation !== 'other'
  ) {
    throw new Error('Choose a valid storage location.');
  }

  if (storageLocation === 'other') {
    if (!storageLocationOther) {
      throw new Error('Describe where the equipment is stored.');
    }
    if (storageLocationOther.length > 50) {
      throw new Error('Keep the storage location under 50 characters.');
    }
  }

  if (!stewardshipNote) {
    throw new Error('A stewardship note is required.');
  }

  if (countWords(stewardshipNote) > 30) {
    throw new Error('Keep the stewardship note under 30 words.');
  }

  // Steward = a team, or "leadership" (club-wide, no team). Team leads can
  // only steward to their own team; presidents/VPs/admins can steward to any
  // team or to Robotics Club leadership.
  const { user, profile, currentRole } = await requireActiveProfile();
  const canStewardLeadership =
    currentRole === 'admin' || currentRole === 'president' || currentRole === 'vice_president';

  let teamId: string | null = null;
  let stewardScope: 'team' | 'leadership' = 'team';
  let teamName: string = LEADERSHIP_STEWARD_LABEL;
  const admin = createAdminClient();

  if (steward === 'leadership') {
    if (!canStewardLeadership) {
      throw new Error('Only presidents, vice presidents, or admins can add club leadership assets.');
    }
    stewardScope = 'leadership';
    teamId = null;
    teamName = LEADERSHIP_STEWARD_LABEL;
  } else {
    if (!steward) {
      throw new Error('Choose which team stewards this asset.');
    }
    const { data: team } = await admin.from('teams').select('id, name').eq('id', steward).maybeSingle();
    if (!team) {
      throw new Error('Choose a valid team.');
    }
    if (!canStewardLeadership) {
      await requireLeadTeam(steward);
    }
    stewardScope = 'team';
    teamId = steward;
    teamName = team.name;
  }

  // Guard against accidental double-submits (the dashboard re-render is slow,
  // so an impatient double-click could otherwise log the same item twice):
  // skip if this user logged an identical asset in the last minute.
  const recentCutoff = new Date(Date.now() - 60_000).toISOString();
  const { data: recentDuplicate } = await admin
    .from('high_value_assets')
    .select('id, created_at')
    .eq('logged_by', user.id)
    .eq('item_name', itemName)
    .eq('amount_cents', amountCents)
    .gte('created_at', recentCutoff)
    .limit(1)
    .maybeSingle();

  const buildView = (id: string, createdAt: string): HighValueAssetViewResult => ({
    id,
    teamName,
    itemName,
    amountCents,
    locationLabel: storageLocationLabel(storageLocation, storageLocation === 'other' ? storageLocationOther : null),
    loggedByName: profile.full_name || 'Unknown',
    createdAt,
    stewardshipNote
  });

  if (recentDuplicate) {
    return buildView(recentDuplicate.id, recentDuplicate.created_at);
  }

  const { data: inserted, error } = await admin
    .from('high_value_assets')
    .insert({
      team_id: teamId,
      steward_scope: stewardScope,
      logged_by: user.id,
      item_name: itemName,
      amount_cents: amountCents,
      storage_location: storageLocation,
      storage_location_other: storageLocation === 'other' ? storageLocationOther : null,
      stewardship_note: stewardshipNote
    })
    .select('id, created_at')
    .single();

  if (error || !inserted) {
    throw new Error(error?.message || 'Failed to log the high value asset.');
  }

  await recordAuditEvent({
    actorId: user.id,
    action: 'high_value_asset.logged',
    targetType: 'high_value_asset',
    targetId: inserted.id,
    summary: `Logged high value asset "${itemName}" (${stewardScope === 'leadership' ? 'Robotics Club leadership' : 'team'}).`,
    details: {
      teamId,
      stewardScope,
      amountCents,
      storageLocation,
      storageLocationOther: storageLocation === 'other' ? storageLocationOther : null
    }
  });

  return buildView(inserted.id, inserted.created_at);
}

export async function logHighValueAssetAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard',
    successMessage: 'Logged the high value asset.',
    action: async () => {
      await createHighValueAsset(formData);
      revalidatePaths(['/dashboard']);
    }
  });
}

// Inline (non-redirecting) variant of logHighValueAssetAction. Returns the
// resolved asset view so the panel can prepend it to the on-page list.
export async function logHighValueAssetInline(_prev: unknown, formData: FormData) {
  return runInlineAction(() => createHighValueAsset(formData), 'Logged the high value asset.');
}

export async function importPurchasesAction(
  _prevState: {
    message?: string;
    addedAmount?: number;
    skippedRows?: number[];
  } | null,
  formData: FormData
) {
  const teamId = String(formData.get('team_id') || '').trim();
  const academicYear = String(formData.get('academic_year') || (await getCurrentAcademicYear())).trim();
  const payloadRaw = String(formData.get('import_payload') || '').trim();

  if (!teamId || !payloadRaw) {
    return { message: 'Missing team or import payload.', addedAmount: 0, skippedRows: [] };
  }

  const { user } = await requireLeadTeam(teamId);
  let parsed: {
    purchases: Array<{
      rowNumber?: number;
      description: string;
      amount: number;
      personName?: string;
      purchasedAt?: string;
      paymentMethod?: string;
      category?: string;
    }>;
    skippedRows: number[];
  };

  try {
    parsed = JSON.parse(payloadRaw) as typeof parsed;
  } catch {
    return { message: 'The import file could not be parsed.', addedAmount: 0, skippedRows: [] };
  }

  const skippedRows = new Set<number>((parsed.skippedRows || []).filter((row) => Number.isFinite(row)));
  const admin = createAdminClient();
  const { data: existingPurchasesData } = await admin
    .from('purchase_logs')
    .select('description, amount_cents, purchased_at, person_name, payment_method')
    .eq('team_id', teamId)
    .eq('academic_year', academicYear);
  const seenKeys = new Set(
    ((existingPurchasesData || []) as Array<{
      description: string;
      amount_cents: number;
      purchased_at: string;
      person_name: string | null;
      payment_method: 'reimbursement' | 'credit_card' | 'amazon' | 'unknown';
    }>).map((purchase) =>
      buildPurchaseDedupKey({
        description: purchase.description,
        amountCents: purchase.amount_cents,
        purchasedAt: purchase.purchased_at,
        personName: purchase.person_name,
        paymentMethod: purchase.payment_method
      })
    )
  );
  let duplicateCount = 0;
  const validPurchases = (parsed.purchases || []).flatMap((purchase) => {
    const description = String(purchase.description || '').trim();
    const amount = parsePurchaseAmount(purchase.amount);
    const rowNumber = Number(purchase.rowNumber || 0);

    if (!description || !Number.isFinite(amount) || amount < 0.5) {
      if (rowNumber > 0) {
        skippedRows.add(rowNumber);
      }
      return [];
    }

    const amountCents = Math.round(amount * 100);
    const normalizedPurchasedAt = normalizePurchaseDate(purchase.purchasedAt) || new Date().toISOString();
    const normalizedPaymentMethod = normalizePaymentMethod(purchase.paymentMethod || 'unknown');
    const person = purchase.personName ? String(purchase.personName).trim() || null : null;
    const dedupKey = buildPurchaseDedupKey({
      description,
      amountCents,
      purchasedAt: normalizedPurchasedAt,
      personName: person,
      paymentMethod: normalizedPaymentMethod
    });

    if (seenKeys.has(dedupKey)) {
      duplicateCount += 1;
      if (rowNumber > 0) {
        skippedRows.add(rowNumber);
      }
      return [];
    }

    seenKeys.add(dedupKey);

    return [
      {
        team_id: teamId,
        created_by: user.id,
        academic_year: academicYear,
        amount_cents: amountCents,
        description,
        person_name: person,
        purchased_at: normalizedPurchasedAt,
        payment_method: normalizedPaymentMethod,
        category:
          purchase.category === 'food' ||
          purchase.category === 'travel' ||
          purchase.category === 'equipment' ||
          purchase.category === 'registration'
            ? purchase.category
            : detectPurchaseCategory(description),
        receipt_not_needed: true
      }
    ];
  });

  if (validPurchases.length === 0) {
    return {
      message:
        duplicateCount > 0
          ? 'Everything in that file already appears to be in the expense log.'
          : 'No valid purchases were found to import.',
      addedAmount: 0,
      skippedRows: Array.from(skippedRows).sort((a, b) => a - b)
    };
  }

  const { error } = await admin.from('purchase_logs').insert(validPurchases);

  if (error) {
    throw new Error(error.message);
  }

  const addedAmount = validPurchases.reduce((sum, purchase) => sum + purchase.amount_cents / 100, 0);

  await recordAuditEvent({
    actorId: user.id,
    action: 'purchase.imported',
    targetType: 'purchase_log',
    summary: `Imported ${validPurchases.length} purchases.`,
    details: {
      teamId,
      academicYear,
      purchaseCount: validPurchases.length,
      addedAmount,
      duplicateCount,
      skippedRows: Array.from(skippedRows).sort((a, b) => a - b)
    }
  });

  await syncQueueAndRevalidate(REVALIDATE_PATHS.purchases);

  return {
    message:
      duplicateCount > 0
        ? `Imported ${validPurchases.length} purchases. Skipped ${duplicateCount} duplicates.`
        : `Imported ${validPurchases.length} purchases.`,
    addedAmount,
    skippedRows: Array.from(skippedRows).sort((a, b) => a - b)
  };
}

export async function updatePurchaseCategoryAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/expenses',
    successMessage: 'Updated the purchase category.',
    action: async () => {
      const purchaseId = String(formData.get('purchase_id') || '').trim();
      const category = String(formData.get('category') || '').trim();

      if (!purchaseId) {
        throw new Error('Missing purchase id.');
      }

      if (
        category !== 'equipment' &&
        category !== 'food' &&
        category !== 'travel' &&
        category !== 'registration'
      ) {
        throw new Error('Invalid category.');
      }

      const admin = createAdminClient();
      const { data: purchase } = await admin.from('purchase_logs').select('id, team_id').eq('id', purchaseId).single();

      if (!purchase) {
        throw new Error('Purchase not found.');
      }

      const { user } = await requireLeadTeam(purchase.team_id);
      const { error } = await admin.from('purchase_logs').update({ category }).eq('id', purchaseId);

      if (error) {
        throw new Error(error.message);
      }

      await recordAuditEvent({
        actorId: user.id,
        action: 'purchase.category.updated',
        targetType: 'purchase_log',
        targetId: purchaseId,
        summary: `Updated purchase category to ${category}.`,
        details: {
          teamId: purchase.team_id,
          category
        }
      });

      revalidatePaths(REVALIDATE_PATHS.finances.concat(['/dashboard/expenses', '/dashboard/purchases']));
    }
  });
}

export async function updatePurchaseDetailsAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/expenses',
    successMessage: 'Updated the purchase details.',
    action: async () => {
      const purchaseId = String(formData.get('purchase_id') || '').trim();
      const description = String(formData.get('description') || '').trim();
      const amount = parsePurchaseAmount(formData.get('amount'));
      const purchasedAt = String(formData.get('purchased_at') || '').trim();
      const personName = String(formData.get('person_name') || '').trim();
      const paymentMethod = normalizePaymentMethod(String(formData.get('payment_method') || 'unknown'));
      const categoryValue = String(formData.get('category') || 'equipment').trim();
      const category =
        categoryValue === 'food' ||
        categoryValue === 'travel' ||
        categoryValue === 'equipment' ||
        categoryValue === 'registration'
          ? categoryValue
          : detectPurchaseCategory(description);

      if (!purchaseId) {
        throw new Error('Missing purchase id.');
      }

      if (!description) {
        throw new Error('Item name is required.');
      }

      if (!Number.isFinite(amount) || amount < 0.5) {
        throw new Error('Amount must be at least $0.50.');
      }

      const admin = createAdminClient();
      const { data: purchase } = await admin
        .from('purchase_logs')
        .select('id, team_id')
        .eq('id', purchaseId)
        .maybeSingle();

      if (!purchase) {
        throw new Error('Purchase not found.');
      }

      const { user } = await requireLeadTeam(purchase.team_id);
      const amountCents = Math.round(amount * 100);
      const normalizedPurchasedAt = normalizePurchaseDate(purchasedAt) || new Date().toISOString();
      const { error } = await admin
        .from('purchase_logs')
        .update({
          description,
          amount_cents: amountCents,
          purchased_at: normalizedPurchasedAt,
          person_name: personName || null,
          payment_method: paymentMethod,
          category
        })
        .eq('id', purchaseId);

      if (error) {
        throw new Error(error.message);
      }

      await recordAuditEvent({
        actorId: user.id,
        action: 'purchase.updated',
        targetType: 'purchase_log',
        targetId: purchaseId,
        summary: `Updated purchase "${description}".`,
        details: {
          teamId: purchase.team_id,
          amountCents,
          purchasedAt: normalizedPurchasedAt,
          personName: personName || null,
          paymentMethod,
          category
        }
      });

      await syncQueueAndRevalidate(REVALIDATE_PATHS.purchases);
    }
  });
}

export async function deletePurchaseAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/expenses',
    successMessage: 'Deleted the purchase.',
    action: async () => {
      const purchaseId = String(formData.get('purchase_id') || '').trim();

      if (!purchaseId) {
        throw new Error('Missing purchase id.');
      }

      const admin = createAdminClient();
      const { data: purchase } = await admin
        .from('purchase_logs')
        .select('id, team_id, description, receipt_path')
        .eq('id', purchaseId)
        .maybeSingle();

      if (!purchase) {
        throw new Error('Purchase not found.');
      }

      const { user } = await requireLeadTeam(purchase.team_id);

      if (purchase.receipt_path) {
        await admin.storage.from(RECEIPT_BUCKET).remove([purchase.receipt_path]);
      }

      const { error } = await admin.from('purchase_logs').delete().eq('id', purchaseId);

      if (error) {
        throw new Error(error.message);
      }

      await recordAuditEvent({
        actorId: user.id,
        action: 'purchase.deleted',
        targetType: 'purchase_log',
        targetId: purchaseId,
        summary: `Deleted purchase "${purchase.description}".`,
        details: {
          teamId: purchase.team_id,
          receiptDeleted: Boolean(purchase.receipt_path)
        }
      });

      await syncQueueAndRevalidate(REVALIDATE_PATHS.purchases);
    }
  });
}

export async function clearTeamExpenseLogAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/expenses',
    successMessage: 'Cleared the team expense log.',
    action: async () => {
      const teamId = String(formData.get('team_id') || '').trim();

      if (!teamId) {
        throw new Error('Missing team id.');
      }

      const { user } = await requireLeadTeam(teamId);
      const admin = createAdminClient();
      const { data: team } = await admin.from('teams').select('id, name').eq('id', teamId).single();

      if (!team) {
        throw new Error('Team not found.');
      }

      const confirmOne = String(formData.get('confirm_delete') || '').trim();
      const confirmTwo = String(formData.get('confirm_team_name') || '').trim();

      if (confirmOne !== 'DELETE' || confirmTwo !== team.name) {
        throw new Error('Expense log clear confirmation did not match.');
      }

      const { data: purchases } = await admin
        .from('purchase_logs')
        .select('id, receipt_path')
        .eq('team_id', teamId);

      const receiptPaths = (purchases || [])
        .map((purchase) => purchase.receipt_path)
        .filter((path): path is string => Boolean(path));

      if (receiptPaths.length > 0) {
        await admin.storage.from(RECEIPT_BUCKET).remove(receiptPaths);
      }

      const { error } = await admin.from('purchase_logs').delete().eq('team_id', teamId);

      if (error) {
        throw new Error(error.message);
      }

      await recordAuditEvent({
        actorId: user.id,
        action: 'purchase.cleared',
        targetType: 'purchase_log',
        targetId: teamId,
        summary: `Cleared all expense log entries for ${team.name}.`,
        details: {
          teamId,
          deletedPurchaseCount: (purchases || []).length,
          deletedReceiptCount: receiptPaths.length
        }
      });

      await syncQueueAndRevalidate(REVALIDATE_PATHS.purchases);
    }
  });
}

export async function uploadPurchaseReceiptAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/expenses',
    successMessage: 'Uploaded the receipt.',
    action: async () => {
      const purchaseId = String(formData.get('purchase_id') || '').trim();
      const receiptFile = formData.get('receipt');

      if (!purchaseId) {
        throw new Error('Missing purchase id.');
      }

      if (!(receiptFile instanceof File) || receiptFile.size === 0) {
        throw new Error('Please choose a receipt file to upload.');
      }

      const admin = createAdminClient();
      const { data: purchase } = await admin
        .from('purchase_logs')
        .select('id, team_id, receipt_path')
        .eq('id', purchaseId)
        .single();

      if (!purchase) {
        throw new Error('Purchase not found.');
      }

      const { user } = await requireLeadTeam(purchase.team_id);
      const uploaded = await uploadReceiptToStorage({
        purchaseId,
        teamId: purchase.team_id,
        file: receiptFile,
        existingPath: purchase.receipt_path
      });

      const { error } = await admin
        .from('purchase_logs')
        .update({
          receipt_path: uploaded.path,
          receipt_file_name: uploaded.fileName,
          receipt_uploaded_at: new Date().toISOString()
        })
        .eq('id', purchaseId);

      if (error) {
        throw new Error(error.message);
      }

      await recordAuditEvent({
        actorId: user.id,
        action: 'file.uploaded',
        targetType: 'purchase_receipt',
        targetId: purchaseId,
        summary: 'Uploaded a purchase receipt.',
        details: {
          teamId: purchase.team_id,
          fileName: uploaded.fileName,
          receiptPath: uploaded.path
        }
      });

      await syncQueueAndRevalidate(REVALIDATE_PATHS.purchaseReceipt);
    }
  });
}

export async function updateReceiptNotificationSettingsAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/settings',
    successMessage: 'Updated receipt reminder settings.',
    action: async () => {
      const { user } = await requireAdmin();
      const reminderDays = normalizeReminderDays([
        formData.get('reminder_day_one')?.toString(),
        formData.get('reminder_day_two')?.toString(),
        formData.get('reminder_day_three')?.toString()
      ]);
      const emailEnabled = String(formData.get('email_enabled') || '') === 'on';
      const slackEnabled = String(formData.get('slack_enabled') || '') === 'on';

      const admin = createAdminClient();
      const { error } = await admin.from('receipt_notification_settings').upsert({
        id: 1,
        email_enabled: emailEnabled,
        slack_enabled: slackEnabled,
        reminder_days: reminderDays,
        updated_at: new Date().toISOString()
      });

      if (error) {
        throw new Error(error.message);
      }

      await recordAuditEvent({
        actorId: user.id,
        action: 'settings.receipt_reminders.updated',
        targetType: 'receipt_notification_settings',
        targetId: '1',
        summary: 'Updated receipt reminder settings.',
        details: {
          emailEnabled,
          slackEnabled,
          reminderDays
        }
      });

      await syncQueueAndRevalidate(REVALIDATE_PATHS.settings);
    }
  });
}

export async function updateReimbursementSettingsAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/settings',
    successMessage: 'Updated reimbursement settings.',
    action: async () => {
      const { user } = await requireAdmin();
      const thresholdDollars = Number(String(formData.get('signature_threshold') || '').replace(/[^0-9.]/g, ''));
      if (!Number.isFinite(thresholdDollars) || thresholdDollars < 0) {
        throw new Error('Enter a valid signature threshold.');
      }
      const intakeEnabled = String(formData.get('intake_enabled') || '') === 'on';
      const thresholdCents = Math.round(thresholdDollars * 100);
      const signatureReminderEnabled = String(formData.get('signature_reminder_enabled') || '') === 'on';
      const intervalRaw = Math.round(
        Number(String(formData.get('signature_reminder_interval_days') || '7').replace(/[^0-9]/g, ''))
      );
      const signatureReminderIntervalDays = Math.min(365, Math.max(1, Number.isFinite(intervalRaw) && intervalRaw > 0 ? intervalRaw : 7));

      const admin = createAdminClient();
      const { error } = await admin.from('reimbursement_settings').upsert({
        id: 1,
        signature_threshold_cents: thresholdCents,
        intake_enabled: intakeEnabled,
        signature_reminder_enabled: signatureReminderEnabled,
        signature_reminder_interval_days: signatureReminderIntervalDays,
        updated_at: new Date().toISOString()
      });

      if (error) {
        throw new Error(error.message);
      }

      await recordAuditEvent({
        actorId: user.id,
        action: 'settings.reimbursements.updated',
        targetType: 'reimbursement_settings',
        targetId: '1',
        summary: 'Updated member reimbursement settings.',
        details: { thresholdCents, intakeEnabled, signatureReminderEnabled, signatureReminderIntervalDays }
      });

      revalidatePaths(REVALIDATE_PATHS.settings);
    }
  });
}

export async function updateReportNotificationSettingsAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/settings',
    successMessage: 'Updated report reminder settings.',
    action: async () => {
      const { user } = await requireAdmin();
      const reminderDays = normalizeReminderDays([
        formData.get('report_reminder_day_one')?.toString(),
        formData.get('report_reminder_day_two')?.toString(),
        formData.get('report_reminder_day_three')?.toString()
      ]);
      const emailEnabled = String(formData.get('report_email_enabled') || '') === 'on';
      const slackEnabled = String(formData.get('report_slack_enabled') || '') === 'on';

      const admin = createAdminClient();
      const { error } = await admin.from('report_notification_settings').upsert({
        id: 1,
        email_enabled: emailEnabled,
        slack_enabled: slackEnabled,
        reminder_days: reminderDays,
        updated_at: new Date().toISOString()
      });

      if (error) {
        throw new Error(error.message);
      }

      await recordAuditEvent({
        actorId: user.id,
        action: 'settings.report_reminders.updated',
        targetType: 'report_notification_settings',
        targetId: '1',
        summary: 'Updated report reminder settings.',
        details: {
          emailEnabled,
          slackEnabled,
          reminderDays
        }
      });

      await syncQueueAndRevalidate(REVALIDATE_PATHS.settings);
    }
  });
}

export async function updateInviteNotificationSettingsAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/settings',
    successMessage: 'Updated invite reminder settings.',
    action: async () => {
      const { user } = await requireAdmin();
      const emailEnabled = String(formData.get('invite_email_enabled') || '') === 'on';
      const slackEnabled = String(formData.get('invite_slack_enabled') || '') === 'on';

      const admin = createAdminClient();
      const { error } = await admin.from('invite_notification_settings').upsert({
        id: 1,
        email_enabled: emailEnabled,
        slack_enabled: slackEnabled,
        updated_at: new Date().toISOString()
      });

      if (error) {
        throw new Error(error.message);
      }

      await recordAuditEvent({
        actorId: user.id,
        action: 'settings.invite_reminders.updated',
        targetType: 'invite_notification_settings',
        targetId: '1',
        summary: 'Updated invite reminder settings.',
        details: {
          emailEnabled,
          slackEnabled,
          cadenceDays: 3
        }
      });

      await syncQueueAndRevalidate(REVALIDATE_PATHS.settings);
    }
  });
}

export async function updateAcademicCalendarSettingsAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/settings',
    successMessage: 'Updated the academic calendar template.',
    action: async () => {
      const { user } = await requireAdmin();
      const autumnStart = String(formData.get('autumn_start_md') || '').trim();
      const autumnEnd = String(formData.get('autumn_end_md') || '').trim();
      const winterEnd = String(formData.get('winter_end_md') || '').trim();
      const springEnd = String(formData.get('spring_end_md') || '').trim();
      const summerEnd = String(formData.get('summer_end_md') || '').trim();

      const allValues = [autumnStart, autumnEnd, winterEnd, springEnd, summerEnd];
      if (allValues.some((value) => !/^\d{2}-\d{2}$/.test(value))) {
        throw new Error('Quarter dates must use MM-DD format.');
      }

      const admin = createAdminClient();
      const { error } = await admin.from('academic_calendar_templates').upsert({
        id: 1,
        autumn_start_md: autumnStart,
        autumn_end_md: autumnEnd,
        winter_end_md: winterEnd,
        spring_end_md: springEnd,
        summer_end_md: summerEnd,
        updated_at: new Date().toISOString()
      });

      if (error) {
        throw new Error(error.message);
      }

      await recordAuditEvent({
        actorId: user.id,
        action: 'settings.academic_calendar.updated',
        targetType: 'academic_calendar_templates',
        targetId: '1',
        summary: 'Updated the academic calendar template.',
        details: {
          autumnStart,
          autumnEnd,
          winterEnd,
          springEnd,
          summerEnd
        }
      });

      await syncQueueAndRevalidate(REVALIDATE_PATHS.settingsDashboardReportsTasks);
    }
  });
}

export async function saveReportQuestionsAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/settings',
    successMessage: 'Saved the report questions.',
    action: async () => {
      const { user } = await requireAdmin();
      const payloadRaw = String(formData.get('questions_json') || '[]');
      let parsed: unknown;
      try {
        parsed = JSON.parse(payloadRaw);
      } catch {
        throw new Error('Report questions payload could not be parsed.');
      }

      const questions = normalizeReportQuestions(parsed);
      if (questions.length === 0) {
        throw new Error('At least one report question is required.');
      }

      const admin = createAdminClient();
      const { data: existingQuestions } = await admin
        .from('report_questions')
        .select('id')
        .eq('is_active', true);
      const existingIds = new Set((existingQuestions || []).map((question) => question.id));
      const incomingIds = new Set(questions.map((question) => question.id).filter(Boolean));

      for (const question of questions) {
        if (question.id) {
          const { error } = await admin
            .from('report_questions')
            .update({
              prompt: question.prompt,
              field_type: question.fieldType,
              word_limit: question.wordLimit,
              sort_order: question.sortOrder,
              is_active: true
            })
            .eq('id', question.id);

          if (error) {
            throw new Error(error.message);
          }
        } else {
          const { error } = await admin.from('report_questions').insert({
            prompt: question.prompt,
            field_type: question.fieldType,
            word_limit: question.wordLimit,
            sort_order: question.sortOrder,
            is_active: true
          });

          if (error) {
            throw new Error(error.message);
          }
        }
      }

      const retireIds = Array.from(existingIds).filter((id) => !incomingIds.has(id));
      if (retireIds.length > 0) {
        const { error } = await admin
          .from('report_questions')
          .update({ is_active: false })
          .in('id', retireIds);

        if (error) {
          throw new Error(error.message);
        }
      }

      await recordAuditEvent({
        actorId: user.id,
        action: 'settings.report_questions.updated',
        targetType: 'report_question',
        summary: 'Updated quarterly report questions.',
        details: {
          questionCount: questions.length,
          retiredQuestionCount: retireIds.length
        }
      });

      revalidatePaths(REVALIDATE_PATHS.settingsAndReports);
    }
  });
}

export async function saveTeamReportDraftAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/reports',
    successMessage: 'Saved the report draft.',
    action: async () => {
      await saveTeamReport(formData, 'draft');
    }
  });
}

export async function submitTeamReportAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/reports',
    successMessage: 'Submitted the report.',
    action: async () => {
      await saveTeamReport(formData, 'submitted');
    }
  });
}

function coerceEoyMemberRefs(raw: unknown, validByKey: Map<string, EoyMemberRef>, limit: number): EoyMemberRef[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const seen = new Set<string>();
  const result: EoyMemberRef[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const id = String((entry as { id?: unknown }).id || '').trim();
    const source = String((entry as { source?: unknown }).source || '').trim();
    if (!id || (source !== 'profile' && source !== 'roster')) {
      continue;
    }
    const key = eoyMemberKey({ id, source });
    if (seen.has(key)) {
      continue;
    }
    const match = validByKey.get(key);
    if (!match) {
      continue;
    }
    seen.add(key);
    result.push(match);
    if (result.length >= limit) {
      break;
    }
  }

  return result;
}

function normalizeEoyReportData(
  raw: unknown,
  options: {
    members: EoyMemberRef[];
    acknowledgementCount: number;
    autofill: EoyReportData['autofill'];
  }
): EoyReportData {
  const base = emptyEoyReportData();
  const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const validByKey = new Map(options.members.map((member) => [eoyMemberKey(member), member]));

  const reregister = record.reregister === 'yes' || record.reregister === 'no' ? record.reregister : '';

  const classRaw =
    record.classDistribution && typeof record.classDistribution === 'object'
      ? (record.classDistribution as Record<string, unknown>)
      : {};
  const classDistribution = { ...base.classDistribution };
  for (const year of EOY_CLASS_YEARS) {
    const value = Number(classRaw[year.key]);
    if (Number.isFinite(value)) {
      classDistribution[year.key] = Math.max(0, Math.round(value));
    }
  }

  const niceToHave = Array.isArray(record.niceToHave)
    ? (record.niceToHave as unknown[]).map((entry) => String(entry || '').trim()).slice(0, 3)
    : base.niceToHave;

  const summerRaw =
    record.summer && typeof record.summer === 'object' ? (record.summer as Record<string, unknown>) : {};
  const summerActive = summerRaw.active === 'yes' || summerRaw.active === 'no' ? summerRaw.active : '';
  const predictedSpendCents = Math.max(0, Math.round(Number(summerRaw.predictedSpendCents) || 0));

  const justifications = Array.isArray(summerRaw.justifications)
    ? (summerRaw.justifications as unknown[])
        .map((entry) => {
          const item = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {};
          return {
            category: String(item.category || '').trim(),
            justification: String(item.justification || '').trim()
          };
        })
        .filter((entry) => entry.category || entry.justification)
    : [];

  const acksRaw = Array.isArray(summerRaw.acknowledgements) ? (summerRaw.acknowledgements as unknown[]) : [];
  const acknowledgements = Array.from({ length: options.acknowledgementCount }, (_, index) => Boolean(acksRaw[index]));

  const signatureRaw = typeof record.signature === 'string' ? record.signature : '';
  const signature = signatureRaw.startsWith('data:image/') ? signatureRaw.slice(0, 1_000_000) : '';

  return {
    reregister,
    nextLeads: coerceEoyMemberRefs(record.nextLeads, validByKey, 2),
    leadSelection: String(record.leadSelection || '').trim(),
    yearSummary: String(record.yearSummary || '').trim(),
    classDistribution,
    niceToHave,
    summer: {
      active: summerActive,
      members: coerceEoyMemberRefs(summerRaw.members, validByKey, Math.max(2, options.members.length)),
      predictedSpendCents,
      plan: String(summerRaw.plan || '').trim(),
      justifications,
      acknowledgements
    },
    signature,
    autofill: options.autofill
  };
}

function validateEoySubmission(data: EoyReportData, options: { yearSummaryLimit: number }) {
  if (data.reregister !== 'yes' && data.reregister !== 'no') {
    throw new Error('Please answer whether you would like to re-register your team for next year.');
  }

  // Declining to re-register ends the report — the team will not continue next year.
  if (data.reregister === 'no') {
    if (!data.signature) {
      throw new Error('Please sign the report before submitting.');
    }
    return;
  }

  if (data.nextLeads.length !== 2) {
    throw new Error('Please select exactly 2 team leads for next year.');
  }
  if (!data.leadSelection) {
    throw new Error('Please describe how the new team leads were chosen.');
  }
  if (!data.yearSummary) {
    throw new Error('Please summarize your team’s work this year.');
  }
  const yearSummaryWords = countWords(data.yearSummary);
  const yearSummaryMin = Math.ceil(options.yearSummaryLimit / 2);
  if (yearSummaryWords < yearSummaryMin) {
    throw new Error(`Your year summary must be at least ${yearSummaryMin} words.`);
  }
  if (yearSummaryWords > options.yearSummaryLimit) {
    throw new Error(`Your year summary exceeds its ${options.yearSummaryLimit} word limit.`);
  }
  if (data.summer.active !== 'yes' && data.summer.active !== 'no') {
    throw new Error('Please answer whether your team plans to be active over summer.');
  }
  if (data.summer.active === 'yes') {
    if (data.summer.members.length < 2) {
      throw new Error('Please list at least 2 team members who will be on campus over summer.');
    }
    if (data.summer.predictedSpendCents > data.autofill.remainingFundingCents) {
      throw new Error('Predicted summer spend cannot exceed your remaining funding for the year.');
    }
    if (!data.summer.plan) {
      throw new Error('Please describe how you plan to spend funds over summer.');
    }
    if (!data.summer.acknowledgements.every(Boolean)) {
      throw new Error('Please confirm all of the summer spending acknowledgements before submitting.');
    }
  }
  if (!data.signature) {
    throw new Error('Please sign the report before submitting.');
  }
}

async function saveEoyReport(formData: FormData, status: 'draft' | 'submitted') {
  const teamId = String(formData.get('team_id') || '').trim();
  const academicYear = String(formData.get('academic_year') || '').trim();

  if (!teamId || !academicYear) {
    throw new Error('Missing report context.');
  }

  const { user } = await requireLeadTeam(teamId);

  if (status === 'submitted') {
    const state = await getEoyReportState();
    if (state.reportState !== 'open' || state.academicYear !== academicYear) {
      throw new Error('The end-of-year report is not currently open for submission.');
    }
  }

  const settings = await getEoyReportSettings();
  const [totalMembers, fundsSpentThisYearCents, annualBudgetCents, members, summerBlock] = await Promise.all([
    getTeamMemberCount(teamId),
    getYearFundsSpentCents(teamId, academicYear),
    getTeamAnnualBudgetCents(teamId, academicYear),
    getEoyTeamMembers(teamId),
    getEoySummerBlock(teamId)
  ]);
  const remainingFundingCents = Math.max(0, annualBudgetCents - fundsSpentThisYearCents);

  const payloadRaw = String(formData.get('report_data') || '{}');
  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadRaw);
  } catch {
    throw new Error('Report data could not be parsed.');
  }

  const data = normalizeEoyReportData(parsed, {
    members,
    acknowledgementCount: settings.questions.acknowledgements.length,
    autofill: { totalMembers, fundsSpentThisYearCents, annualBudgetCents, remainingFundingCents }
  });

  // Blocked teams cannot record any summer spending, regardless of client input.
  if (summerBlock) {
    data.summer = {
      active: 'no',
      members: [],
      predictedSpendCents: 0,
      plan: '',
      justifications: [],
      acknowledgements: data.summer.acknowledgements.map(() => false)
    };
  }

  if (status === 'submitted') {
    validateEoySubmission(data, { yearSummaryLimit: yearSummaryWordLimit(annualBudgetCents) });
  }

  const admin = createAdminClient();
  const { data: report, error } = await admin
    .from('eoy_reports')
    .upsert(
      {
        team_id: teamId,
        academic_year: academicYear,
        status,
        data,
        submitted_at: status === 'submitted' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
        updated_by: user.id
      },
      { onConflict: 'team_id,academic_year' }
    )
    .select('id')
    .single();

  if (error || !report) {
    throw new Error(error?.message || 'Failed to save the end-of-year report.');
  }

  await recordAuditEvent({
    actorId: user.id,
    action: `eoy_report.${status}`,
    targetType: 'eoy_report',
    targetId: report.id,
    summary: `${status === 'submitted' ? 'Submitted' : 'Saved draft for'} ${EOY_REPORT_TITLE}.`,
    details: {
      teamId,
      academicYear,
      totalMembers,
      fundsSpentThisYearCents,
      annualBudgetCents,
      remainingFundingCents,
      summerActive: data.summer.active
    }
  });

  // Keep saving snappy: just revalidate. The reminder queue (which cancels a
  // submitted team's nudges) reconciles on the next scheduled cron sync.
  revalidatePaths(REVALIDATE_PATHS.eoyReports);
}

export async function saveEoyReportDraftAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/reports/eoy',
    successMessage: 'Saved the end-of-year report draft.',
    action: async () => {
      await saveEoyReport(formData, 'draft');
    }
  });
}

export async function submitEoyReportAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/reports/eoy',
    successMessage: 'Submitted the end-of-year report.',
    action: async () => {
      await saveEoyReport(formData, 'submitted');
    }
  });
}

function normalizeEoyQuestions(raw: unknown): EoyQuestionConfig {
  const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const pick = (key: keyof EoyQuestionConfig) => {
    const value = record[key];
    return typeof value === 'string' && value.trim() ? value.trim() : (DEFAULT_EOY_QUESTIONS[key] as string);
  };
  const acksRaw = Array.isArray(record.acknowledgements) ? (record.acknowledgements as unknown[]) : [];
  const acknowledgements = acksRaw.map((entry) => String(entry || '').trim()).filter(Boolean);

  return {
    reregister: pick('reregister'),
    nextLeads: pick('nextLeads'),
    leadSelection: pick('leadSelection'),
    yearSummary: pick('yearSummary'),
    classDistribution: pick('classDistribution'),
    niceToHave: pick('niceToHave'),
    summerActive: pick('summerActive'),
    summerMembers: pick('summerMembers'),
    summerSpend: pick('summerSpend'),
    summerPlan: pick('summerPlan'),
    summerJustifications: pick('summerJustifications'),
    acknowledgements: acknowledgements.length > 0 ? acknowledgements : DEFAULT_EOY_QUESTIONS.acknowledgements
  };
}

export async function updateEoyReportSettingsAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/settings',
    successMessage: 'Updated end-of-year report settings.',
    action: async () => {
      const { user } = await requireAdminOrPresident();
      const dueMonthDay = String(formData.get('eoy_due_month_day') || '').trim();
      if (!/^\d{2}-\d{2}$/.test(dueMonthDay)) {
        throw new Error('Due date must use MM-DD format.');
      }

      const reminderDays = normalizeReminderDays([
        formData.get('eoy_reminder_day_one')?.toString(),
        formData.get('eoy_reminder_day_two')?.toString(),
        formData.get('eoy_reminder_day_three')?.toString()
      ]);
      const emailEnabled = String(formData.get('eoy_email_enabled') || '') === 'on';
      const slackEnabled = String(formData.get('eoy_slack_enabled') || '') === 'on';

      let questions: EoyQuestionConfig | undefined;
      const questionsRaw = formData.get('eoy_questions_json');
      if (typeof questionsRaw === 'string' && questionsRaw.trim()) {
        let parsedQuestions: unknown;
        try {
          parsedQuestions = JSON.parse(questionsRaw);
        } catch {
          throw new Error('Report questions payload could not be parsed.');
        }
        questions = normalizeEoyQuestions(parsedQuestions);
      }

      const admin = createAdminClient();
      const payload: Record<string, unknown> = {
        id: 1,
        due_month_day: dueMonthDay,
        email_enabled: emailEnabled,
        slack_enabled: slackEnabled,
        reminder_days: reminderDays,
        updated_at: new Date().toISOString(),
        updated_by: user.id
      };
      if (questions) {
        payload.questions = questions;
      }

      const { error } = await admin.from('eoy_report_settings').upsert(payload);
      if (error) {
        throw new Error(error.message);
      }

      await recordAuditEvent({
        actorId: user.id,
        action: 'settings.eoy_report.updated',
        targetType: 'eoy_report_settings',
        targetId: '1',
        summary: 'Updated end-of-year report settings.',
        details: { dueMonthDay, emailEnabled, slackEnabled, reminderDays }
      });

      await syncQueueAndRevalidate(REVALIDATE_PATHS.eoyReports);
    }
  });
}

function formatAnnouncementDateTime(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Los_Angeles'
  }).format(new Date(value));
}

function parseOffset(offsetLabel: string) {
  const normalized = offsetLabel.replace('GMT', '').replace('UTC', '').trim();
  const sign = normalized.startsWith('-') ? '-' : '+';
  const raw = normalized.replace(/^[-+]/, '');

  if (!raw.includes(':')) {
    const hours = raw.padStart(2, '0');
    return `${sign}${hours}:00`;
  }

  const [hours, minutes] = raw.split(':');
  return `${sign}${hours.padStart(2, '0')}:${(minutes || '00').padStart(2, '0')}`;
}

function getPacificOffsetForInstant(date: Date) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    timeZoneName: 'shortOffset'
  });
  const part = formatter.formatToParts(date).find((entry) => entry.type === 'timeZoneName')?.value || 'GMT-8';
  return parseOffset(part);
}

function parsePacificDateTimeInput(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) {
    return null;
  }

  const [, year, month, day, hour, minute] = match;
  const probe = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)));
  const offset = getPacificOffsetForInstant(probe);
  const parsed = new Date(`${year}-${month}-${day}T${hour}:${minute}:00${offset}`);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function resolveLeadEmailsForTeams(admin: ReturnType<typeof createAdminClient>, teamIds: string[]) {
  const uniqueTeamIds = Array.from(new Set(teamIds));

  if (uniqueTeamIds.length === 0) {
    return {
      uniqueTeamIds,
      recipientEmails: [] as string[],
      teamsById: new Map<string, { id: string; name: string }>()
    };
  }

  const [{ data: leadMemberships }, { data: leadProfiles }, { data: teamRows }] = await Promise.all([
    admin
      .from('team_memberships')
      .select('user_id, team_id')
      .in('team_id', uniqueTeamIds)
      .eq('team_role', 'lead')
      .eq('is_active', true),
    admin
      .from('profiles')
      .select('id, email')
      .not('email', 'is', null),
    admin.from('teams').select('id, name').in('id', uniqueTeamIds)
  ]);

  const uniqueLeadIds = Array.from(new Set((leadMemberships || []).map((membership) => membership.user_id)));
  const emailMap = new Map((leadProfiles || []).map((profile) => [profile.id, profile.email || '']));
  const recipientEmails = uniqueLeadIds.map((leadId) => emailMap.get(leadId) || '').filter(Boolean);
  const teamsById = new Map((teamRows || []).map((team) => [team.id, team]));

  return {
    uniqueTeamIds,
    recipientEmails,
    teamsById
  };
}

async function resolveTrackedMemberEmailsForTeams(admin: ReturnType<typeof createAdminClient>, teamIds: string[]) {
  const uniqueTeamIds = Array.from(new Set(teamIds));

  if (uniqueTeamIds.length === 0) {
    return {
      uniqueTeamIds,
      recipientEmails: [] as string[],
      teamIdByEmail: new Map<string, string | null>()
    };
  }

  const [{ data: memberships }, { data: profiles }, { data: rosterMembers }] = await Promise.all([
    admin.from('team_memberships').select('user_id, team_id').in('team_id', uniqueTeamIds).eq('is_active', true),
    admin.from('profiles').select('id, email').not('email', 'is', null),
    admin
      .from('team_roster_members')
      .select('team_id, stanford_email')
      .in('team_id', uniqueTeamIds)
      .not('stanford_email', 'is', null)
  ]);

  const emailByUserId = new Map((profiles || []).map((profile) => [profile.id, (profile.email || '').toLowerCase()]));
  const teamIdByEmail = new Map<string, string | null>();

  for (const membership of memberships || []) {
    const email = emailByUserId.get(membership.user_id);
    if (email && !teamIdByEmail.has(email)) {
      teamIdByEmail.set(email, membership.team_id);
    }
  }

  for (const rosterMember of rosterMembers || []) {
    const email = (rosterMember.stanford_email || '').toLowerCase();
    if (email && !teamIdByEmail.has(email)) {
      teamIdByEmail.set(email, rosterMember.team_id);
    }
  }

  return {
    uniqueTeamIds,
    recipientEmails: Array.from(teamIdByEmail.keys()),
    teamIdByEmail
  };
}

export async function createTaskAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/tasks',
    successMessage: 'Assigned the task.',
    action: async () => {
      const { user, currentRole } = await requireActiveProfile();
      const title = String(formData.get('title') || '').trim();
      const details = String(formData.get('details') || '').trim();
      const recipientScope = String(formData.get('recipient_scope') || 'specific_teams').trim();
      const pushNotification = String(formData.get('push_notification') || '') === 'on';
      const slackPushNotification = String(formData.get('slack_push_notification') || '') === 'on';
      const teamIds = formData
        .getAll('team_ids')
        .map((value) => String(value).trim())
        .filter(Boolean);

      if (!title) {
        throw new Error('Task title is required.');
      }

      const admin = createAdminClient();
      let allowedTeamIds = teamIds;

      if (currentRole !== 'admin') {
        const { data: memberships } = await admin
          .from('team_memberships')
          .select('team_id')
          .eq('user_id', user.id)
          .eq('team_role', 'lead')
          .eq('is_active', true);

        const myTeamIds = new Set((memberships || []).map((membership) => membership.team_id));
        allowedTeamIds = allowedTeamIds.filter((teamId) => myTeamIds.has(teamId));

        if (recipientScope === 'all_teams') {
          throw new Error('Only admins can assign tasks to all teams.');
        }
      }

      const { data: task, error } = await admin
        .from('tasks')
        .insert({
          title,
          details: details || null,
          recipient_scope: recipientScope === 'all_teams' ? 'all_teams' : 'specific_teams',
          push_notification: pushNotification || slackPushNotification,
          created_by: user.id,
          is_active: true
        })
        .select('id')
        .single();

      if (error || !task) {
        throw new Error(error?.message || 'Failed to create task.');
      }

      if (recipientScope !== 'all_teams' && allowedTeamIds.length > 0) {
        const { error: recipientsError } = await admin
          .from('task_recipients')
          .insert(allowedTeamIds.map((teamId) => ({ task_id: task.id, team_id: teamId })));

        if (recipientsError) {
          throw new Error(recipientsError.message);
        }
      }

      if (pushNotification || slackPushNotification) {
        const recipientTeamIds =
          recipientScope === 'all_teams'
            ? (
                await admin
                  .from('team_memberships')
                  .select('team_id')
                  .eq('team_role', 'lead')
                  .eq('is_active', true)
              ).data?.map((membership) => membership.team_id) || []
            : allowedTeamIds;
        const { uniqueTeamIds, recipientEmails, teamsById } = await resolveLeadEmailsForTeams(admin, recipientTeamIds);

        if (uniqueTeamIds.length > 0) {
          if (slackPushNotification && recipientEmails.length > 0) {
            const fallbackContext = getSlackbotFallbackContext();
            const singleTeam = uniqueTeamIds.length === 1 ? teamsById.get(uniqueTeamIds[0]) || null : null;
            const teamContext = singleTeam
              ? { teamId: singleTeam.id, teamName: singleTeam.name }
              : fallbackContext;

            await sendSlackbotNotification({
              idempotency_key: `task_push:${task.id}`,
              type: 'task_assigned',
              team_id: teamContext.teamId,
              team_name: teamContext.teamName,
              recipient_emails: recipientEmails,
              title: `${teamContext.teamName} has a new assigned task below: ${title}`,
              message: details || 'No additional description was provided.',
              cta_label: 'Open tasks',
              cta_url: `${env.siteUrl}/dashboard/tasks`,
              metadata: {
                taskId: task.id,
                recipientScope,
                teamIds: uniqueTeamIds
              }
            });

            await recordAuditEvent({
              actorId: user.id,
              action: 'slack.sent',
              targetType: 'task',
              targetId: task.id,
              summary: `Sent task Slack push for "${title}".`,
              details: {
                recipientCount: recipientEmails.length
              }
            });
          }

          if (recipientEmails.length > 0) {
            await sendTaskEmails({
              to: recipientEmails,
              title,
              details: details || 'Open SSR HQ to review this task.'
            });

            await recordAuditEvent({
              actorId: user.id,
              action: 'email.sent',
              targetType: 'task',
              targetId: task.id,
              summary: `Sent task email for "${title}".`,
              details: {
                recipientCount: recipientEmails.length
              }
            });
          }
        }
      }

      await recordAuditEvent({
        actorId: user.id,
        action: 'task.created',
        targetType: 'task',
        targetId: task.id,
        summary: `Created task "${title}".`,
        details: {
          recipientScope,
          pushNotification,
          slackPushNotification,
          teamIds: allowedTeamIds
        }
      });

      revalidatePaths(REVALIDATE_PATHS.tasks);
    }
  });
}

export async function createAnnouncementAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/tasks',
    successMessage: 'Published the announcement.',
    action: async () => {
      const { user } = await requireAdmin();
      const title = String(formData.get('title') || '').trim();
      const details = String(formData.get('details') || '').trim();
      const location = String(formData.get('location') || '').trim();
      const eventAtRaw = String(formData.get('event_at') || '').trim();
      const recipientScope = String(formData.get('recipient_scope') || 'specific_teams').trim();
      const teamIds = formData
        .getAll('team_ids')
        .map((value) => String(value).trim())
        .filter(Boolean);

      if (!title) {
        throw new Error('Event name is required.');
      }

      if (!location) {
        throw new Error('Location is required.');
      }

      if (!eventAtRaw) {
        throw new Error('Date and time are required.');
      }

      if (recipientScope !== 'all_teams' && teamIds.length === 0) {
        throw new Error('Choose at least one team or switch the announcement to all teams.');
      }

      const eventAt = parsePacificDateTimeInput(eventAtRaw);
      if (!eventAt) {
        throw new Error('Choose a valid date and time.');
      }

      const admin = createAdminClient();
      const { data: announcement, error } = await admin
        .from('announcements')
        .insert({
          title,
          details: details || null,
          location,
          event_at: eventAt.toISOString(),
          recipient_scope: recipientScope === 'all_teams' ? 'all_teams' : 'specific_teams',
          created_by: user.id,
          is_active: true
        })
        .select('id')
        .single();

      if (error || !announcement) {
        throw new Error(error?.message || 'Failed to create the announcement.');
      }

      if (recipientScope !== 'all_teams') {
        const { error: recipientsError } = await admin
          .from('announcement_recipients')
          .insert(Array.from(new Set(teamIds)).map((teamId) => ({ announcement_id: announcement.id, team_id: teamId })));

        if (recipientsError) {
          throw new Error(recipientsError.message);
        }
      }

      const recipientTeamIds =
        recipientScope === 'all_teams'
          ? (
              await admin
                .from('teams')
                .select('id')
                .eq('is_active', true)
            ).data?.map((team) => team.id) || []
          : teamIds;

      const { recipientEmails, teamIdByEmail } = await resolveTrackedMemberEmailsForTeams(admin, recipientTeamIds);
      if (recipientEmails.length > 0) {
        const { error: deliveryError } = await admin.from('announcement_deliveries').insert(
          recipientEmails.map((email) => ({
            announcement_id: announcement.id,
            team_id: teamIdByEmail.get(email.toLowerCase()) || null,
            recipient_email: email.toLowerCase(),
            status: 'queued' as const
          }))
        );

        if (deliveryError) {
          throw new Error(deliveryError.message);
        }
      }

      await recordAuditEvent({
        actorId: user.id,
        action: 'announcement.created',
        targetType: 'announcement',
        targetId: announcement.id,
        summary: `Published event announcement "${title}".`,
        details: {
          recipientScope,
          teamIds: Array.from(new Set(teamIds)),
          location,
          eventAt: eventAt.toISOString(),
          queuedRecipientCount: recipientEmails.length
        }
      });

      revalidatePaths(REVALIDATE_PATHS.tasks.concat(REVALIDATE_PATHS.dashboard));
    }
  });
}

export async function processNextAnnouncementDeliveryAction(announcementId: string) {
  return runInlineAction(async () => {
    const { user } = await requireAdmin();

    if (!announcementId) {
      throw new Error('Missing announcement id.');
    }

    const admin = createAdminClient();
    const { data: announcement } = await admin
      .from('announcements')
      .select('id, title, details, location, event_at, recipient_scope')
      .eq('id', announcementId)
      .eq('is_active', true)
      .maybeSingle();

    if (!announcement) {
      throw new Error('Announcement not found.');
    }

    const { data: nextDelivery } = await admin
      .from('announcement_deliveries')
      .select('id, recipient_email, team_id')
      .eq('announcement_id', announcementId)
      .eq('status', 'queued')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!nextDelivery) {
      const { data: deliveries } = await admin
        .from('announcement_deliveries')
        .select('status')
        .eq('announcement_id', announcementId);
      const total = (deliveries || []).length;
      const sent = (deliveries || []).filter((row) => row.status === 'sent').length;
      const failed = (deliveries || []).filter((row) => row.status === 'failed').length;
      return { total, sent, failed, remaining: 0, done: true };
    }

    let teamContext = getSlackbotFallbackContext();
    if (nextDelivery.team_id) {
      const { data: team } = await admin
        .from('teams')
        .select('id, name')
        .eq('id', nextDelivery.team_id)
        .maybeSingle();
      if (team) {
        teamContext = { teamId: team.id, teamName: team.name };
      }
    }

    try {
      await sendSlackbotNotification({
        idempotency_key: `announcement:${announcementId}:${nextDelivery.id}`,
        type: 'manual_message',
        team_id: teamContext.teamId,
        team_name: teamContext.teamName,
        recipient_emails: [nextDelivery.recipient_email],
        title: `${announcement.title} · ${formatAnnouncementDateTime(announcement.event_at)}`,
        message: `${announcement.location}\n\n${announcement.details || 'Event notification from SSR HQ.'}`,
        cta_label: 'RSVP',
        metadata: {
          announcementId,
          announcementType: 'event',
          location: announcement.location,
          eventAt: announcement.event_at,
          recipientEmail: nextDelivery.recipient_email,
          rsvpCallbackUrl: `${env.siteUrl}/api/internal/announcement-rsvp`
        }
      });

      await admin
        .from('announcement_deliveries')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          error_text: null
        })
        .eq('id', nextDelivery.id);

      await recordAuditEvent({
        actorId: user.id,
        action: 'slack.sent',
        targetType: 'announcement',
        targetId: announcementId,
        summary: `Sent announcement "${announcement.title}" to ${nextDelivery.recipient_email}.`,
        details: {
          recipientEmail: nextDelivery.recipient_email
        }
      });
    } catch (error) {
      await admin
        .from('announcement_deliveries')
        .update({
          status: 'failed',
          error_text: getActionErrorMessage(error)
        })
        .eq('id', nextDelivery.id);
    }

    const { data: deliveries } = await admin
      .from('announcement_deliveries')
      .select('status')
      .eq('announcement_id', announcementId);
    const total = (deliveries || []).length;
    const sent = (deliveries || []).filter((row) => row.status === 'sent').length;
    const failed = (deliveries || []).filter((row) => row.status === 'failed').length;
    const remaining = total - sent - failed;

    revalidatePaths(REVALIDATE_PATHS.tasks.concat(REVALIDATE_PATHS.dashboard));

    return {
      total,
      sent,
      failed,
      remaining,
      done: remaining === 0
    };
  }, 'Processed the next announcement delivery.');
}

export async function deleteAnnouncementAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/tasks',
    successMessage: 'Removed the announcement.',
    action: async () => {
      const { user } = await requireAdmin();
      const announcementId = String(formData.get('announcement_id') || '').trim();

      if (!announcementId) {
        throw new Error('Missing announcement id.');
      }

      const admin = createAdminClient();
      const { data: announcement } = await admin
        .from('announcements')
        .select('id, title')
        .eq('id', announcementId)
        .maybeSingle();

      if (!announcement) {
        throw new Error('Announcement not found.');
      }

      const { error } = await admin
        .from('announcements')
        .update({ is_active: false })
        .eq('id', announcementId);

      if (error) {
        throw new Error(error.message);
      }

      await admin.from('announcement_recipients').delete().eq('announcement_id', announcementId);

      await recordAuditEvent({
        actorId: user.id,
        action: 'announcement.deleted',
        targetType: 'announcement',
        targetId: announcementId,
        summary: `Removed announcement "${announcement.title}".`,
        details: {
          title: announcement.title
        }
      });

      revalidatePaths(REVALIDATE_PATHS.tasks);
    }
  });
}

export async function deleteTaskAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/tasks',
    successMessage: 'Deleted the task.',
    action: async () => {
      const { user } = await requireAdmin();
      const taskId = String(formData.get('task_id') || '').trim();

      if (!taskId) {
        throw new Error('Missing task id.');
      }

      const admin = createAdminClient();
      const { data: task } = await admin
        .from('tasks')
        .select('id, title')
        .eq('id', taskId)
        .maybeSingle();

      if (!task) {
        throw new Error('Task not found.');
      }

      const { error } = await admin
        .from('tasks')
        .update({
          is_active: false
        })
        .eq('id', taskId);

      if (error) {
        throw new Error(error.message);
      }

      await admin.from('task_recipients').delete().eq('task_id', taskId);

      await recordAuditEvent({
        actorId: user.id,
        action: 'task.deleted',
        targetType: 'task',
        targetId: taskId,
        summary: `Deleted task "${task.title}".`,
        details: {
          taskId,
          title: task.title
        }
      });

      revalidatePaths(REVALIDATE_PATHS.tasks);
    }
  });
}

export async function sendQueuedReminderPreviewAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/settings/queue',
    successMessage: 'Sent the test reminder.',
    action: async () => {
      const { user } = await requireAdmin();
      const queueId = String(formData.get('queue_id') || '').trim();

      if (!queueId) {
        throw new Error('Missing queued reminder id.');
      }

      const admin = createAdminClient();
      const [{ data: queueRow }, { data: actorProfile }] = await Promise.all([
        admin
          .from('notification_queue')
          .select('id, notification_type, team_id, payload, scheduled_for, status')
          .eq('id', queueId)
          .eq('status', 'queued')
          .maybeSingle(),
        admin.from('profiles').select('email').eq('id', user.id).maybeSingle()
      ]);

      if (!queueRow) {
        throw new Error('Queued reminder not found.');
      }

      if (!actorProfile?.email) {
        throw new Error('Your admin profile does not have an email address saved.');
      }

      const [receiptSettings, reportSettingsResponse, inviteSettingsResponse] = await Promise.all([
        createAdminClient().from('receipt_notification_settings').select('email_enabled, slack_enabled').eq('id', 1).maybeSingle(),
        createAdminClient().from('report_notification_settings').select('email_enabled, slack_enabled').eq('id', 1).maybeSingle(),
        createAdminClient().from('invite_notification_settings').select('email_enabled, slack_enabled').eq('id', 1).maybeSingle()
      ]);
      const { data: team } = await admin.from('teams').select('name').eq('id', queueRow.team_id).maybeSingle();
      const teamName = team?.name || 'Unknown team';

      if (queueRow.notification_type === 'receipt') {
        const itemName = String(queueRow.payload?.itemName || 'Receipt item');
        const purchasedAt = String(queueRow.payload?.purchasedAt || new Date().toISOString());
        const purchasedDate = new Date(purchasedAt);
        const deadline = new Date(purchasedDate.getTime() + 14 * 24 * 60 * 60 * 1000);
        const daysOpen = Math.max(0, Math.ceil((Date.now() - purchasedDate.getTime()) / (24 * 60 * 60 * 1000)));
        const timeLeftDays = Math.max(0, Math.ceil((deadline.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
        const emailEnabled = receiptSettings.data?.email_enabled ?? true;
        const slackEnabled = receiptSettings.data?.slack_enabled ?? false;

        if (slackEnabled) {
          await sendSlackbotNotification({
            idempotency_key: `preview-receipt:${queueId}:${user.id}`,
            type: 'receipt_reminder',
            team_id: queueRow.team_id,
            team_name: teamName,
            recipient_emails: [actorProfile.email.toLowerCase()],
            title: `Receipt uploads needed for ${teamName}`,
            message: `${itemName} still needs a receipt upload. ${timeLeftDays <= 0 ? 'due now' : `${timeLeftDays} day${timeLeftDays === 1 ? '' : 's'} left`}.`,
            cta_label: 'Open expense log',
            cta_url: `${env.siteUrl}/dashboard/expenses`,
            metadata: {
              preview: true,
              queueId
            }
          });
        }

        if (emailEnabled) {
          await sendReceiptDigestEmail({
            to: [actorProfile.email],
            teamName,
            items: [
              {
                itemName,
                purchasedAt: formatDateLabel(purchasedDate),
                reminderDay: Number(queueRow.payload?.reminderDay || 0),
                deadlineLabel: formatDateLabel(deadline),
                timeLeftLabel: timeLeftDays <= 0 ? 'due now' : `${timeLeftDays} day${timeLeftDays === 1 ? '' : 's'} left`,
                daysOpen
              }
            ],
            uploadLink: `${env.siteUrl}/dashboard/expenses`
          });
        }
      } else if (queueRow.notification_type === 'report') {
        const quarter = String(queueRow.payload?.quarter || 'Quarter report');
        const dueAt = new Date(String(queueRow.payload?.dueAt || queueRow.scheduled_for));
        const timeLeftDays = Math.max(0, Math.ceil((dueAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
        const emailEnabled = reportSettingsResponse.data?.email_enabled ?? true;
        const slackEnabled = reportSettingsResponse.data?.slack_enabled ?? false;

        if (slackEnabled) {
          await sendSlackbotNotification({
            idempotency_key: `preview-report:${queueId}:${user.id}`,
            type: 'report_reminder',
            team_id: queueRow.team_id,
            team_name: teamName,
            recipient_emails: [actorProfile.email.toLowerCase()],
            title: `${formatQuarterReportTitle(quarter)} is due`,
            message: `${teamName} still needs to submit this report. ${timeLeftDays <= 0 ? 'Due now.' : `${timeLeftDays} day${timeLeftDays === 1 ? '' : 's'} left.`}`,
            cta_label: 'Open report',
            cta_url: `${env.siteUrl}/dashboard/reports`,
            metadata: {
              preview: true,
              queueId
            }
          });
        }

        if (emailEnabled) {
          await sendReportReminderEmail({
            to: [actorProfile.email],
            teamName,
            reportTitle: formatQuarterReportTitle(quarter),
            dueDateLabel: formatDateLabel(dueAt),
            timeLeftLabel: timeLeftDays <= 0 ? 'due now' : `${timeLeftDays} day${timeLeftDays === 1 ? '' : 's'} left`,
            reportLink: `${env.siteUrl}/dashboard/reports`
          });
        }
      } else {
        const email = String(queueRow.payload?.email || actorProfile.email);
        const fullName = String(queueRow.payload?.fullName || '');
        const role = String(queueRow.payload?.role || 'team_lead');
        const emailEnabled = inviteSettingsResponse.data?.email_enabled ?? true;
        const slackEnabled = inviteSettingsResponse.data?.slack_enabled ?? false;
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
          throw new Error(generated.error?.message || 'Failed to generate a fresh invite link.');
        }

        const actionLink = buildInviteConfirmLink(generated.data.properties);

        if (slackEnabled) {
          await sendSlackbotNotification({
            idempotency_key: `preview-invite:${queueId}:${user.id}`,
            type: 'invite_reminder',
            team_id: queueRow.team_id,
            team_name: teamName,
            recipient_emails: [actorProfile.email.toLowerCase()],
            title: 'Your SSR HQ invite is still waiting',
            message: teamName
              ? `You were added as a lead to ${teamName}, but your SSR HQ account still needs to be confirmed.`
              : 'Your SSR HQ portal invite is still waiting to be confirmed.',
            cta_label: 'Confirm account',
            cta_url: actionLink,
            metadata: {
              preview: true,
              queueId
            }
          });
        }

        if (emailEnabled) {
          await sendInviteReminderEmail({
            to: actorProfile.email,
            fullName,
            teamName,
            actionLink
          });
        }
      }

      await recordAuditEvent({
        actorId: user.id,
        action: 'notification.preview.sent',
        targetType: 'notification_queue',
        targetId: queueId,
        summary: `Sent queued ${queueRow.notification_type} reminder preview to ${actorProfile.email}.`,
        details: {
          queueId,
          notificationType: queueRow.notification_type,
          previewRecipient: actorProfile.email,
          channels: {
            email:
              queueRow.notification_type === 'receipt'
                ? receiptSettings.data?.email_enabled ?? true
                : queueRow.notification_type === 'report'
                  ? reportSettingsResponse.data?.email_enabled ?? true
                  : inviteSettingsResponse.data?.email_enabled ?? true,
            slack:
              queueRow.notification_type === 'receipt'
                ? receiptSettings.data?.slack_enabled ?? false
                : queueRow.notification_type === 'report'
                  ? reportSettingsResponse.data?.slack_enabled ?? false
                  : inviteSettingsResponse.data?.slack_enabled ?? false
          }
        }
      });
    }
  });
}

export async function completeTaskAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/tasks',
    successMessage: 'Marked the task as done.',
    action: async () => {
      const { user, currentRole } = await requireActiveProfile();
      const taskId = String(formData.get('task_id') || '').trim();

      if (currentRole !== 'team_lead') {
        redirect('/dashboard');
      }

      if (!taskId) {
        throw new Error('Missing task id.');
      }

      const admin = createAdminClient();
      const [{ data: myMemberships }, { data: task }, { data: recipients }] = await Promise.all([
        admin
          .from('team_memberships')
          .select('team_id')
          .eq('user_id', user.id)
          .eq('team_role', 'lead')
          .eq('is_active', true),
        admin
          .from('tasks')
          .select('id, title, recipient_scope')
          .eq('id', taskId)
          .eq('is_active', true)
          .maybeSingle(),
        admin.from('task_recipients').select('team_id').eq('task_id', taskId)
      ]);

      if (!task) {
        throw new Error('Task not found.');
      }

      const myTeamIds = new Set((myMemberships || []).map((membership) => membership.team_id));
      const visibleTeamIds =
        task.recipient_scope === 'all_teams'
          ? Array.from(myTeamIds)
          : (recipients || []).map((recipient) => recipient.team_id).filter((teamId) => myTeamIds.has(teamId));

      if (visibleTeamIds.length === 0) {
        throw new Error('You cannot complete a task for a team you do not lead.');
      }

      const { error } = await admin.from('task_completions').upsert(
        visibleTeamIds.map((teamId) => ({
          task_id: taskId,
          team_id: teamId,
          completed_by: user.id,
          completed_at: new Date().toISOString()
        })),
        { onConflict: 'task_id,team_id' }
      );

      if (error) {
        throw new Error(error.message);
      }

      await recordAuditEvent({
        actorId: user.id,
        action: 'task.completed',
        targetType: 'task',
        targetId: taskId,
        summary: `Marked task "${task.title}" as done.`,
        details: {
          teamIds: visibleTeamIds
        }
      });

      revalidatePaths(REVALIDATE_PATHS.tasks.concat(REVALIDATE_PATHS.dashboard));
    }
  });
}

export async function invitePortalMemberAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/members',
    successMessage: 'Sent the portal invite.',
    action: async () => {
      const { user } = await requireAdmin();
      const email = String(formData.get('email') || '').trim().toLowerCase();
      const fullName = String(formData.get('full_name') || '').trim();
      const teamId = String(formData.get('team_id') || '').trim();

      if (!email) {
        throw new Error('Email is required.');
      }

      const { admin, generated, actionLink } = await createPortalInviteProfile({
        email,
        fullName,
        role: 'team_lead'
      });

      let teamName: string | null = null;
      if (teamId) {
        const { data: team } = await admin.from('teams').select('id, name').eq('id', teamId).single();

        if (!team) {
          throw new Error('Selected team not found.');
        }

        teamName = team.name;

        const membershipPayload = {
          team_id: teamId,
          user_id: generated.user.id,
          team_role: 'lead' as const,
          is_active: true
        };

        const { data: membership, error: membershipError } = await admin
          .from('team_memberships')
          .upsert(membershipPayload, {
            onConflict: 'team_id,user_id'
          })
          .select('id, team_id, user_id, is_active')
          .single();

        if (membershipError || !membership) {
          throw new Error(membershipError.message);
        }

        const { data: verifiedMembership } = await admin
          .from('team_memberships')
          .select('id')
          .eq('team_id', teamId)
          .eq('user_id', generated.user.id)
          .eq('team_role', 'lead')
          .eq('is_active', true)
          .maybeSingle();

        if (!verifiedMembership) {
          throw new Error(`The invite was created, but the lead assignment to ${team.name} did not stick.`);
        }

        await recordAuditEvent({
          actorId: user.id,
          action: 'lead.assigned',
          targetType: 'team_membership',
          targetId: membership.id,
          summary: `Assigned invited lead ${email} to ${team.name}.`,
          details: {
            teamId,
            userId: generated.user.id
          }
        });
      }

      await sendInviteEmail({
        to: email,
        fullName,
        teamName,
        actionLink
      });

      await recordAuditEvent({
        actorId: user.id,
        action: 'member.invited',
        targetType: 'profile',
        targetId: generated.user.id,
        summary: `Invited ${email} to the portal${teamName ? ` as lead for ${teamName}` : ''}.`,
        details: {
          email,
          teamId: teamId || null,
          teamName,
          role: 'team_lead'
        }
      });

      await recordAuditEvent({
        actorId: user.id,
        action: 'email.sent',
        targetType: 'profile',
        targetId: generated.user.id,
        summary: `Sent invite email to ${email}.`,
        details: {
          email,
          teamId: teamId || null
        }
      });

      await syncInviteQueueAndRevalidate(REVALIDATE_PATHS.teamsAndMembers);
    }
  });
}

async function addTeamRosterMemberCore(formData: FormData) {
  const teamId = String(formData.get('team_id') || '').trim();
  const fullName = String(formData.get('full_name') || '').trim();
  const stanfordEmail = String(formData.get('stanford_email') || '').trim().toLowerCase();
  const slackUserIdRaw = String(formData.get('slack_user_id') || '').trim();
  const joinedMonth = Number(formData.get('joined_month') || 0);
  const joinedYear = Number(formData.get('joined_year') || 0);
  const slackUserId = slackUserIdRaw || null;

  if (!teamId || !fullName || !stanfordEmail) {
    throw new Error('Team, full name, and Stanford email are required.');
  }

  if (!stanfordEmail.endsWith('@stanford.edu')) {
    throw new Error('Member email must be a Stanford email.');
  }

  if (!Number.isInteger(joinedMonth) || joinedMonth < 1 || joinedMonth > 12) {
    throw new Error('Joined month must be between 1 and 12.');
  }

  if (!Number.isInteger(joinedYear) || joinedYear < 2000 || joinedYear > 2100) {
    throw new Error('Joined year is invalid.');
  }

  const { user } = await requireLeadTeam(teamId);
  const admin = createAdminClient();
  const { data: member, error } = await admin
    .from('team_roster_members')
    .insert({
      team_id: teamId,
      full_name: fullName,
      stanford_email: stanfordEmail,
      slack_user_id: slackUserId,
      joined_month: joinedMonth,
      joined_year: joinedYear,
      created_by: user.id
    })
    .select('id, full_name, stanford_email, slack_user_id, joined_month, joined_year')
    .single();

  if (error || !member) {
    throw new Error(error?.message || 'Failed to add the recorded member.');
  }

  await recordAuditEvent({
    actorId: user.id,
    action: 'member.recorded',
    targetType: 'team_roster_member',
    targetId: member.id,
    summary: `Added ${fullName} to the team roster.`,
    details: {
      teamId,
      fullName,
      stanfordEmail,
      slackUserId,
      joinedMonth,
      joinedYear
    }
  });

  revalidatePaths(REVALIDATE_PATHS.members);

  return {
    id: member.id,
    full_name: member.full_name,
    stanford_email: member.stanford_email,
    slack_user_id: member.slack_user_id,
    joined_month: member.joined_month,
    joined_year: member.joined_year,
    source: 'recorded' as const
  };
}

export async function addTeamRosterMemberInlineAction(formData: FormData) {
  return runInlineAction(() => addTeamRosterMemberCore(formData), 'Added the recorded member.');
}

export async function addTeamRosterMemberAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/members',
    successMessage: 'Added the recorded member.',
    action: async () => {
      await addTeamRosterMemberCore(formData);
    }
  });
}

async function updateTeamRosterMemberCore(formData: FormData) {
  const memberId = String(formData.get('member_id') || '').trim();
  const fullName = String(formData.get('full_name') || '').trim();
  const stanfordEmail = String(formData.get('stanford_email') || '').trim().toLowerCase();
  const slackUserIdRaw = String(formData.get('slack_user_id') || '').trim();
  const slackUserId = slackUserIdRaw || null;

  if (!memberId || !fullName || !stanfordEmail) {
    throw new Error('Member id, full name, and Stanford email are required.');
  }

  if (!stanfordEmail.endsWith('@stanford.edu')) {
    throw new Error('Member email must be a Stanford email.');
  }

  const admin = createAdminClient();
  const { data: rosterMember } = await admin
    .from('team_roster_members')
    .select('id, team_id')
    .eq('id', memberId)
    .maybeSingle();

  if (!rosterMember) {
    throw new Error('Recorded member not found.');
  }

  const { user } = await requireLeadTeam(rosterMember.team_id);
  const { data: updatedMember, error } = await admin
    .from('team_roster_members')
    .update({
      full_name: fullName,
      stanford_email: stanfordEmail,
      slack_user_id: slackUserId
    })
    .eq('id', memberId)
    .select('id, full_name, stanford_email, slack_user_id, joined_month, joined_year')
    .single();

  if (error || !updatedMember) {
    throw new Error(error?.message || 'Failed to update the recorded member.');
  }

  await recordAuditEvent({
    actorId: user.id,
    action: 'member.record.updated',
    targetType: 'team_roster_member',
    targetId: memberId,
    summary: `Updated recorded member ${fullName}.`,
    details: {
      teamId: rosterMember.team_id,
      fullName,
      stanfordEmail,
      slackUserId
    }
  });

  revalidatePaths(REVALIDATE_PATHS.members);

  return {
    id: updatedMember.id,
    full_name: updatedMember.full_name,
    stanford_email: updatedMember.stanford_email,
    slack_user_id: updatedMember.slack_user_id,
    joined_month: updatedMember.joined_month,
    joined_year: updatedMember.joined_year,
    source: 'recorded' as const
  };
}

export async function updateTeamRosterMemberInlineAction(formData: FormData) {
  return runInlineAction(() => updateTeamRosterMemberCore(formData), 'Updated the recorded member.');
}

export async function updateTeamRosterMemberAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/members',
    successMessage: 'Updated the recorded member.',
    action: async () => {
      await updateTeamRosterMemberCore(formData);
    }
  });
}

async function deleteTeamRosterMemberCore(formData: FormData) {
  const memberId = String(formData.get('member_id') || '').trim();
  const confirmationName = String(formData.get('confirmation_name') || '').trim();

  if (!memberId) {
    throw new Error('Missing member id.');
  }

  const admin = createAdminClient();
  const { data: rosterMember } = await admin
    .from('team_roster_members')
    .select('id, team_id, full_name')
    .eq('id', memberId)
    .maybeSingle();

  if (!rosterMember) {
    throw new Error('Recorded member not found.');
  }

  if (!confirmationMatches(confirmationName, { fullName: rosterMember.full_name })) {
    throw new Error('Confirmation name did not match.');
  }

  const { user } = await requireLeadTeam(rosterMember.team_id);
  const { error } = await admin.from('team_roster_members').delete().eq('id', memberId);

  if (error) {
    throw new Error(error.message);
  }

  await recordAuditEvent({
    actorId: user.id,
    action: 'member.record.deleted',
    targetType: 'team_roster_member',
    targetId: memberId,
    summary: `Deleted recorded member ${rosterMember.full_name}.`,
    details: {
      teamId: rosterMember.team_id,
      fullName: rosterMember.full_name
    }
  });

  revalidatePaths(REVALIDATE_PATHS.members);

  return { memberId };
}

export async function deleteTeamRosterMemberInlineAction(formData: FormData) {
  return runInlineAction(() => deleteTeamRosterMemberCore(formData), 'Deleted the recorded member.');
}

export async function deleteTeamRosterMemberAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/members',
    successMessage: 'Deleted the recorded member.',
    action: async () => {
      await deleteTeamRosterMemberCore(formData);
    }
  });
}

export async function updateOwnDisplayNameAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/profile',
    successMessage: 'Updated your display name.',
    action: async () => {
      const fullName = String(formData.get('full_name') || '').trim();

      if (!fullName) {
        throw new Error('Name is required.');
      }

      if (fullName.length > 120) {
        throw new Error('Name must be 120 characters or fewer.');
      }

      const { user } = await requireSignedInUser();
      const admin = createAdminClient();
      const { error } = await admin
        .from('profiles')
        .update({
          full_name: fullName
        })
        .eq('id', user.id);

      if (error) {
        throw new Error(error.message);
      }

      await recordAuditEvent({
        actorId: user.id,
        action: 'profile.updated',
        targetType: 'profile',
        targetId: user.id,
        summary: 'Updated personal display name.',
        details: {
          fullName
        }
      });

      revalidatePaths(REVALIDATE_PATHS.profile);
    }
  });
}

export async function switchActiveRoleAction(formData: FormData) {
  const { availableRoles } = await getViewerContext();
  const nextRole = String(formData.get('next_role') || '').trim() as AppRole;

  if (!availableRoles.includes(nextRole)) {
    throw new Error('That profile mode is not available for your account.');
  }

  (await cookies()).set(ACTIVE_ROLE_COOKIE, nextRole, {
    path: '/',
    sameSite: 'lax',
    httpOnly: true
  });

  redirect('/dashboard');
}

async function deletePortalLeadCore(formData: FormData) {
  const { user } = await requireAdmin();
  const leadId = String(formData.get('lead_id') || '').trim();
  const confirmationPhrase = String(formData.get('confirmation_phrase') || '').trim();
  const confirmationName = String(formData.get('confirmation_name') || '').trim();

  if (!leadId) {
    throw new Error('Missing lead id.');
  }

  if (leadId === user.id) {
    throw new Error('You cannot delete your own admin account from here.');
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('id, full_name, email, role, is_admin, is_president')
    .eq('id', leadId)
    .maybeSingle();

  if (!profile) {
    throw new Error('Portal user not found.');
  }

  const { count: leadMembershipCount } = await admin
    .from('team_memberships')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', leadId)
    .eq('team_role', 'lead')
    .eq('is_active', true);

  if (profileHasAdminRole(profile) || profileHasPresidentRole(profile)) {
    throw new Error('Users with admin or president access cannot be deleted from the lead removal flow.');
  }

  // Orphaned profiles (no name, never attached to a team — e.g. an invite sent
  // to a mistyped email) are deletable here regardless of their role column.
  const isOrphan = !profile.full_name && !leadMembershipCount;
  if (!isOrphan && !leadMembershipCount && profile.role !== 'team_lead') {
    throw new Error('Only team leads can be removed from the portal here.');
  }

  if (confirmationPhrase !== 'DELETE') {
    throw new Error('First confirmation must be DELETE.');
  }

  if (!confirmationMatches(confirmationName, { fullName: profile.full_name, email: profile.email })) {
    throw new Error('Second confirmation must match the displayed name (or the account email).');
  }

  const displayName = profile.full_name || profile.email || 'team lead';
  await recordAuditEvent({
    actorId: user.id,
    action: 'member.portal_deleted',
    targetType: 'profile',
    targetId: leadId,
    summary: `Deleted portal access for ${displayName}.`,
    details: {
      leadId,
      fullName: profile.full_name,
      email: profile.email
    }
  });

  // Deleting the auth user cascades to the profile. If the auth user is
  // already gone (half-created account), fall back to removing the profile
  // row directly instead of stranding an undeletable entry.
  const { error: deleteError } = await admin.auth.admin.deleteUser(leadId);
  if (deleteError) {
    const { error: profileDeleteError } = await admin.from('profiles').delete().eq('id', leadId);
    if (profileDeleteError) {
      throw new Error(deleteError.message);
    }
  }

  await syncQueueAndRevalidate(REVALIDATE_PATHS.deleteLead);

  return { leadId };
}

export async function deletePortalLeadInlineAction(formData: FormData) {
  return runInlineAction(() => deletePortalLeadCore(formData), 'Removed the lead from the portal.');
}

export async function deletePortalLeadAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/members',
    successMessage: 'Removed the lead from the portal.',
    action: async () => {
      await deletePortalLeadCore(formData);
    }
  });
}

async function setPortalUserPasswordCore(formData: FormData) {
  const { user } = await requireAdmin();
  const profileId = String(formData.get('profile_id') || '').trim();
  const password = String(formData.get('password') || '');
  const passwordConfirm = String(formData.get('password_confirm') || '');

  if (!profileId) {
    throw new Error('Missing portal user id.');
  }

  if (password.length < 8) {
    throw new Error('Passwords must be at least 8 characters.');
  }

  if (password !== passwordConfirm) {
    throw new Error('Passwords must match exactly.');
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('id, full_name, email, active')
    .eq('id', profileId)
    .maybeSingle();

  if (!profile || !profile.active) {
    throw new Error('Portal user not found.');
  }

  if (!profile.email) {
    throw new Error('That user does not have a portal email on file.');
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(profileId, {
    password
  });

  if (updateError) {
    throw new Error(updateError.message);
  }

  await recordAuditEvent({
    actorId: user.id,
    action: 'member.password_set',
    targetType: 'profile',
    targetId: profileId,
    summary: `Set a new portal password for ${profile.full_name || profile.email}.`,
    details: {
      profileId,
      fullName: profile.full_name,
      email: profile.email
    }
  });

  revalidatePaths(REVALIDATE_PATHS.members);

  return { profileId };
}

export async function setPortalUserPasswordInlineAction(formData: FormData) {
  return runInlineAction(() => setPortalUserPasswordCore(formData), 'Updated the portal password.');
}

export async function setPortalUserPasswordAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/members',
    successMessage: 'Updated the portal password.',
    action: async () => {
      await setPortalUserPasswordCore(formData);
    }
  });
}

export async function assignPresidentRoleAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/settings',
    successMessage: 'Assigned the President role.',
    action: async () => {
      const { user } = await requireAdmin();
      const profileId = String(formData.get('profile_id') || '').trim();
      if (!profileId) {
        throw new Error('Select a user to assign.');
      }

      const admin = createAdminClient();
      const { data: profile } = await admin
        .from('profiles')
        .select('id, full_name, role, is_president, active')
        .eq('id', profileId)
        .maybeSingle();

      if (!profile || !profile.active) {
        throw new Error('Selected user was not found.');
      }

      if (profileHasPresidentRole(profile)) {
        throw new Error('That user already has President access.');
      }

      const { error } = await admin
        .from('profiles')
        .update({ is_president: true })
        .eq('id', profileId);

      if (error) {
        throw new Error(error.message);
      }

      await recordAuditEvent({
        actorId: user.id,
        action: 'role.assigned',
        targetType: 'profile',
        targetId: profileId,
        summary: `Assigned President role to ${profile.full_name || 'user'}.`,
        details: {
          role: 'president'
        }
      });

      revalidatePaths(REVALIDATE_PATHS.presidentRole);
    }
  });
}

export async function removePresidentRoleAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/settings',
    successMessage: 'Removed the President role.',
    action: async () => {
      const { user } = await requireAdmin();
      const profileId = String(formData.get('profile_id') || '').trim();
      if (!profileId) {
        throw new Error('Missing president id.');
      }

      const admin = createAdminClient();
      const { data: profile } = await admin
        .from('profiles')
        .select('id, full_name, role, is_president, is_admin, is_financial_officer')
        .eq('id', profileId)
        .maybeSingle();

      if (!profile || !profileHasPresidentRole(profile)) {
        throw new Error('President not found.');
      }

      // Clearing the flag isn't enough when president is their PRIMARY role —
      // demote the role column to their next-highest remaining role.
      const fallbackRole = profile.is_admin
        ? 'admin'
        : profile.is_financial_officer
          ? 'financial_officer'
          : 'team_lead';
      const nextRole = profile.role === 'president' ? fallbackRole : profile.role;

      const { error } = await admin
        .from('profiles')
        .update({ is_president: false, role: nextRole })
        .eq('id', profileId);

      if (error) {
        throw new Error(error.message);
      }

      await recordAuditEvent({
        actorId: user.id,
        action: 'role.removed',
        targetType: 'profile',
        targetId: profileId,
        summary: `Removed President role from ${profile.full_name || 'user'}.`,
        details: {
          role: 'president'
        }
      });

      revalidatePaths(REVALIDATE_PATHS.presidentRole);
    }
  });
}

export async function invitePresidentAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/settings',
    successMessage: 'Sent the President invite.',
    action: async () => {
      const { user } = await requireAdmin();
      const email = String(formData.get('email') || '').trim().toLowerCase();
      const fullName = String(formData.get('full_name') || '').trim();

      if (!email) {
        throw new Error('Email is required.');
      }

      const { generated, actionLink } = await createPortalInviteProfile({
        email,
        fullName,
        role: 'president'
      });

      await sendPresidentInviteEmail({
        to: email,
        fullName,
        actionLink
      });

      await recordAuditEvent({
        actorId: user.id,
        action: 'member.invited',
        targetType: 'profile',
        targetId: generated.user.id,
        summary: `Invited ${email} to the portal as President.`,
        details: {
          email,
          role: 'president'
        }
      });

      await recordAuditEvent({
        actorId: user.id,
        action: 'email.sent',
        targetType: 'profile',
        targetId: generated.user.id,
        summary: `Sent president invite email to ${email}.`,
        details: {
          email,
          role: 'president'
        }
      });

      revalidatePaths(REVALIDATE_PATHS.presidentRole);
    }
  });
}

export async function assignVicePresidentRoleAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/settings',
    successMessage: 'Assigned the Vice President role.',
    action: async () => {
      const { user } = await requireAdmin();
      const profileId = String(formData.get('profile_id') || '').trim();
      if (!profileId) {
        throw new Error('Select a user to assign.');
      }

      const admin = createAdminClient();
      const { data: profile } = await admin
        .from('profiles')
        .select('id, full_name, role, is_vice_president, active')
        .eq('id', profileId)
        .maybeSingle();

      if (!profile || !profile.active) {
        throw new Error('Selected user was not found.');
      }

      if (profileHasVicePresidentRole(profile)) {
        throw new Error('That user already has Vice President access.');
      }

      const { error } = await admin
        .from('profiles')
        .update({ is_vice_president: true })
        .eq('id', profileId);

      if (error) {
        throw new Error(error.message);
      }

      await recordAuditEvent({
        actorId: user.id,
        action: 'role.assigned',
        targetType: 'profile',
        targetId: profileId,
        summary: `Assigned Vice President role to ${profile.full_name || 'user'}.`,
        details: {
          role: 'vice_president'
        }
      });

      revalidatePaths(REVALIDATE_PATHS.vicePresidentRole);
    }
  });
}

export async function removeVicePresidentRoleAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/settings',
    successMessage: 'Removed the Vice President role.',
    action: async () => {
      const { user } = await requireAdmin();
      const profileId = String(formData.get('profile_id') || '').trim();
      if (!profileId) {
        throw new Error('Missing vice president id.');
      }

      const admin = createAdminClient();
      const { data: profile } = await admin
        .from('profiles')
        .select('id, full_name, role, is_vice_president, is_admin, is_president, is_financial_officer')
        .eq('id', profileId)
        .maybeSingle();

      if (!profile || !profileHasVicePresidentRole(profile)) {
        throw new Error('Vice president not found.');
      }

      // Clearing the flag isn't enough when vice_president is their PRIMARY role —
      // demote the role column to their next-highest remaining role.
      const fallbackRole = profile.is_admin
        ? 'admin'
        : profile.is_president
          ? 'president'
          : profile.is_financial_officer
            ? 'financial_officer'
            : 'team_lead';
      const nextRole = profile.role === 'vice_president' ? fallbackRole : profile.role;

      const { error } = await admin
        .from('profiles')
        .update({ is_vice_president: false, role: nextRole })
        .eq('id', profileId);

      if (error) {
        throw new Error(error.message);
      }

      await recordAuditEvent({
        actorId: user.id,
        action: 'role.removed',
        targetType: 'profile',
        targetId: profileId,
        summary: `Removed Vice President role from ${profile.full_name || 'user'}.`,
        details: {
          role: 'vice_president'
        }
      });

      revalidatePaths(REVALIDATE_PATHS.vicePresidentRole);
    }
  });
}

export async function inviteVicePresidentAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/settings',
    successMessage: 'Sent the Vice President invite.',
    action: async () => {
      const { user } = await requireAdmin();
      const email = String(formData.get('email') || '').trim().toLowerCase();
      const fullName = String(formData.get('full_name') || '').trim();

      if (!email) {
        throw new Error('Email is required.');
      }

      const { generated, actionLink } = await createPortalInviteProfile({
        email,
        fullName,
        role: 'vice_president'
      });

      await sendVicePresidentInviteEmail({
        to: email,
        fullName,
        actionLink
      });

      await recordAuditEvent({
        actorId: user.id,
        action: 'member.invited',
        targetType: 'profile',
        targetId: generated.user.id,
        summary: `Invited ${email} to the portal as Vice President.`,
        details: {
          email,
          role: 'vice_president'
        }
      });

      await recordAuditEvent({
        actorId: user.id,
        action: 'email.sent',
        targetType: 'profile',
        targetId: generated.user.id,
        summary: `Sent vice president invite email to ${email}.`,
        details: {
          email,
          role: 'vice_president'
        }
      });

      revalidatePaths(REVALIDATE_PATHS.vicePresidentRole);
    }
  });
}

export async function assignFinancialOfficerRoleAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/settings',
    successMessage: 'Assigned the Financial Officer role.',
    action: async () => {
      const { user } = await requireAdmin();
      const profileId = String(formData.get('profile_id') || '').trim();
      if (!profileId) {
        throw new Error('Select a user to assign.');
      }

      const admin = createAdminClient();
      const { data: profile } = await admin
        .from('profiles')
        .select('id, full_name, is_financial_officer, active')
        .eq('id', profileId)
        .maybeSingle();

      if (!profile || !profile.active) {
        throw new Error('Selected user was not found.');
      }

      if (profile.is_financial_officer) {
        throw new Error('That user already has Financial Officer access.');
      }

      const { error } = await admin
        .from('profiles')
        .update({ is_financial_officer: true })
        .eq('id', profileId);

      if (error) {
        throw new Error(error.message);
      }

      await recordAuditEvent({
        actorId: user.id,
        action: 'role.assigned',
        targetType: 'profile',
        targetId: profileId,
        summary: `Assigned Financial Officer role to ${profile.full_name || 'user'}.`,
        details: {
          role: 'financial_officer'
        }
      });

      revalidatePaths(REVALIDATE_PATHS.financialOfficerRole.concat(REVALIDATE_PATHS.presidentRole));
    }
  });
}

export async function removeFinancialOfficerRoleAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/settings',
    successMessage: 'Removed the Financial Officer role.',
    action: async () => {
      const { user } = await requireAdmin();
      const profileId = String(formData.get('profile_id') || '').trim();
      if (!profileId) {
        throw new Error('Missing financial officer id.');
      }

      const admin = createAdminClient();
      const { data: profile } = await admin
        .from('profiles')
        .select('id, full_name, role, is_financial_officer, is_admin, is_president')
        .eq('id', profileId)
        .maybeSingle();

      // If the profile is gone there's nothing to remove — treat as success.
      if (!profile) {
        revalidatePaths(REVALIDATE_PATHS.financialOfficerRole.concat(REVALIDATE_PATHS.presidentRole));
        return;
      }

      // Clearing the flag isn't enough when financial_officer is their PRIMARY
      // role — demote the role column to their next-highest remaining role.
      const fallbackRole = profile.is_admin ? 'admin' : profile.is_president ? 'president' : 'team_lead';
      const nextRole = profile.role === 'financial_officer' ? fallbackRole : profile.role;

      const { error } = await admin
        .from('profiles')
        .update({ is_financial_officer: false, role: nextRole })
        .eq('id', profileId);

      if (error) {
        throw new Error(error.message);
      }

      await recordAuditEvent({
        actorId: user.id,
        action: 'role.removed',
        targetType: 'profile',
        targetId: profileId,
        summary: `Removed Financial Officer role from ${profile.full_name || 'user'}.`,
        details: {
          role: 'financial_officer'
        }
      });

      revalidatePaths(REVALIDATE_PATHS.financialOfficerRole.concat(REVALIDATE_PATHS.presidentRole));
    }
  });
}

export async function inviteFinancialOfficerAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/settings',
    successMessage: 'Sent the Financial Officer invite.',
    action: async () => {
      const { user } = await requireAdmin();
      const email = String(formData.get('email') || '').trim().toLowerCase();
      const fullName = String(formData.get('full_name') || '').trim();

      if (!email) {
        throw new Error('Email is required.');
      }

      const { generated, actionLink } = await createPortalInviteProfile({
        email,
        fullName,
        role: 'financial_officer'
      });

      await sendFinancialOfficerInviteEmail({
        to: email,
        fullName,
        actionLink
      });

      await recordAuditEvent({
        actorId: user.id,
        action: 'member.invited',
        targetType: 'profile',
        targetId: generated.user.id,
        summary: `Invited ${email} to the portal as Financial Officer.`,
        details: {
          email,
          role: 'financial_officer'
        }
      });

      await recordAuditEvent({
        actorId: user.id,
        action: 'email.sent',
        targetType: 'profile',
        targetId: generated.user.id,
        summary: `Sent financial officer invite email to ${email}.`,
        details: {
          email,
          role: 'financial_officer'
        }
      });

      revalidatePaths(REVALIDATE_PATHS.financialOfficerRole.concat(REVALIDATE_PATHS.presidentRole));
    }
  });
}

async function runStatementAutoMatch(admin: ReturnType<typeof createAdminClient>) {
  // Largest items first so high-value purchases claim their match before smaller ones.
  const { data: pending } = await admin
    .from('statement_line_items')
    .select('id, amount_cents, description')
    .eq('status', 'unmatched')
    .eq('direction', 'debit')
    .order('amount_cents', { ascending: false });

  if (!pending || pending.length === 0) {
    return 0;
  }

  const { data: logs } = await admin
    .from('purchase_logs')
    .select('id, description, amount_cents, team_id, teams(name)');

  // A purchase already linked to (or created from) another statement line is off the table.
  const { data: usedRows } = await admin
    .from('statement_line_items')
    .select('matched_purchase_log_id, created_purchase_log_id');
  const used = new Set<string>();
  for (const row of usedRows || []) {
    if (row.matched_purchase_log_id) used.add(row.matched_purchase_log_id);
    if (row.created_purchase_log_id) used.add(row.created_purchase_log_id);
  }

  const purchases: MatchablePurchase[] = ((logs || []) as Array<{
    id: string;
    description: string | null;
    amount_cents: number;
    teams?: { name: string } | { name: string }[] | null;
  }>)
    .filter((log) => !used.has(log.id))
    .map((log) => ({
      id: log.id,
      description: log.description || '',
      amount_cents: log.amount_cents,
      teamName: Array.isArray(log.teams) ? log.teams[0]?.name || null : log.teams?.name || null
    }));

  if (purchases.length === 0) {
    return 0;
  }

  const usedNow = new Set<string>();
  let matched = 0;
  for (const item of pending) {
    const candidates = purchases.filter((purchase) => !usedNow.has(purchase.id));
    const match = findStatementMatch(
      { amountCents: item.amount_cents, description: item.description || '' },
      candidates
    );
    if (match) {
      await admin
        .from('statement_line_items')
        .update({ status: 'auto_matched', matched_purchase_log_id: match.id })
        .eq('id', item.id);
      usedNow.add(match.id);
      matched += 1;
    }
  }

  return matched;
}

export async function uploadStatementAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/settings',
    successMessage: 'Imported the statement and ran auto-matching.',
    action: async () => {
      const { user } = await requireAdmin();
      const file = formData.get('statement_csv');
      if (!(file instanceof File) || file.size === 0) {
        throw new Error('Choose a statement CSV to upload.');
      }
      if (file.size > 5 * 1024 * 1024) {
        throw new Error('Statement files must be under 5 MB.');
      }

      const text = await file.text();
      const items = parseStatementCsv(text);
      if (items.length === 0) {
        throw new Error('No statement rows were found in that file.');
      }

      const admin = createAdminClient();
      const importId = crypto.randomUUID();
      await admin.from('statement_imports').insert({
        id: importId,
        file_name: file.name,
        uploaded_by: user.id,
        item_count: items.length
      });

      const rows = items.map((item) => ({
        import_id: importId,
        statement_date: item.statementDate,
        raw_date: item.rawDate,
        reference_number: item.referenceNumber,
        person_name: item.personName,
        description: item.description,
        raw_reference: item.rawReference,
        amount_cents: item.amountCents,
        direction: item.direction,
        dedupe_key: item.dedupeKey,
        status: 'unmatched'
      }));

      const { error } = await admin
        .from('statement_line_items')
        .upsert(rows, { onConflict: 'dedupe_key', ignoreDuplicates: true });
      if (error) {
        throw new Error(error.message);
      }

      await runStatementAutoMatch(admin);

      await recordAuditEvent({
        actorId: user.id,
        action: 'statement.imported',
        targetType: 'statement_import',
        targetId: importId,
        summary: `Imported statement "${file.name}" with ${items.length} rows.`,
        details: { fileName: file.name, itemCount: items.length }
      });

      revalidatePaths(REVALIDATE_PATHS.reconciliation);
    }
  });
}

export async function rematchStatementAction() {
  await runRedirectingAction({
    fallbackPath: '/dashboard/settings',
    successMessage: 'Re-ran auto-matching against logged purchases.',
    action: async () => {
      await requireAdmin();
      const admin = createAdminClient();
      await runStatementAutoMatch(admin);
      revalidatePaths(REVALIDATE_PATHS.reconciliation);
    }
  });
}

export async function resolveStatementItemAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/settings',
    successMessage: 'Updated the statement line item.',
    action: async () => {
      const { user } = await requireAdmin();
      const itemId = String(formData.get('item_id') || '').trim();
      const decision = String(formData.get('decision') || '').trim();
      const teamId = String(formData.get('team_id') || '').trim();
      if (!itemId) {
        throw new Error('Missing statement line item.');
      }

      const admin = createAdminClient();
      const { data: item } = await admin
        .from('statement_line_items')
        .select('id, description, person_name, amount_cents, statement_date, direction')
        .eq('id', itemId)
        .maybeSingle();
      if (!item) {
        throw new Error('That statement line item no longer exists.');
      }

      const now = new Date().toISOString();

      if (decision === 'disregard') {
        await admin
          .from('statement_line_items')
          .update({ status: 'disregarded', resolved_by: user.id, resolved_at: now })
          .eq('id', itemId);
      } else if (decision === 'unknown') {
        await admin
          .from('statement_line_items')
          .update({
            status: 'assigned',
            assigned_scope: 'unknown',
            assigned_team_id: null,
            resolved_by: user.id,
            resolved_at: now
          })
          .eq('id', itemId);
      } else if (decision === 'team' || decision === 'leadership') {
        if (decision === 'team' && !teamId) {
          throw new Error('Choose a team to assign this purchase to.');
        }

        const purchaseId = crypto.randomUUID();
        const academicYear = await getCurrentAcademicYear();
        const { error: insertError } = await admin.from('purchase_logs').insert({
          id: purchaseId,
          team_id: decision === 'team' ? teamId : null,
          expense_type: decision === 'team' ? 'team' : 'leadership',
          created_by: user.id,
          academic_year: academicYear,
          amount_cents: item.amount_cents,
          description: item.description,
          person_name: item.person_name || null,
          purchased_at: item.statement_date ? `${item.statement_date}T12:00:00Z` : now,
          payment_method: 'unknown',
          category: detectPurchaseCategory(item.description),
          receipt_not_needed: true
        });
        if (insertError) {
          throw new Error(insertError.message);
        }

        await admin
          .from('statement_line_items')
          .update({
            status: 'assigned',
            assigned_scope: decision,
            assigned_team_id: decision === 'team' ? teamId : null,
            created_purchase_log_id: purchaseId,
            resolved_by: user.id,
            resolved_at: now
          })
          .eq('id', itemId);
      } else {
        throw new Error('Unknown reconciliation action.');
      }

      await recordAuditEvent({
        actorId: user.id,
        action: 'statement.resolved',
        targetType: 'statement_line_item',
        targetId: itemId,
        summary: `Reconciled statement item "${item.description}" as ${decision}.`,
        details: { decision, teamId: decision === 'team' ? teamId : null, amountCents: item.amount_cents }
      });

      revalidatePaths(REVALIDATE_PATHS.reconciliation);
    }
  });
}

// ───────────────────────────── Budget planner ─────────────────────────────

type AdminClient = ReturnType<typeof createAdminClient>;

function formatCentsUsd(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

async function getActivePresidentProfiles(admin: AdminClient) {
  const { data } = await admin
    .from('profiles')
    .select('id, full_name, email, role, is_president')
    .eq('active', true);
  return ((data || []) as Array<{ id: string; full_name: string | null; email: string | null; role: string; is_president: boolean }>)
    .filter((profile) => profile.role === 'president' || profile.is_president)
    .filter((profile) => Boolean(profile.email));
}

async function requireExactlyTwoPresidents(admin: AdminClient) {
  const presidents = await getActivePresidentProfiles(admin);
  if (presidents.length !== 2) {
    throw new Error(
      `Budget approval requires exactly two active presidents (currently ${presidents.length}). Update president roles in Club Settings first.`
    );
  }
  return presidents;
}

async function loadBudgetPlanRow(admin: AdminClient, planId: string) {
  const { data } = await admin
    .from('budget_plans')
    .select('id, academic_year, version, status')
    .eq('id', planId)
    .maybeSingle();
  if (!data) {
    throw new Error('Budget plan not found.');
  }
  return data as { id: string; academic_year: string; version: number; status: string };
}

// A draft/pending plan is freely editable; editing a pending plan reverts it to
// draft and clears collected signatures. Approved plans are not bulk-editable.
async function ensureEditableDraft(admin: AdminClient, planId: string, status: string) {
  if (status === 'approved') {
    throw new Error('This plan is approved. Start a revision to change it.');
  }
  if (status === 'pending_approval') {
    await admin.from('budget_plans').update({ status: 'draft' }).eq('id', planId);
    await admin.from('budget_approvals').delete().eq('target_type', 'plan').eq('target_id', planId);
  }
}

async function pushBudgetApprovalSlack(opts: {
  targetType: 'plan' | 'quarter';
  targetId: string;
  academicYear: string;
  quarter?: string | null;
  title: string;
  message: string;
  presidents: Array<{ email: string | null }>;
}) {
  const settings = await getBudgetPlanSettings();
  if (!settings.slackEnabled) return;
  const emails = opts.presidents.map((p) => (p.email || '').toLowerCase()).filter(Boolean);
  if (emails.length === 0) return;
  try {
    await sendSlackbotNotification({
      idempotency_key: `budget_approval:${opts.targetType}:${opts.targetId}`,
      type: 'budget_approval',
      team_id: SLACKBOT_SYSTEM_TEAM_ID,
      team_name: SLACKBOT_SYSTEM_TEAM_NAME,
      recipient_emails: emails,
      title: opts.title,
      message: opts.message,
      cta_label: 'Review & sign',
      cta_url: `${env.siteUrl}/dashboard/finances/plan`,
      metadata: {
        target_type: opts.targetType,
        target_id: opts.targetId,
        academic_year: opts.academicYear,
        quarter: opts.quarter ?? null
      }
    });
  } catch (error) {
    console.error('Budget approval Slack push failed:', error);
  }
}

// Writes approved plan amounts into the legacy team_budgets/club_budgets tables
// so existing spend tracking keeps working.
async function writePlanThrough(admin: AdminClient, planId: string, academicYear: string) {
  const rollup = await computePlanRollup(planId, academicYear);
  const teamRows = Array.from(rollup.perTeam.entries()).map(([teamId, value]) => ({
    team_id: teamId,
    academic_year: academicYear,
    annual_budget_cents: value.budgetCents
  }));
  if (teamRows.length > 0) {
    await admin.from('team_budgets').upsert(teamRows, { onConflict: 'team_id,academic_year' });
  }
  await admin
    .from('club_budgets')
    .upsert({ academic_year: academicYear, total_budget_cents: rollup.totalFundingCents });
}

async function finalizeBudgetPlan(admin: AdminClient, planId: string, academicYear: string) {
  const now = new Date().toISOString();
  await admin.from('budget_plans').update({ status: 'approved', approved_at: now, updated_at: now }).eq('id', planId);
  // Supersede any other non-superseded plan for the same year.
  await admin
    .from('budget_plans')
    .update({ status: 'superseded' })
    .eq('academic_year', academicYear)
    .neq('id', planId)
    .neq('status', 'superseded');
  // Lock everything except explicitly-unlocked (event) items.
  await admin.from('budget_expense_items').update({ locked: true }).eq('plan_id', planId).neq('lock_cadence', 'unlocked');
  await admin.from('budget_funding_sources').update({ locked: true }).eq('plan_id', planId);
  await writePlanThrough(admin, planId, academicYear);
}

export async function createBudgetPlanAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/finances/plan',
    successMessage: 'Created a draft budget plan.',
    action: async () => {
      const { user } = await requireAdmin();
      const setup = await getBudgetSetupState();
      const academicYear = String(formData.get('academic_year') || setup.nextAcademicYear).trim();

      const admin = createAdminClient();
      const existing = await getActiveBudgetPlan(academicYear);
      if (existing) {
        throw new Error(`A budget plan already exists for ${academicYear}.`);
      }

      const planId = crypto.randomUUID();
      const { error } = await admin.from('budget_plans').insert({
        id: planId,
        academic_year: academicYear,
        version: 1,
        status: 'draft',
        created_by: user.id
      });
      if (error) throw new Error(error.message);

      // Permanent annual-grant rows — one per category.
      await admin.from('budget_funding_sources').insert(
        (['equipment', 'food', 'travel', 'registration', 'other'] as const).map((category, index) => ({
          plan_id: planId,
          label: 'Annual grant',
          kind: 'annual_grant',
          category,
          amount_cents: 0,
          is_default_pool: index === 0,
          sort_order: index
        }))
      );

      const { data: teams } = await admin.from('teams').select('id, name').eq('is_active', true).order('name');
      const categoryRows: Array<Record<string, unknown>> = [];
      (((teams || []) as Array<{ id: string; name: string }>) || []).forEach((team, teamIndex) => {
        (['equipment', 'food', 'travel', 'registration'] as const).forEach((category, categoryIndex) => {
          categoryRows.push({
            plan_id: planId,
            kind: 'team',
            team_id: team.id,
            category,
            label: `${team.name} — ${category}`,
            amount_cents: 0,
            lock_cadence: 'yearly',
            sort_order: teamIndex * 10 + categoryIndex
          });
        });
      });
      if (categoryRows.length > 0) {
        await admin.from('budget_expense_items').insert(categoryRows);
      }

      await recordAuditEvent({
        actorId: user.id,
        action: 'budget.plan.created',
        targetType: 'budget_plan',
        targetId: planId,
        summary: `Created ${academicYear} budget plan.`,
        details: { academicYear }
      });

      revalidatePaths(REVALIDATE_PATHS.budgetPlan);
    }
  });
}

function revalidateBudgetPlan() {
  revalidatePath('/dashboard/finances/plan');
}

export async function upsertFundingSourceAction(formData: FormData) {
  await requireAdmin();
  const planId = String(formData.get('plan_id') || '').trim();
  const sourceId = String(formData.get('source_id') || '').trim();
  const label = String(formData.get('label') || '').trim();
  const kindRaw = String(formData.get('kind') || 'other').trim();
  const categoryRaw = String(formData.get('category') || '').trim();
  const amountCents = Math.max(0, Math.round((Number(formData.get('amount')) || 0) * 100));
  const isDefaultPool = String(formData.get('is_default_pool') || '') === 'on';
  const notes = String(formData.get('notes') || '').trim() || null;
  if (!planId || !label) return;

  const admin = createAdminClient();
  const plan = await loadBudgetPlanRow(admin, planId);
  await ensureEditableDraft(admin, planId, plan.status);

  const kind = ['annual_grant', 'reserve_grant', 'grant', 'sponsorship', 'other'].includes(kindRaw) ? kindRaw : 'other';
  const category = ['equipment', 'food', 'travel', 'registration', 'other'].includes(categoryRaw) ? categoryRaw : null;

  if (kind === 'annual_grant') {
    const { data: existing } = await admin
      .from('budget_funding_sources')
      .select('id, category')
      .eq('plan_id', planId)
      .eq('kind', 'annual_grant');
    const conflict = (existing || []).some((row) => row.id !== sourceId && (row.category || '') === (category || ''));
    if (conflict) {
      throw new Error(`Only one annual grant is allowed per category${category ? ` (${category})` : ''}.`);
    }
  }

  if (isDefaultPool) {
    await admin
      .from('budget_funding_sources')
      .update({ is_default_pool: false })
      .eq('plan_id', planId)
      .neq('id', sourceId || '00000000-0000-0000-0000-000000000000');
  }

  const payload = { plan_id: planId, label, kind, category, amount_cents: amountCents, is_default_pool: isDefaultPool, notes };
  if (sourceId) {
    await admin.from('budget_funding_sources').update(payload).eq('id', sourceId);
  } else {
    await admin.from('budget_funding_sources').insert(payload);
  }
  revalidateBudgetPlan();
}

export async function deleteFundingSourceAction(formData: FormData) {
  await requireAdmin();
  const planId = String(formData.get('plan_id') || '').trim();
  const sourceId = String(formData.get('source_id') || '').trim();
  if (!planId || !sourceId) return;
  const admin = createAdminClient();
  const plan = await loadBudgetPlanRow(admin, planId);
  await ensureEditableDraft(admin, planId, plan.status);
  const { data: source } = await admin
    .from('budget_funding_sources')
    .select('kind')
    .eq('id', sourceId)
    .maybeSingle();
  if (source?.kind === 'annual_grant') {
    throw new Error('Annual grant rows are permanent and cannot be removed.');
  }
  await admin.from('budget_funding_sources').delete().eq('id', sourceId);
  revalidateBudgetPlan();
}

export async function upsertExpenseItemAction(formData: FormData) {
  await requireAdmin();
  const planId = String(formData.get('plan_id') || '').trim();
  const expenseId = String(formData.get('expense_id') || '').trim();
  const kindRaw = String(formData.get('kind') || 'general').trim();
  const teamId = String(formData.get('team_id') || '').trim();
  const parentId = String(formData.get('parent_id') || '').trim();
  const categoryRaw = String(formData.get('category') || '').trim();
  const label = String(formData.get('label') || '').trim();
  const amountCents = Math.max(0, Math.round((Number(formData.get('amount')) || 0) * 100));
  const lockCadenceRaw = String(formData.get('lock_cadence') || 'yearly').trim();
  const notes = String(formData.get('notes') || '').trim() || null;
  if (!planId) return;

  const admin = createAdminClient();
  const plan = await loadBudgetPlanRow(admin, planId);

  const isSubItem = Boolean(parentId);
  const kind = ['team', 'event', 'operations', 'general'].includes(kindRaw) ? kindRaw : 'general';
  const lockCadence = ['yearly', 'quarterly', 'unlocked'].includes(lockCadenceRaw) ? lockCadenceRaw : 'yearly';
  const category =
    (kind === 'team' || isSubItem) && ['equipment', 'food', 'travel', 'registration', 'other'].includes(categoryRaw) ? categoryRaw : null;
  const categoryLabels: Record<string, string> = { equipment: 'Equipment', food: 'Food', travel: 'Travel', registration: 'Registration', other: 'Other' };

  // Team rows and sub-items get derived labels; other kinds use the typed label.
  let resolvedLabel = label;
  if (isSubItem) {
    if (!category) return;
    const { data: siblings } = await admin
      .from('budget_expense_items')
      .select('id, category')
      .eq('plan_id', planId)
      .eq('parent_id', parentId);
    if ((siblings || []).some((row) => row.id !== expenseId && row.category === category)) {
      throw new Error(`This line item already has a ${category} sub-budget.`);
    }
    resolvedLabel = categoryLabels[category];
  } else if (kind === 'team') {
    if (!teamId) return;
    // One row per (team, category) per plan.
    const { data: existingForTeam } = await admin
      .from('budget_expense_items')
      .select('id, category')
      .eq('plan_id', planId)
      .eq('team_id', teamId)
      .eq('kind', 'team');
    const conflict = (existingForTeam || []).some((row) => row.id !== expenseId && row.category === category);
    if (conflict) {
      throw new Error(`That team already has a ${category || 'category'} budget. Edit the existing one instead.`);
    }
    const { data: team } = await admin.from('teams').select('name').eq('id', teamId).maybeSingle();
    resolvedLabel = `${team?.name || 'Team'} — ${categoryLabels[category || 'other']}`;
  } else if (!resolvedLabel) {
    return;
  }

  if (plan.status === 'approved') {
    if (!expenseId) throw new Error('This plan is approved. Start a revision to add line items.');
    const { data: existing } = await admin.from('budget_expense_items').select('lock_cadence').eq('id', expenseId).maybeSingle();
    if (existing?.lock_cadence !== 'unlocked') {
      throw new Error('This line item is locked. Start a revision to change it.');
    }
  } else {
    await ensureEditableDraft(admin, planId, plan.status);
  }

  const payload = {
    plan_id: planId,
    kind,
    team_id: !isSubItem && kind === 'team' ? teamId || null : null,
    parent_id: parentId || null,
    category,
    label: resolvedLabel,
    amount_cents: amountCents,
    lock_cadence: lockCadence,
    notes
  };
  let savedId = expenseId;
  if (expenseId) {
    await admin.from('budget_expense_items').update(payload).eq('id', expenseId);
  } else {
    const { data: inserted } = await admin.from('budget_expense_items').insert(payload).select('id').single();
    savedId = (inserted?.id as string) || '';
  }
  // Once a parent has sub-items, its own amount/funding is replaced by the
  // sub-items — clear them so nothing is double-counted.
  if (isSubItem) {
    await admin.from('budget_expense_items').update({ amount_cents: 0 }).eq('id', parentId).gt('amount_cents', 0);
    await admin.from('budget_allocations').delete().eq('expense_id', parentId);

    // Optional funding source chosen on the add row — allocate the sub-item's
    // amount from it (only if categories are compatible and it isn't a grant).
    const sourceId = String(formData.get('source_id') || '').trim();
    if (sourceId && savedId && amountCents > 0) {
      const { data: src } = await admin
        .from('budget_funding_sources')
        .select('kind, category')
        .eq('id', sourceId)
        .maybeSingle();
      if (src && src.kind !== 'annual_grant' && (!category || !src.category || src.category === category)) {
        await admin
          .from('budget_allocations')
          .upsert(
            { plan_id: planId, source_id: sourceId, expense_id: savedId, amount_cents: amountCents },
            { onConflict: 'source_id,expense_id' }
          );
      }
    }
  }
  if (plan.status === 'approved') {
    await writePlanThrough(admin, planId, plan.academic_year);
  }
  revalidateBudgetPlan();
}

export async function deleteExpenseItemAction(formData: FormData) {
  await requireAdmin();
  const planId = String(formData.get('plan_id') || '').trim();
  const expenseId = String(formData.get('expense_id') || '').trim();
  if (!planId || !expenseId) return;
  const admin = createAdminClient();
  const plan = await loadBudgetPlanRow(admin, planId);
  await ensureEditableDraft(admin, planId, plan.status);
  await admin.from('budget_expense_items').delete().eq('id', expenseId);
  revalidateBudgetPlan();
}

export async function upsertAllocationAction(formData: FormData) {
  await requireAdmin();
  const planId = String(formData.get('plan_id') || '').trim();
  const sourceId = String(formData.get('source_id') || '').trim();
  const expenseId = String(formData.get('expense_id') || '').trim();
  const amountCents = Math.max(0, Math.round((Number(formData.get('amount')) || 0) * 100));
  if (!planId || !sourceId || !expenseId) return;

  const admin = createAdminClient();
  const plan = await loadBudgetPlanRow(admin, planId);
  await ensureEditableDraft(admin, planId, plan.status);

  if (amountCents === 0) {
    await admin.from('budget_allocations').delete().eq('source_id', sourceId).eq('expense_id', expenseId);
    revalidateBudgetPlan();
    return;
  }

  const { sources, expenses, allocations } = await getPlanBundle(planId);
  const source = sources.find((s) => s.id === sourceId);
  const expense = expenses.find((e) => e.id === expenseId);
  if (!source || !expense) throw new Error('Unknown source or line item.');
  if (source.kind === 'annual_grant') {
    throw new Error('The annual grant funds the remainder automatically — pick a sponsorship/grant/other source.');
  }
  // A categorized line item can only draw from a matching-category or uncategorized source.
  if (expense.category && source.category && source.category !== expense.category) {
    throw new Error(`A ${expense.category} line item can only be funded by a ${expense.category} or uncategorized source.`);
  }
  const otherFromSource = allocations
    .filter((a) => a.sourceId === sourceId && a.expenseId !== expenseId)
    .reduce((sum, a) => sum + a.amountCents, 0);
  const otherToExpense = allocations
    .filter((a) => a.expenseId === expenseId && a.sourceId !== sourceId)
    .reduce((sum, a) => sum + a.amountCents, 0);
  if (amountCents + otherFromSource > source.amountCents) {
    throw new Error(`That exceeds "${source.label}" — only ${formatCentsUsd(source.amountCents - otherFromSource)} remains.`);
  }
  if (amountCents + otherToExpense > expense.amountCents) {
    throw new Error(`That exceeds the "${expense.label}" line item amount.`);
  }

  await admin
    .from('budget_allocations')
    .upsert({ plan_id: planId, source_id: sourceId, expense_id: expenseId, amount_cents: amountCents }, { onConflict: 'source_id,expense_id' });
  revalidateBudgetPlan();
}

export async function reorderBudgetItemsAction(
  planId: string,
  table: 'budget_expense_items' | 'budget_funding_sources',
  orderedIds: string[]
) {
  await requireAdmin();
  if (!planId || !Array.isArray(orderedIds) || orderedIds.length === 0) return;
  if (table !== 'budget_expense_items' && table !== 'budget_funding_sources') return;
  const admin = createAdminClient();
  await Promise.all(
    orderedIds.map((id, index) =>
      admin.from(table).update({ sort_order: index }).eq('id', id).eq('plan_id', planId)
    )
  );
  revalidateBudgetPlan();
}

// Wipe a plan's team category rows and recreate a clean Equipment/Food/Travel/Registration
// set for every active team.
export async function resetTeamBudgetsAction(formData: FormData) {
  await requireAdmin();
  const planId = String(formData.get('plan_id') || '').trim();
  if (!planId) return;
  const admin = createAdminClient();
  const plan = await loadBudgetPlanRow(admin, planId);
  if (plan.status === 'approved') {
    throw new Error('Start a revision to reset team budgets on an approved plan.');
  }
  await ensureEditableDraft(admin, planId, plan.status);

  await admin.from('budget_expense_items').delete().eq('plan_id', planId).eq('kind', 'team');

  const { data: teams } = await admin.from('teams').select('id, name').eq('is_active', true).order('name');
  const categories: Array<[string, string]> = [
    ['equipment', 'Equipment'],
    ['food', 'Food'],
    ['travel', 'Travel'],
    ['registration', 'Registration']
  ];
  const rows: Array<Record<string, unknown>> = [];
  ((teams || []) as Array<{ id: string; name: string }>).forEach((team, teamIndex) => {
    categories.forEach(([category, categoryLabel], categoryIndex) => {
      rows.push({
        plan_id: planId,
        kind: 'team',
        team_id: team.id,
        category,
        label: `${team.name} — ${categoryLabel}`,
        amount_cents: 0,
        lock_cadence: 'yearly',
        sort_order: teamIndex * 10 + categoryIndex
      });
    });
  });
  if (rows.length > 0) {
    await admin.from('budget_expense_items').insert(rows);
  }
  revalidateBudgetPlan();
}

// Set every team's food sub-budget from a $/member rate and the team roster
// size. Per-quarter -> quarterly lock; per-year -> yearly lock.
export async function applyFoodPerMemberAction(formData: FormData) {
  await requireAdmin();
  const planId = String(formData.get('plan_id') || '').trim();
  const dollars = Number(formData.get('dollars')) || 0;
  const period = String(formData.get('period') || 'quarter');
  if (!planId) return;
  const perMemberCents = Math.max(0, Math.round(dollars * 100));
  const lockCadence = period === 'year' ? 'yearly' : 'quarterly';

  const admin = createAdminClient();
  const plan = await loadBudgetPlanRow(admin, planId);
  await ensureEditableDraft(admin, planId, plan.status);

  const { data: foodRows } = await admin
    .from('budget_expense_items')
    .select('id, team_id')
    .eq('plan_id', planId)
    .eq('kind', 'team')
    .eq('category', 'food');
  const rows = ((foodRows || []) as Array<{ id: string; team_id: string | null }>).filter((r) => r.team_id);
  if (rows.length === 0) {
    revalidateBudgetPlan();
    return;
  }

  const teamIds = Array.from(new Set(rows.map((r) => r.team_id as string)));
  const { data: members } = await admin.from('team_roster_members').select('team_id').in('team_id', teamIds);
  const countByTeam = new Map<string, number>();
  for (const m of (members || []) as Array<{ team_id: string }>) {
    countByTeam.set(m.team_id, (countByTeam.get(m.team_id) || 0) + 1);
  }

  await Promise.all(
    rows.map((r) =>
      admin
        .from('budget_expense_items')
        .update({ amount_cents: perMemberCents * (countByTeam.get(r.team_id as string) || 0), lock_cadence: lockCadence })
        .eq('id', r.id)
    )
  );
  revalidateBudgetPlan();
}

export async function submitBudgetPlanForApprovalAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/finances/plan',
    successMessage: 'Sent the plan to both presidents for approval.',
    action: async () => {
      const { user } = await requireAdmin();
      const planId = String(formData.get('plan_id') || '').trim();
      if (!planId) throw new Error('Missing plan.');
      const admin = createAdminClient();
      const plan = await loadBudgetPlanRow(admin, planId);
      if (plan.status === 'approved') throw new Error('This plan is already approved.');

      const presidents = await requireExactlyTwoPresidents(admin);
      const rollup = await computePlanRollup(planId, plan.academic_year);
      if (rollup.overAllocatedSources.length > 0) {
        throw new Error('A funding source is over-allocated. Fix allocations before submitting.');
      }
      if (rollup.uncoveredCents > 0) {
        throw new Error(`Funding falls short of planned expenses by ${formatCentsUsd(rollup.uncoveredCents)}.`);
      }

      const now = new Date().toISOString();
      await admin
        .from('budget_plans')
        .update({ status: 'pending_approval', total_funding_cents: rollup.totalFundingCents, submitted_at: now, submitted_by: user.id, updated_at: now })
        .eq('id', planId);
      await admin.from('budget_approvals').delete().eq('target_type', 'plan').eq('target_id', planId);

      await pushBudgetApprovalSlack({
        targetType: 'plan',
        targetId: planId,
        academicYear: plan.academic_year,
        title: `${plan.academic_year} budget plan needs your approval`,
        message: `The ${plan.academic_year} budget plan (total ${formatCentsUsd(rollup.totalFundingCents)}) is ready for both presidents to review and sign in the portal.`,
        presidents
      });

      await recordAuditEvent({
        actorId: user.id,
        action: 'budget.plan.submitted',
        targetType: 'budget_plan',
        targetId: planId,
        summary: `Submitted ${plan.academic_year} budget plan for approval.`,
        details: { totalFundingCents: rollup.totalFundingCents }
      });
      revalidatePaths(REVALIDATE_PATHS.budgetPlan);
    }
  });
}

async function requireSigningPresident() {
  const { user, profile } = await getViewerContext();
  if (!(profile.role === 'president' || profile.is_president)) {
    throw new Error('Only presidents can sign budget approvals.');
  }
  return { user, profile };
}

// --- Signature verification ---------------------------------------------

// Signature enrollment is open to any active user: team leads sign to approve
// higher-value reimbursements, and officers sign budgets and approvals.
export async function enrollSignatureAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/profile',
    successMessage: 'Signature enrolled. Future approvals will be verified against it.',
    action: async () => {
      const { user } = await getViewerContext();

      let raw: unknown;
      try {
        raw = JSON.parse(String(formData.get('samples') || '[]'));
      } catch {
        throw new Error('Could not read the captured signatures. Please try again.');
      }
      const sampleStrokes = Array.isArray(raw) ? (raw as SignatureStroke[][]) : [];
      const featureList = sampleStrokes
        .map((strokes) => extractSignatureFeatures(parseStrokes(strokes)))
        .filter((f): f is number[] => Array.isArray(f));

      if (featureList.length < MIN_ENROLL_SAMPLES) {
        throw new Error(`Please capture at least ${MIN_ENROLL_SAMPLES} clear signatures before enrolling.`);
      }

      const signatureProfile = buildSignatureProfile(featureList);
      const admin = createAdminClient();
      await admin.from('signature_profiles').upsert(
        {
          user_id: user.id,
          profile: signatureProfile,
          sample_count: signatureProfile.sampleCount,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'user_id' }
      );

      await recordAuditEvent({
        actorId: user.id,
        action: 'signature.enrolled',
        targetType: 'profile',
        targetId: user.id,
        summary: `Enrolled a verification signature (${signatureProfile.sampleCount} samples).`,
        details: { samples: signatureProfile.sampleCount }
      });

      revalidatePath('/dashboard/profile');
    }
  });
}

export async function resetSignatureEnrollmentAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/profile',
    successMessage: 'Removed your enrolled signature.',
    action: async () => {
      const { user } = await getViewerContext();
      const targetId = String(formData.get('user_id') || '').trim() || user.id;
      // Admins may reset anyone's enrollment; everyone else only their own.
      if (targetId !== user.id) {
        await requireAdmin();
      }
      const admin = createAdminClient();
      await admin.from('signature_profiles').delete().eq('user_id', targetId);
      revalidatePath('/dashboard/profile');
      revalidatePath('/dashboard/settings');
    }
  });
}

// Non-blocking self-test of a signature against the user's enrolled profile.
export async function testSignatureAction(
  _prev: { ok: boolean; message: string },
  formData: FormData
): Promise<{ ok: boolean; message: string }> {
  const { user } = await getViewerContext();
  const admin = createAdminClient();
  const { data } = await admin.from('signature_profiles').select('profile').eq('user_id', user.id).maybeSingle();
  if (!data) {
    return { ok: false, message: 'No signature is enrolled yet — enroll one above first.' };
  }
  const features = extractSignatureFeatures(parseStrokes(formData.get('strokes')));
  if (!features) {
    return { ok: false, message: 'That signature was too brief to check — try signing again.' };
  }
  const result = verifySignature(data.profile as SignatureProfile, features);
  const detail = `score ${result.score.toFixed(2)}, allowed ≤ ${result.threshold.toFixed(2)}`;
  return result.ok
    ? { ok: true, message: `Match ✓ — this looks like your signature (${detail}).` }
    : { ok: false, message: `No match ✗ — this doesn't look like your enrolled signature (${detail}).` };
}

// Verify the strokes submitted with a signature against the signer's enrolled
// profile. Throws (blocking the signature) on mismatch or missing enrollment.
async function verifyEnrolledSignature(admin: AdminClient, userId: string, formData: FormData) {
  const { data } = await admin.from('signature_profiles').select('profile').eq('user_id', userId).maybeSingle();
  if (!data) {
    throw new Error('Enroll your signature in Personal settings before you can approve.');
  }
  const features = extractSignatureFeatures(parseStrokes(formData.get('strokes')));
  if (!features) {
    throw new Error('That signature was too brief to verify — please sign again.');
  }
  const result = verifySignature(data.profile as SignatureProfile, features);
  if (!result.ok) {
    throw new Error(
      'Signature verification failed — this does not match your enrolled signature. Sign again, or re-enroll in Personal settings.'
    );
  }
  return result;
}

export async function signBudgetPlanAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/finances/plan',
    successMessage: 'Signed the budget plan.',
    action: async () => {
      const { user, profile } = await requireSigningPresident();
      const planId = String(formData.get('plan_id') || '').trim();
      const signature = String(formData.get('signature') || '').trim();
      if (!planId) throw new Error('Missing plan.');
      if (!signature.startsWith('data:image/')) throw new Error('Please add your signature before approving.');

      const admin = createAdminClient();
      const plan = await loadBudgetPlanRow(admin, planId);
      if (plan.status !== 'pending_approval') throw new Error('This plan is not awaiting approval.');

      await verifyEnrolledSignature(admin, user.id, formData);

      await admin.from('budget_approvals').upsert(
        {
          target_type: 'plan',
          target_id: planId,
          president_id: user.id,
          president_email: (profile.email || '').toLowerCase(),
          decision: 'approved',
          signature: signature.slice(0, 1_000_000),
          source: 'portal',
          decided_at: new Date().toISOString()
        },
        { onConflict: 'target_type,target_id,president_id' }
      );

      const presidents = await getActivePresidentProfiles(admin);
      const presidentIds = new Set(presidents.map((p) => p.id));
      const { data: approvals } = await admin
        .from('budget_approvals')
        .select('president_id, decision, signature')
        .eq('target_type', 'plan')
        .eq('target_id', planId);
      const signedApprovers = (approvals || []).filter(
        (a) => a.decision === 'approved' && a.signature && presidentIds.has(a.president_id)
      );
      if (presidents.length === 2 && signedApprovers.length >= 2) {
        await finalizeBudgetPlan(admin, planId, plan.academic_year);
        await recordAuditEvent({
          actorId: user.id,
          action: 'budget.plan.approved',
          targetType: 'budget_plan',
          targetId: planId,
          summary: `${plan.academic_year} budget plan approved by both presidents.`,
          details: { academicYear: plan.academic_year }
        });
      }
      revalidatePaths(REVALIDATE_PATHS.budgetPlan);
    }
  });
}

export async function reviseBudgetPlanAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/finances/plan',
    successMessage: 'Started a new draft revision.',
    action: async () => {
      const { user } = await requireAdmin();
      const planId = String(formData.get('plan_id') || '').trim();
      if (!planId) throw new Error('Missing plan.');
      const admin = createAdminClient();
      const plan = await loadBudgetPlanRow(admin, planId);
      if (plan.status !== 'approved') throw new Error('Only an approved plan can be revised.');

      const newPlanId = crypto.randomUUID();
      await admin.from('budget_plans').insert({
        id: newPlanId,
        academic_year: plan.academic_year,
        version: plan.version + 1,
        status: 'draft',
        created_by: user.id
      });

      const { sources, expenses, allocations } = await getPlanBundle(planId);
      const sourceIdMap = new Map<string, string>();
      const expenseIdMap = new Map<string, string>();
      for (const source of sources) {
        const id = crypto.randomUUID();
        sourceIdMap.set(source.id, id);
        await admin.from('budget_funding_sources').insert({
          id,
          plan_id: newPlanId,
          label: source.label,
          kind: source.kind,
          amount_cents: source.amountCents,
          is_default_pool: source.isDefaultPool,
          locked: false,
          notes: source.notes,
          sort_order: source.sortOrder
        });
      }
      for (const expense of expenses) {
        const id = crypto.randomUUID();
        expenseIdMap.set(expense.id, id);
        await admin.from('budget_expense_items').insert({
          id,
          plan_id: newPlanId,
          kind: expense.kind,
          team_id: expense.teamId,
          category: expense.category,
          label: expense.label,
          amount_cents: expense.amountCents,
          lock_cadence: expense.lockCadence,
          locked: false,
          notes: expense.notes,
          sort_order: expense.sortOrder
        });
      }
      for (const alloc of allocations) {
        const sourceId = sourceIdMap.get(alloc.sourceId);
        const expenseId = expenseIdMap.get(alloc.expenseId);
        if (sourceId && expenseId) {
          await admin.from('budget_allocations').insert({
            plan_id: newPlanId,
            source_id: sourceId,
            expense_id: expenseId,
            amount_cents: alloc.amountCents
          });
        }
      }

      await recordAuditEvent({
        actorId: user.id,
        action: 'budget.plan.revised',
        targetType: 'budget_plan',
        targetId: newPlanId,
        summary: `Started revision v${plan.version + 1} of the ${plan.academic_year} budget plan.`,
        details: { fromPlanId: planId }
      });
      revalidatePaths(REVALIDATE_PATHS.budgetPlan);
    }
  });
}

// ── Quarterly re-declaration ──

export async function openQuarterDeclarationAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/finances/plan',
    successMessage: 'Opened the quarterly declaration.',
    action: async () => {
      const { user } = await requireAdmin();
      const quarterState = await getQuarterDeclarationState();
      if (!quarterState) throw new Error('No quarterly declaration window is currently open.');
      const planIdInput = String(formData.get('plan_id') || '').trim();

      const admin = createAdminClient();
      const plan = planIdInput
        ? await loadBudgetPlanRow(admin, planIdInput)
        : (await getActiveBudgetPlan(quarterState.academicYear));
      if (!plan) throw new Error('No approved budget plan for the current year.');
      if (plan.status !== 'approved') throw new Error('The current-year plan is not approved yet.');

      const { data: existing } = await admin
        .from('budget_quarter_declarations')
        .select('id, version')
        .eq('plan_id', plan.id)
        .eq('quarter', quarterState.quarter)
        .neq('status', 'superseded')
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing) throw new Error(`A ${quarterState.quarter} declaration already exists.`);

      const declarationId = crypto.randomUUID();
      await admin.from('budget_quarter_declarations').insert({
        id: declarationId,
        plan_id: plan.id,
        academic_year: quarterState.academicYear,
        quarter: quarterState.quarter,
        version: 1,
        status: 'draft',
        submitted_by: user.id
      });

      const { data: quarterlyItems } = await admin
        .from('budget_expense_items')
        .select('id, amount_cents')
        .eq('plan_id', plan.id)
        .eq('lock_cadence', 'quarterly');
      const valueRows = ((quarterlyItems || []) as Array<{ id: string; amount_cents: number }>).map((item) => ({
        declaration_id: declarationId,
        expense_item_id: item.id,
        amount_cents: item.amount_cents
      }));
      if (valueRows.length > 0) {
        await admin.from('budget_quarterly_values').insert(valueRows);
      }

      await recordAuditEvent({
        actorId: user.id,
        action: 'budget.quarter.opened',
        targetType: 'budget_quarter_declaration',
        targetId: declarationId,
        summary: `Opened ${quarterState.quarter} budget declaration.`,
        details: { quarter: quarterState.quarter, academicYear: quarterState.academicYear }
      });
      revalidatePaths(REVALIDATE_PATHS.budgetPlan);
    }
  });
}

export async function upsertQuarterlyValueAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/finances/plan',
    successMessage: 'Saved the quarterly amount.',
    action: async () => {
      await requireAdmin();
      const declarationId = String(formData.get('declaration_id') || '').trim();
      const expenseItemId = String(formData.get('expense_item_id') || '').trim();
      const amountCents = Math.max(0, Math.round((Number(formData.get('amount')) || 0) * 100));
      if (!declarationId || !expenseItemId) throw new Error('Missing quarterly value fields.');
      const admin = createAdminClient();
      const { data: decl } = await admin.from('budget_quarter_declarations').select('status').eq('id', declarationId).maybeSingle();
      if (!decl) throw new Error('Declaration not found.');
      if (decl.status === 'approved') throw new Error('This quarter is already approved.');
      if (decl.status === 'pending_approval') {
        await admin.from('budget_quarter_declarations').update({ status: 'draft' }).eq('id', declarationId);
        await admin.from('budget_approvals').delete().eq('target_type', 'quarter').eq('target_id', declarationId);
      }
      await admin
        .from('budget_quarterly_values')
        .upsert({ declaration_id: declarationId, expense_item_id: expenseItemId, amount_cents: amountCents }, { onConflict: 'declaration_id,expense_item_id' });
      revalidatePaths(REVALIDATE_PATHS.budgetPlan);
    }
  });
}

export async function submitQuarterDeclarationForApprovalAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/finances/plan',
    successMessage: 'Sent the quarterly declaration for approval.',
    action: async () => {
      const { user } = await requireAdmin();
      const declarationId = String(formData.get('declaration_id') || '').trim();
      if (!declarationId) throw new Error('Missing declaration.');
      const admin = createAdminClient();
      const { data: decl } = await admin
        .from('budget_quarter_declarations')
        .select('id, academic_year, quarter, status')
        .eq('id', declarationId)
        .maybeSingle();
      if (!decl) throw new Error('Declaration not found.');
      if (decl.status === 'approved') throw new Error('This quarter is already approved.');
      const presidents = await requireExactlyTwoPresidents(admin);

      await admin
        .from('budget_quarter_declarations')
        .update({ status: 'pending_approval', submitted_at: new Date().toISOString(), submitted_by: user.id })
        .eq('id', declarationId);
      await admin.from('budget_approvals').delete().eq('target_type', 'quarter').eq('target_id', declarationId);

      await pushBudgetApprovalSlack({
        targetType: 'quarter',
        targetId: declarationId,
        academicYear: decl.academic_year,
        quarter: decl.quarter,
        title: `${decl.quarter} budget needs your approval`,
        message: `The ${decl.quarter} quarterly budget amounts are ready for both presidents to review and sign in the portal.`,
        presidents
      });

      await recordAuditEvent({
        actorId: user.id,
        action: 'budget.quarter.submitted',
        targetType: 'budget_quarter_declaration',
        targetId: declarationId,
        summary: `Submitted ${decl.quarter} budget declaration for approval.`,
        details: { quarter: decl.quarter }
      });
      revalidatePaths(REVALIDATE_PATHS.budgetPlan);
    }
  });
}

export async function signQuarterDeclarationAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/finances/plan',
    successMessage: 'Signed the quarterly declaration.',
    action: async () => {
      const { user, profile } = await requireSigningPresident();
      const declarationId = String(formData.get('declaration_id') || '').trim();
      const signature = String(formData.get('signature') || '').trim();
      if (!declarationId) throw new Error('Missing declaration.');
      if (!signature.startsWith('data:image/')) throw new Error('Please add your signature before approving.');

      const admin = createAdminClient();
      const { data: decl } = await admin
        .from('budget_quarter_declarations')
        .select('id, plan_id, academic_year, quarter, status')
        .eq('id', declarationId)
        .maybeSingle();
      if (!decl) throw new Error('Declaration not found.');
      if (decl.status !== 'pending_approval') throw new Error('This declaration is not awaiting approval.');

      await verifyEnrolledSignature(admin, user.id, formData);

      await admin.from('budget_approvals').upsert(
        {
          target_type: 'quarter',
          target_id: declarationId,
          president_id: user.id,
          president_email: (profile.email || '').toLowerCase(),
          decision: 'approved',
          signature: signature.slice(0, 1_000_000),
          source: 'portal',
          decided_at: new Date().toISOString()
        },
        { onConflict: 'target_type,target_id,president_id' }
      );

      const presidents = await getActivePresidentProfiles(admin);
      const presidentIds = new Set(presidents.map((p) => p.id));
      const { data: approvals } = await admin
        .from('budget_approvals')
        .select('president_id, decision, signature')
        .eq('target_type', 'quarter')
        .eq('target_id', declarationId);
      const signed = (approvals || []).filter((a) => a.decision === 'approved' && a.signature && presidentIds.has(a.president_id));
      if (presidents.length === 2 && signed.length >= 2) {
        const now = new Date().toISOString();
        await admin.from('budget_quarter_declarations').update({ status: 'approved', approved_at: now }).eq('id', declarationId);
        await admin
          .from('budget_quarter_declarations')
          .update({ status: 'superseded' })
          .eq('plan_id', decl.plan_id)
          .eq('quarter', decl.quarter)
          .neq('id', declarationId)
          .neq('status', 'superseded');
        await writePlanThrough(admin, decl.plan_id, decl.academic_year);
        await recordAuditEvent({
          actorId: user.id,
          action: 'budget.quarter.approved',
          targetType: 'budget_quarter_declaration',
          targetId: declarationId,
          summary: `${decl.quarter} budget declaration approved by both presidents.`,
          details: { quarter: decl.quarter }
        });
      }
      revalidatePaths(REVALIDATE_PATHS.budgetPlan);
    }
  });
}
