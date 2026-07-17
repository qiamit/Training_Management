create table if not exists public.org_accreditations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  accreditation_name text not null,
  certificate_number text not null default '',
  validity_date date,
  scope text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists org_accreditations_org_id_idx
  on public.org_accreditations (org_id);

create trigger org_accreditations_updated_at
  before update on public.org_accreditations
  for each row execute function public.set_updated_at();

alter table public.org_accreditations enable row level security;

drop policy if exists org_accreditations_select on public.org_accreditations;
create policy org_accreditations_select on public.org_accreditations
  for select to authenticated
  using (
    private.is_qi_staff()
    or org_id = private.my_org_id()
  );

drop policy if exists org_accreditations_insert on public.org_accreditations;
create policy org_accreditations_insert on public.org_accreditations
  for insert to authenticated
  with check (
    private.is_qi_staff()
    or (private.is_org_admin() and org_id = private.my_org_id())
  );

drop policy if exists org_accreditations_update on public.org_accreditations;
create policy org_accreditations_update on public.org_accreditations
  for update to authenticated
  using (
    private.is_qi_staff()
    or (private.is_org_admin() and org_id = private.my_org_id())
  )
  with check (
    private.is_qi_staff()
    or (private.is_org_admin() and org_id = private.my_org_id())
  );

drop policy if exists org_accreditations_delete on public.org_accreditations;
create policy org_accreditations_delete on public.org_accreditations
  for delete to authenticated
  using (
    private.is_qi_staff()
    or (private.is_org_admin() and org_id = private.my_org_id())
  );

insert into public.org_accreditations (org_id, accreditation_name, certificate_number, scope)
select
  o.id,
  trim(both from a.accreditation_name),
  '',
  ''
from public.organizations o
cross join lateral unnest(coalesce(o.iso_accreditations, '{}'::text[])) as a(accreditation_name)
where trim(both from a.accreditation_name) <> ''
  and not exists (
    select 1
    from public.org_accreditations oa
    where oa.org_id = o.id
      and oa.accreditation_name = trim(both from a.accreditation_name)
  );
