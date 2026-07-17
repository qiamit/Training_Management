-- Allow QI staff to update learner/org profile status fields
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid() or private.is_super_admin() or private.is_qi_staff())
  with check (id = auth.uid() or private.is_super_admin() or private.is_qi_staff());

create or replace function private.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if private.is_super_admin() or private.is_qi_staff() then
    return new;
  end if;

  new.role := old.role;
  new.approval_status := old.approval_status;
  new.is_active := old.is_active;
  new.org_id := old.org_id;
  return new;
end;
$$;
