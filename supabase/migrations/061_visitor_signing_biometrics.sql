-- Additional signing evidence captured when an external visitor signs the
-- access agreement: the timed pen path (a behavioral biometric), the request's
-- geo location, and small client-provided device context. Used by the
-- admin/president signed-agreement viewer to show signing evidence.

alter table public.visitor_agreements
  add column if not exists participant_signature_strokes jsonb,
  add column if not exists signer_geo jsonb,
  add column if not exists signer_meta jsonb;
