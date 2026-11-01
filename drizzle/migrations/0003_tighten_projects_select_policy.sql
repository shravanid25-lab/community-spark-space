DROP POLICY IF EXISTS "projects_select_auth" ON public.projects;
CREATE POLICY "projects_select_auth"
  ON public.projects
  FOR SELECT
  TO authenticated
  USING (
    status = 'open'
    OR public.is_project_participant(id, auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
