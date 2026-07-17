-- Org admins can edit/delete programmes they submitted (any status)
drop policy if exists programmes_org_update on public.training_programmes;
create policy programmes_org_update on public.training_programmes
  for update to authenticated
  using (
    private.is_org_admin()
    and submitted_by_org_id = private.my_org_id()
  )
  with check (
    private.is_org_admin()
    and submitted_by_org_id = private.my_org_id()
  );

drop policy if exists programmes_org_delete on public.training_programmes;
create policy programmes_org_delete on public.training_programmes
  for delete to authenticated
  using (
    private.is_org_admin()
    and submitted_by_org_id = private.my_org_id()
  );
