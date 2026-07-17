-- Public-safe trainer profile lookup for trainees (org admins, org employees,
-- individuals) to view the profile of the trainer assigned to their training.
-- Returns only professional fields and only for QI staff / trainer roles.

create or replace function public.get_trainer_profile(p_trainer_id uuid)
returns table (
  id uuid,
  full_name text,
  designation text,
  email text,
  mobile text,
  photo_url text,
  qualification text,
  education text,
  experience text,
  skills text,
  city text,
  state text,
  country text
)
language sql
security definer
set search_path = public
as $$
  select p.id, p.full_name, p.designation, p.email, p.mobile, p.photo_url,
         p.qualification, p.education, p.experience, p.skills,
         p.city, p.state, p.country
  from public.profiles p
  where p.id = p_trainer_id
    and p.role in ('trainer', 'super_admin', 'employee');
$$;

revoke all on function public.get_trainer_profile(uuid) from public;
grant execute on function public.get_trainer_profile(uuid) to authenticated;
