import { env } from '@/lib/env';

function renderEmailFrame({
  heading,
  eyebrow,
  body,
  footer,
  ctaLabel,
  ctaUrl
}: {
  heading: string;
  eyebrow: string;
  body: string;
  footer?: string;
  ctaLabel?: string;
  ctaUrl?: string;
}) {
  return `
    <div style="background:#f5f4f2;padding:36px 16px;font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#231f20;">
      <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e7dddd;border-radius:18px;overflow:hidden;">
        <div style="padding:18px 28px;border-bottom:1px solid #efe6e6;background:linear-gradient(180deg,#fffafa 0%,#ffffff 100%);">
          <div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#8c1515;font-weight:700;">${eyebrow}</div>
          <div style="font-size:14px;color:#6d6161;margin-top:4px;">Stanford Student Robotics HQ</div>
        </div>
        <div style="padding:28px;">
          <h1 style="margin:0 0 16px;font-size:28px;line-height:1.2;font-weight:700;color:#171414;">${heading}</h1>
          <div style="font-size:16px;line-height:1.7;color:#383233;">${body}</div>
          ${
            ctaLabel && ctaUrl
              ? `<p style="margin:24px 0 0;"><a href="${ctaUrl}" style="display:inline-block;background:#8c1515;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700;">${ctaLabel}</a></p>`
              : ''
          }
          ${
            footer
              ? `<div style="margin-top:24px;padding-top:18px;border-top:1px solid #efe6e6;font-size:13px;line-height:1.6;color:#6d6161;">${footer}</div>`
              : ''
          }
        </div>
      </div>
    </div>
  `;
}

async function sendEmail({
  to,
  subject,
  text,
  html
}: {
  to: string[];
  subject: string;
  text: string;
  html: string;
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
      subject,
      text,
      html
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to send email: ${body}`);
  }
}

export async function sendTaskEmails({
  to,
  title,
  details
}: {
  to: string[];
  title: string;
  details: string;
}) {
  const subject = `SSR HQ task: ${title}`;
  const text = `A new SSR HQ task has been assigned.\n\nTitle: ${title}\n\nDetails:\n${details}\n\nOpen HQ: ${env.siteUrl}/dashboard/tasks`;
  const html = renderEmailFrame({
    eyebrow: 'SSR HQ task',
    heading: title,
    body: `<p style="margin:0 0 14px;">A new task has been assigned in SSR HQ.</p><p style="margin:0;">${details}</p>`,
    footer: 'Open the lead portal to review details and coordinate next steps with your team.',
    ctaLabel: 'Open tasks',
    ctaUrl: `${env.siteUrl}/dashboard/tasks`
  });

  await sendEmail({ to, subject, text, html });
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
  const assignmentLine = teamName
    ? `You've been added as a lead to ${teamName}.`
    : `You've been invited to SSR HQ without a team assignment yet. This is not recommended and should be updated soon.`;
  const subject = teamName ? `You've been added as a lead to ${teamName}` : 'You have been invited to SSR HQ';
  const text = `Hi ${fullName || 'there'},\n\n${assignmentLine}\n\nPlease use this link to confirm your account:\n${actionLink}\n\nOnce you have an account, you'll request a secure link every time you want to log in.\n\nSSR HQ`;
  const html = renderEmailFrame({
    eyebrow: 'SSR HQ invite',
    heading: `Welcome to SSR HQ${fullName ? `, ${fullName}` : ''}`,
    body: `<p style="margin:0 0 14px;">${assignmentLine}</p><p style="margin:0;">Once your account is created, you’ll request a secure login link each time you sign in.</p>`,
    footer: 'If you were not expecting this message, please reply to SSR HQ before using the invite link.',
    ctaLabel: 'Confirm account',
    ctaUrl: actionLink
  });

  await sendEmail({ to: [to], subject, text, html });
}

export async function sendPresidentInviteEmail({
  to,
  fullName,
  actionLink
}: {
  to: string;
  fullName: string;
  actionLink: string;
}) {
  const subject = 'You have been invited to SSR HQ as President';
  const text = `Hi ${fullName || 'there'},\n\nYou've been invited to SSR HQ as a President with read-only visibility across the portal.\n\nPlease use this link to confirm your account:\n${actionLink}\n\nOnce you have an account, you'll request a secure link every time you want to log in.\n\nSSR HQ`;
  const html = renderEmailFrame({
    eyebrow: 'SSR HQ president invite',
    heading: `Welcome to SSR HQ${fullName ? `, ${fullName}` : ''}`,
    body:
      "<p style=\"margin:0 0 14px;\">You've been invited to SSR HQ as a President.</p><p style=\"margin:0;\">This role has read-only visibility across teams, reports, finances, and members so you can stay informed without changing club data.</p>",
    footer: 'Once your account is created, you’ll request a secure login link each time you sign in.',
    ctaLabel: 'Confirm account',
    ctaUrl: actionLink
  });

  await sendEmail({ to: [to], subject, text, html });
}

export async function sendReceiptDigestEmail({
  to,
  teamName,
  items,
  uploadLink
}: {
  to: string[];
  teamName: string;
  items: Array<{
    itemName: string;
    purchasedAt: string;
    reminderDay: number;
    deadlineLabel: string;
    timeLeftLabel: string;
    daysOpen: number;
  }>;
  uploadLink: string;
}) {
  const subject = `Receipt reminders for ${teamName}`;
  const text = `SSR HQ still needs receipts for ${teamName}:\n\n${items
    .map(
      (item) =>
        `- ${item.itemName}: purchased ${item.purchasedAt}, receipt deadline ${item.deadlineLabel}, ${item.timeLeftLabel}`
    )
    .join('\n')}\n\nUpload receipts here: ${uploadLink}`;
  const body = `
    <p style="margin:0 0 14px;">SSR HQ still needs the following receipt uploads for <strong>${teamName}</strong>.</p>
    <ul style="margin:0;padding-left:20px;">
      ${items
        .map(
          (item) =>
            `<li style="margin:0 0 14px;"><strong>${item.itemName}</strong><br />Purchased ${item.purchasedAt}.<br /><span style="color:#6d6161;">Receipt deadline: ${item.deadlineLabel}. Status: ${item.timeLeftLabel}.</span></li>`
        )
        .join('')}
    </ul>
  `;
  const html = renderEmailFrame({
    eyebrow: 'Receipt reminder',
    heading: `Receipt uploads needed for ${teamName}`,
    body,
    footer:
      'Receipts for card purchases should be uploaded promptly. Missing receipts for more than two weeks may affect card access.',
    ctaLabel: 'Open expense log',
    ctaUrl: uploadLink
  });

  await sendEmail({ to, subject, text, html });
}

export async function sendReportReminderEmail({
  to,
  teamName,
  reportTitle,
  dueDateLabel,
  timeLeftLabel,
  reportLink
}: {
  to: string[];
  teamName: string;
  reportTitle: string;
  dueDateLabel: string;
  timeLeftLabel: string;
  reportLink: string;
}) {
  const subject = `${reportTitle} is due soon`;
  const text = `${teamName} still needs to submit ${reportTitle}.\n\nDue date: ${dueDateLabel}\nTime remaining: ${timeLeftLabel}\n\nOpen the report here: ${reportLink}`;
  const html = renderEmailFrame({
    eyebrow: 'Report reminder',
    heading: `${reportTitle} is still due`,
    body: `<p style="margin:0 0 14px;">${teamName} still needs to submit this report.</p><p style="margin:0 0 8px;"><strong>Due date:</strong> ${dueDateLabel}</p><p style="margin:0;"><strong>Time left:</strong> ${timeLeftLabel}</p>`,
    footer: 'If the report has already been submitted, no further action is needed.',
    ctaLabel: 'Open report',
    ctaUrl: reportLink
  });

  await sendEmail({ to, subject, text, html });
}
