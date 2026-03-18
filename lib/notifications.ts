import { env } from '@/lib/env';

export async function sendTaskEmails({
  to,
  title,
  details
}: {
  to: string[];
  title: string;
  details: string;
}) {
  const recipients = Array.from(new Set(to.filter(Boolean)));
  if (recipients.length === 0) {
    return;
  }

  if (!env.resendApiKey) {
    throw new Error('Missing environment variable: RESEND_API_KEY');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.resendApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: `${env.resendSenderName} <${env.resendSenderEmail}>`,
      to: recipients,
      subject: `SSR HQ task: ${title}`,
      text: `A new SSR HQ task has been assigned.\n\nTitle: ${title}\n\nDetails:\n${details}\n\nOpen HQ: ${env.siteUrl}/dashboard/tasks`
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to send task emails: ${body}`);
  }
}
