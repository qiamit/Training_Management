alter table public.trainee_evaluations
  add column if not exists question_evaluations jsonb default '[]'::jsonb;

comment on column public.trainee_evaluations.question_evaluations is
  'Per-question evaluation: [{questionId, awardedMarks, feedback, isCorrect}]';
