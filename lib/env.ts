const required = (value: string | undefined, name: string) => {
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
};

export const env = {
  supabaseUrl: required(process.env.NEXT_PUBLIC_SUPABASE_URL, 'NEXT_PUBLIC_SUPABASE_URL'),
  supabaseAnonKey: required(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, 'NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
  cronSecret: process.env.CRON_SECRET,
  resendApiKey: process.env.RESEND_API_KEY,
  resendSenderEmail: process.env.RESEND_SENDER_EMAIL || 'hq@stanfordssr.org',
  resendSenderName: process.env.RESEND_SENDER_NAME || 'SSR HQ'
};
