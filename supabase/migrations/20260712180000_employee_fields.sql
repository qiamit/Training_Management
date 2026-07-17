alter table public.profiles
  add column if not exists employee_code text,
  add column if not exists department text;

alter table public.org_invites
  add column if not exists employee_code text,
  add column if not exists designation text,
  add column if not exists department text,
  add column if not exists full_name text,
  add column if not exists mobile text;
