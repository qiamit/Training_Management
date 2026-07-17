-- Org signup enrichment: GST + full address
alter table public.organizations
  add column if not exists gst_number text,
  add column if not exists address text,
  add column if not exists pin_code text,
  add column if not exists state text;
