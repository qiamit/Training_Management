-- Allow trainees listed on a request to read their own assigned trainings.
DROP POLICY IF EXISTS training_requests_select ON public.training_requests;
CREATE POLICY training_requests_select ON public.training_requests
  FOR SELECT TO authenticated
  USING (
    private.is_qi_staff()
    OR (org_id = private.my_org_id())
    OR (requested_by = auth.uid())
    OR (auth.uid() = ANY (employee_ids))
  );
