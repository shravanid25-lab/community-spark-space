
CREATE POLICY "campus_uploads_read_auth" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'campus-uploads');
CREATE POLICY "campus_uploads_insert_own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'campus-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "campus_uploads_update_own" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'campus-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "campus_uploads_delete_own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'campus-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);
