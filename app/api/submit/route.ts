import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { recordAuditEvent } from '@/lib/audit';
import {
  extractSubmissionFootprint,
  getActiveTeamLeads,
  getCurrentAcademicYearSafe,
  getReimbursementSettings,
  matchSubmitterToTeam,
  normalizeReimbursementNumber,
  recordSubmissionFootprint,
  sendReimbursementSlackPush,
  uploadReimbursementReceipt,
  type ReimbursementRow
} from '@/lib/reimbursements';

export const runtime = 'nodejs';

// Public, login-free reimbursement intake. Anyone with the link can submit a
// purchase on behalf of a team they belong to.
export async function POST(request: NextRequest) {
  const settings = await getReimbursementSettings();
  if (!settings.intakeEnabled) {
    return NextResponse.json(
      { error: 'Reimbursement submissions are currently closed. Check with your team lead.' },
      { status: 403 }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Could not read your submission.' }, { status: 400 });
  }

  const teamId = String(formData.get('team_id') || '').trim();
  const submitterName = String(formData.get('submitter_name') || '').trim();
  const itemName = String(formData.get('item_name') || '').trim();
  const amountRaw = String(formData.get('amount') || '').trim();
  const reimbursementNumberRaw = String(formData.get('reimbursement_number') || '').trim();
  const offCampusAck = String(formData.get('off_campus_ack') || '') === 'true';
  const receipt = formData.get('receipt');

  if (!teamId || !submitterName || !itemName || !amountRaw || !reimbursementNumberRaw) {
    return NextResponse.json({ error: 'Please fill in every field.' }, { status: 400 });
  }

  // Capture the submitter's network footprint, and require the off-campus
  // acknowledgement if we geolocate them outside the Bay Area.
  const footprint = extractSubmissionFootprint(request.headers);
  if (footprint.geo.outsideBayArea && !offCampusAck) {
    return NextResponse.json(
      {
        error:
          "We noticed you're not on campus. Please confirm you are following all relevant policy " +
          'when it comes to orders not shipped to campus.',
        requireOffCampusAck: true
      },
      { status: 422 }
    );
  }

  const amount = Number(amountRaw.replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'Enter a valid amount greater than zero.' }, { status: 400 });
  }
  const amountCents = Math.round(amount * 100);

  const reimbursementNumber = normalizeReimbursementNumber(reimbursementNumberRaw);
  if (!reimbursementNumber) {
    return NextResponse.json(
      { error: 'Enter a valid Granted reimbursement number, e.g. R-119704.' },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: team } = await admin
    .from('teams')
    .select('id, name, is_active')
    .eq('id', teamId)
    .maybeSingle();
  if (!team || !team.is_active) {
    return NextResponse.json({ error: 'Choose a valid team.' }, { status: 400 });
  }

  const match = await matchSubmitterToTeam(teamId, submitterName);
  if (!match) {
    return NextResponse.json(
      {
        error:
          `We couldn't find "${submitterName}" on ${team.name}'s roster. ` +
          'Check the spelling, or ask your team lead to add you to the roster first.'
      },
      { status: 422 }
    );
  }

  const leads = await getActiveTeamLeads(teamId);
  if (leads.length === 0) {
    return NextResponse.json(
      { error: `${team.name} has no active team lead set up to approve reimbursements yet.` },
      { status: 409 }
    );
  }

  const reimbursementId = crypto.randomUUID();
  let receiptPath: string | null = null;
  let receiptFileName: string | null = null;
  if (receipt instanceof File && receipt.size > 0) {
    try {
      const uploaded = await uploadReimbursementReceipt(reimbursementId, teamId, receipt);
      receiptPath = uploaded.path;
      receiptFileName = uploaded.fileName;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not upload the receipt.';
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  const academicYear = await getCurrentAcademicYearSafe();
  const requiresSignature = amountCents > settings.signatureThresholdCents;
  const decisionToken = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '');

  const { data: inserted, error: insertError } = await admin
    .from('member_reimbursements')
    .insert({
      id: reimbursementId,
      team_id: teamId,
      submitter_name: match.canonicalName,
      roster_member_id: match.rosterMemberId,
      matched_profile_id: match.profileId,
      item_name: itemName,
      amount_cents: amountCents,
      reimbursement_number: reimbursementNumber,
      academic_year: academicYear,
      receipt_path: receiptPath,
      receipt_file_name: receiptFileName,
      decision_token: decisionToken,
      requires_signature: requiresSignature,
      off_campus_ack: footprint.geo.outsideBayArea ? offCampusAck : false
    })
    .select('*')
    .single();

  if (insertError || !inserted) {
    if (receiptPath) {
      await admin.storage.from('purchase-receipts').remove([receiptPath]).catch(() => {});
    }
    return NextResponse.json(
      { error: insertError?.message || 'Could not save your submission. Try again.' },
      { status: 500 }
    );
  }

  await recordAuditEvent({
    actorId: match.profileId,
    action: 'reimbursement.submitted',
    targetType: 'member_reimbursement',
    targetId: reimbursementId,
    summary: `${match.canonicalName} submitted a ${reimbursementNumber} reimbursement for ${team.name}.`,
    details: {
      teamId,
      amountCents,
      requiresSignature,
      source: 'public_intake',
      offCampus: footprint.geo.outsideBayArea,
      offCampusAck: footprint.geo.outsideBayArea ? offCampusAck : null
    }
  });

  await recordSubmissionFootprint(reimbursementId, footprint);

  await sendReimbursementSlackPush(inserted as ReimbursementRow, leads, team.name);

  return NextResponse.json({
    ok: true,
    requiresSignature,
    message: requiresSignature
      ? `Submitted! Because this is over the approval threshold, your lead will need to sign to approve it.`
      : `Submitted! Your team lead has been notified to approve it.`
  });
}
