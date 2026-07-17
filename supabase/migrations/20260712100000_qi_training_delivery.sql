-- Local mirror of remote migration qi_training_delivery_platform
alter table public.organizations
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists status text not null default 'active',
  add column if not exists notes text;

alter table public.training_programmes
  add column if not exists category text,
  add column if not exists price_cents integer not null default 0,
  add column if not exists delivery_mode text not null default 'onsite';

alter table public.training_sessions
  add column if not exists capacity integer,
  add column if not exists mode text not null default 'onsite',
  add column if not exists notes text;

create table if not exists public.programme_assignments (
  id uuid primary key default gen_random_uuid(),
  programme_id uuid not null references public.training_programmes (id) on delete cascade,
  org_id uuid references public.organizations (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  assigned_by uuid references public.profiles (id) on delete set null,
  status text not null default 'active',
  notes text,
  assigned_at timestamptz not null default now(),
  constraint programme_assignments_target_chk check (org_id is not null or user_id is not null)
);

create table if not exists public.training_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  programme_id uuid references public.training_programmes (id) on delete set null,
  title text not null,
  message text not null default '',
  preferred_date date,
  status text not null default 'pending',
  requested_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
