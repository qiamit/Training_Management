alter table public.training_programmes
  add column if not exists presentation_notes text,
  add column if not exists question_paper_notes text,
  add column if not exists answer_sheet_notes text;

create table if not exists public.programme_training_assets (
  id uuid primary key default gen_random_uuid(),
  programme_id uuid not null references public.training_programmes(id) on delete cascade,
  category text not null check (category in ('matter_files', 'presentation', 'question_paper', 'answer_sheet')),
  file_name text not null,
  file_url text not null,
  storage_path text not null,
  file_size bigint,
  mime_type text,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists programme_training_assets_programme_idx
  on public.programme_training_assets (programme_id, category);

alter table public.programme_training_assets enable row level security;

drop policy if exists programme_training_assets_select on public.programme_training_assets;
create policy programme_training_assets_select on public.programme_training_assets
  for select to authenticated
  using (private.is_qi_staff());

drop policy if exists programme_training_assets_insert on public.programme_training_assets;
create policy programme_training_assets_insert on public.programme_training_assets
  for insert to authenticated
  with check (private.is_qi_staff());

drop policy if exists programme_training_assets_delete on public.programme_training_assets;
create policy programme_training_assets_delete on public.programme_training_assets
  for delete to authenticated
  using (private.is_qi_staff());

insert into storage.buckets (id, name, public)
values ('training-assets', 'training-assets', true)
on conflict (id) do update set public = true;

drop policy if exists training_assets_select on storage.objects;
create policy training_assets_select on storage.objects
  for select to authenticated
  using (bucket_id = 'training-assets' and private.is_qi_staff());

drop policy if exists training_assets_insert on storage.objects;
create policy training_assets_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'training-assets' and private.is_qi_staff());

drop policy if exists training_assets_update on storage.objects;
create policy training_assets_update on storage.objects
  for update to authenticated
  using (bucket_id = 'training-assets' and private.is_qi_staff())
  with check (bucket_id = 'training-assets' and private.is_qi_staff());

drop policy if exists training_assets_delete on storage.objects;
create policy training_assets_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'training-assets' and private.is_qi_staff());
