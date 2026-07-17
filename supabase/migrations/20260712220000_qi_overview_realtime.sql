-- Enable realtime for QI Control Center live updates
do $$ begin
  begin alter publication supabase_realtime add table public.organizations; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.profiles; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.training_programmes; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.training_sessions; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.enrollments; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.training_requests; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.invoices; exception when duplicate_object then null; end;
end $$;
