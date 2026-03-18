import { createAdminClient } from '@/lib/supabase-admin';

export async function recordAuditEvent({
  actorId,
  action,
  targetType,
  targetId,
  summary,
  details
}: {
  actorId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  summary: string;
  details?: Record<string, unknown> | null;
}) {
  const admin = createAdminClient();
  const { error } = await admin.from('audit_log_entries').insert({
    actor_id: actorId || null,
    action,
    target_type: targetType,
    target_id: targetId || null,
    summary,
    details: details || null
  });

  if (error) {
    console.error('Failed to record audit event:', error.message);
  }
}
