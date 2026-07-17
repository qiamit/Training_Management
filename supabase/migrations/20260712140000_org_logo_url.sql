alter table public.organizations
  add column if not exists logo_url text;

update storage.buckets
set public = true
where id = 'org-assets';

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'org_assets_update'
  ) then
    create policy org_assets_update on storage.objects
      for update to authenticated
      using (
        bucket_id = 'org-assets'
        and (
          private.is_qi_staff()
          or (storage.foldername(name))[1] = private.my_org_id()::text
        )
      )
      with check (
        bucket_id = 'org-assets'
        and (
          private.is_qi_staff()
          or (storage.foldername(name))[1] = private.my_org_id()::text
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'org_assets_delete'
  ) then
    create policy org_assets_delete on storage.objects
      for delete to authenticated
      using (
        bucket_id = 'org-assets'
        and (
          private.is_qi_staff()
          or (storage.foldername(name))[1] = private.my_org_id()::text
        )
      );
  end if;
end $$;
