-- Human-readable Training ID so the same programme can appear multiple times distinctly
alter table public.training_requests
  add column if not exists training_code text;

update public.training_requests
set training_code =
  'TRN-' || to_char(created_at at time zone 'utc', 'YYYYMMDD') || '-' ||
  upper(substr(replace(id::text, '-', ''), 1, 6))
where training_code is null;

alter table public.training_requests
  alter column training_code set not null;

create unique index if not exists training_requests_training_code_uidx
  on public.training_requests (training_code);

create or replace function public.generate_training_request_code()
returns trigger
language plpgsql
as $$
declare
  candidate text;
  attempts int := 0;
begin
  if new.training_code is not null and length(trim(new.training_code)) > 0 then
    return new;
  end if;

  loop
    attempts := attempts + 1;
    candidate :=
      'TRN-' || to_char(timezone('utc', now()), 'YYYYMMDD') || '-' ||
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (
      select 1 from public.training_requests tr where tr.training_code = candidate
    );
    exit when attempts >= 20;
  end loop;

  new.training_code := candidate;
  return new;
end;
$$;

drop trigger if exists training_requests_set_training_code on public.training_requests;
create trigger training_requests_set_training_code
  before insert on public.training_requests
  for each row
  execute function public.generate_training_request_code();

comment on column public.training_requests.training_code is
  'Public Training ID used to distinguish repeated assignments of the same programme.';
