ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS skills text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS interests text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS bio text;

DROP FUNCTION IF EXISTS public.search_students(text, integer);
DROP FUNCTION IF EXISTS public.profiles_basic(uuid[]);

CREATE FUNCTION public.search_students(_q text DEFAULT NULL::text, _limit integer DEFAULT 30)
 RETURNS TABLE(id uuid, full_name text, department text, avatar_url text, skills text[], interests text[], bio text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.id, p.full_name, p.department, p.avatar_url, p.skills, p.interests, p.bio
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
    AND p.id <> auth.uid()
    AND (
      _q IS NULL OR btrim(_q) = ''
      OR p.full_name ILIKE '%' || btrim(_q) || '%'
      OR p.department ILIKE '%' || btrim(_q) || '%'
      OR p.bio ILIKE '%' || btrim(_q) || '%'
      OR EXISTS (SELECT 1 FROM unnest(p.skills) s WHERE s ILIKE '%' || btrim(_q) || '%')
      OR EXISTS (SELECT 1 FROM unnest(p.interests) i WHERE i ILIKE '%' || btrim(_q) || '%')
    )
  ORDER BY p.full_name
  LIMIT LEAST(GREATEST(COALESCE(_limit, 30), 1), 50)
$function$;

CREATE FUNCTION public.profiles_basic(_ids uuid[])
 RETURNS TABLE(id uuid, full_name text, department text, avatar_url text, skills text[], interests text[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.id, p.full_name, p.department, p.avatar_url, p.skills, p.interests
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
    AND p.id = ANY(_ids)
$function$;

REVOKE ALL ON FUNCTION public.search_students(text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.profiles_basic(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_students(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.profiles_basic(uuid[]) TO authenticated;

DROP POLICY IF EXISTS pm_insert_self ON public.project_members;
DROP POLICY IF EXISTS pm_insert_self_or_owner_invite ON public.project_members;
CREATE POLICY pm_insert_self_or_owner_invite ON public.project_members
  FOR INSERT TO authenticated
  WITH CHECK (
    (auth.uid() = user_id AND status = 'pending')
    OR (
      status = 'invited'
      AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.owner_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS pm_update_self_invite ON public.project_members;
CREATE POLICY pm_update_self_invite ON public.project_members
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND status IN ('accepted', 'rejected'));