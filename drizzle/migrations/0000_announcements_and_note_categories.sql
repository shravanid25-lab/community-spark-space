CREATE TABLE public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  club_id uuid REFERENCES public.clubs(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcements TO authenticated;
GRANT ALL ON public.announcements TO service_role;

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY ann_select_auth ON public.announcements FOR SELECT TO authenticated USING (true);
CREATE POLICY ann_insert_own ON public.announcements FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY ann_update_own_or_admin ON public.announcements FOR UPDATE TO authenticated USING ((auth.uid() = created_by) OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY ann_delete_own_or_admin ON public.announcements FOR DELETE TO authenticated USING ((auth.uid() = created_by) OR has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX announcements_created_at_idx ON public.announcements (created_at DESC);

ALTER TABLE public.notes ADD COLUMN category text NOT NULL DEFAULT 'note';
ALTER TABLE public.notes ADD COLUMN subject text;
ALTER TABLE public.notes ADD COLUMN semester text;