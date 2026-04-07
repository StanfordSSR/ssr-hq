import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { env } from '@/lib/env';
import { recordAuditEvent } from '@/lib/audit';

export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization');

  if (auth !== `Bearer ${env.slackbotNotifySecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        announcement_id?: string;
        recipient_email?: string;
        response?: 'yes' | 'maybe' | 'no';
      }
    | null;

  const announcementId = body?.announcement_id?.trim();
  const recipientEmail = body?.recipient_email?.trim().toLowerCase();
  const response = body?.response;

  if (!announcementId || !recipientEmail || !response) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
  }

  if (response !== 'yes' && response !== 'maybe' && response !== 'no') {
    return NextResponse.json({ error: 'Invalid response.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const [{ data: announcement }, { data: delivery }] = await Promise.all([
    admin
      .from('announcements')
      .select('id, title')
      .eq('id', announcementId)
      .eq('is_active', true)
      .maybeSingle(),
    admin
      .from('announcement_deliveries')
      .select('announcement_id, recipient_email')
      .eq('announcement_id', announcementId)
      .eq('recipient_email', recipientEmail)
      .limit(1)
      .maybeSingle()
  ]);

  if (!announcement || !delivery) {
    return NextResponse.json({ error: 'Announcement delivery not found.' }, { status: 404 });
  }

  const [{ data: profile }, { data: rosterMember }] = await Promise.all([
    admin.from('profiles').select('id').eq('email', recipientEmail).maybeSingle(),
    admin.from('team_roster_members').select('id').eq('stanford_email', recipientEmail).maybeSingle()
  ]);

  const { data: existingRsvp } = await admin
    .from('announcement_recipient_rsvps')
    .select('id')
    .eq('announcement_id', announcementId)
    .eq('recipient_email', recipientEmail)
    .maybeSingle();

  const payload = {
    announcement_id: announcementId,
    profile_id: profile?.id || null,
    team_roster_member_id: rosterMember?.id || null,
    recipient_email: recipientEmail,
    response,
    responded_at: new Date().toISOString()
  };

  const { error } = existingRsvp
    ? await admin.from('announcement_recipient_rsvps').update(payload).eq('id', existingRsvp.id)
    : await admin.from('announcement_recipient_rsvps').insert(payload);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await recordAuditEvent({
    actorId: profile?.id || null,
    action: 'announcement.rsvp.updated',
    targetType: 'announcement',
    targetId: announcementId,
    summary: `${recipientEmail} RSVP’d ${response} for "${announcement.title}".`,
    details: {
      recipientEmail,
      response
    }
  });

  const { data: rows } = await admin
    .from('announcement_recipient_rsvps')
    .select('response')
    .eq('announcement_id', announcementId);

  const yes = (rows || []).filter((row) => row.response === 'yes').length;
  const maybe = (rows || []).filter((row) => row.response === 'maybe').length;
  const no = (rows || []).filter((row) => row.response === 'no').length;

  return NextResponse.json({
    ok: true,
    counts: {
      yes,
      maybe,
      no
    }
  });
}
