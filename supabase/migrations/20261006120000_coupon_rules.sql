-- =============================================================================================
-- Cupons com configurações completas (Admin > Cupons, página própria de cada cupom).
--  1) Colunas novas em coupons: description (nota interna), starts_at (início da validade),
--     max_discount (teto do desconto em %), max_uses_per_customer, first_order_only, updated_at.
--  2) public.coupon_quote(_code, _user, _subtotal): única fonte das regras e do valor do desconto.
--     Usada pelo trigger orders_secure_amounts (ao gravar o pedido) e pelo servidor (create-order,
--     _shared/pricing.ts couponDiscount), só com service_role.
--  3) check_coupon (checkout, com sessão e limite de tentativas) segue as mesmas regras, exceto a
--     compra mínima (o navegador confere com o subtotal dele), e devolve também max_discount.
--  4) orders_secure_amounts: igual à da migration 20261002100100, exceto o bloco do cupom.
-- =============================================================================================

ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS starts_at timestamptz;
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS max_discount numeric(12,2);
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS max_uses_per_customer integer;
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS first_order_only boolean NOT NULL DEFAULT false;
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.coupons DROP CONSTRAINT IF EXISTS coupons_max_discount_positive;
ALTER TABLE public.coupons ADD CONSTRAINT coupons_max_discount_positive CHECK (max_discount IS NULL OR max_discount > 0);
ALTER TABLE public.coupons DROP CONSTRAINT IF EXISTS coupons_per_customer_positive;
ALTER TABLE public.coupons ADD CONSTRAINT coupons_per_customer_positive CHECK (max_uses_per_customer IS NULL OR max_uses_per_customer >= 1);

COMMENT ON COLUMN public.coupons.description IS 'Nota interna do cupom (só o Admin vê).';
COMMENT ON COLUMN public.coupons.starts_at IS 'O cupom só vale a partir desta data (vazio = já vale).';
COMMENT ON COLUMN public.coupons.max_discount IS 'Teto do desconto, na moeda base da loja (útil em cupons de %).';
COMMENT ON COLUMN public.coupons.max_uses_per_customer IS 'Quantas vezes cada cliente pode usar (vazio = sem limite).';
COMMENT ON COLUMN public.coupons.first_order_only IS 'Só vale na primeira compra do cliente.';

CREATE OR REPLACE FUNCTION public.coupons_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  -- O contador de usos muda a cada pedido; só as mudanças do Admin contam como edição.
  IF (to_jsonb(NEW) - 'current_uses' - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'current_uses' - 'updated_at') THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS coupons_touch_updated_at_bu ON public.coupons;
CREATE TRIGGER coupons_touch_updated_at_bu
BEFORE UPDATE ON public.coupons
FOR EACH ROW EXECUTE FUNCTION public.coupons_touch_updated_at();

-- Pedidos com cupom: contagem por cliente e página do cupom no Admin.
CREATE INDEX IF NOT EXISTS orders_coupon_code_lower_idx ON public.orders (lower(coupon_code)) WHERE coupon_code IS NOT NULL;

-- ---------------------------------------------------------------------------------------------
-- Regras comuns (sem a compra mínima): ativo, datas, limite total, limite por cliente, primeira compra.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._coupon_allowed(c public.coupons, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT c.active
     AND (c.starts_at IS NULL OR c.starts_at <= now())
     AND (c.expires_at IS NULL OR c.expires_at > now())
     AND (c.max_uses IS NULL OR COALESCE(c.current_uses, 0) < c.max_uses)
     AND (c.max_uses_per_customer IS NULL OR (_user IS NOT NULL AND (
           SELECT count(*) FROM public.orders o
            WHERE o.user_id = _user AND o.coupon_use_counted
              AND lower(o.coupon_code) = lower(c.code)
              AND o.status NOT IN ('cancelled', 'refunded')
         ) < c.max_uses_per_customer))
     AND (NOT c.first_order_only OR (_user IS NOT NULL AND NOT EXISTS (
           SELECT 1 FROM public.orders o
            WHERE o.user_id = _user AND o.status NOT IN ('cancelled', 'refunded')
         )));
$function$;

REVOKE EXECUTE ON FUNCTION public._coupon_allowed(public.coupons, uuid) FROM PUBLIC, anon, authenticated;

-- Valor do desconto para um pedido: % ou valor fixo do subtotal sem impostos, com teto (max_discount)
-- e nunca acima do subtotal. Sem linha = cupom não vale para este cliente ou subtotal.
CREATE OR REPLACE FUNCTION public.coupon_quote(_code text, _user uuid, _subtotal numeric)
RETURNS TABLE(code text, discount numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT c.code::text,
         round(GREATEST(0, LEAST(
           CASE WHEN c.discount_type = 'percentage' THEN _subtotal * c.discount_value / 100.0 ELSE c.discount_value END,
           COALESCE(c.max_discount, _subtotal),
           _subtotal
         )), 2)
    FROM public.coupons c
   WHERE lower(c.code) = lower(btrim(COALESCE(_code, '')))
     AND _subtotal IS NOT NULL
     AND _subtotal >= COALESCE(c.min_purchase, 0)
     AND public._coupon_allowed(c, _user)
   LIMIT 1;
$function$;

REVOKE EXECUTE ON FUNCTION public.coupon_quote(text, uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.coupon_quote(text, uuid, numeric) TO service_role;

-- ---------------------------------------------------------------------------------------------
-- Checkout: mesmas regras, com sessão e limite de tentativas (igual à migration 20261002120100).
-- ---------------------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.check_coupon(text);
CREATE FUNCTION public.check_coupon(_code text)
RETURNS TABLE(code text, discount_type text, discount_value numeric, min_purchase numeric, max_discount numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  failures integer;
  found_row record;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Inicie sessão para usar um cupão.';
  END IF;

  SELECT count(*) INTO failures FROM public.coupon_attempts
   WHERE user_id = uid AND NOT success AND created_at > now() - interval '15 minutes';
  IF failures >= 10 THEN
    RAISE EXCEPTION 'Demasiadas tentativas de cupão. Tente novamente dentro de 15 minutos.';
  END IF;

  SELECT c.code, c.discount_type, c.discount_value, c.min_purchase, c.max_discount INTO found_row
    FROM public.coupons c
   WHERE lower(c.code) = lower(btrim(COALESCE(_code, '')))
     AND public._coupon_allowed(c, uid)
   LIMIT 1;

  INSERT INTO public.coupon_attempts (user_id, success) VALUES (uid, found_row.code IS NOT NULL);
  DELETE FROM public.coupon_attempts WHERE created_at < now() - interval '1 day';

  IF found_row.code IS NOT NULL THEN
    RETURN QUERY SELECT found_row.code::text, found_row.discount_type::text, found_row.discount_value::numeric,
      found_row.min_purchase::numeric, found_row.max_discount::numeric;
  END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.check_coupon(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_coupon(text) TO authenticated;

-- ---------------------------------------------------------------------------------------------
-- Trigger de valores do pedido: o bloco do cupom passa a usar coupon_quote.
-- ---------------------------------------------------------------------------------------------
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
    NEW.resources_released_at := NULL;
    NEW.coupon_use_counted := false;

    IF NEW.coupon_code IS NOT NULL AND btrim(NEW.coupon_code) <> '' THEN
      -- O desconto calcula-se sobre o subtotal sem IVA, como no checkout. Sem ele não há como validar o cupão.
      IF NEW.subtotal_net IS NULL THEN
        RAISE EXCEPTION 'Cupom: atualize a página e tente novamente.';
      END IF;

      -- Regras do cupom (datas, limites total e por cliente, primeira compra, desconto máximo) em
      -- public.coupon_quote, a mesma função que o servidor (create-order) usa para calcular o total.
      SELECT q.code, q.discount INTO coupon_rec FROM public.coupon_quote(NEW.coupon_code, NEW.user_id, NEW.subtotal_net) q;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Cupom inválido, expirado, esgotado ou abaixo da compra mínima.';
      END IF;

      -- Consome uma utilização de forma atómica: com pedidos em simultâneo, max_uses nunca é ultrapassado.
      -- Se o pedido falhar mais tarde, a transação desfaz este incremento.
      UPDATE public.coupons c
         SET current_uses = COALESCE(c.current_uses, 0) + 1
       WHERE lower(c.code) = lower(coupon_rec.code)
         AND (c.max_uses IS NULL OR COALESCE(c.current_uses, 0) < c.max_uses);
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Cupom inválido, expirado, esgotado ou abaixo da compra mínima.';
      END IF;

      NEW.coupon_code := coupon_rec.code;
      NEW.discount_amount := coupon_rec.discount;
      NEW.coupon_use_counted := true;
    ELSE
      NEW.coupon_code := NULL;
      NEW.discount_amount := 0;
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    NEW.total              := OLD.total;
    NEW.subtotal_net       := OLD.subtotal_net;
    NEW.vat_total          := OLD.vat_total;
    NEW.discount_amount    := OLD.discount_amount;
    NEW.shipping_cost      := OLD.shipping_cost;
    NEW.coupon_code        := OLD.coupon_code;
    NEW.coupon_use_counted := OLD.coupon_use_counted;
    NEW.resources_released_at := OLD.resources_released_at;
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
