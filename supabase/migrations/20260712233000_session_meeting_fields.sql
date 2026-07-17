-- Online meeting details for training invitations
alter table public.training_sessions
  add column if not exists meeting_platform text,
  add column if not exists meeting_link text;

comment on column public.training_sessions.meeting_platform is
  'zoom | google_meet | webex | teams | other';
comment on column public.training_sessions.meeting_link is
  'Join URL for online training session';
