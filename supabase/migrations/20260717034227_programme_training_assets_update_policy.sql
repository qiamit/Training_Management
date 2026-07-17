-- Allow QI staff to rename / update training matter sources
drop policy if exists programme_training_assets_update on public.programme_training_assets;
create policy programme_training_assets_update on public.programme_training_assets
  for update to authenticated
  using (private.is_qi_staff())
  with check (private.is_qi_staff());
