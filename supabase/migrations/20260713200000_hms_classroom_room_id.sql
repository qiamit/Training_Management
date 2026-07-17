-- 100ms room id for in-app live classroom

alter table public.training_sessions
  add column if not exists hms_room_id text;

comment on column public.training_sessions.hms_room_id is
  '100ms room id created for in-app classroom sessions.';

create index if not exists training_sessions_hms_room_id_idx
  on public.training_sessions (hms_room_id)
  where hms_room_id is not null;
