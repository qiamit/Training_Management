-- Trainer / staff profile: photo, education, experience, skills
alter table public.profiles
  add column if not exists photo_url text,
  add column if not exists education text,
  add column if not exists experience text,
  add column if not exists skills text;
