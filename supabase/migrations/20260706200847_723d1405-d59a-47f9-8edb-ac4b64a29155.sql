
-- Patch orders_secure_amounts to tolerate missing paid_at column
CREATE OR REPLACE FUNCTION public.orders_secure_amounts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  jwt_role text;
  is_admin boolean;
  coupon_rec record;
  computed_discount numeric := 0;
BEGIN
  BEGIN
    jwt_role := current_setting('request.jwt.claim.role', true);
  EXCEPTION WHEN OTHERS THEN jwt_role := NULL; END;
  IF jwt_role IS NULL OR jwt_role = '' THEN
    BEGIN
      jwt_role := (current_setting('request.jwt.claims', true)::jsonb ->> 'role');
    EXCEPTION WHEN OTHERS THEN jwt_role := NULL; END;
  END IF;

  is_admin := COALESCE(public.has_role(auth.uid(), 'admin'::app_role), false);

  IF jwt_role = 'service_role' OR is_admin OR jwt_role IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.payment_status      := 'pending';
    NEW.status              := 'pending';
    NEW.payment_proof_url   := NULL;
    BEGIN NEW.paid_at := NULL; EXCEPTION WHEN undefined_column THEN NULL; END;
    BEGIN NEW.viva_order_code := NULL; EXCEPTION WHEN undefined_column THEN NULL; END;
    BEGIN NEW.viva_transaction_id := NULL; EXCEPTION WHEN undefined_column THEN NULL; END;

    IF NEW.coupon_code IS NOT NULL AND btrim(NEW.coupon_code) <> '' THEN
      SELECT * INTO coupon_rec FROM public.validate_coupon(NEW.coupon_code) LIMIT 1;
      IF coupon_rec.code IS NULL THEN
        NEW.coupon_code := NULL;
        NEW.discount_amount := 0;
      ELSE
        IF COALESCE(NEW.subtotal_net, 0) < COALESCE(coupon_rec.min_purchase, 0) THEN
          NEW.coupon_code := NULL;
          NEW.discount_amount := 0;
        ELSE
          IF coupon_rec.discount_type = 'percentage' THEN
            computed_discount := COALESCE(NEW.subtotal_net, 0) * coupon_rec.discount_value / 100.0;
          ELSE
            computed_discount := coupon_rec.discount_value;
          END IF;
          NEW.discount_amount := LEAST(computed_discount, COALESCE(NEW.subtotal_net, 0));
        END IF;
      END IF;
    ELSE
      NEW.discount_amount := 0;
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    NEW.total              := OLD.total;
    NEW.subtotal_net       := OLD.subtotal_net;
    NEW.vat_total          := OLD.vat_total;
    NEW.discount_amount    := OLD.discount_amount;
    NEW.shipping_cost      := OLD.shipping_cost;
    NEW.coupon_code        := OLD.coupon_code;
    NEW.payment_status     := OLD.payment_status;
    NEW.status             := OLD.status;
    BEGIN NEW.paid_at := OLD.paid_at; EXCEPTION WHEN undefined_column THEN NULL; END;
    NEW.delivery_method_id := OLD.delivery_method_id;
    NEW.payment_method     := OLD.payment_method;
    BEGIN NEW.viva_order_code := OLD.viva_order_code; EXCEPTION WHEN undefined_column THEN NULL; END;
    BEGIN NEW.viva_transaction_id := OLD.viva_transaction_id; EXCEPTION WHEN undefined_column THEN NULL; END;

    IF OLD.status IS DISTINCT FROM 'pending' THEN
      NEW.payment_proof_url := OLD.payment_proof_url;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS files_pending boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.mark_order_files_pending()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.design_data IS NOT NULL AND NEW.design_data ? 'cartItemKey' THEN
    UPDATE public.orders SET files_pending = true WHERE id = NEW.order_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mark_order_files_pending ON public.order_items;
CREATE TRIGGER trg_mark_order_files_pending
AFTER INSERT ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.mark_order_files_pending();

CREATE OR REPLACE FUNCTION public.sync_order_files_pending()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  oid uuid;
  incomplete_count int;
BEGIN
  oid := COALESCE(NEW.order_id, OLD.order_id);
  IF oid IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT COUNT(*) INTO incomplete_count
  FROM public.order_designs
  WHERE order_id = oid
    AND deleted_at IS NULL
    AND COALESCE(upload_complete, false) = false;
  IF incomplete_count > 0 THEN
    UPDATE public.orders SET files_pending = true
    WHERE id = oid AND files_pending = false;
  ELSE
    UPDATE public.orders SET files_pending = false
    WHERE id = oid AND files_pending = true;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_order_files_pending ON public.order_designs;
CREATE TRIGGER trg_sync_order_files_pending
AFTER INSERT OR UPDATE OR DELETE ON public.order_designs
FOR EACH ROW EXECUTE FUNCTION public.sync_order_files_pending();

UPDATE public.orders o SET files_pending = true
WHERE EXISTS (
  SELECT 1 FROM public.order_designs d
  WHERE d.order_id = o.id
    AND d.deleted_at IS NULL
    AND COALESCE(d.upload_complete, false) = false
);
