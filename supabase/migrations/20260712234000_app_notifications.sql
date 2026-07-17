-- In-app notifications for training invitations and related alerts
create table if not exists public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  body text not null,
  link text,
  kind text not null default 'general',
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists app_notifications_user_id_created_at_idx
  on public.app_notifications (user_id, created_at desc);

alter table public.app_notifications enable row level security;

drop policy if exists app_notifications_select_own on public.app_notifications;
create policy app_notifications_select_own on public.app_notifications
  for select to authenticated
  using (user_id = auth.uid() or private.is_super_admin() or private.is_qi_staff());

drop policy if exists app_notifications_update_own on public.app_notifications;
create policy app_notifications_update_own on public.app_notifications
  for update to authenticated
  using (user_id = auth.uid() or private.is_super_admin() or private.is_qi_staff())
  with check (user_id = auth.uid() or private.is_super_admin() or private.is_qi_staff());
