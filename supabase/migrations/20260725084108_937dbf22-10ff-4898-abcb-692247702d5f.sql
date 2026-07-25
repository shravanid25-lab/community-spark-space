
REVOKE ALL ON FUNCTION public.enforce_pcu_email() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_project_participant(uuid, uuid) FROM PUBLIC, anon;
-- keep EXECUTE for authenticated: used inside RLS policies
GRANT EXECUTE ON FUNCTION public.is_project_participant(uuid, uuid) TO authenticated;
