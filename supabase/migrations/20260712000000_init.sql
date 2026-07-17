-- Quality International Training Platform — initial schema
-- Roles: super_admin, trainer, employee, org_admin, org_employee, individual

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.app_role as enum (
  'super_admin',
  'trainer',
  'employee',
  'org_admin',
  'org_employee',
  'individual'
);

create type public.approval_status as enum ('pending', 'approved', 'rejected');

create type public.org_type as enum ('platform', 'tenant', 'independent');

create type public.programme_status as enum ('draft', 'published', 'archived');

create type public.session_status as enum ('scheduled', 'in_progress', 'completed', 'cancelled');

create type public.enrollment_status as enum ('enrolled', 'attended', 'completed', 'dropped');

create type public.invoice_status as enum ('draft', 'sent', 'paid', 'void');

-- ---------------------------------------------------------------------------
-- Organizations
-- ---------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type public.org_type not null default 'tenant',
  industry text,
  employee_count text,
  iso_accreditations text[] not null default '{}',
  city text,
  country text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index organizations_platform_unique
  on public.organizations ((true))
  where type = 'platform';

create unique index organizations_independent_unique
  on public.organizations ((true))
  where type = 'independent';

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  org_id uuid references public.organizations (id) on delete set null,
  full_name text not null default '',
  role public.app_role not null default 'individual',
  approval_status public.approval_status not null default 'pending',
  is_active boolean not null default true,
  designation text,
  mobile text,
  city text,
  country text,
  occupation text,
  qualification text,
  date_of_birth text,
  industry text,
  employee_count text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_org_id_idx on public.profiles (org_id);
create index profiles_role_idx on public.profiles (role);
create index profiles_approval_idx on public.profiles (approval_status);

-- ---------------------------------------------------------------------------
-- Bootstrap emails (seeded; used by signup trigger)
-- ---------------------------------------------------------------------------
create table public.bootstrap_super_admins (
  email text primary key
);

insert into public.bootstrap_super_admins (email)
values ('amitrajput183@gmail.com');

-- ---------------------------------------------------------------------------
-- Org invites (org_admin invites org_employee)
-- ---------------------------------------------------------------------------
create table public.org_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  email text not null,
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  invited_by uuid references public.profiles (id) on delete set null,
  accepted_at timestamptz,
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now()
);

create index org_invites_org_id_idx on public.org_invites (org_id);
create index org_invites_token_idx on public.org_invites (token);

-- ---------------------------------------------------------------------------
-- Training domain
-- ---------------------------------------------------------------------------
create table public.training_programmes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  status public.programme_status not null default 'draft',
  duration_hours numeric(6, 1),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.training_sessions (
  id uuid primary key default gen_random_uuid(),
  programme_id uuid not null references public.training_programmes (id) on delete cascade,
  title text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  location text,
  status public.session_status not null default 'scheduled',
  org_id uuid references public.organizations (id) on delete set null,
  trainer_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.training_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status public.enrollment_status not null default 'enrolled',
  created_at timestamptz not null default now(),
  unique (session_id, user_id)
);

create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.training_sessions (id) on delete cascade,
  title text not null,
  passing_score integer not null default 70,
  created_at timestamptz not null default now()
);

create table public.assessment_attempts (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  score integer,
  passed boolean,
  submitted_at timestamptz not null default now(),
  unique (assessment_id, user_id)
);

create table public.certificates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  programme_id uuid references public.training_programmes (id) on delete set null,
  session_id uuid references public.training_sessions (id) on delete set null,
  title text not null,
  issued_at timestamptz not null default now(),
  storage_path text,
  created_at timestamptz not null default now()
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations (id) on delete set null,
  invoice_number text not null,
  amount_cents integer not null default 0,
  currency text not null default 'INR',
  status public.invoice_status not null default 'draft',
  issued_at timestamptz,
  due_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Helper functions (private schema for security definer)
-- ---------------------------------------------------------------------------
create schema if not exists private;

create or replace function private.current_profile()
returns public.profiles
language sql
stable
security definer
set search_path = public
as $$
  select * from public.profiles where id = auth.uid();
$$;

create or replace function private.is_qi_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.approval_status = 'approved'
      and p.is_active = true
      and p.role in ('super_admin', 'trainer', 'employee')
  );
$$;

create or replace function private.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.approval_status = 'approved'
      and p.is_active = true
      and p.role = 'super_admin'
  );
$$;

create or replace function private.my_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from public.profiles where id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Signup trigger: create profile + org from auth metadata
-- ---------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_portal text := coalesce(new.raw_user_meta_data->>'portal', 'individual');
  v_full_name text := coalesce(new.raw_user_meta_data->>'full_name', '');
  v_email text := lower(coalesce(new.email, ''));
  v_org_name text := coalesce(new.raw_user_meta_data->>'organization_name', '');
  v_invite_token text := coalesce(new.raw_user_meta_data->>'invite_token', '');
  v_role public.app_role;
  v_status public.approval_status;
  v_org_id uuid;
  v_invite public.org_invites%rowtype;
  v_platform_org uuid;
  v_independent_org uuid;
begin
  -- Ensure platform + independent orgs exist
  select id into v_platform_org from public.organizations where type = 'platform' limit 1;
  if v_platform_org is null then
    insert into public.organizations (name, type)
    values ('Quality International', 'platform')
    returning id into v_platform_org;
  end if;

  select id into v_independent_org from public.organizations where type = 'independent' limit 1;
  if v_independent_org is null then
    insert into public.organizations (name, type)
    values ('Independent Learners', 'independent')
    returning id into v_independent_org;
  end if;

  -- Bootstrap super admin
  if exists (select 1 from public.bootstrap_super_admins b where lower(b.email) = v_email) then
    insert into public.profiles (
      id, org_id, full_name, role, approval_status, email,
      designation, mobile, city, country
    ) values (
      new.id, v_platform_org, v_full_name, 'super_admin', 'approved', v_email,
      new.raw_user_meta_data->>'designation',
      new.raw_user_meta_data->>'mobile',
      new.raw_user_meta_data->>'city',
      new.raw_user_meta_data->>'country'
    );
    return new;
  end if;

  -- Org employee via invite
  if v_invite_token <> '' then
    select * into v_invite
    from public.org_invites
    where token = v_invite_token
      and accepted_at is null
      and expires_at > now()
    limit 1;

    if v_invite.id is null then
      raise exception 'Invalid or expired organization invite';
    end if;

    insert into public.profiles (
      id, org_id, full_name, role, approval_status, email,
      designation, mobile, city, country
    ) values (
      new.id, v_invite.org_id, v_full_name, 'org_employee', 'approved', v_email,
      new.raw_user_meta_data->>'designation',
      new.raw_user_meta_data->>'mobile',
      new.raw_user_meta_data->>'city',
      new.raw_user_meta_data->>'country'
    );

    update public.org_invites
    set accepted_at = now()
    where id = v_invite.id;

    return new;
  end if;

  if v_portal = 'quality-international' then
    v_role := 'employee';
    v_status := 'pending';
    v_org_id := v_platform_org;
  elsif v_portal = 'organization' then
    v_role := 'org_admin';
    v_status := 'approved';
    insert into public.organizations (name, type, industry, employee_count, city, country)
    values (
      coalesce(nullif(v_org_name, ''), 'Organization - ' || split_part(v_email, '@', 2)),
      'tenant',
      new.raw_user_meta_data->>'industry',
      new.raw_user_meta_data->>'employee_count',
      new.raw_user_meta_data->>'city',
      new.raw_user_meta_data->>'country'
    )
    returning id into v_org_id;
  else
    v_role := 'individual';
    v_status := 'approved';
    v_org_id := v_independent_org;
  end if;

  insert into public.profiles (
    id, org_id, full_name, role, approval_status, email,
    designation, mobile, city, country, occupation, qualification,
    date_of_birth, industry, employee_count
  ) values (
    new.id, v_org_id, v_full_name, v_role, v_status, v_email,
    new.raw_user_meta_data->>'designation',
    new.raw_user_meta_data->>'mobile',
    new.raw_user_meta_data->>'city',
    new.raw_user_meta_data->>'country',
    new.raw_user_meta_data->>'occupation',
    new.raw_user_meta_data->>'qualification',
    new.raw_user_meta_data->>'date_of_birth',
    new.raw_user_meta_data->>'industry',
    new.raw_user_meta_data->>'employee_count'
  );

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger organizations_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

create trigger programmes_updated_at
  before update on public.training_programmes
  for each row execute function public.set_updated_at();

create trigger sessions_updated_at
  before update on public.training_sessions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.bootstrap_super_admins enable row level security;
alter table public.org_invites enable row level security;
alter table public.training_programmes enable row level security;
alter table public.training_sessions enable row level security;
alter table public.enrollments enable row level security;
alter table public.assessments enable row level security;
alter table public.assessment_attempts enable row level security;
alter table public.certificates enable row level security;
alter table public.invoices enable row level security;

-- bootstrap_super_admins: no client access
-- (no policies = deny for anon/authenticated)

-- Organizations
create policy orgs_select on public.organizations
  for select to authenticated
  using (
    private.is_qi_staff()
    or id = private.my_org_id()
  );

create policy orgs_insert on public.organizations
  for insert to authenticated
  with check (private.is_super_admin() or private.is_qi_staff());

create policy orgs_update on public.organizations
  for update to authenticated
  using (
    private.is_super_admin()
    or (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role = 'org_admin'
          and p.approval_status = 'approved'
          and p.org_id = organizations.id
      )
    )
  );

create policy orgs_delete on public.organizations
  for delete to authenticated
  using (private.is_super_admin());

-- Profiles
create or replace function private.is_org_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'org_admin'
      and p.approval_status = 'approved'
      and p.is_active = true
  );
$$;

create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or private.is_qi_staff()
    or (private.is_org_admin() and org_id = private.my_org_id())
  );

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid() or private.is_super_admin())
  with check (id = auth.uid() or private.is_super_admin());

-- Prevent privilege escalation via self-service profile updates
create or replace function private.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Allow SQL editor / service role (no JWT) to change privileges
  if auth.uid() is null then
    return new;
  end if;

  if not private.is_super_admin() then
    new.role := old.role;
    new.approval_status := old.approval_status;
    new.is_active := old.is_active;
    new.org_id := old.org_id;
  end if;
  return new;
end;
$$;

create trigger protect_profile_privileges
  before update on public.profiles
  for each row execute function private.protect_profile_privileges();

-- Org invites
create policy invites_select on public.org_invites
  for select to authenticated
  using (
    private.is_qi_staff()
    or org_id = private.my_org_id()
  );

create policy invites_insert on public.org_invites
  for insert to authenticated
  with check (
    org_id = private.my_org_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'org_admin'
        and p.approval_status = 'approved'
    )
  );

create policy invites_update on public.org_invites
  for update to authenticated
  using (
    private.is_qi_staff()
    or org_id = private.my_org_id()
  );

-- Training programmes
create policy programmes_select on public.training_programmes
  for select to authenticated
  using (
    status = 'published'
    or private.is_qi_staff()
  );

create policy programmes_write on public.training_programmes
  for all to authenticated
  using (private.is_qi_staff())
  with check (private.is_qi_staff());

-- Sessions
create policy sessions_select on public.training_sessions
  for select to authenticated
  using (
    private.is_qi_staff()
    or org_id = private.my_org_id()
    or org_id is null
    or exists (
      select 1 from public.enrollments e
      where e.session_id = training_sessions.id
        and e.user_id = auth.uid()
    )
  );

create policy sessions_write on public.training_sessions
  for all to authenticated
  using (private.is_qi_staff())
  with check (private.is_qi_staff());

-- Enrollments
create policy enrollments_select on public.enrollments
  for select to authenticated
  using (
    user_id = auth.uid()
    or private.is_qi_staff()
    or exists (
      select 1 from public.profiles p
      where p.id = enrollments.user_id
        and p.org_id = private.my_org_id()
        and exists (
          select 1 from public.profiles me
          where me.id = auth.uid() and me.role = 'org_admin'
        )
    )
  );

create policy enrollments_insert on public.enrollments
  for insert to authenticated
  with check (
    user_id = auth.uid()
    or private.is_qi_staff()
    or exists (
      select 1 from public.profiles p
      where p.id = enrollments.user_id
        and p.org_id = private.my_org_id()
        and exists (
          select 1 from public.profiles me
          where me.id = auth.uid()
            and me.role = 'org_admin'
            and me.approval_status = 'approved'
        )
    )
  );

create policy enrollments_update on public.enrollments
  for update to authenticated
  using (private.is_qi_staff() or user_id = auth.uid());

-- Assessments
create policy assessments_select on public.assessments
  for select to authenticated
  using (
    private.is_qi_staff()
    or exists (
      select 1 from public.enrollments e
      where e.session_id = assessments.session_id
        and e.user_id = auth.uid()
    )
  );

create policy assessments_write on public.assessments
  for all to authenticated
  using (private.is_qi_staff())
  with check (private.is_qi_staff());

create policy attempts_select on public.assessment_attempts
  for select to authenticated
  using (user_id = auth.uid() or private.is_qi_staff());

create policy attempts_insert on public.assessment_attempts
  for insert to authenticated
  with check (user_id = auth.uid() or private.is_qi_staff());

create policy attempts_update on public.assessment_attempts
  for update to authenticated
  using (user_id = auth.uid() or private.is_qi_staff());

-- Certificates
create policy certificates_select on public.certificates
  for select to authenticated
  using (user_id = auth.uid() or private.is_qi_staff());

create policy certificates_write on public.certificates
  for all to authenticated
  using (private.is_qi_staff())
  with check (private.is_qi_staff());

-- Invoices
create policy invoices_select on public.invoices
  for select to authenticated
  using (
    private.is_qi_staff()
    or org_id = private.my_org_id()
  );

create policy invoices_write on public.invoices
  for all to authenticated
  using (private.is_qi_staff())
  with check (private.is_qi_staff());

-- ---------------------------------------------------------------------------
-- Storage buckets
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values
  ('certificates', 'certificates', false),
  ('org-assets', 'org-assets', false)
on conflict (id) do nothing;

create policy certificates_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'certificates'
    and (
      private.is_qi_staff()
      or (storage.foldername(name))[1] = auth.uid()::text
    )
  );

create policy certificates_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'certificates'
    and private.is_qi_staff()
  );

create policy org_assets_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'org-assets'
    and (
      private.is_qi_staff()
      or (storage.foldername(name))[1] = private.my_org_id()::text
    )
  );

create policy org_assets_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'org-assets'
    and (
      private.is_qi_staff()
      or (storage.foldername(name))[1] = private.my_org_id()::text
    )
  );

-- Seed platform orgs (idempotent)
do $$
begin
  if not exists (select 1 from public.organizations where type = 'platform') then
    insert into public.organizations (name, type)
    values ('Quality International', 'platform');
  end if;
  if not exists (select 1 from public.organizations where type = 'independent') then
    insert into public.organizations (name, type)
    values ('Independent Learners', 'independent');
  end if;
end $$;
