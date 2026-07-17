alter table public.trainee_evaluations
  add column if not exists effectiveness_rating text
    check (
      effectiveness_rating is null
      or effectiveness_rating in ('effective', 'partial', 'not_effective')
    ),
  add column if not exists effectiveness_notes text,
  add column if not exists effectiveness_rated_at timestamptz;
