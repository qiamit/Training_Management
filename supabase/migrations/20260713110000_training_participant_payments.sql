-- Per-participant training charges & payment tracking for assigned programmes
create table if not exists public.training_participant_payments (
  id uuid primary key default gen_random_uuid(),
  training_request_id uuid not null references public.training_requests (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount_cents integer not null default 0 check (amount_cents >= 0),
  currency text not null default 'INR',
  payment_status text not null default 'pending'
    check (payment_status in ('pending', 'link_sent', 'paid', 'waived')),
  payment_link text,
  payment_link_sent_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (training_request_id, user_id)
);

create index if not exists training_participant_payments_request_idx
  on public.training_participant_payments (training_request_id);

create index if not exists training_participant_payments_user_idx
  on public.training_participant_payments (user_id, payment_status);

alter table public.training_participant_payments enable row level security;

drop policy if exists training_participant_payments_select on public.training_participant_payments;
create policy training_participant_payments_select
  on public.training_participant_payments
  for select to authenticated
  using (user_id = auth.uid() or private.is_super_admin() or private.is_qi_staff());

drop policy if exists training_participant_payments_insert on public.training_participant_payments;
create policy training_participant_payments_insert
  on public.training_participant_payments
  for insert to authenticated
  with check (private.is_super_admin() or private.is_qi_staff());

drop policy if exists training_participant_payments_update on public.training_participant_payments;
create policy training_participant_payments_update
  on public.training_participant_payments
  for update to authenticated
  using (private.is_super_admin() or private.is_qi_staff())
  with check (private.is_super_admin() or private.is_qi_staff());

drop policy if exists training_participant_payments_delete on public.training_participant_payments;
create policy training_participant_payments_delete
  on public.training_participant_payments
  for delete to authenticated
  using (private.is_super_admin() or private.is_qi_staff());

comment on table public.training_participant_payments is
  'Training charges and payment status per participant on an assigned training request.';
