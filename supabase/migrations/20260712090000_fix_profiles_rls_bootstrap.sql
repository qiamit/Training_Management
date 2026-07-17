-- Fix recursive RLS on profiles + bootstrap email update

drop policy if exists profiles_select on public.profiles;

create or replace function private.is_org_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'org_admin'
      and p.approval_status = 'approved'
      and p.is_active = true
  );
$$;

create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or private.is_qi_staff()
    or (private.is_org_admin() and org_id = private.my_org_id())
  );

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

  if not private.is_super_admin() then
    new.role := old.role;
    new.approval_status := old.approval_status;
    new.is_active := old.is_active;
    new.org_id := old.org_id;
  end if;
  return new;
end;
$$;

delete from public.bootstrap_super_admins where lower(email) = 'qicoding1@gmail.com';
insert into public.bootstrap_super_admins (email)
values ('amitrajput183@gmail.com')
on conflict (email) do nothing;
