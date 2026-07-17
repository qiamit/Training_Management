-- Private 100ms credentials (service_role / edge functions only)

create schema if not exists private;

create table if not exists private.hms_config (
  id int primary key default 1 check (id = 1),
  access_key text not null,
  app_secret text not null,
  template_id text,
  host_role text not null default 'host',
  guest_role text not null default 'guest',
  updated_at timestamptz not null default now()
);

revoke all on table private.hms_config from public, anon, authenticated;

create or replace function public.hms_config_for_service()
returns jsonb
language plpgsql
security definer
set search_path = private, public
as $$
declare
  row private.hms_config%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not allowed';
  end if;

  select * into row from private.hms_config where id = 1;
  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'access_key', row.access_key,
    'app_secret', row.app_secret,
    'template_id', row.template_id,
    'host_role', row.host_role,
    'guest_role', row.guest_role
  );
end;
$$;

revoke all on function public.hms_config_for_service() from public, anon, authenticated;
grant execute on function public.hms_config_for_service() to service_role;

create or replace function public.hms_config_upsert(
  access_key text default null,
  app_secret text default null,
  template_id text default null,
  host_role text default 'host',
  guest_role text default 'guest'
)
returns boolean
language plpgsql
security definer
set search_path = private, public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not allowed';
  end if;

  insert into private.hms_config (id, access_key, app_secret, template_id, host_role, guest_role)
  values (1, access_key, app_secret, template_id, host_role, guest_role)
  on conflict (id) do update set
    access_key = coalesce(excluded.access_key, private.hms_config.access_key),
    app_secret = coalesce(excluded.app_secret, private.hms_config.app_secret),
    template_id = coalesce(excluded.template_id, private.hms_config.template_id),
    host_role = coalesce(excluded.host_role, private.hms_config.host_role),
    guest_role = coalesce(excluded.guest_role, private.hms_config.guest_role),
    updated_at = now();

  return true;
end;
$$;

revoke all on function public.hms_config_upsert(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.hms_config_upsert(text, text, text, text, text) to service_role;

comment on table private.hms_config is
  '100ms credentials for live classroom. Not exposed via Data API.';
