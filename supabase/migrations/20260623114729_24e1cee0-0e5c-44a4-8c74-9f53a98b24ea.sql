ALTER TABLE public.order_designs ADD COLUMN IF NOT EXISTS dpi_acceptances jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_profiles' AND policyname='Admins can view any profile') THEN
    CREATE POLICY "Admins can view any profile" ON public.user_profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
  END IF;
END $$;