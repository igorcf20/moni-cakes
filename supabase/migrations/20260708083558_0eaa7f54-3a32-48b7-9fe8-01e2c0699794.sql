
-- Bypass flag used by the request_order_cancellation RPC so the
-- orders_secure_amounts trigger does not revert the customer's own change.

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
  bypass_flag text;
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

  -- Trusted server-side RPCs can set this GUC to skip the lock.
  BEGIN
    bypass_flag := current_setting('app.bypass_orders_lock', true);
  EXCEPTION WHEN OTHERS THEN bypass_flag := NULL; END;

  IF jwt_role = 'service_role' OR is_admin OR jwt_role IS NULL OR bypass_flag = '1' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.payment_status      := 'pending';
    NEW.status              := 'pending';
    NEW.payment_proof_url   := NULL;
    BEGIN NEW.paid_at := NULL; EXCEPTION WHEN undefined_column THEN NULL; END;
    BEGIN NEW.viva_order_code := NULL; EXCEPTION WHEN undefined_column THEN NULL; END;
    BEGIN NEW.viva_transaction_id := NULL; EXCEPTION WHEN undefined_column THEN NULL; END;
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
    NEW.terms_accepted_at            := OLD.terms_accepted_at;
    NEW.low_res_accepted             := OLD.low_res_accepted;
    NEW.proportional_resize_accepted := OLD.proportional_resize_accepted;
    NEW.has_customizable_items       := OLD.has_customizable_items;
    NEW.cancellation_status       := OLD.cancellation_status;
    NEW.refunded_at               := OLD.refunded_at;
    NEW.refund_note               := OLD.refund_note;
    NEW.cancellation_reason       := OLD.cancellation_reason;
    NEW.cancellation_requested_at := OLD.cancellation_requested_at;

    IF OLD.status IS DISTINCT FROM 'pending' THEN
      NEW.payment_proof_url := OLD.payment_proof_url;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;


CREATE OR REPLACE FUNCTION public.request_order_cancellation(_order_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  IF o.cancellation_status = 'requested' THEN
    RAISE EXCEPTION 'Já existe um pedido de cancelamento em análise';
  END IF;
  IF o.status NOT IN ('pending','awaiting_payment','paid') THEN
    RAISE EXCEPTION 'Este pedido já não pode ser cancelado';
  END IF;

  -- Tell orders_secure_amounts trigger this update is trusted (transaction-local).
  PERFORM set_config('app.bypass_orders_lock', '1', true);

  UPDATE public.orders
     SET cancellation_status = 'requested',
         cancellation_requested_at = now(),
         cancellation_reason = NULLIF(btrim(_reason), '')
   WHERE id = _order_id;

  PERFORM set_config('app.bypass_orders_lock', '', true);

  BEGIN
    INSERT INTO public.order_status_history (order_id, status, note, created_by)
    VALUES (_order_id, o.status, 'Cancelamento solicitado pelo cliente' ||
      CASE WHEN _reason IS NOT NULL AND btrim(_reason) <> '' THEN ' — ' || _reason ELSE '' END,
      auth.uid());
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;
END;
$function$;
