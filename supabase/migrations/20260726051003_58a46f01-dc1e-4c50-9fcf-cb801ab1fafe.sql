-- Marketplace listing type + rent period
DO $$ BEGIN
  CREATE TYPE public.marketplace_listing_type AS ENUM ('sale', 'rent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.marketplace_items
  ADD COLUMN IF NOT EXISTS listing_type public.marketplace_listing_type NOT NULL DEFAULT 'sale',
  ADD COLUMN IF NOT EXISTS rent_period text;

-- Borrow requests
CREATE TABLE IF NOT EXISTS public.borrow_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.marketplace_items(id) ON DELETE CASCADE,
  requester_id uuid NOT NULL,
  message text,
  start_date date,
  end_date date,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, requester_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.borrow_requests TO authenticated;
GRANT ALL ON public.borrow_requests TO service_role;

ALTER TABLE public.borrow_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "br_select_requester_or_owner" ON public.borrow_requests
  FOR SELECT TO authenticated
  USING (
    requester_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.marketplace_items m
      WHERE m.id = borrow_requests.item_id AND m.seller_id = auth.uid()
    )
  );

CREATE POLICY "br_insert_self" ON public.borrow_requests
  FOR INSERT TO authenticated
  WITH CHECK (requester_id = auth.uid());

CREATE POLICY "br_update_owner" ON public.borrow_requests
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplace_items m
      WHERE m.id = borrow_requests.item_id AND m.seller_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.marketplace_items m
      WHERE m.id = borrow_requests.item_id AND m.seller_id = auth.uid()
    )
  );

CREATE POLICY "br_delete_requester_or_owner" ON public.borrow_requests
  FOR DELETE TO authenticated
  USING (
    requester_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.marketplace_items m
      WHERE m.id = borrow_requests.item_id AND m.seller_id = auth.uid()
    )
  );

CREATE TRIGGER borrow_requests_set_updated_at
  BEFORE UPDATE ON public.borrow_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Stop collecting student IDs at signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, full_name, department)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data ->> 'department'
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'student')
    ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;