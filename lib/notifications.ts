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

export async function sendInviteEmail({
  to,
  fullName,
  teamName,
  actionLink
}: {
  to: string;
  fullName: string;
  teamName?: string | null;
  actionLink: string;
}) {
  if (!env.resendApiKey) {
    throw new Error('Missing environment variable: RESEND_API_KEY');
  }

  const assignmentLine = teamName
    ? `You've been added as a lead to ${teamName}.`
    : `You've been invited to SSR HQ without a team assignment yet. This is not recommended and should be updated soon.`;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.resendApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: `${env.resendSenderName} <${env.resendSenderEmail}>`,
      to: [to],
      subject: teamName ? `You've been added as a lead to ${teamName}` : 'You have been invited to SSR HQ',
      text: `Hi ${fullName || 'there'},\n\n${assignmentLine}\n\nPlease use this link to confirm your account:\n${actionLink}\n\nOnce you have an account, you'll request a secure link every time you want to log in.\n\nSSR HQ`
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to send invite email: ${body}`);
  }
}
