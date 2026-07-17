-- Multiple AI provider configs per platform org
create table if not exists public.company_ai_providers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  display_name text not null,
  provider text not null,
  model_name text not null,
  api_key text not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists company_ai_providers_org_id_idx
  on public.company_ai_providers (org_id);

create unique index if not exists company_ai_providers_one_active_per_org
  on public.company_ai_providers (org_id)
  where is_active = true;

alter table public.company_ai_providers enable row level security;

drop policy if exists company_ai_providers_qi_select on public.company_ai_providers;
create policy company_ai_providers_qi_select
  on public.company_ai_providers for select to authenticated
  using (private.is_qi_staff());

drop policy if exists company_ai_providers_qi_insert on public.company_ai_providers;
create policy company_ai_providers_qi_insert
  on public.company_ai_providers for insert to authenticated
  with check (private.is_qi_staff());

drop policy if exists company_ai_providers_qi_update on public.company_ai_providers;
create policy company_ai_providers_qi_update
  on public.company_ai_providers for update to authenticated
  using (private.is_qi_staff())
  with check (private.is_qi_staff());

drop policy if exists company_ai_providers_qi_delete on public.company_ai_providers;
create policy company_ai_providers_qi_delete
  on public.company_ai_providers for delete to authenticated
  using (private.is_qi_staff());

grant select, insert, update, delete on public.company_ai_providers to authenticated;
