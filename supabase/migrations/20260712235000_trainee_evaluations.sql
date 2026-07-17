-- Structured question JSON on training assets (for online evaluations)
alter table public.programme_training_assets
  add column if not exists content_json jsonb;

create table if not exists public.trainee_evaluations (
  id uuid primary key default gen_random_uuid(),
  training_request_id uuid not null references public.training_requests (id) on delete cascade,
  session_id uuid references public.training_sessions (id) on delete set null,
  programme_id uuid references public.training_programmes (id) on delete set null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending_send'
    check (status in ('pending_send', 'link_sent', 'in_progress', 'submitted', 'evaluated')),
  questions jsonb not null default '[]'::jsonb,
  answers jsonb,
  score integer,
  max_score integer,
  passed boolean,
  evaluator_notes text,
  evaluated_by uuid references public.profiles (id) on delete set null,
  evaluated_at timestamptz,
  link_sent_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (training_request_id, user_id)
);

create index if not exists trainee_evaluations_user_id_idx
  on public.trainee_evaluations (user_id, status);
create index if not exists trainee_evaluations_request_id_idx
  on public.trainee_evaluations (training_request_id);

alter table public.trainee_evaluations enable row level security;

drop policy if exists trainee_evaluations_select on public.trainee_evaluations;
create policy trainee_evaluations_select on public.trainee_evaluations
  for select to authenticated
  using (user_id = auth.uid() or private.is_super_admin() or private.is_qi_staff());

drop policy if exists trainee_evaluations_insert on public.trainee_evaluations;
create policy trainee_evaluations_insert on public.trainee_evaluations
  for insert to authenticated
  with check (private.is_super_admin() or private.is_qi_staff());

drop policy if exists trainee_evaluations_update on public.trainee_evaluations;
create policy trainee_evaluations_update on public.trainee_evaluations
  for update to authenticated
  using (user_id = auth.uid() or private.is_super_admin() or private.is_qi_staff())
  with check (user_id = auth.uid() or private.is_super_admin() or private.is_qi_staff());

drop policy if exists trainee_evaluations_delete on public.trainee_evaluations;
create policy trainee_evaluations_delete on public.trainee_evaluations
  for delete to authenticated
  using (private.is_super_admin() or private.is_qi_staff());
