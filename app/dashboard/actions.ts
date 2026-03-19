'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase-admin';
import { requireAdmin, requireSignedInUser } from '@/lib/auth';
import { getCurrentAcademicYear, formatAcademicYear, formatPacificDateKey, getReportingWindow } from '@/lib/academic-calendar';
import { sendInviteEmail, sendPresidentInviteEmail, sendTaskEmails } from '@/lib/notifications';
import { env } from '@/lib/env';
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
import { syncNotificationQueue } from '@/lib/notification-queue';

const REVALIDATE_PATHS = {
  dashboard: ['/dashboard'],
  finances: ['/dashboard', '/dashboard/finances'],
  purchases: ['/dashboard', '/dashboard/expenses', '/dashboard/purchases', '/dashboard/finances', '/dashboard/tasks'],
  purchaseReceipt: ['/dashboard', '/dashboard/expenses', '/dashboard/purchases', '/dashboard/tasks'],
  reports: ['/dashboard', '/dashboard/reports', '/dashboard/settings'],
  settings: ['/dashboard/settings'],
  settingsAndReports: ['/dashboard/settings', '/dashboard/reports'],
  settingsDashboardReportsTasks: ['/dashboard', '/dashboard/settings', '/dashboard/reports', '/dashboard/tasks'],
  tasks: ['/dashboard', '/dashboard/tasks'],
  teamsAndMembers: ['/dashboard', '/dashboard/teams', '/dashboard/members'],
  members: ['/dashboard', '/dashboard/members'],
  profile: ['/dashboard', '/dashboard/profile', '/dashboard/members'],
  deleteLead: ['/dashboard', '/dashboard/members', '/dashboard/teams', '/dashboard/tasks', '/dashboard/reports'],
  presidentRole: ['/dashboard', '/dashboard/settings', '/dashboard/members']
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
  const { supabase, user } = await requireSignedInUser();
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, active')
    .eq('id', user.id)
    .single();

  if (!profile?.active) {
    redirect('/login');
  }

  return { user, profile };
}

async function requireLeadTeam(teamId: string) {
  const { user, profile } = await requireActiveProfile();
  if (profile.role === 'admin') {
    return { user, profile };
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

  return { user, profile };
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

function buildInviteConfirmLink(properties: {
  hashed_token?: string | null;
  verification_type?: string | null;
}) {
  const tokenHash = properties.hashed_token;
  const type = properties.verification_type;

  if (!tokenHash || !type) {
    throw new Error('Invite link is missing verification details.');
  }

  const confirmUrl = new URL('/auth/confirm', env.siteUrl);
  confirmUrl.searchParams.set('token_hash', tokenHash);
  confirmUrl.searchParams.set('type', type);
  confirmUrl.searchParams.set('next', '/dashboard');
  return confirmUrl.toString();
}

async function createPortalInviteProfile({
  email,
  fullName,
  role
}: {
  email: string;
  fullName: string;
  role: 'team_lead' | 'president';
}) {
  const admin = createAdminClient();
  const { data: generated, error: generateError } = await admin.auth.admin.generateLink({
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

  if (generateError || !generated?.properties?.action_link || !generated.user?.id) {
    throw new Error(generateError?.message || 'Failed to generate invite link.');
  }

  const { error: profileError } = await admin.from('profiles').upsert({
    id: generated.user.id,
    full_name: fullName || null,
    role,
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

export async function logPurchaseAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/purchases',
    successMessage: 'Logged the purchase.',
    action: async () => {
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
        categoryValue === 'food' || categoryValue === 'travel' || categoryValue === 'equipment'
          ? categoryValue
          : detectPurchaseCategory(description);

      if (!teamId || !description) {
        throw new Error('Team and description are required.');
      }

      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error('Amount must be greater than zero.');
      }

      const { user } = await requireLeadTeam(teamId);
      const purchaseId = crypto.randomUUID();
      let receiptPath: string | null = null;
      let receiptFileName: string | null = null;
      let receiptUploadedAt: string | null = null;

      if (receiptFile instanceof File && receiptFile.size > 0) {
        const uploaded = await uploadReceiptToStorage({
          purchaseId,
          teamId,
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
        team_id: teamId,
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
        summary: `Logged purchase "${description}".`,
        details: {
          teamId,
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
            teamId,
            fileName: receiptFileName,
            receiptPath
          }
        });
      }

      await syncQueueAndRevalidate(REVALIDATE_PATHS.purchases);
    }
  });
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
          purchase.category === 'food' || purchase.category === 'travel' || purchase.category === 'equipment'
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

      if (category !== 'equipment' && category !== 'food' && category !== 'travel') {
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
        categoryValue === 'food' || categoryValue === 'travel' || categoryValue === 'equipment'
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

      const admin = createAdminClient();
      const { error } = await admin.from('receipt_notification_settings').upsert({
        id: 1,
        email_enabled: emailEnabled,
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
          reminderDays
        }
      });

      await syncQueueAndRevalidate(REVALIDATE_PATHS.settings);
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

      const admin = createAdminClient();
      const { error } = await admin.from('report_notification_settings').upsert({
        id: 1,
        email_enabled: emailEnabled,
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
          reminderDays
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

export async function createTaskAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/tasks',
    successMessage: 'Assigned the task.',
    action: async () => {
      const { user, profile } = await requireActiveProfile();
      const title = String(formData.get('title') || '').trim();
      const details = String(formData.get('details') || '').trim();
      const recipientScope = String(formData.get('recipient_scope') || 'specific_teams').trim();
      const pushNotification = String(formData.get('push_notification') || '') === 'on';
      const teamIds = formData
        .getAll('team_ids')
        .map((value) => String(value).trim())
        .filter(Boolean);

      if (!title) {
        throw new Error('Task title is required.');
      }

      const admin = createAdminClient();
      let allowedTeamIds = teamIds;

      if (profile.role !== 'admin') {
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
          push_notification: pushNotification,
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

      if (pushNotification) {
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
        const uniqueTeamIds = Array.from(new Set(recipientTeamIds));

        if (uniqueTeamIds.length > 0) {
          const { data: leadMemberships } = await admin
            .from('team_memberships')
            .select('user_id, team_id')
            .in('team_id', uniqueTeamIds)
            .eq('team_role', 'lead')
            .eq('is_active', true);

          const uniqueLeadIds = Array.from(new Set((leadMemberships || []).map((membership) => membership.user_id)));
          const { data: authUsers } = await admin.auth.admin.listUsers();
          const emailMap = new Map(authUsers.users.map((authUser) => [authUser.id, authUser.email || '']));
          const recipientEmails = uniqueLeadIds.map((leadId) => emailMap.get(leadId) || '').filter(Boolean);

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

      await recordAuditEvent({
        actorId: user.id,
        action: 'task.created',
        targetType: 'task',
        targetId: task.id,
        summary: `Created task "${title}".`,
        details: {
          recipientScope,
          pushNotification,
          teamIds: allowedTeamIds
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

      await syncQueueAndRevalidate(REVALIDATE_PATHS.teamsAndMembers);
    }
  });
}

export async function addTeamRosterMemberAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/members',
    successMessage: 'Added the recorded member.',
    action: async () => {
      const teamId = String(formData.get('team_id') || '').trim();
      const fullName = String(formData.get('full_name') || '').trim();
      const stanfordEmail = String(formData.get('stanford_email') || '').trim().toLowerCase();
      const joinedMonth = Number(formData.get('joined_month') || 0);
      const joinedYear = Number(formData.get('joined_year') || 0);

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
      const { error } = await admin.from('team_roster_members').insert({
        team_id: teamId,
        full_name: fullName,
        stanford_email: stanfordEmail,
        joined_month: joinedMonth,
        joined_year: joinedYear,
        created_by: user.id
      });

      if (error) {
        throw new Error(error.message);
      }

      await recordAuditEvent({
        actorId: user.id,
        action: 'member.recorded',
        targetType: 'team_roster_member',
        summary: `Added ${fullName} to the team roster.`,
        details: {
          teamId,
          fullName,
          stanfordEmail,
          joinedMonth,
          joinedYear
        }
      });

      revalidatePaths(REVALIDATE_PATHS.members);
    }
  });
}

export async function updateTeamRosterMemberAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/members',
    successMessage: 'Updated the recorded member.',
    action: async () => {
      const memberId = String(formData.get('member_id') || '').trim();
      const fullName = String(formData.get('full_name') || '').trim();
      const stanfordEmail = String(formData.get('stanford_email') || '').trim().toLowerCase();

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
      const { error } = await admin
        .from('team_roster_members')
        .update({
          full_name: fullName,
          stanford_email: stanfordEmail
        })
        .eq('id', memberId);

      if (error) {
        throw new Error(error.message);
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
          stanfordEmail
        }
      });

      revalidatePaths(REVALIDATE_PATHS.members);
    }
  });
}

export async function deleteTeamRosterMemberAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/members',
    successMessage: 'Deleted the recorded member.',
    action: async () => {
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

      if (confirmationName !== rosterMember.full_name) {
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

export async function deletePortalLeadAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/members',
    successMessage: 'Removed the lead from the portal.',
    action: async () => {
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
        .select('id, full_name, role')
        .eq('id', leadId)
        .maybeSingle();

      if (!profile) {
        throw new Error('Portal user not found.');
      }

      if (profile.role !== 'team_lead') {
        throw new Error('Only team leads can be removed from the portal here.');
      }

      const expectedName = profile.full_name || '';
      if (confirmationPhrase !== 'DELETE') {
        throw new Error('First confirmation must be DELETE.');
      }

      if (confirmationName !== expectedName) {
        throw new Error('Second confirmation must match the lead name exactly.');
      }

      await recordAuditEvent({
        actorId: user.id,
        action: 'member.portal_deleted',
        targetType: 'profile',
        targetId: leadId,
        summary: `Deleted portal access for ${expectedName || 'team lead'}.`,
        details: {
          leadId,
          fullName: expectedName
        }
      });

      const { error: deleteError } = await admin.auth.admin.deleteUser(leadId);

      if (deleteError) {
        throw new Error(deleteError.message);
      }

      await syncQueueAndRevalidate(REVALIDATE_PATHS.deleteLead);
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
        .select('id, full_name, role, active')
        .eq('id', profileId)
        .maybeSingle();

      if (!profile || !profile.active) {
        throw new Error('Selected user was not found.');
      }

      if (profile.role === 'admin') {
        throw new Error('Admins cannot be reassigned as presidents here.');
      }

      const { error } = await admin
        .from('profiles')
        .update({ role: 'president' })
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
        .select('id, full_name, role')
        .eq('id', profileId)
        .maybeSingle();

      if (!profile || profile.role !== 'president') {
        throw new Error('President not found.');
      }

      const { error } = await admin
        .from('profiles')
        .update({ role: 'team_lead' })
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
