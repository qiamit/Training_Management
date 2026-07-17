alter table public.training_programmes
  add column if not exists submitted_by_user_id uuid references public.profiles (id) on delete set null;

create index if not exists training_programmes_submitted_by_user_idx
  on public.training_programmes (submitted_by_user_id);

drop policy if exists programmes_select on public.training_programmes;
create policy programmes_select on public.training_programmes
  for select to authenticated
  using (
    status = 'published'
    or private.is_qi_staff()
    or submitted_by_org_id = private.my_org_id()
    or submitted_by_user_id = auth.uid()
  );

drop policy if exists programmes_user_insert on public.training_programmes;
create policy programmes_user_insert on public.training_programmes
  for insert to authenticated
  with check (
    submitted_by_user_id = auth.uid()
    and created_by = auth.uid()
    and status = 'draft'
    and submitted_by_org_id is null
  );

drop policy if exists programmes_user_update on public.training_programmes;
create policy programmes_user_update on public.training_programmes
  for update to authenticated
  using (
    submitted_by_user_id = auth.uid()
    and status = 'draft'
  )
  with check (
    submitted_by_user_id = auth.uid()
    and status = 'draft'
  );

drop policy if exists programmes_user_delete on public.training_programmes;
create policy programmes_user_delete on public.training_programmes
  for delete to authenticated
  using (
    submitted_by_user_id = auth.uid()
    and status = 'draft'
  );
