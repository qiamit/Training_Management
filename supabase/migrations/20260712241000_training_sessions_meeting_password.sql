ALTER TABLE public.training_sessions
  ADD COLUMN IF NOT EXISTS meeting_password text;

COMMENT ON COLUMN public.training_sessions.meeting_password IS
  'Optional meeting passcode (Zoom/Teams/etc) shared with invited trainees.';
