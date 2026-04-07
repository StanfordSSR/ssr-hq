create unique index if not exists announcement_recipient_rsvps_exact_email_idx
on public.announcement_recipient_rsvps (announcement_id, recipient_email);
