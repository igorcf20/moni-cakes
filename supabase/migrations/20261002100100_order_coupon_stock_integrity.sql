-- Integridade das encomendas: cupões, stock e criação atómica.
--
-- Problemas corrigidos:
--  1) Cupões: o checkout não enviava subtotal_net, por isso o trigger orders_secure_amounts gravava
--     discount_amount = 0 (ou apagava o cupão se havia compra mínima) e o total ficava com desconto. A
--     verificação de preços da Viva então devolvia 409. Além disso current_uses nunca era incrementado,
--     por isso max_uses não era aplicado.
--  2) Stock: nunca baixava numa venda. Agora baixa ao criar as linhas da encomenda (com verificação, para
--     não vender mais do que existe) e volta quando a encomenda é cancelada ou reembolsada.
--  3) A encomenda e as linhas eram gravadas em dois pedidos separados do browser; uma falha a meio deixava
--     uma encomenda vazia (e um cupão gasto). create_order_checkout grava tudo numa só transação.
--
-- Regras do stock (espelham o que a loja mostra):
--  - Produtos personalizáveis e linhas com personalização não têm stock controlado (são feitos por encomenda).
--  - Com tamanhos: usa a linha da matriz cor x tamanho se existir, senão o stock do tamanho.
--  - Sem tamanhos: usa products.stock_quantity (se não for nulo).
--  - Encomendas criadas por admin ou pelo servidor nunca falham por falta de stock (o stock fica a 0).
--  - Encomendas anteriores a esta migration ficam marcadas como "já tratadas": o stock delas não é devolvido.
--
-- Executar no SQL Editor depois da migration 20261002100000. Seguro de repetir.

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS resources_released_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS coupon_use_counted boolean NOT NULL DEFAULT false;

-- Encomendas já existentes não reservaram stock nem cupão com esta lógica: não há nada a devolver.
UPDATE public.orders SET resources_released_at = now() WHERE resources_released_at IS NULL;

-- ---------------------------------------------------------------------------------------------
-- Quem escreve: servidor, admin ou ligação direta ao banco (SQL Editor) é de confiança.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._is_trusted_writer()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE jwt_role text;
BEGIN
  BEGIN
    jwt_role := current_setting('request.jwt.claim.role', true);
  EXCEPTION WHEN OTHERS THEN jwt_role := NULL; END;
  IF jwt_role IS NULL OR jwt_role = '' THEN
    BEGIN
      jwt_role := (current_setting('request.jwt.claims', true)::jsonb ->> 'role');
    EXCEPTION WHEN OTHERS THEN jwt_role := NULL; END;
  END IF;
  RETURN jwt_role IS NULL OR jwt_role IN ('', 'service_role')
    OR COALESCE(public.has_role(auth.uid(), 'admin'::app_role), false);
END;
$function$;

-- ---------------------------------------------------------------------------------------------
-- Trigger de segurança dos valores da encomenda, agora com cupão correto.
-- (igual ao da migration 20260708083558, exceto o bloco do cupão e as colunas novas)
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
    NEW.resources_released_at := NULL;
    NEW.coupon_use_counted := false;

    IF NEW.coupon_code IS NOT NULL AND btrim(NEW.coupon_code) <> '' THEN
      -- O desconto calcula-se sobre o subtotal sem IVA, como no checkout. Sem ele não há como validar o cupão.
      IF NEW.subtotal_net IS NULL THEN
        RAISE EXCEPTION 'Cupom: atualize a página e tente novamente.';
      END IF;

      -- Consome uma utilização de forma atómica: com pedidos em simultâneo, max_uses nunca é ultrapassado.
      -- Se o pedido falhar mais tarde, a transação desfaz este incremento.
      UPDATE public.coupons c
         SET current_uses = COALESCE(c.current_uses, 0) + 1
       WHERE c.active = true
         AND lower(c.code) = lower(btrim(NEW.coupon_code))
         AND (c.expires_at IS NULL OR c.expires_at > now())
         AND (c.max_uses IS NULL OR COALESCE(c.current_uses, 0) < c.max_uses)
         AND NEW.subtotal_net >= COALESCE(c.min_purchase, 0)
      RETURNING c.code, c.discount_type, c.discount_value INTO coupon_rec;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Cupom inválido, expirado, esgotado ou abaixo da compra mínima.';
      END IF;

      IF coupon_rec.discount_type = 'percentage' THEN
        computed_discount := NEW.subtotal_net * coupon_rec.discount_value / 100.0;
      ELSE
        computed_discount := coupon_rec.discount_value;
      END IF;
      NEW.coupon_code := coupon_rec.code;
      NEW.discount_amount := round(GREATEST(0, LEAST(computed_discount, NEW.subtotal_net)), 2);
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

-- ---------------------------------------------------------------------------------------------
-- Stock
-- ---------------------------------------------------------------------------------------------
-- _delta negativo = vender; positivo = devolver. _strict: falha se não houver stock suficiente.
CREATE OR REPLACE FUNCTION public._adjust_order_item_stock(_product_id text, _design jsonb, _delta integer, _strict boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  p record;
  s_label text;
  v_name text;
  has_sizes boolean;
  s_id public.product_sizes.id%TYPE;
  v_id public.product_variations.id%TYPE;
  m_found boolean := false;
  n integer;
BEGIN
  IF _product_id IS NULL OR COALESCE(_delta, 0) = 0 THEN RETURN; END IF;

  SELECT id, customizable, stock_quantity INTO p FROM public.products WHERE id = _product_id;
  IF NOT FOUND OR COALESCE(p.customizable, false) THEN RETURN; END IF;
  IF _design IS NOT NULL AND jsonb_typeof(_design) = 'object' AND _design ? 'customization' THEN RETURN; END IF;

  s_label := lower(btrim(COALESCE(_design->>'size', '')));
  v_name  := lower(btrim(COALESCE(_design->>'variation', '')));
  SELECT EXISTS (SELECT 1 FROM public.product_sizes WHERE product_id = _product_id) INTO has_sizes;

  IF has_sizes THEN
    -- Sem tamanho identificável não sabemos que stock mexer: não controlamos esta linha.
    IF s_label = '' THEN RETURN; END IF;
    SELECT id INTO s_id FROM public.product_sizes
     WHERE product_id = _product_id AND lower(btrim(size_label)) = s_label
     ORDER BY is_active DESC, display_order LIMIT 1;
    IF s_id IS NULL THEN RETURN; END IF;

    IF v_name <> '' THEN
      SELECT id INTO v_id FROM public.product_variations
       WHERE product_id = _product_id AND lower(btrim(name)) = v_name
       ORDER BY is_active DESC, display_order LIMIT 1;
      IF v_id IS NOT NULL THEN
        SELECT true INTO m_found FROM public.product_variation_size_availability
         WHERE variation_id = v_id AND product_size_id = s_id;
      END IF;
    END IF;

    IF COALESCE(m_found, false) THEN
      UPDATE public.product_variation_size_availability
         SET stock_quantity = CASE WHEN _delta < 0 AND NOT _strict THEN GREATEST(0, stock_quantity + _delta) ELSE stock_quantity + _delta END
       WHERE variation_id = v_id AND product_size_id = s_id
         AND (_delta > 0 OR NOT _strict OR stock_quantity >= -_delta);
    ELSE
      UPDATE public.product_sizes
         SET stock_quantity = CASE WHEN _delta < 0 AND NOT _strict THEN GREATEST(0, stock_quantity + _delta) ELSE stock_quantity + _delta END
       WHERE id = s_id
         AND (_delta > 0 OR NOT _strict OR stock_quantity >= -_delta);
    END IF;
  ELSE
    IF p.stock_quantity IS NULL THEN RETURN; END IF;
    UPDATE public.products
       SET stock_quantity = CASE WHEN _delta < 0 AND NOT _strict THEN GREATEST(0, stock_quantity + _delta) ELSE stock_quantity + _delta END
     WHERE id = _product_id
       AND (_delta > 0 OR NOT _strict OR stock_quantity >= -_delta);
  END IF;

  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 AND _strict AND _delta < 0 THEN
    RAISE EXCEPTION 'Stock insuficiente para um dos artigos. Reduza a quantidade ou remova o artigo do carrinho.';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.order_items_reserve_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.quantity IS NULL OR NEW.quantity <= 0 THEN RETURN NEW; END IF;
  PERFORM public._adjust_order_item_stock(NEW.product_id, NEW.design_data, -NEW.quantity, NOT public._is_trusted_writer());
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS order_items_reserve_stock_ai ON public.order_items;
CREATE TRIGGER order_items_reserve_stock_ai
AFTER INSERT ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.order_items_reserve_stock();

-- Cancelada ou reembolsada: devolve o stock e a utilização do cupão (uma única vez).
CREATE OR REPLACE FUNCTION public.orders_release_resources()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE it record; prev_flag text;
BEGIN
  IF NEW.status NOT IN ('cancelled', 'refunded') OR OLD.status IN ('cancelled', 'refunded') THEN RETURN NEW; END IF;
  IF NEW.resources_released_at IS NOT NULL THEN RETURN NEW; END IF;

  FOR it IN SELECT product_id, quantity, design_data FROM public.order_items WHERE order_id = NEW.id LOOP
    IF it.quantity IS NOT NULL AND it.quantity > 0 THEN
      PERFORM public._adjust_order_item_stock(it.product_id, it.design_data, it.quantity, false);
    END IF;
  END LOOP;

  IF NEW.coupon_use_counted AND NEW.coupon_code IS NOT NULL THEN
    UPDATE public.coupons SET current_uses = GREATEST(0, COALESCE(current_uses, 0) - 1)
     WHERE lower(code) = lower(NEW.coupon_code);
  END IF;

  -- Marca como tratada sem passar pelo bloqueio de valores; repõe o estado anterior da flag.
  prev_flag := COALESCE(current_setting('app.bypass_orders_lock', true), '');
  PERFORM set_config('app.bypass_orders_lock', '1', true);
  UPDATE public.orders SET resources_released_at = now() WHERE id = NEW.id;
  PERFORM set_config('app.bypass_orders_lock', prev_flag, true);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS orders_release_resources_au ON public.orders;
CREATE TRIGGER orders_release_resources_au
AFTER UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.orders_release_resources();

-- ---------------------------------------------------------------------------------------------
-- Criação atómica da encomenda (chamada pelo checkout)
-- ---------------------------------------------------------------------------------------------
-- Corre com os direitos de quem chama (RLS e triggers aplicam-se como antes). O utilizador é sempre
-- auth.uid(): o payload não pode escolher o dono da encomenda. Qualquer erro (stock, cupão) desfaz tudo.
CREATE OR REPLACE FUNCTION public.create_order_checkout(_order jsonb, _items jsonb)
RETURNS public.orders
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE o public.orders;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão expirada. Inicie sessão novamente.';
  END IF;
  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Encomenda sem artigos.';
  END IF;

  INSERT INTO public.orders (
    user_id, guest_email, guest_name, guest_phone, total, subtotal_net, vat_total,
    shipping_address, billing_address, shipping_cost, coupon_code, discount_amount,
    payment_method, payment_status, status, delivery_method_id, notes,
    has_customizable_items, terms_accepted_at
  ) VALUES (
    auth.uid(),
    NULLIF(_order->>'guest_email', ''), NULLIF(_order->>'guest_name', ''), NULLIF(_order->>'guest_phone', ''),
    (_order->>'total')::numeric,
    NULLIF(_order->>'subtotal_net', '')::numeric,
    NULLIF(_order->>'vat_total', '')::numeric,
    _order->'shipping_address', _order->'billing_address',
    COALESCE(NULLIF(_order->>'shipping_cost', '')::numeric, 0),
    NULLIF(btrim(COALESCE(_order->>'coupon_code', '')), ''),
    COALESCE(NULLIF(_order->>'discount_amount', '')::numeric, 0),
    NULLIF(_order->>'payment_method', ''), 'pending', 'pending',
    NULLIF(_order->>'delivery_method_id', '')::uuid,
    NULLIF(_order->>'notes', ''),
    COALESCE((_order->>'has_customizable_items')::boolean, false),
    COALESCE(NULLIF(_order->>'terms_accepted_at', '')::timestamptz, now())
  ) RETURNING * INTO o;

  INSERT INTO public.order_items (order_id, product_id, quantity, price, design_data)
  SELECT o.id, i->>'product_id', (i->>'quantity')::integer, (i->>'price')::numeric, i->'design_data'
    FROM jsonb_array_elements(_items) AS i;

  RETURN o;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_order_checkout(jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order_checkout(jsonb, jsonb) TO authenticated;
