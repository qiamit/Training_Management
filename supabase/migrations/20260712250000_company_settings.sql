-- Platform company settings (AI, letterhead, bank, theme)
create table if not exists public.company_settings (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  ai_enabled boolean not null default false,
  ai_provider text,
  ai_model text,
  ai_api_key text,
  ai_system_prompt text,
  letterhead_company_name text,
  letterhead_tagline text,
  letterhead_header text,
  letterhead_footer text,
  letterhead_logo_url text,
  letterhead_show_gst boolean not null default true,
  bank_name text,
  bank_account_name text,
  bank_account_number text,
  bank_ifsc text,
  bank_branch text,
  bank_upi_id text,
  theme_primary_color text default '#4f46e5',
  theme_accent_color text default '#0f172a',
  theme_mode text not null default 'light',
  theme_sidebar_style text default 'dark',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.company_settings enable row level security;

drop policy if exists company_settings_select on public.company_settings;
create policy company_settings_select on public.company_settings
  for select to authenticated
  using (private.is_qi_staff());

drop policy if exists company_settings_insert on public.company_settings;
create policy company_settings_insert on public.company_settings
  for insert to authenticated
  with check (private.is_qi_staff());

drop policy if exists company_settings_update on public.company_settings;
create policy company_settings_update on public.company_settings
  for update to authenticated
  using (private.is_qi_staff())
  with check (private.is_qi_staff());

drop policy if exists company_settings_delete on public.company_settings;
create policy company_settings_delete on public.company_settings
  for delete to authenticated
  using (private.is_super_admin());

insert into public.company_settings (org_id)
select id from public.organizations where type = 'platform'
on conflict (org_id) do nothing;
