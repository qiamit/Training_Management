alter table public.training_programmes
  add column if not exists submitted_by_org_id uuid references public.organizations (id) on delete set null,
  add column if not exists submission_notes text not null default '';

create index if not exists training_programmes_submitted_by_org_idx
  on public.training_programmes (submitted_by_org_id);

drop policy if exists programmes_select on public.training_programmes;
create policy programmes_select on public.training_programmes
  for select to authenticated
  using (
    status = 'published'
    or private.is_qi_staff()
    or submitted_by_org_id = private.my_org_id()
  );

drop policy if exists programmes_write on public.training_programmes;

create policy programmes_qi_all on public.training_programmes
  for all to authenticated
  using (private.is_qi_staff())
  with check (private.is_qi_staff());

create policy programmes_org_insert on public.training_programmes
  for insert to authenticated
  with check (
    private.is_org_admin()
    and submitted_by_org_id = private.my_org_id()
    and status = 'draft'
  );

create policy programmes_org_update on public.training_programmes
  for update to authenticated
  using (
    private.is_org_admin()
    and submitted_by_org_id = private.my_org_id()
    and status = 'draft'
  )
  with check (
    private.is_org_admin()
    and submitted_by_org_id = private.my_org_id()
    and status = 'draft'
  );

create policy programmes_org_delete on public.training_programmes
  for delete to authenticated
  using (
    private.is_org_admin()
    and submitted_by_org_id = private.my_org_id()
    and status = 'draft'
  );
