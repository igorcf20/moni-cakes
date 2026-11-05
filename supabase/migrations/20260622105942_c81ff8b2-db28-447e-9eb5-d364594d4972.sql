
ALTER TABLE public.order_designs
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'layout',
  ADD COLUMN IF NOT EXISTS originals jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS delete_after timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_order_designs_delete_after ON public.order_designs(delete_after) WHERE deleted_at IS NULL AND delete_after IS NOT NULL;

CREATE OR REPLACE FUNCTION public.schedule_design_cleanup_on_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('delivered','completed') AND COALESCE(OLD.status,'') NOT IN ('delivered','completed') THEN
    UPDATE public.order_designs
      SET delete_after = now() + interval '5 days'
      WHERE order_id = NEW.id AND deleted_at IS NULL AND delete_after IS NULL;
  ELSIF NEW.status NOT IN ('delivered','completed') AND COALESCE(OLD.status,'') IN ('delivered','completed') THEN
    UPDATE public.order_designs
      SET delete_after = NULL
      WHERE order_id = NEW.id AND deleted_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_design_cleanup ON public.orders;
CREATE TRIGGER trg_orders_design_cleanup
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.schedule_design_cleanup_on_status();

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects' AND policyname='dtf_uploads_service_role'
  ) THEN
    CREATE POLICY "dtf_uploads_service_role"
      ON storage.objects FOR ALL TO service_role
      USING (bucket_id = 'dtf-uploads')
      WITH CHECK (bucket_id = 'dtf-uploads');
  END IF;
END $$;
