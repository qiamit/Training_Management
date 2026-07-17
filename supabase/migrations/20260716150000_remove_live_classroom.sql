-- Remove in-app Live Classroom (100ms) infrastructure.
-- External Zoom / Meet / Webex / Teams meetings remain.

-- Drop company classroom keys + related policies (cascade via drop table)
drop table if exists public.company_classroom_keys cascade;

-- Drop private HMS config helpers
drop function if exists private.hms_config_for_service();
drop function if exists private.hms_config_upsert(
  text, text, text, text, text
);
drop table if exists private.hms_config cascade;

-- Session / settings columns used only by in-app classroom
alter table public.training_sessions
  drop column if exists hms_room_id;

alter table public.company_settings
  drop column if exists meeting_in_app_enabled;

-- Normalize any legacy in_app sessions to zoom (external)
update public.training_sessions
set meeting_platform = 'zoom'
where meeting_platform = 'in_app';

update public.company_settings
set meeting_default_platform = 'zoom'
where meeting_default_platform is null
   or meeting_default_platform = 'in_app';

-- Refresh platform check if present: disallow in_app going forward
do $$
declare
  cname text;
begin
  select con.conname into cname
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'training_sessions'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%meeting_platform%';

  if cname is not null then
    execute format('alter table public.training_sessions drop constraint %I', cname);
  end if;

  alter table public.training_sessions
    add constraint training_sessions_meeting_platform_check
    check (
      meeting_platform is null
      or meeting_platform in ('zoom', 'google_meet', 'webex', 'teams', 'other')
    );
exception
  when duplicate_object then
    null;
end $$;
