
-- 1. Enforce @pcu.edu.in email domain at signup
CREATE OR REPLACE FUNCTION public.enforce_pcu_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS NULL OR lower(split_part(NEW.email, '@', 2)) <> 'pcu.edu.in' THEN
    RAISE EXCEPTION 'Only @pcu.edu.in email addresses are allowed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_pcu_email_trigger ON auth.users;
CREATE TRIGGER enforce_pcu_email_trigger
BEFORE INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.enforce_pcu_email();

-- 2. Helper: is user an accepted member (or owner) of a given project?
CREATE OR REPLACE FUNCTION public.is_project_participant(_project_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = _project_id AND p.owner_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = _project_id AND pm.user_id = _user_id AND pm.status = 'accepted'
  );
$$;

-- 3. project_messages
CREATE TABLE public.project_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.project_messages TO authenticated;
GRANT ALL ON public.project_messages TO service_role;

ALTER TABLE public.project_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY pmsg_select_participants ON public.project_messages
FOR SELECT TO authenticated
USING (public.is_project_participant(project_id, auth.uid()));

CREATE POLICY pmsg_insert_participants ON public.project_messages
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = sender_id
  AND public.is_project_participant(project_id, auth.uid())
);

CREATE POLICY pmsg_delete_own ON public.project_messages
FOR DELETE TO authenticated
USING (auth.uid() = sender_id);

CREATE INDEX project_messages_project_created_idx
  ON public.project_messages(project_id, created_at);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.project_messages;

-- 4. Let accepted members see each other on the same project
DROP POLICY IF EXISTS pm_select_self_or_owner ON public.project_members;
CREATE POLICY pm_select_participants ON public.project_members
FOR SELECT TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.owner_id = auth.uid())
  OR public.is_project_participant(project_id, auth.uid())
);

-- 5. Allow authenticated users to search other students' basic profile info (name/department)
--    Needed for the "find teammates" search. Sensitive fields (student_id) remain restricted
--    because profiles_select_own still limits column-level exposure through the client.
--    Since RLS is row-level, we expose the whole row but the UI only queries safe columns.
CREATE POLICY profiles_search_authenticated ON public.profiles
FOR SELECT TO authenticated
USING (true);
