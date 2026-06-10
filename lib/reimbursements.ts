import { createAdminClient } from '@/lib/supabase-admin';
import { env } from '@/lib/env';
import { recordAuditEvent } from '@/lib/audit';
import { detectPurchaseCategory } from '@/lib/purchases';
import { getCurrentAcademicYear } from '@/lib/academic-calendar';
import {
  SLACKBOT_SYSTEM_TEAM_ID,
  SLACKBOT_SYSTEM_TEAM_NAME,
  sendSlackbotNotification
} from '@/lib/slackbot';
import {
  extractSignatureFeatures,
  parseStrokes,
  verifySignature,
  type SignatureProfile
} from '@/lib/signature-verify';
import { RECEIPT_BUCKET } from '@/lib/purchases';

export const REIMBURSEMENT_RECEIPT_MAX_BYTES = 6 * 1024 * 1024;

// Footprint retention: kept this many days for abuse/fraud review, then purged.
export const FOOTPRINT_RETENTION_DAYS = 60;

export type SubmissionGeo = {
  country: string | null;
  region: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  outsideBayArea: boolean;
};

export type SubmissionFootprint = {
  ip: string | null;
  userAgent: string | null;
  acceptLanguage: string | null;
  referer: string | null;
  geo: SubmissionGeo;
};

// Greater Bay Area bounding box (deliberately generous so on-campus, SF, East
// Bay, South Bay and the Peninsula all read as "in area").
const BAY_AREA = { minLat: 36.85, maxLat: 38.55, minLng: -123.3, maxLng: -121.2 };

// True only when we have a location AND it falls outside the Bay Area. Unknown
// location returns false so we never block legitimate on-campus submitters.
export function isOutsideBayArea(geo: Pick<SubmissionGeo, 'latitude' | 'longitude' | 'country' | 'region'>) {
  const { latitude, longitude, country, region } = geo;
  if (typeof latitude === 'number' && typeof longitude === 'number') {
    return (
      latitude < BAY_AREA.minLat ||
      latitude > BAY_AREA.maxLat ||
      longitude < BAY_AREA.minLng ||
      longitude > BAY_AREA.maxLng
    );
  }
  // No coordinates: fall back to coarse country/region signal when present.
  if (country) {
    return country.toUpperCase() !== 'US' || (region ? region.toUpperCase() !== 'CA' : false);
  }
  return false;
}

function firstForwardedIp(value: string | null): string | null {
  if (!value) return null;
  const first = value.split(',')[0]?.trim();
  return first || null;
}

// Reads IP, user agent and Vercel geolocation headers off a request. Works for
// both route handlers (request.headers) and server components (await headers()).
export function extractSubmissionFootprint(headers: Headers): SubmissionFootprint {
  const latRaw = headers.get('x-vercel-ip-latitude');
  const lngRaw = headers.get('x-vercel-ip-longitude');
  const latitude = latRaw ? Number(latRaw) : null;
  const longitude = lngRaw ? Number(lngRaw) : null;
  const country = headers.get('x-vercel-ip-country');
  const region = headers.get('x-vercel-ip-country-region');
  const city = headers.get('x-vercel-ip-city');

  const geo: SubmissionGeo = {
    country: country || null,
    region: region || null,
    city: city ? decodeURIComponent(city) : null,
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    outsideBayArea: false
  };
  geo.outsideBayArea = isOutsideBayArea(geo);

  return {
    ip:
      firstForwardedIp(headers.get('x-forwarded-for')) ||
      headers.get('x-real-ip') ||
      headers.get('x-vercel-forwarded-for'),
    userAgent: headers.get('user-agent'),
    acceptLanguage: headers.get('accept-language'),
    referer: headers.get('referer'),
    geo
  };
}

export async function recordSubmissionFootprint(reimbursementId: string, footprint: SubmissionFootprint) {
  const admin = createAdminClient();
  const { error } = await admin.from('reimbursement_submission_footprints').insert({
    reimbursement_id: reimbursementId,
    ip: footprint.ip,
    user_agent: footprint.userAgent,
    accept_language: footprint.acceptLanguage,
    referer: footprint.referer,
    geo: footprint.geo
  });
  if (error) {
    console.error('Failed to record submission footprint:', error.message);
  }
}

// Purge footprints past the retention window. Called from the daily cron.
export async function purgeOldSubmissionFootprints() {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - FOOTPRINT_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error, count } = await admin
    .from('reimbursement_submission_footprints')
    .delete({ count: 'exact' })
    .lt('created_at', cutoff);
  if (error) {
    console.error('Failed to purge submission footprints:', error.message);
    return { purged: 0 };
  }
  return { purged: count || 0 };
}

export const REIMBURSEMENT_RECEIPT_ALLOWED_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif'
];

export type ReimbursementSettings = {
  signatureThresholdCents: number;
  intakeEnabled: boolean;
};

export type ReimbursementRow = {
  id: string;
  team_id: string;
  submitter_name: string;
  roster_member_id: string | null;
  matched_profile_id: string | null;
  item_name: string;
  amount_cents: number;
  reimbursement_number: string;
  academic_year: string;
  receipt_path: string | null;
  receipt_file_name: string | null;
  decision_token: string;
  status: 'pending' | 'approved' | 'rejected';
  requires_signature: boolean;
  approval_kind: 'button' | 'signature' | null;
  decided_by_profile_id: string | null;
  decided_at: string | null;
  locked_purchase_log_id: string | null;
  finance_processed_at: string | null;
  finance_processed_by: string | null;
  created_at: string;
};

export async function getReimbursementSettings(): Promise<ReimbursementSettings> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('reimbursement_settings')
    .select('signature_threshold_cents, intake_enabled')
    .eq('id', 1)
    .maybeSingle();

  return {
    signatureThresholdCents:
      typeof data?.signature_threshold_cents === 'number' ? data.signature_threshold_cents : 10000,
    intakeEnabled: data?.intake_enabled ?? true
  };
}

// Validate and normalize a Stanford Granted reimbursement number to the
// canonical "R-123456" shape. Returns null if it doesn't look like one.
export function normalizeReimbursementNumber(raw: string): string | null {
  const trimmed = raw.trim().toUpperCase();
  if (!trimmed) return null;
  const match = trimmed.match(/^R[-\s]?(\d{3,})$/);
  if (!match) return null;
  return `R-${match[1]}`;
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

export type SubmitterMatch = {
  rosterMemberId: string | null;
  profileId: string | null;
  canonicalName: string;
};

// A submitter's typed name must correspond to a known person on the team: a
// roster member, or an active team lead's profile.
export async function matchSubmitterToTeam(
  teamId: string,
  rawName: string
): Promise<SubmitterMatch | null> {
  const admin = createAdminClient();
  const target = normalizeName(rawName);
  if (!target) return null;

  const { data: rosterMembers } = await admin
    .from('team_roster_members')
    .select('id, full_name')
    .eq('team_id', teamId);

  const rosterMatch = (rosterMembers || []).find((m) => normalizeName(m.full_name || '') === target);
  if (rosterMatch) {
    return { rosterMemberId: rosterMatch.id, profileId: null, canonicalName: rosterMatch.full_name };
  }

  const leads = await getActiveTeamLeads(teamId);
  const leadMatch = leads.find((lead) => normalizeName(lead.fullName || '') === target);
  if (leadMatch) {
    return { rosterMemberId: null, profileId: leadMatch.userId, canonicalName: leadMatch.fullName || rawName.trim() };
  }

  return null;
}

export type TeamLead = { userId: string; fullName: string | null; email: string | null };

export async function getActiveTeamLeads(teamId: string): Promise<TeamLead[]> {
  const admin = createAdminClient();
  const { data: memberships } = await admin
    .from('team_memberships')
    .select('user_id')
    .eq('team_id', teamId)
    .eq('team_role', 'lead')
    .eq('is_active', true);

  const userIds = (memberships || []).map((m) => m.user_id);
  if (userIds.length === 0) return [];

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, full_name, email')
    .in('id', userIds)
    .eq('active', true);

  return (profiles || []).map((p) => ({ userId: p.id, fullName: p.full_name, email: p.email }));
}

export async function uploadReimbursementReceipt(reimbursementId: string, teamId: string, file: File) {
  if (file.size > REIMBURSEMENT_RECEIPT_MAX_BYTES) {
    throw new Error('Receipt files must be under 6 MB.');
  }
  if (file.type && !REIMBURSEMENT_RECEIPT_ALLOWED_TYPES.includes(file.type)) {
    throw new Error('Receipts must be a PDF or image (PNG, JPG, WEBP, GIF).');
  }

  const extension = file.name.includes('.') ? file.name.split('.').pop() || 'png' : 'png';
  const safeBase = (file.name.replace(/\.[^.]+$/, '') || 'receipt')
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  const path = `member-reimbursements/${teamId}/${reimbursementId}-${Date.now()}-${safeBase || 'receipt'}.${extension.toLowerCase()}`;
  const admin = createAdminClient();
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await admin.storage.from(RECEIPT_BUCKET).upload(path, buffer, {
    contentType: file.type || undefined,
    upsert: true
  });
  if (error) {
    throw new Error(error.message);
  }
  return { path, fileName: file.name };
}

// Sends the Slack push to the team lead(s). Below-threshold submissions can be
// approved with a single button (and the bot may render native Approve/Reject
// buttons that POST to /api/internal/reimbursement-approval); above-threshold
// ones require a drawn signature on the tokenized link. We never let a Slack
// failure block the submission — the lead can still act from the portal.
export async function sendReimbursementSlackPush(
  reimbursement: ReimbursementRow,
  leads: TeamLead[],
  teamName: string
) {
  const emails = leads.map((l) => (l.email || '').toLowerCase()).filter(Boolean);
  if (emails.length === 0) return;

  const amount = (reimbursement.amount_cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD'
  });
  const approveUrl = `${env.siteUrl}/approve-reimbursement/${reimbursement.decision_token}`;
  const title = `Reimbursement to review — ${teamName}`;
  const lines = [
    `*${reimbursement.submitter_name}* submitted a purchase for *${teamName}*.`,
    `• Item: ${reimbursement.item_name}`,
    `• Amount: ${amount}`,
    `• Granted #: ${reimbursement.reimbursement_number}`,
    reimbursement.requires_signature
      ? `This is over the signature threshold — open the link to review and *sign* to approve.`
      : `Approve or reject below.`
  ];

  const basePayload = {
    idempotency_key: `reimbursement_approval:${reimbursement.id}`,
    team_id: SLACKBOT_SYSTEM_TEAM_ID,
    team_name: SLACKBOT_SYSTEM_TEAM_NAME,
    recipient_emails: emails,
    title,
    message: lines.join('\n'),
    metadata: {
      reimbursement_id: reimbursement.id,
      team_id: reimbursement.team_id,
      team_name: teamName,
      amount_cents: reimbursement.amount_cents,
      reimbursement_number: reimbursement.reimbursement_number,
      requires_signature: reimbursement.requires_signature,
      approve_url: approveUrl,
      // The Slack bot should POST { reimbursement_id, decision, approver_email }
      // here when a lead taps a native Approve/Reject button.
      callback_path: '/api/internal/reimbursement-approval'
    }
  } as const;

  // Only above-threshold pushes carry a link — those are settled by signing on
  // the web page. Below threshold, leads approve with native Slack buttons and
  // there is intentionally NO external link.
  const cta = reimbursement.requires_signature
    ? { cta_label: 'Review & sign', cta_url: approveUrl }
    : {};

  try {
    await sendSlackbotNotification({ ...basePayload, ...cta, type: 'reimbursement_approval' });
  } catch (error) {
    console.error('Reimbursement Slack push (typed) failed, retrying as manual_message:', error);
    // Fallback only matters if the bot can't render native buttons for the typed
    // event; in that degraded case include the link so the lead can still act.
    try {
      await sendSlackbotNotification({
        ...basePayload,
        cta_label: reimbursement.requires_signature ? 'Review & sign' : 'Review reimbursement',
        cta_url: approveUrl,
        type: 'manual_message'
      });
    } catch (innerError) {
      console.error('Reimbursement Slack push fallback failed:', innerError);
    }
  }
}

// Verify a drawn signature on the public approval link against the enrolled
// signature profile of any active lead of the reimbursement's team. Returns the
// matched lead and score, or throws a user-facing error.
export async function verifyReimbursementSignature(
  reimbursement: ReimbursementRow,
  rawStrokes: unknown
): Promise<{ leadUserId: string; score: number; threshold: number }> {
  const features = extractSignatureFeatures(parseStrokes(rawStrokes));
  if (!features) {
    throw new Error('That signature was too brief to verify — please sign again.');
  }

  const leads = await getActiveTeamLeads(reimbursement.team_id);
  if (leads.length === 0) {
    throw new Error('This team has no active lead to approve the reimbursement.');
  }

  const admin = createAdminClient();
  const { data: profiles } = await admin
    .from('signature_profiles')
    .select('user_id, profile')
    .in(
      'user_id',
      leads.map((l) => l.userId)
    );

  if (!profiles || profiles.length === 0) {
    throw new Error(
      'No team lead has enrolled a signature yet. A lead must enroll one in Personal settings (or approve from the portal) before this can be signed.'
    );
  }

  let best: { leadUserId: string; score: number; threshold: number } | null = null;
  for (const row of profiles) {
    const result = verifySignature(row.profile as SignatureProfile, features);
    if (result.ok && (!best || result.score < best.score)) {
      best = { leadUserId: row.user_id, score: result.score, threshold: result.threshold };
    }
  }

  if (!best) {
    throw new Error(
      "Signature didn't match an enrolled team lead. Sign again, or have your lead approve from the portal."
    );
  }

  return best;
}

// Records the lead's decision and, on approval, writes the purchase into the
// team's budget ledger. Idempotent: a second decision on a settled row throws.
export async function finalizeReimbursementDecision(opts: {
  reimbursement: ReimbursementRow;
  decision: 'approved' | 'rejected';
  deciderProfileId: string | null;
  approvalKind: 'button' | 'signature';
  signatureScore?: number | null;
  signatureThreshold?: number | null;
  source: string;
}): Promise<{ purchaseLogId: string | null }> {
  const { reimbursement, decision } = opts;
  const admin = createAdminClient();

  if (reimbursement.status !== 'pending') {
    if (reimbursement.status === decision) {
      return { purchaseLogId: reimbursement.locked_purchase_log_id };
    }
    throw new Error(`This reimbursement was already ${reimbursement.status}.`);
  }

  let purchaseLogId: string | null = null;

  if (decision === 'approved') {
    // Attribute the ledger entry to the decider, or fall back to the first
    // active lead so created_by (NOT NULL) is always satisfied.
    let creatorId = opts.deciderProfileId;
    if (!creatorId) {
      const leads = await getActiveTeamLeads(reimbursement.team_id);
      creatorId = leads[0]?.userId ?? null;
    }
    if (!creatorId) {
      throw new Error('No team lead is available to record this purchase.');
    }

    purchaseLogId = crypto.randomUUID();
    const { error: insertError } = await admin.from('purchase_logs').insert({
      id: purchaseLogId,
      team_id: reimbursement.team_id,
      expense_type: 'team',
      created_by: creatorId,
      academic_year: reimbursement.academic_year,
      amount_cents: reimbursement.amount_cents,
      description: `${reimbursement.item_name} (${reimbursement.reimbursement_number})`,
      person_name: reimbursement.submitter_name,
      purchased_at: reimbursement.created_at,
      payment_method: 'reimbursement',
      category: detectPurchaseCategory(reimbursement.item_name),
      receipt_path: reimbursement.receipt_path,
      receipt_file_name: reimbursement.receipt_file_name,
      receipt_uploaded_at: reimbursement.receipt_path ? reimbursement.created_at : null,
      receipt_not_needed: !reimbursement.receipt_path
    });
    if (insertError) {
      throw new Error(insertError.message);
    }
  }

  const { error: updateError } = await admin
    .from('member_reimbursements')
    .update({
      status: decision,
      approval_kind: opts.approvalKind,
      decided_by_profile_id: opts.deciderProfileId,
      decided_at: new Date().toISOString(),
      signature_score: opts.signatureScore ?? null,
      signature_threshold: opts.signatureThreshold ?? null,
      locked_purchase_log_id: purchaseLogId
    })
    .eq('id', reimbursement.id)
    .eq('status', 'pending');

  if (updateError) {
    // Roll back the ledger row if the decision write lost a race.
    if (purchaseLogId) {
      await admin.from('purchase_logs').delete().eq('id', purchaseLogId);
    }
    throw new Error(updateError.message);
  }

  await recordAuditEvent({
    actorId: opts.deciderProfileId,
    action: `reimbursement.${decision}`,
    targetType: 'member_reimbursement',
    targetId: reimbursement.id,
    summary: `${decision === 'approved' ? 'Approved' : 'Rejected'} ${reimbursement.submitter_name}'s ${reimbursement.reimbursement_number} reimbursement (${opts.approvalKind}, ${opts.source}).`,
    details: {
      decision,
      approvalKind: opts.approvalKind,
      source: opts.source,
      amountCents: reimbursement.amount_cents,
      purchaseLogId
    }
  });

  // Push the outcome to the Slack bot so it can edit the leads' DMs to
  // "Approved/Rejected by …" — covers every path (Slack button, sign link, and
  // in-portal), so the bot doesn't have to poll. Best-effort and non-blocking.
  await notifyReimbursementDecided(reimbursement, decision, opts.deciderProfileId, opts.approvalKind);

  return { purchaseLogId };
}

// Fire-and-forget "decision recorded" event to the Slack bot. The bot looks up
// the messages it posted for metadata.reimbursement_id and edits them all.
async function notifyReimbursementDecided(
  reimbursement: ReimbursementRow,
  decision: 'approved' | 'rejected',
  deciderProfileId: string | null,
  approvalKind: 'button' | 'signature'
) {
  try {
    const admin = createAdminClient();
    let decidedByName: string | null = null;
    if (deciderProfileId) {
      const { data } = await admin
        .from('profiles')
        .select('full_name')
        .eq('id', deciderProfileId)
        .maybeSingle();
      decidedByName = data?.full_name ?? null;
    }

    const leads = await getActiveTeamLeads(reimbursement.team_id);
    const emails = leads.map((l) => (l.email || '').toLowerCase()).filter(Boolean);

    await sendSlackbotNotification({
      idempotency_key: `reimbursement_decided:${reimbursement.id}:${decision}`,
      type: 'reimbursement_decided',
      team_id: SLACKBOT_SYSTEM_TEAM_ID,
      team_name: SLACKBOT_SYSTEM_TEAM_NAME,
      recipient_emails: emails,
      title: 'Reimbursement decided',
      message: `${decidedByName || 'A team lead'} ${decision} ${reimbursement.submitter_name}'s ${reimbursement.reimbursement_number} reimbursement.`,
      metadata: {
        reimbursement_id: reimbursement.id,
        team_id: reimbursement.team_id,
        decision,
        decided_by_name: decidedByName,
        approval_kind: approvalKind
      }
    });
  } catch (error) {
    console.error('Reimbursement decided push failed:', error);
  }
}

export async function getReimbursementByToken(token: string): Promise<ReimbursementRow | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('member_reimbursements')
    .select('*')
    .eq('decision_token', token)
    .maybeSingle();
  return (data as ReimbursementRow | null) ?? null;
}

export async function getReimbursementById(id: string): Promise<ReimbursementRow | null> {
  const admin = createAdminClient();
  const { data } = await admin.from('member_reimbursements').select('*').eq('id', id).maybeSingle();
  return (data as ReimbursementRow | null) ?? null;
}

export async function getCurrentAcademicYearSafe() {
  try {
    return await getCurrentAcademicYear();
  } catch {
    return '2025-26';
  }
}
