
ALTER TABLE public.usage_guide_sections ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_method_id UUID REFERENCES public.delivery_methods(id) ON DELETE SET NULL;

-- Permitir admin fazer upload/leitura/atualização no bucket payment-proofs
DO $$ BEGIN
  CREATE POLICY "Admins can insert payment proofs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'payment-proofs' AND public.has_role(auth.uid(), 'admin'::public.app_role));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can read payment proofs"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'payment-proofs' AND public.has_role(auth.uid(), 'admin'::public.app_role));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can update payment proofs"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'payment-proofs' AND public.has_role(auth.uid(), 'admin'::public.app_role));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
