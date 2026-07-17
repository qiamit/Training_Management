-- Allow QI staff to update organizations (company settings + tenant status)
drop policy if exists orgs_update on public.organizations;

create policy orgs_update on public.organizations
  for update to authenticated
  using (
    private.is_super_admin()
    or private.is_qi_staff()
    or (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role = 'org_admin'
          and p.approval_status = 'approved'
          and p.org_id = organizations.id
      )
    )
  )
  with check (
    private.is_super_admin()
    or private.is_qi_staff()
    or (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role = 'org_admin'
          and p.approval_status = 'approved'
          and p.org_id = organizations.id
      )
    )
  );
