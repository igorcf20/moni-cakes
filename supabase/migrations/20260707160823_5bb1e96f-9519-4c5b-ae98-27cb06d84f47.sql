-- New columns for personalization terms + cancellation flow
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS low_res_accepted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS proportional_resize_accepted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_customizable_items boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancellation_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS cancellation_status text
    CHECK (cancellation_status IN ('requested','approved','refused')),
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz,
  ADD COLUMN IF NOT EXISTS refund_note text;

-- Preserve new fields against tampering by regular users; only service_role/admin can change
-- cancellation_status / refunded_at / refund_note. Customer-set flags (terms_accepted_at,
-- low_res_accepted, proportional_resize_accepted, has_customizable_items) are locked once set.
CREATE OR REPLACE FUNCTION public.orders_secure_amounts()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    -- Admin-only cancellation/refund fields must not be set on insert by clients
    NEW.cancellation_status := NULL;
    NEW.cancellation_requested_at := NULL;
    NEW.cancellation_reason := NULL;
    NEW.refunded_at := NULL;
    NEW.refund_note := NULL;

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
    -- Terms acknowledgements are set at creation and locked afterwards
    NEW.terms_accepted_at            := OLD.terms_accepted_at;
    NEW.low_res_accepted             := OLD.low_res_accepted;
    NEW.proportional_resize_accepted := OLD.proportional_resize_accepted;
    NEW.has_customizable_items       := OLD.has_customizable_items;
    -- Only admin/service_role may change cancellation/refund state
    NEW.cancellation_status       := OLD.cancellation_status;
    NEW.refunded_at               := OLD.refunded_at;
    NEW.refund_note               := OLD.refund_note;
    -- Customer may set cancellation_reason / cancellation_requested_at only through the RPC
    NEW.cancellation_reason       := OLD.cancellation_reason;
    NEW.cancellation_requested_at := OLD.cancellation_requested_at;

    IF OLD.status IS DISTINCT FROM 'pending' THEN
      NEW.payment_proof_url := OLD.payment_proof_url;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- Customer-initiated cancellation request
CREATE OR REPLACE FUNCTION public.request_order_cancellation(_order_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  o record;
BEGIN
  SELECT id, user_id, status, cancellation_status
    INTO o
    FROM public.orders
   WHERE id = _order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado';
  END IF;
  IF o.user_id IS NULL OR o.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Sem permissão para cancelar este pedido';
  END IF;
  IF o.cancellation_status IS NOT NULL THEN
    RAISE EXCEPTION 'Já existe um pedido de cancelamento em análise';
  END IF;
  IF o.status NOT IN ('pending','awaiting_payment','paid') THEN
    RAISE EXCEPTION 'Este pedido já não pode ser cancelado';
  END IF;

  UPDATE public.orders
     SET cancellation_status = 'requested',
         cancellation_requested_at = now(),
         cancellation_reason = NULLIF(btrim(_reason), '')
   WHERE id = _order_id;

  BEGIN
    INSERT INTO public.order_status_history (order_id, status, note, created_by)
    VALUES (_order_id, o.status, 'Cancelamento solicitado pelo cliente' ||
      CASE WHEN _reason IS NOT NULL AND btrim(_reason) <> '' THEN ' — ' || _reason ELSE '' END,
      auth.uid());
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_order_cancellation(uuid, text) TO authenticated;