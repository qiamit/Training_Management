-- Custom AI skills / prompts per platform org
create table if not exists public.company_ai_skills (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  skill_name text not null,
  skill_key text not null,
  description text not null default '',
  skill_prompt text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_ai_skills_org_key_unique unique (org_id, skill_key)
);

create index if not exists company_ai_skills_org_id_idx
  on public.company_ai_skills (org_id);

alter table public.company_ai_skills enable row level security;

drop policy if exists company_ai_skills_qi_select on public.company_ai_skills;
create policy company_ai_skills_qi_select
  on public.company_ai_skills for select to authenticated
  using (private.is_qi_staff());

drop policy if exists company_ai_skills_qi_insert on public.company_ai_skills;
create policy company_ai_skills_qi_insert
  on public.company_ai_skills for insert to authenticated
  with check (private.is_qi_staff());

drop policy if exists company_ai_skills_qi_update on public.company_ai_skills;
create policy company_ai_skills_qi_update
  on public.company_ai_skills for update to authenticated
  using (private.is_qi_staff())
  with check (private.is_qi_staff());

drop policy if exists company_ai_skills_qi_delete on public.company_ai_skills;
create policy company_ai_skills_qi_delete
  on public.company_ai_skills for delete to authenticated
  using (private.is_qi_staff());

grant select, insert, update, delete on public.company_ai_skills to authenticated;
