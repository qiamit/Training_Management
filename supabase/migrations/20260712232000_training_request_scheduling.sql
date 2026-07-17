-- Scheduling fields for Assign Programmes workflow
alter table public.training_requests
  add column if not exists trainer_id uuid references public.profiles (id) on delete set null,
  add column if not exists training_date date,
  add column if not exists session_id uuid references public.training_sessions (id) on delete set null,
  add column if not exists invitation_sent_at timestamptz;

create index if not exists training_requests_trainer_id_idx
  on public.training_requests (trainer_id);

create index if not exists training_requests_session_id_idx
  on public.training_requests (session_id);
