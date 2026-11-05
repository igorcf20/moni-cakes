-- Persist the expected preview/PDF sizes so upload confirmation can fail closed
-- when a mobile transfer is truncated or a different object is stored.
ALTER TABLE public.order_designs
  ADD COLUMN IF NOT EXISTS preview_size_bytes bigint,
  ADD COLUMN IF NOT EXISTS pdf_size_bytes bigint;

COMMENT ON COLUMN public.order_designs.preview_size_bytes IS
  'Expected preview object size in bytes, supplied by register-order-design and checked before upload_complete.';
COMMENT ON COLUMN public.order_designs.pdf_size_bytes IS
  'Expected print PDF object size in bytes, supplied by register-order-design and checked before upload_complete.';

CREATE OR REPLACE FUNCTION public.block_order_progress_with_pending_files()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.files_pending IS TRUE AND (
    (NEW.status IN ('paid', 'processing', 'shipped', 'delivered', 'completed')
      AND OLD.status IS DISTINCT FROM NEW.status)
    OR (NEW.payment_status = 'paid' AND OLD.payment_status IS DISTINCT FROM 'paid')
  ) THEN
    RAISE EXCEPTION 'order_files_pending: design files must be verified before payment or production';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_order_progress_with_pending_files ON public.orders;
CREATE TRIGGER trg_block_order_progress_with_pending_files
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.block_order_progress_with_pending_files();
