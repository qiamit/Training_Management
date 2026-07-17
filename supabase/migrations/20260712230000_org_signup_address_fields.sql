-- Persist GST / address fields when organization portal users are created
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_portal text := coalesce(new.raw_user_meta_data->>'portal', 'individual');
  v_full_name text := coalesce(new.raw_user_meta_data->>'full_name', '');
  v_email text := lower(coalesce(new.email, ''));
  v_org_name text := coalesce(new.raw_user_meta_data->>'organization_name', '');
  v_invite_token text := coalesce(new.raw_user_meta_data->>'invite_token', '');
  v_role public.app_role;
  v_status public.approval_status;
  v_org_id uuid;
  v_invite public.org_invites%rowtype;
  v_platform_org uuid;
  v_independent_org uuid;
begin
  select id into v_platform_org from public.organizations where type = 'platform' limit 1;
  if v_platform_org is null then
    insert into public.organizations (name, type)
    values ('Quality International', 'platform')
    returning id into v_platform_org;
  end if;

  select id into v_independent_org from public.organizations where type = 'independent' limit 1;
  if v_independent_org is null then
    insert into public.organizations (name, type)
    values ('Independent Learners', 'independent')
    returning id into v_independent_org;
  end if;

  if exists (select 1 from public.bootstrap_super_admins b where lower(b.email) = v_email) then
    insert into public.profiles (
      id, org_id, full_name, role, approval_status, email,
      designation, mobile, city, country
    ) values (
      new.id, v_platform_org, v_full_name, 'super_admin', 'approved', v_email,
      new.raw_user_meta_data->>'designation',
      new.raw_user_meta_data->>'mobile',
      new.raw_user_meta_data->>'city',
      new.raw_user_meta_data->>'country'
    );
    return new;
  end if;

  if v_invite_token <> '' then
    select * into v_invite
    from public.org_invites
    where token = v_invite_token
      and accepted_at is null
      and expires_at > now()
    limit 1;

    if v_invite.id is null then
      raise exception 'Invalid or expired organization invite';
    end if;

    insert into public.profiles (
      id, org_id, full_name, role, approval_status, email,
      designation, mobile, city, country
    ) values (
      new.id, v_invite.org_id, v_full_name, 'org_employee', 'approved', v_email,
      new.raw_user_meta_data->>'designation',
      new.raw_user_meta_data->>'mobile',
      new.raw_user_meta_data->>'city',
      new.raw_user_meta_data->>'country'
    );

    update public.org_invites
    set accepted_at = now()
    where id = v_invite.id;

    return new;
  end if;

  if v_portal = 'quality-international' then
    v_role := 'employee';
    v_status := 'pending';
    v_org_id := v_platform_org;
  elsif v_portal = 'organization' then
    v_role := 'org_admin';
    v_status := 'approved';
    insert into public.organizations (
      name, type, industry, employee_count, city, country,
      gst_number, address, pin_code, state
    )
    values (
      coalesce(nullif(v_org_name, ''), 'Organization - ' || split_part(v_email, '@', 2)),
      'tenant',
      new.raw_user_meta_data->>'industry',
      new.raw_user_meta_data->>'employee_count',
      new.raw_user_meta_data->>'city',
      new.raw_user_meta_data->>'country',
      nullif(new.raw_user_meta_data->>'gst_number', ''),
      nullif(new.raw_user_meta_data->>'address', ''),
      nullif(new.raw_user_meta_data->>'pin_code', ''),
      nullif(new.raw_user_meta_data->>'state', '')
    )
    returning id into v_org_id;
  else
    v_role := 'individual';
    v_status := 'approved';
    v_org_id := v_independent_org;
  end if;

  insert into public.profiles (
    id, org_id, full_name, role, approval_status, email,
    designation, mobile, city, country, occupation, qualification,
    date_of_birth, industry, employee_count
  ) values (
    new.id, v_org_id, v_full_name, v_role, v_status, v_email,
    new.raw_user_meta_data->>'designation',
    new.raw_user_meta_data->>'mobile',
    new.raw_user_meta_data->>'city',
    new.raw_user_meta_data->>'country',
    new.raw_user_meta_data->>'occupation',
    new.raw_user_meta_data->>'qualification',
    new.raw_user_meta_data->>'date_of_birth',
    new.raw_user_meta_data->>'industry',
    new.raw_user_meta_data->>'employee_count'
  );

  return new;
end;
$$;
