import { env } from '@/lib/env';

const SLACKBOT_SYSTEM_TEAM_ID = '00000000-0000-0000-0000-000000000000';
const SLACKBOT_SYSTEM_TEAM_NAME = 'SSR HQ';

type SlackbotNotifyPayload = {
  idempotency_key: string;
  type: 'manual_message' | 'receipt_reminder' | 'report_reminder' | 'task_assigned' | 'invite_reminder';
  team_id: string;
  team_name: string;
  recipient_emails: string[];
  title: string;
  message: string;
  cta_label?: string;
  cta_url?: string;
  metadata?: Record<string, unknown>;
};

type SlackbotNotifyResponse = {
  ok: boolean;
  error?: string;
  delivered?: number;
  failed?: number;
  results?: Array<{
    email: string;
    ok: boolean;
    slack_user_id?: string;
  }>;
};

export function getSlackbotFallbackContext() {
  return {
    teamId: SLACKBOT_SYSTEM_TEAM_ID,
    teamName: SLACKBOT_SYSTEM_TEAM_NAME
  };
}

export async function sendSlackbotNotification(payload: SlackbotNotifyPayload) {
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

    if (!data?.ok) {
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
