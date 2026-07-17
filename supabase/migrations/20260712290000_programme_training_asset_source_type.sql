-- Source kinds for training matter assets (file / website / youtube / text)
alter table public.programme_training_assets
  add column if not exists source_type text not null default 'file'
  check (source_type in ('file', 'website', 'youtube', 'text'));

comment on column public.programme_training_assets.source_type is
  'Source kind: file upload, website link, youtube link, or pasted text';
