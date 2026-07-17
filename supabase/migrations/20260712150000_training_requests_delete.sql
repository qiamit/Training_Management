do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'training_requests'
      and policyname = 'training_requests_delete'
  ) then
    create policy training_requests_delete on public.training_requests
      for delete to authenticated
      using (
        private.is_qi_staff()
        or (org_id = private.my_org_id() and private.is_org_admin())
      );
  end if;
end $$;
