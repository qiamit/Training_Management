-- Soft-hide training requests from QI staff/super admin without deleting them.
-- Requester (organization/individual) can still see the request in their Request Programme view.

alter table public.training_requests
  add column if not exists hidden_from_qi boolean not null default false;

comment on column public.training_requests.hidden_from_qi is
  'When true, QI staff/super admin views hide this request; requester (org/individual) still sees it.';

create index if not exists training_requests_hidden_from_qi_idx
  on public.training_requests (hidden_from_qi)
  where hidden_from_qi = false;
