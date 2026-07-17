-- Public catalogue of upcoming / assigned trainings for the landing page.
-- Exposes only non-sensitive schedule fields (no meeting links, org private notes, or participant IDs).

create or replace function public.list_upcoming_trainings()
returns table (
  training_code text,
  title text,
  programme_title text,
  training_date date,
  status text,
  mode text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    tr.training_code,
    coalesce(nullif(btrim(tr.title), ''), p.title, 'Assigned training') as title,
    p.title as programme_title,
    coalesce(tr.training_date, tr.preferred_date) as training_date,
    initcap(replace(tr.status, '_', ' ')) as status,
    coalesce(nullif(btrim(s.mode), ''), 'online') as mode
  from public.training_requests tr
  left join public.training_programmes p on p.id = tr.programme_id
  left join public.training_sessions s on s.id = tr.session_id
  where tr.trainer_id is not null
    and lower(tr.status) not in ('cancelled', 'rejected', 'draft', 'pending')
    and (
      lower(tr.status) in ('scheduled', 'approved', 'hold', 'in_progress')
      or coalesce(tr.training_date, tr.preferred_date) >= current_date
    )
  order by
    coalesce(tr.training_date, tr.preferred_date) asc nulls last,
    tr.created_at desc
  limit 50;
$$;

revoke all on function public.list_upcoming_trainings() from public;
grant execute on function public.list_upcoming_trainings() to anon, authenticated;
