
ALTER TABLE public.user_addresses ADD COLUMN IF NOT EXISTS is_billing_default boolean NOT NULL DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS billing_address jsonb;

-- Ensure only one billing default per user
CREATE OR REPLACE FUNCTION public.ensure_single_billing_default()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_billing_default THEN
    UPDATE public.user_addresses
       SET is_billing_default = false
     WHERE user_id = NEW.user_id
       AND id <> NEW.id
       AND is_billing_default = true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_single_billing_default ON public.user_addresses;
CREATE TRIGGER trg_single_billing_default
  BEFORE INSERT OR UPDATE ON public.user_addresses
  FOR EACH ROW EXECUTE FUNCTION public.ensure_single_billing_default();
