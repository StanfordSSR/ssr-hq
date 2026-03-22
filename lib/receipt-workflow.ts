import { createAdminClient } from '@/lib/supabase-admin';
import {
  RECEIPT_BUCKET,
  normalizeReminderDays,
  type ReceiptNotificationSettings
} from '@/lib/purchases';

export async function getReceiptNotificationSettings() {
  const admin = createAdminClient();
  const { data } = await admin
    .from('receipt_notification_settings')
    .select('email_enabled, slack_enabled, reminder_days')
    .eq('id', 1)
    .maybeSingle();

  return {
    emailEnabled: data?.email_enabled ?? true,
    slackEnabled: data?.slack_enabled ?? false,
    reminderDays: normalizeReminderDays(data?.reminder_days || [3, 7])
  } satisfies ReceiptNotificationSettings;
}

export async function getReceiptLinks(paths: Array<string | null | undefined>) {
  const receiptPaths = Array.from(new Set(paths.filter((path): path is string => Boolean(path))));
  if (receiptPaths.length === 0) {
    return new Map<string, string>();
  }

  const admin = createAdminClient();
  const results = await Promise.all(
    receiptPaths.map(async (path) => {
      const { data } = await admin.storage.from(RECEIPT_BUCKET).createSignedUrl(path, 60 * 60);
      return [path, data?.signedUrl || ''] as const;
    })
  );

  return new Map(results);
}

export async function processDueReceiptReminders() {
  return getReceiptNotificationSettings();
}
