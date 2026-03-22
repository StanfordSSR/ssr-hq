const required = (value: string | undefined, name: string) => {
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
};

const normalizeSiteUrl = (value: string | undefined) => {
  const raw = (value || 'http://localhost:3000').trim();
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  try {
    return new URL(withProtocol).toString().replace(/\/$/, '');
  } catch {
    throw new Error(`Invalid NEXT_PUBLIC_SITE_URL: ${raw}`);
  }
};

export const env = {
  supabaseUrl: required(process.env.NEXT_PUBLIC_SUPABASE_URL, 'NEXT_PUBLIC_SUPABASE_URL'),
  supabaseAnonKey: required(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, 'NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  siteUrl: normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL),
  cronSecret: process.env.CRON_SECRET,
  slackbotNotifyUrl: process.env.SSR_SLACKBOT_NOTIFY_URL,
  slackbotNotifySecret: process.env.SSR_SLACKBOT_NOTIFY_SECRET,
  resendApiKey: process.env.RESEND_API_KEY,
  resendSenderEmail: process.env.RESEND_SENDER_EMAIL || 'hq@stanfordssr.org',
  resendSenderName: process.env.RESEND_SENDER_NAME || 'SSR HQ'
};
