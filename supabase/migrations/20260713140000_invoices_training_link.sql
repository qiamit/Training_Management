-- Link invoices to training payments for auto-generation
alter table public.invoices
  add column if not exists training_request_id uuid
    references public.training_requests (id) on delete set null,
  add column if not exists user_id uuid
    references public.profiles (id) on delete set null;

create index if not exists invoices_training_request_idx
  on public.invoices (training_request_id);

create index if not exists invoices_user_idx
  on public.invoices (user_id);

-- One invoice per org training payment
create unique index if not exists invoices_org_training_unique
  on public.invoices (training_request_id, org_id)
  where training_request_id is not null and org_id is not null;

-- One invoice per individual training payment
create unique index if not exists invoices_user_training_unique
  on public.invoices (training_request_id, user_id)
  where training_request_id is not null
    and user_id is not null
    and org_id is null;

comment on column public.invoices.training_request_id is
  'Training request this invoice was generated for (auto from payment paid).';
