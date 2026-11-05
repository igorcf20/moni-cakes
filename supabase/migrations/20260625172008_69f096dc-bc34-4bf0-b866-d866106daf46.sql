GRANT SELECT ON public.email_send_log TO authenticated;
DO $$ BEGIN
  CREATE POLICY "Admins can read send log"
    ON public.email_send_log FOR SELECT
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;