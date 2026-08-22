DROP POLICY IF EXISTS "campus_uploads_read_avatars" ON storage.objects;
CREATE POLICY "campus_uploads_read_avatars" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'campus-uploads'
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.avatar_url = storage.objects.name)
  );