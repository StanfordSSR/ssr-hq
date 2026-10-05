import { env } from '@/lib/env';

export const SLACKBOT_SYSTEM_TEAM_ID = '00000000-0000-0000-0000-000000000000';
export const SLACKBOT_SYSTEM_TEAM_NAME = 'SSR HQ';

type SlackbotNotifyPayload = {
  idempotency_key: string;
  type:
    | 'manual_message'
    | 'receipt_reminder'
    | 'report_reminder'
    | 'task_assigned'
    | 'invite_reminder'
    | 'budget_approval'
    | 'reimbursement_approval'
    | 'reimbursement_decided';
  team_id: string;
  team_name: string;
  recipient_emails: string[];
  title: string;
  message: string;
  cta_label?: string;
  cta_url?: string;
  metadata?: Record<string, unknown>;
};

export type SlackbotNotifyResponse = {
  ok: boolean;
  error?: string;
  delivered?: number;
  failed?: number;
  idempotency_key?: string;
  type?: string;
  results?: Array<{
    email: string;
    ok: boolean;
    slack_user_id?: string;
    error?: string;
  }>;
};

export function getSlackbotFallbackContext() {
  return {
    teamId: SLACKBOT_SYSTEM_TEAM_ID,
    teamName: SLACKBOT_SYSTEM_TEAM_NAME
  };
}

export async function sendSlackbotNotification(payload: SlackbotNotifyPayload, options?: { allowFailedAck?: boolean }) {
  if (!env.slackbotNotifyUrl) {
    throw new Error('Missing environment variable: SSR_SLACKBOT_NOTIFY_URL');
  }

  if (!env.slackbotNotifySecret) {
    throw new Error('Missing environment variable: SSR_SLACKBOT_NOTIFY_SECRET');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(env.slackbotNotifyUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.slackbotNotifySecret}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    const data = (await response.json().catch(() => null)) as SlackbotNotifyResponse | null;

    if (!response.ok) {
      throw new Error(data?.error || `Slackbot notify failed with status ${response.status}.`);
    }

    if (!data) {
      throw new Error('Slackbot returned no delivery acknowledgement.');
    }
    if (!data.ok && !options?.allowFailedAck) {
      throw new Error(data?.error || 'Slackbot notify failed.');
    }

    return data;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Slack push timed out after 10 seconds.');
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getSlackbotNotificationStatus(key: string): Promise<{
  found: boolean;
  status?: 'processing' | 'completed' | 'failed';
  response_payload?: unknown;
}> {
  if (!env.slackbotNotifyUrl || !env.slackbotNotifySecret) {
    throw new Error('Slackbot notification service is not configured.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const url = new URL(env.slackbotNotifyUrl);
    url.searchParams.set('idempotency_key', key);
    const response = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${env.slackbotNotifySecret}` },
      cache: 'no-store',
      signal: controller.signal
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok || typeof data.found !== 'boolean') {
      throw new Error(data?.error || `Slackbot status lookup failed with status ${response.status}.`);
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}
