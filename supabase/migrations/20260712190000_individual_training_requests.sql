-- Allow individual / learner self-service training requests
alter table public.training_requests
  alter column org_id drop not null;

drop policy if exists training_requests_select on public.training_requests;
create policy training_requests_select on public.training_requests
  for select to authenticated
  using (
    private.is_qi_staff()
    or org_id = private.my_org_id()
    or requested_by = auth.uid()
  );

drop policy if exists training_requests_insert on public.training_requests;
create policy training_requests_insert on public.training_requests
  for insert to authenticated
  with check (
    private.is_qi_staff()
    or (org_id = private.my_org_id() and private.is_org_admin())
    or (
      requested_by = auth.uid()
      and (org_id is null or org_id = private.my_org_id())
    )
  );

drop policy if exists training_requests_update on public.training_requests;
create policy training_requests_update on public.training_requests
  for update to authenticated
  using (
    private.is_qi_staff()
    or (org_id = private.my_org_id() and private.is_org_admin())
    or requested_by = auth.uid()
  )
  with check (
    private.is_qi_staff()
    or (org_id = private.my_org_id() and private.is_org_admin())
    or requested_by = auth.uid()
  );

drop policy if exists training_requests_delete on public.training_requests;
create policy training_requests_delete on public.training_requests
  for delete to authenticated
  using (
    private.is_qi_staff()
    or (org_id = private.my_org_id() and private.is_org_admin())
    or requested_by = auth.uid()
  );
