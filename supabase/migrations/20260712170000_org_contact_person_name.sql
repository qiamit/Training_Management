alter table public.organizations
  add column if not exists contact_person_name text;
