-- Secure trigger to prevent client-side tampering of order amounts/status
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
  -- Detect caller role. Service role & DB superuser bypass all checks.
  BEGIN
    jwt_role := current_setting('request.jwt.claim.role', true);
  EXCEPTION WHEN OTHERS THEN
    jwt_role := NULL;
  END;
  IF jwt_role IS NULL OR jwt_role = '' THEN
    BEGIN
      jwt_role := (current_setting('request.jwt.claims', true)::jsonb ->> 'role');
    EXCEPTION WHEN OTHERS THEN
      jwt_role := NULL;
    END;
  END IF;

  is_admin := COALESCE(public.has_role(auth.uid(), 'admin'::app_role), false);

  -- Service role and admins bypass tampering checks (edge functions, admin panel)
  IF jwt_role = 'service_role' OR is_admin THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Force safe defaults for customer-initiated orders. A customer can never
    -- self-mark an order as paid or shipped, regardless of what they send.
    NEW.payment_status      := 'pending';
    NEW.status              := 'pending';
    NEW.payment_proof_url   := NULL;
    NEW.paid_at             := NULL;
    -- Best-effort: null out gateway identifiers if these columns exist.
    BEGIN NEW.viva_order_code := NULL; EXCEPTION WHEN undefined_column THEN NULL; END;
    BEGIN NEW.viva_transaction_id := NULL; EXCEPTION WHEN undefined_column THEN NULL; END;

    -- Server-side coupon revalidation. If the coupon does not validate,
    -- discard it and zero the discount so a client cannot forge one.
    IF NEW.coupon_code IS NOT NULL AND btrim(NEW.coupon_code) <> '' THEN
      SELECT * INTO coupon_rec
      FROM public.validate_coupon(NEW.coupon_code)
      LIMIT 1;

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
          -- Clamp discount so it can never exceed the net subtotal.
          NEW.discount_amount := LEAST(computed_discount, COALESCE(NEW.subtotal_net, 0));
        END IF;
      END IF;
    ELSE
      NEW.discount_amount := 0;
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Freeze every money/status field. Customers may only update non-financial
    -- fields (e.g. payment_proof_url on pending orders) — those are preserved
    -- by not overriding them here.
    NEW.total              := OLD.total;
    NEW.subtotal_net       := OLD.subtotal_net;
    NEW.vat_total          := OLD.vat_total;
    NEW.discount_amount    := OLD.discount_amount;
    NEW.shipping_cost      := OLD.shipping_cost;
    NEW.coupon_code        := OLD.coupon_code;
    NEW.payment_status     := OLD.payment_status;
    NEW.status             := OLD.status;
    NEW.paid_at            := OLD.paid_at;
    NEW.delivery_method_id := OLD.delivery_method_id;
    NEW.payment_method     := OLD.payment_method;
    BEGIN NEW.viva_order_code := OLD.viva_order_code; EXCEPTION WHEN undefined_column THEN NULL; END;
    BEGIN NEW.viva_transaction_id := OLD.viva_transaction_id; EXCEPTION WHEN undefined_column THEN NULL; END;

    -- Only allow proof upload while pending; once past pending, freeze it too.
    IF OLD.status IS DISTINCT FROM 'pending' THEN
      NEW.payment_proof_url := OLD.payment_proof_url;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_secure_amounts_biu ON public.orders;
CREATE TRIGGER orders_secure_amounts_biu
BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.orders_secure_amounts();