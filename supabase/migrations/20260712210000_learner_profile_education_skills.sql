alter table public.profiles
  add column if not exists address text,
  add column if not exists state text,
  add column if not exists pin_code text;

create table if not exists public.learner_educations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  institution text not null,
  degree text not null,
  field_of_study text not null default '',
  start_year text,
  end_year text,
  grade text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists learner_educations_user_id_idx
  on public.learner_educations (user_id);

create table if not exists public.learner_skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  skill_name text not null,
  proficiency text not null default 'intermediate',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists learner_skills_user_id_idx
  on public.learner_skills (user_id);

alter table public.learner_educations enable row level security;
alter table public.learner_skills enable row level security;

drop policy if exists learner_educations_select on public.learner_educations;
create policy learner_educations_select on public.learner_educations
  for select to authenticated
  using (user_id = auth.uid() or private.is_qi_staff());

drop policy if exists learner_educations_insert on public.learner_educations;
create policy learner_educations_insert on public.learner_educations
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists learner_educations_update on public.learner_educations;
create policy learner_educations_update on public.learner_educations
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists learner_educations_delete on public.learner_educations;
create policy learner_educations_delete on public.learner_educations
  for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists learner_skills_select on public.learner_skills;
create policy learner_skills_select on public.learner_skills
  for select to authenticated
  using (user_id = auth.uid() or private.is_qi_staff());

drop policy if exists learner_skills_insert on public.learner_skills;
create policy learner_skills_insert on public.learner_skills
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists learner_skills_update on public.learner_skills;
create policy learner_skills_update on public.learner_skills
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists learner_skills_delete on public.learner_skills;
create policy learner_skills_delete on public.learner_skills
  for delete to authenticated
  using (user_id = auth.uid());
