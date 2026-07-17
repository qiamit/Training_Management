-- Classroom provider keys (100ms, etc.) managed from Company Setting
create table if not exists public.company_classroom_keys (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  display_name text not null,
  provider text not null default '100ms',
  access_key text not null,
  app_secret text not null,
  template_id text,
  host_role text not null default 'host',
  guest_role text not null default 'guest',
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists company_classroom_keys_org_id_idx
  on public.company_classroom_keys (org_id);

create unique index if not exists company_classroom_keys_one_active_per_org
  on public.company_classroom_keys (org_id)
  where is_active = true;

alter table public.company_classroom_keys enable row level security;

drop policy if exists company_classroom_keys_qi_select on public.company_classroom_keys;
create policy company_classroom_keys_qi_select
  on public.company_classroom_keys for select to authenticated
  using (private.is_qi_staff());

drop policy if exists company_classroom_keys_qi_insert on public.company_classroom_keys;
create policy company_classroom_keys_qi_insert
  on public.company_classroom_keys for insert to authenticated
  with check (private.is_qi_staff());

drop policy if exists company_classroom_keys_qi_update on public.company_classroom_keys;
create policy company_classroom_keys_qi_update
  on public.company_classroom_keys for update to authenticated
  using (private.is_qi_staff())
  with check (private.is_qi_staff());

drop policy if exists company_classroom_keys_qi_delete on public.company_classroom_keys;
create policy company_classroom_keys_qi_delete
  on public.company_classroom_keys for delete to authenticated
  using (private.is_qi_staff());

grant select, insert, update, delete on public.company_classroom_keys to authenticated;

comment on table public.company_classroom_keys is
  'Live classroom provider credentials (e.g. 100ms) for in-app meetings.';
