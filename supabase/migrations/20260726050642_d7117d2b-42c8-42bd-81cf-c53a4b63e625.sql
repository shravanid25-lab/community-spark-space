-- 1. Revoke EXECUTE on internal trigger functions from app roles
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_pcu_email() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_project_participant(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_project_participant(uuid, uuid) TO authenticated;

-- 2. poll_votes: only your own vote row is readable
DROP POLICY IF EXISTS pv_select_auth ON public.poll_votes;
CREATE POLICY pv_select_own ON public.poll_votes
  FOR SELECT TO authenticated
  USING (auth.uid() = voter_id);

-- Aggregate tallies only (no voter identity)
CREATE OR REPLACE FUNCTION public.poll_results(_poll_ids uuid[])
RETURNS TABLE (poll_id uuid, option_id uuid, votes bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT v.poll_id, v.option_id, count(*)::bigint
  FROM public.poll_votes v
  WHERE auth.uid() IS NOT NULL
    AND v.poll_id = ANY(_poll_ids)
  GROUP BY v.poll_id, v.option_id
$$;
REVOKE ALL ON FUNCTION public.poll_results(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.poll_results(uuid[]) TO authenticated;

-- 3. profiles: remove blanket read policy
DROP POLICY IF EXISTS profiles_search_authenticated ON public.profiles;

-- Directory lookups expose only non-sensitive columns
CREATE OR REPLACE FUNCTION public.search_students(_q text DEFAULT NULL, _limit int DEFAULT 30)
RETURNS TABLE (id uuid, full_name text, department text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.department
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
    AND p.id <> auth.uid()
    AND (
      _q IS NULL OR btrim(_q) = ''
      OR p.full_name ILIKE '%' || btrim(_q) || '%'
      OR p.department ILIKE '%' || btrim(_q) || '%'
    )
  ORDER BY p.full_name
  LIMIT LEAST(GREATEST(COALESCE(_limit, 30), 1), 50)
$$;
REVOKE ALL ON FUNCTION public.search_students(text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_students(text, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.profiles_basic(_ids uuid[])
RETURNS TABLE (id uuid, full_name text, department text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.department
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
    AND p.id = ANY(_ids)
$$;
REVOKE ALL ON FUNCTION public.profiles_basic(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.profiles_basic(uuid[]) TO authenticated;

-- 4. Storage: readable only when you own the file or it is attached to a shared listing
DROP POLICY IF EXISTS campus_uploads_read_auth ON storage.objects;
CREATE POLICY campus_uploads_read_scoped ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'campus-uploads'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (SELECT 1 FROM public.notes n WHERE n.file_path = storage.objects.name)
      OR EXISTS (SELECT 1 FROM public.marketplace_items m WHERE m.image_path = storage.objects.name)
      OR EXISTS (SELECT 1 FROM public.lost_found_items l WHERE l.image_path = storage.objects.name)
      OR EXISTS (SELECT 1 FROM public.clubs c WHERE c.banner_path = storage.objects.name)
    )
  );