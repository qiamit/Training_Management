-- Online Meeting settings + classroom session fields + attendance

alter table public.company_settings
  add column if not exists meeting_in_app_enabled boolean not null default false,
  add column if not exists meeting_prefer_free_external boolean not null default true,
  add column if not exists meeting_default_platform text not null default 'google_meet',
  add column if not exists meeting_mute_on_entry boolean not null default true,
  add column if not exists meeting_waiting_room boolean not null default false,
  add column if not exists meeting_allow_screen_share boolean not null default true,
  add column if not exists meeting_allow_chat boolean not null default true,
  add column if not exists meeting_recording_enabled boolean not null default false,
  add column if not exists meeting_ai_summary_enabled boolean not null default false;

alter table public.training_sessions
  add column if not exists meeting_started_at timestamptz,
  add column if not exists meeting_ended_at timestamptz,
  add column if not exists recording_url text,
  add column if not exists meeting_ai_summary text;

-- Expand meeting_platform check if present
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'training_sessions_meeting_platform_check'
  ) then
    alter table public.training_sessions
      drop constraint training_sessions_meeting_platform_check;
  end if;
exception when undefined_object then
  null;
end $$;

alter table public.training_sessions
  drop constraint if exists training_sessions_meeting_platform_check;

alter table public.training_sessions
  add constraint training_sessions_meeting_platform_check
  check (
    meeting_platform is null
    or meeting_platform in (
      'zoom',
      'google_meet',
      'webex',
      'teams',
      'other',
      'in_app'
    )
  );

create table if not exists public.training_meeting_attendance (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.training_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  role_in_room text not null default 'participant',
  created_at timestamptz not null default now(),
  unique (session_id, user_id)
);

create index if not exists training_meeting_attendance_session_idx
  on public.training_meeting_attendance (session_id);

alter table public.training_meeting_attendance enable row level security;

drop policy if exists training_meeting_attendance_select on public.training_meeting_attendance;
create policy training_meeting_attendance_select
  on public.training_meeting_attendance
  for select to authenticated
  using (
    private.is_qi_staff()
    or user_id = auth.uid()
    or exists (
      select 1
      from public.training_sessions s
      where s.id = session_id
        and (
          s.trainer_id = auth.uid()
          or (
            s.org_id is not null
            and private.is_org_admin_of(s.org_id)
          )
        )
    )
  );

drop policy if exists training_meeting_attendance_insert on public.training_meeting_attendance;
create policy training_meeting_attendance_insert
  on public.training_meeting_attendance
  for insert to authenticated
  with check (
    user_id = auth.uid()
    or private.is_qi_staff()
  );

drop policy if exists training_meeting_attendance_update on public.training_meeting_attendance;
create policy training_meeting_attendance_update
  on public.training_meeting_attendance
  for update to authenticated
  using (
    user_id = auth.uid()
    or private.is_qi_staff()
  )
  with check (
    user_id = auth.uid()
    or private.is_qi_staff()
  );
