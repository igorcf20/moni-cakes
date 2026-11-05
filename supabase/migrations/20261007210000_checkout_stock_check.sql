-- Estoque no checkout: o pedido do site nunca vende mais do que o estoque.
--
-- Antes: o trigger order_items_reserve_stock só barrava a falta de estoque quando quem gravava NÃO era de
-- confiança (_is_trusted_writer). O create-order grava como o cliente (create_order_server), mas um cliente que
-- também é admin conta como de confiança: o pedido passava e o estoque ficava em 0 em silêncio.
-- Agora:
--   _order_item_stock_slot   de que estoque sai a linha (produto, cor, tamanho ou cor x tamanho) e quanto há;
--                            a mesma procura de _adjust_order_item_stock. NULL = linha sem controle de estoque.
--   cart_stock_check         o carrinho e o checkout perguntam quanto há de cada linha (só leitura; os números
--                            já são públicos na página do produto).
--   create_order_server      marca a transação como compra do cliente (loja3d.customer_checkout).
--   order_items_reserve_stock  numa compra do cliente o estoque é sempre estrito, seja quem for o cliente.
-- O Admin (novo pedido, editar itens) continua a poder gravar sem estoque, como antes.

-- ---------------------------------------------------------------------------------------------
-- De que estoque sai uma linha do pedido e quanto há (mesma procura de _adjust_order_item_stock).
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._order_item_stock_slot(_product_id text, _design jsonb, OUT slot text, OUT available integer)
LANGUAGE plpgsql
STABLE
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
  m_stock integer;
  m_found boolean := false;
BEGIN
  slot := NULL; available := NULL;
  IF _product_id IS NULL THEN RETURN; END IF;

  SELECT id, customizable, stock_quantity INTO p FROM public.products WHERE id = _product_id;
  IF NOT FOUND OR COALESCE(p.customizable, false) THEN RETURN; END IF;
  IF _design IS NOT NULL AND jsonb_typeof(_design) = 'object'
     AND (_design ? 'customization' OR _design ? 'rental') THEN RETURN; END IF;
  IF public.feature_enabled('digital_products', false)
     AND EXISTS (SELECT 1 FROM public.product_digital WHERE product_id = _product_id AND is_active AND NOT ships) THEN RETURN; END IF;

  s_label := lower(btrim(COALESCE(_design->>'size', '')));
  v_name  := lower(btrim(COALESCE(_design->>'variation', '')));
  SELECT EXISTS (SELECT 1 FROM public.product_sizes WHERE product_id = _product_id) INTO has_sizes;

  IF has_sizes THEN
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
        SELECT true, stock_quantity INTO m_found, m_stock FROM public.product_variation_size_availability
         WHERE variation_id = v_id AND product_size_id = s_id;
      END IF;
    END IF;
    IF COALESCE(m_found, false) THEN
      slot := 'm:' || v_id::text || ':' || s_id::text;
      available := GREATEST(0, COALESCE(m_stock, 0));
    ELSE
      slot := 's:' || s_id::text;
      SELECT GREATEST(0, COALESCE(stock_quantity, 0)) INTO available FROM public.product_sizes WHERE id = s_id;
    END IF;
    RETURN;
  END IF;

  IF v_name <> '' AND public.feature_enabled('variants', true) THEN
    SELECT id, stock_quantity INTO v_id, m_stock FROM public.product_variations
     WHERE product_id = _product_id AND lower(btrim(name)) = v_name AND stock_quantity IS NOT NULL
     ORDER BY is_active DESC, display_order LIMIT 1;
  END IF;
  IF v_id IS NOT NULL THEN
    slot := 'v:' || v_id::text;
    available := GREATEST(0, m_stock);
  ELSIF p.stock_quantity IS NOT NULL THEN
    slot := 'p:' || _product_id;
    available := GREATEST(0, p.stock_quantity);
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public._order_item_stock_slot(text, jsonb) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Carrinho e checkout: quanto há de cada linha. _items = [{ product_id, design_data }], na mesma ordem.
-- Devolve [{ slot, available }] (slot e available nulos = sem controle de estoque). Linhas do mesmo slot
-- (ex.: a mesma cor em duas linhas) partilham o estoque: quem chama soma as quantidades por slot.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cart_stock_check(_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  it jsonb;
  r record;
  design jsonb;
  res jsonb := '[]'::jsonb;
BEGIN
  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' THEN RETURN res; END IF;
  IF jsonb_array_length(_items) > 200 THEN RAISE EXCEPTION 'too_many_items'; END IF;
  FOR it IN SELECT value FROM jsonb_array_elements(_items) LOOP
    design := CASE WHEN jsonb_typeof(it->'design_data') = 'object' THEN it->'design_data' ELSE NULL END;
    SELECT * INTO r FROM public._order_item_stock_slot(NULLIF(it->>'product_id', ''), design);
    res := res || jsonb_build_array(jsonb_build_object('slot', r.slot, 'available', r.available));
  END LOOP;
  RETURN res;
END;
$function$;

REVOKE ALL ON FUNCTION public.cart_stock_check(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cart_stock_check(jsonb) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- Compra do cliente: create_order_server marca a transação (igual a 20261002120000 + 1 linha).
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_order_server(_user_id uuid, _order jsonb, _items jsonb)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE o public.orders;
BEGIN
  IF _user_id IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = _user_id) THEN
    RAISE EXCEPTION 'Sessão expirada. Inicie sessão novamente.';
  END IF;

  -- Para o resto desta transação, a base de dados vê o pedido como vindo do próprio cliente.
  PERFORM set_config('request.jwt.claim.sub', _user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _user_id, 'role', 'authenticated')::text, true);
  -- Compra do cliente: o estoque é estrito mesmo que o cliente seja admin (order_items_reserve_stock).
  PERFORM set_config('loja3d.customer_checkout', '1', true);

  o := public.create_order_checkout(_order, _items);
  RETURN o;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_order_server(uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_server(uuid, jsonb, jsonb) TO service_role;

-- ---------------------------------------------------------------------------------------------
-- Baixa de estoque da linha (igual a 20261007030000_stock_history.sql, com a compra do cliente sempre estrita).
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.order_items_reserve_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE prev text := COALESCE(current_setting('loja3d.stock_ctx', true), '');
BEGIN
  IF NEW.quantity IS NULL OR NEW.quantity <= 0 THEN RETURN NEW; END IF;
  -- Dentro da edição de itens do Admin o motivo já é order_edit.
  IF prev = '' THEN
    PERFORM set_config('loja3d.stock_ctx', jsonb_build_object('reason', 'sale', 'order_id', NEW.order_id)::text, true);
  END IF;
  PERFORM public._adjust_order_item_stock(NEW.product_id, NEW.design_data, -NEW.quantity,
    COALESCE(current_setting('loja3d.customer_checkout', true), '') = '1' OR NOT public._is_trusted_writer());
  PERFORM set_config('loja3d.stock_ctx', prev, true);
  RETURN NEW;
END;
$function$;
