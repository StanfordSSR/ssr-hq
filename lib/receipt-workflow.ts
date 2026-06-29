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
  // Sign every receipt in a single storage call instead of one round-trip per
  // receipt — much faster for months with many receipts.
  const { data } = await admin.storage.from(RECEIPT_BUCKET).createSignedUrls(receiptPaths, 60 * 60);

  const links = new Map<string, string>();
  for (const entry of data || []) {
    if (entry.path && entry.signedUrl) {
      links.set(entry.path, entry.signedUrl);
    }
  }

  return links;
}

export async function processDueReceiptReminders() {
  return getReceiptNotificationSettings();
}
