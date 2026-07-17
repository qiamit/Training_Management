-- Allow org admins (and self) to view/update participant payments;
-- expose platform bank details safely for payment screens.

create or replace function public.get_platform_bank_details()
returns table (
  bank_name text,
  bank_account_name text,
  bank_account_number text,
  bank_ifsc text,
  bank_branch text,
  bank_upi_id text,
  company_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    cs.bank_name,
    cs.bank_account_name,
    cs.bank_account_number,
    cs.bank_ifsc,
    cs.bank_branch,
    cs.bank_upi_id,
    cs.letterhead_company_name
  from public.company_settings cs
  inner join public.organizations o on o.id = cs.org_id
  where o.type = 'platform'
  order by cs.created_at asc
  limit 1;
$$;

revoke all on function public.get_platform_bank_details() from public;
grant execute on function public.get_platform_bank_details() to authenticated;

drop policy if exists training_participant_payments_select on public.training_participant_payments;
create policy training_participant_payments_select
  on public.training_participant_payments
  for select to authenticated
  using (
    user_id = auth.uid()
    or private.is_super_admin()
    or private.is_qi_staff()
    or (
      private.is_org_admin()
      and exists (
        select 1
        from public.training_requests tr
        where tr.id = training_request_id
          and tr.org_id = private.my_org_id()
      )
    )
  );

drop policy if exists training_participant_payments_update on public.training_participant_payments;
create policy training_participant_payments_update
  on public.training_participant_payments
  for update to authenticated
  using (
    user_id = auth.uid()
    or private.is_super_admin()
    or private.is_qi_staff()
    or (
      private.is_org_admin()
      and exists (
        select 1
        from public.training_requests tr
        where tr.id = training_request_id
          and tr.org_id = private.my_org_id()
      )
    )
  )
  with check (
    user_id = auth.uid()
    or private.is_super_admin()
    or private.is_qi_staff()
    or (
      private.is_org_admin()
      and exists (
        select 1
        from public.training_requests tr
        where tr.id = training_request_id
          and tr.org_id = private.my_org_id()
      )
    )
  );
