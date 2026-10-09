CREATE TABLE public.item_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type text NOT NULL CHECK (item_type IN ('lost_found','marketplace')),
  item_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  participant_id uuid NOT NULL,
  sender_id uuid NOT NULL,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (owner_id <> participant_id)
);
CREATE INDEX item_messages_thread_idx ON public.item_messages (item_type, item_id, participant_id, created_at);
GRANT SELECT, INSERT, DELETE ON public.item_messages TO authenticated;
GRANT ALL ON public.item_messages TO service_role;
ALTER TABLE public.item_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Thread members read" ON public.item_messages FOR SELECT TO authenticated
  USING (auth.uid() = owner_id OR auth.uid() = participant_id);
CREATE POLICY "Thread members send" ON public.item_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND (auth.uid() = owner_id OR auth.uid() = participant_id)
    AND (
      (item_type = 'lost_found' AND EXISTS (SELECT 1 FROM public.lost_found_items l WHERE l.id = item_id AND l.reporter_id = owner_id))
      OR (item_type = 'marketplace' AND EXISTS (SELECT 1 FROM public.marketplace_items m WHERE m.id = item_id AND m.seller_id = owner_id))
    )
  );
CREATE POLICY "Sender deletes own" ON public.item_messages FOR DELETE TO authenticated
  USING (sender_id = auth.uid());