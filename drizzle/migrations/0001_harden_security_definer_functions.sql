-- Restrict SECURITY DEFINER helpers so signed-in callers can only ask about themselves.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL
     AND _user_id = auth.uid()
     AND EXISTS (
       SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
     )
$function$;

CREATE OR REPLACE FUNCTION public.is_project_participant(_project_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL
     AND _user_id = auth.uid()
     AND (
       EXISTS (SELECT 1 FROM public.projects p WHERE p.id = _project_id AND p.owner_id = _user_id)
       OR EXISTS (
         SELECT 1 FROM public.project_members pm
         WHERE pm.project_id = _project_id AND pm.user_id = _user_id AND pm.status = 'accepted'
       )
     )
$function$;

REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_project_participant(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.poll_results(uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.profiles_basic(uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.search_students(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_project_participant(uuid, uuid) TO authenticated;
