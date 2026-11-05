-- =============================================================================================
-- Histórico de estoque (recurso stock_history em Admin > Recursos da loja, ligado por padrão): Admin > Catálogo >
-- Histórico de estoque e bloco na página de números do produto.
--  1) stock_movements    cada mudança de estoque de produto, tamanho, cor ou combinação cor x tamanho, com antes,
--                        depois, motivo, pedido, quem fez e nota. Escrito só pelos triggers abaixo; leitura do Admin.
--  2) triggers AFTER UPDATE OF stock_quantity nas 4 tabelas de estoque. O motivo vem do contexto da transação
--     (loja3d.stock_ctx, JSON com reason, order_id e note), posto pelas funções do servidor:
--       sale          pedido criado (order_items_reserve_stock)
--       order_restock pedido cancelado ou reembolsado (orders_release_resources)
--       order_edit    itens do pedido editados no Admin (admin_update_order_items)
--       receive, count, damage, other   ajuste no Admin com motivo (admin_adjust_stock)
--     Sem contexto: admin (edição direta no Admin) ou system.
--  3) admin_adjust_stock, admin_stock_movements e admin_stock_summary (só admin).
-- O registo acontece sempre (o recurso só esconde as telas), para o histórico não ter buracos.
-- =============================================================================================

CREATE TABLE IF NOT EXISTS public.stock_movements (
  id bigserial PRIMARY KEY,
  product_id text NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variation_id uuid,
  size_id uuid,
  sku text,
  quantity_before integer,
  quantity_after integer,
  change integer NOT NULL,
  reason text NOT NULL DEFAULT 'system',
  order_id uuid,
  actor uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stock_movements_reason CHECK (reason IN ('sale', 'order_restock', 'order_edit', 'admin', 'receive', 'count', 'damage', 'other', 'system')),
  CONSTRAINT stock_movements_note_len CHECK (note IS NULL OR char_length(note) <= 500)
);
CREATE INDEX IF NOT EXISTS stock_movements_recent_idx ON public.stock_movements (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS stock_movements_product_idx ON public.stock_movements (product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS stock_movements_order_idx ON public.stock_movements (order_id) WHERE order_id IS NOT NULL;

COMMENT ON TABLE public.stock_movements IS 'Histórico de estoque (Admin > Histórico de estoque). Escrito só por triggers e funções do servidor.';

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read stock movements" ON public.stock_movements;
CREATE POLICY "Admins read stock movements" ON public.stock_movements
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
REVOKE ALL ON public.stock_movements FROM anon, authenticated;
GRANT SELECT ON public.stock_movements TO authenticated;
GRANT ALL ON public.stock_movements TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.stock_movements_id_seq TO service_role;

-- ---------------------------------------------------------------------------------------------
-- Registo: um trigger para as 4 tabelas (as colunas vêm de to_jsonb(NEW), que existe em todas).
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.stock_movements_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  n jsonb := to_jsonb(NEW);
  ctx jsonb;
  raw text := COALESCE(current_setting('loja3d.stock_ctx', true), '');
  v_reason text;
  v_order uuid;
  v_note text;
  v_product text;
  v_variation uuid;
  v_size uuid;
BEGIN
  IF OLD.stock_quantity IS NOT DISTINCT FROM NEW.stock_quantity THEN RETURN NEW; END IF;

  IF raw <> '' THEN
    BEGIN
      ctx := raw::jsonb;
    EXCEPTION WHEN others THEN ctx := NULL;
    END;
  END IF;
  v_reason := ctx ->> 'reason';
  IF v_reason IS NULL OR v_reason NOT IN ('sale', 'order_restock', 'order_edit', 'receive', 'count', 'damage', 'other') THEN
    v_reason := CASE WHEN auth.uid() IS NOT NULL AND COALESCE(public.has_role(auth.uid(), 'admin'::app_role), false) THEN 'admin' ELSE 'system' END;
  END IF;
  BEGIN
    v_order := NULLIF(ctx ->> 'order_id', '')::uuid;
  EXCEPTION WHEN others THEN v_order := NULL;
  END;
  v_note := left(NULLIF(btrim(COALESCE(ctx ->> 'note', '')), ''), 500);

  IF TG_TABLE_NAME = 'products' THEN
    v_product := n ->> 'id';
  ELSIF TG_TABLE_NAME = 'product_sizes' THEN
    v_product := n ->> 'product_id'; v_size := (n ->> 'id')::uuid;
  ELSIF TG_TABLE_NAME = 'product_variations' THEN
    v_product := n ->> 'product_id'; v_variation := (n ->> 'id')::uuid;
  ELSE
    v_variation := (n ->> 'variation_id')::uuid; v_size := (n ->> 'product_size_id')::uuid;
    SELECT product_id INTO v_product FROM public.product_variations WHERE id = v_variation;
  END IF;
  IF v_product IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.stock_movements (product_id, variation_id, size_id, sku, quantity_before, quantity_after, change, reason, order_id, actor, note)
  VALUES (v_product, v_variation, v_size, NULLIF(n ->> 'sku', ''), OLD.stock_quantity, NEW.stock_quantity,
          COALESCE(NEW.stock_quantity, 0) - COALESCE(OLD.stock_quantity, 0), v_reason, v_order, auth.uid(), v_note);
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.stock_movements_log() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS products_stock_movements ON public.products;
CREATE TRIGGER products_stock_movements AFTER UPDATE OF stock_quantity ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.stock_movements_log();
DROP TRIGGER IF EXISTS product_sizes_stock_movements ON public.product_sizes;
CREATE TRIGGER product_sizes_stock_movements AFTER UPDATE OF stock_quantity ON public.product_sizes
  FOR EACH ROW EXECUTE FUNCTION public.stock_movements_log();
DROP TRIGGER IF EXISTS product_variations_stock_movements ON public.product_variations;
CREATE TRIGGER product_variations_stock_movements AFTER UPDATE OF stock_quantity ON public.product_variations
  FOR EACH ROW EXECUTE FUNCTION public.stock_movements_log();
DROP TRIGGER IF EXISTS pvsa_stock_movements ON public.product_variation_size_availability;
CREATE TRIGGER pvsa_stock_movements AFTER UPDATE OF stock_quantity ON public.product_variation_size_availability
  FOR EACH ROW EXECUTE FUNCTION public.stock_movements_log();

-- ---------------------------------------------------------------------------------------------
-- Motivo das baixas e devoluções de pedidos (mesmo corpo de antes + contexto do histórico).
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
  PERFORM public._adjust_order_item_stock(NEW.product_id, NEW.design_data, -NEW.quantity, NOT public._is_trusted_writer());
  PERFORM set_config('loja3d.stock_ctx', prev, true);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.orders_release_resources()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE it record; prev_flag text; prev_ctx text := COALESCE(current_setting('loja3d.stock_ctx', true), '');
BEGIN
  IF NEW.status NOT IN ('cancelled', 'refunded') OR OLD.status IN ('cancelled', 'refunded') THEN RETURN NEW; END IF;
  IF NEW.resources_released_at IS NOT NULL THEN RETURN NEW; END IF;

  PERFORM set_config('loja3d.stock_ctx', jsonb_build_object('reason', 'order_restock', 'order_id', NEW.id)::text, true);
  FOR it IN SELECT product_id, quantity, design_data FROM public.order_items WHERE order_id = NEW.id LOOP
    IF it.quantity IS NOT NULL AND it.quantity > 0 THEN
      PERFORM public._adjust_order_item_stock(it.product_id, it.design_data, it.quantity, false);
    END IF;
  END LOOP;
  PERFORM set_config('loja3d.stock_ctx', prev_ctx, true);

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

-- Edição de itens no Admin: igual à versão de 20261006200000_reward_points.sql, com o contexto do histórico.
CREATE OR REPLACE FUNCTION public.admin_update_order_items(
  _order_id uuid,
  _items jsonb,
  _shipping_cost numeric,
  _discount numeric,
  _note text DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  o record;
  it jsonb;
  old_item record;
  keep_ids uuid[] := '{}';
  v_id uuid;
  v_qty integer;
  v_price numeric;
  v_rate numeric;
  v_items numeric := 0;
  v_vat numeric := 0;
  v_total numeric;
  v_ship numeric := round(GREATEST(COALESCE(_shipping_cost, 0), 0), 2);
  v_disc numeric := round(GREATEST(COALESCE(_discount, 0), 0), 2);
BEGIN
  IF NOT COALESCE(public.has_role(auth.uid(), 'admin'::app_role), false) THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF o.status IN ('shipped', 'delivered', 'cancelled', 'refunded')
     OR o.payment_status = 'refunded' OR o.resources_released_at IS NOT NULL THEN
    RAISE EXCEPTION 'order_locked';
  END IF;
  IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'items_required';
  END IF;

  -- Histórico de estoque: os movimentos desta edição ficam ligados ao pedido.
  PERFORM set_config('loja3d.stock_ctx', jsonb_build_object('reason', 'order_edit', 'order_id', _order_id)::text, true);

  -- Validação e ids que ficam.
  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_qty := (it ->> 'quantity')::integer;
    v_price := (it ->> 'price')::numeric;
    IF v_qty IS NULL OR v_qty <= 0 OR v_price IS NULL OR v_price < 0 THEN
      RAISE EXCEPTION 'invalid_item';
    END IF;
    IF NULLIF(it ->> 'product_id', '') IS NULL AND NULLIF(btrim(it ->> 'custom_name'), '') IS NULL THEN
      RAISE EXCEPTION 'invalid_item';
    END IF;
    v_id := NULLIF(it ->> 'id', '')::uuid;
    IF v_id IS NOT NULL THEN keep_ids := keep_ids || v_id; END IF;
  END LOOP;

  -- Itens retirados: devolve o estoque e apaga.
  FOR old_item IN
    SELECT id, product_id, quantity, design_data FROM public.order_items
     WHERE order_id = _order_id AND NOT (id = ANY (keep_ids))
  LOOP
    IF old_item.quantity > 0 THEN
      PERFORM public._adjust_order_item_stock(old_item.product_id, old_item.design_data, old_item.quantity, false);
    END IF;
    DELETE FROM public.order_items WHERE id = old_item.id;
  END LOOP;

  -- Alterados e novos.
  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_id := NULLIF(it ->> 'id', '')::uuid;
    v_qty := (it ->> 'quantity')::integer;
    v_price := round((it ->> 'price')::numeric, 2);
    v_rate := GREATEST(COALESCE((it ->> 'vat_rate')::numeric, 0), 0);
    v_items := v_items + round(v_price * v_qty, 2);
    v_vat := v_vat + round(v_price * v_qty * v_rate / 100, 2);

    IF v_id IS NOT NULL THEN
      SELECT id, product_id, quantity, design_data INTO old_item FROM public.order_items
       WHERE id = v_id AND order_id = _order_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'invalid_item'; END IF;
      IF v_qty <> old_item.quantity THEN
        PERFORM public._adjust_order_item_stock(old_item.product_id, old_item.design_data, old_item.quantity - v_qty, false);
      END IF;
      UPDATE public.order_items
         SET quantity = v_qty,
             price = v_price,
             vat_rate = v_rate,
             vat_amount = round(v_price * v_qty * v_rate / 100, 2),
             custom_name = CASE WHEN product_id IS NULL THEN COALESCE(NULLIF(btrim(it ->> 'custom_name'), ''), custom_name) ELSE custom_name END,
             custom_description = CASE WHEN product_id IS NULL THEN NULLIF(btrim(it ->> 'custom_description'), '') ELSE custom_description END
       WHERE id = v_id;
    ELSE
      INSERT INTO public.order_items (order_id, product_id, quantity, price, vat_rate, vat_amount, custom_name, custom_description, design_data)
      VALUES (
        _order_id,
        NULLIF(it ->> 'product_id', ''),
        v_qty,
        v_price,
        v_rate,
        round(v_price * v_qty * v_rate / 100, 2),
        CASE WHEN NULLIF(it ->> 'product_id', '') IS NULL THEN btrim(it ->> 'custom_name') END,
        CASE WHEN NULLIF(it ->> 'product_id', '') IS NULL THEN NULLIF(btrim(it ->> 'custom_description'), '') END,
        CASE WHEN NULLIF(it ->> 'product_id', '') IS NULL
          THEN jsonb_build_object('custom', true, 'name', btrim(it ->> 'custom_name'), 'description', COALESCE(btrim(it ->> 'custom_description'), ''))
        END
      );
    END IF;
  END LOOP;

  v_total := GREATEST(round(v_items + v_vat + v_ship - v_disc - COALESCE(o.payment_discount, 0) - COALESCE(o.gift_card_amount, 0) - COALESCE(o.reward_points_amount, 0), 2), 0);

  UPDATE public.orders
     SET subtotal_net = v_items,
         vat_total = v_vat,
         shipping_cost = v_ship,
         discount_amount = v_disc,
         total = v_total
   WHERE id = _order_id;

  INSERT INTO public.order_status_history (order_id, status, notes)
  VALUES (_order_id, o.status, NULLIF(btrim(COALESCE(_note, '')), ''));

  PERFORM set_config('loja3d.stock_ctx', '', true);
  RETURN v_total;
END;
$function$;
-- ---------------------------------------------------------------------------------------------
-- Ajuste de estoque no Admin com motivo e nota. _mode 'set' (novo valor) ou 'add' (soma, pode ser negativo).
-- Alvo: cor + tamanho (linha da matriz; criada se faltar), só tamanho, só cor ou o produto.
-- Erros estáveis: forbidden, not_found, invalid_value, invalid_reason.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_adjust_stock(
  _product_id text, _variation_id uuid, _size_id uuid, _mode text, _value integer, _reason text, _note text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  cur integer;
  nxt integer;
  prev text := COALESCE(current_setting('loja3d.stock_ctx', true), '');
BEGIN
  IF NOT COALESCE(public.has_role(auth.uid(), 'admin'::app_role), false) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF _reason IS NULL OR _reason NOT IN ('receive', 'count', 'damage', 'other') THEN RAISE EXCEPTION 'invalid_reason' USING ERRCODE = '22023'; END IF;
  IF _value IS NULL OR _mode NOT IN ('set', 'add') OR (_mode = 'set' AND _value < 0) OR (_mode = 'add' AND _value = 0) OR abs(_value) > 1000000 THEN
    RAISE EXCEPTION 'invalid_value' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = _product_id) THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF _variation_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.product_variations WHERE id = _variation_id AND product_id = _product_id) THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;
  IF _size_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.product_sizes WHERE id = _size_id AND product_id = _product_id) THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Estoque atual do alvo (combinação sem linha na matriz = estoque do tamanho, como a loja mostra).
  IF _variation_id IS NOT NULL AND _size_id IS NOT NULL THEN
    SELECT stock_quantity INTO cur FROM public.product_variation_size_availability WHERE variation_id = _variation_id AND product_size_id = _size_id;
    IF NOT FOUND THEN
      SELECT stock_quantity INTO cur FROM public.product_sizes WHERE id = _size_id;
      INSERT INTO public.product_variation_size_availability (variation_id, product_size_id, is_available, stock_quantity)
      VALUES (_variation_id, _size_id, true, COALESCE(cur, 0));
    END IF;
  ELSIF _size_id IS NOT NULL THEN
    SELECT stock_quantity INTO cur FROM public.product_sizes WHERE id = _size_id;
  ELSIF _variation_id IS NOT NULL THEN
    SELECT stock_quantity INTO cur FROM public.product_variations WHERE id = _variation_id;
  ELSE
    SELECT stock_quantity INTO cur FROM public.products WHERE id = _product_id;
  END IF;

  nxt := CASE WHEN _mode = 'set' THEN _value ELSE COALESCE(cur, 0) + _value END;
  IF nxt < 0 THEN RAISE EXCEPTION 'invalid_value' USING ERRCODE = '22023'; END IF;

  PERFORM set_config('loja3d.stock_ctx', jsonb_build_object('reason', _reason, 'note', left(NULLIF(btrim(COALESCE(_note, '')), ''), 500))::text, true);
  IF _variation_id IS NOT NULL AND _size_id IS NOT NULL THEN
    UPDATE public.product_variation_size_availability SET stock_quantity = nxt WHERE variation_id = _variation_id AND product_size_id = _size_id;
  ELSIF _size_id IS NOT NULL THEN
    UPDATE public.product_sizes SET stock_quantity = nxt WHERE id = _size_id;
  ELSIF _variation_id IS NOT NULL THEN
    UPDATE public.product_variations SET stock_quantity = nxt WHERE id = _variation_id;
  ELSE
    UPDATE public.products SET stock_quantity = nxt WHERE id = _product_id;
  END IF;
  PERFORM set_config('loja3d.stock_ctx', prev, true);
  RETURN nxt;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_adjust_stock(text, uuid, uuid, text, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_adjust_stock(text, uuid, uuid, text, integer, text, text) TO authenticated;

-- ---------------------------------------------------------------------------------------------
-- Lista para o Admin: com nome do produto, cor, tamanho e quem fez; filtros e total para paginar.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_stock_movements(
  _since timestamptz DEFAULT NULL, _reasons text[] DEFAULT NULL, _q text DEFAULT NULL, _product_id text DEFAULT NULL,
  _limit integer DEFAULT 50, _offset integer DEFAULT 0
)
RETURNS TABLE (
  id bigint, created_at timestamptz, product_id text, product_name text, product_image text, variation_name text, size_label text,
  sku text, quantity_before integer, quantity_after integer, change integer, reason text, order_id uuid, actor_email text, note text,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE q text := NULLIF(lower(btrim(COALESCE(_q, ''))), '');
BEGIN
  IF NOT COALESCE(public.has_role(auth.uid(), 'admin'::app_role), false) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT m.id, m.created_at, m.product_id, p.name, p.image, v.name, s.size_label, m.sku, m.quantity_before, m.quantity_after,
         m.change, m.reason, m.order_id, u.email::text, m.note, count(*) OVER ()
    FROM public.stock_movements m
    JOIN public.products p ON p.id = m.product_id
    LEFT JOIN public.product_variations v ON v.id = m.variation_id
    LEFT JOIN public.product_sizes s ON s.id = m.size_id
    LEFT JOIN auth.users u ON u.id = m.actor
   WHERE (_since IS NULL OR m.created_at >= _since)
     AND (_reasons IS NULL OR cardinality(_reasons) = 0 OR m.reason = ANY (_reasons))
     AND (_product_id IS NULL OR m.product_id = _product_id)
     AND (q IS NULL OR lower(p.name) LIKE '%' || q || '%' OR lower(COALESCE(m.sku, '')) LIKE '%' || q || '%'
          OR lower(COALESCE(p.sku, '')) LIKE '%' || q || '%' OR m.order_id::text LIKE q || '%')
   ORDER BY m.created_at DESC, m.id DESC
   LIMIT LEAST(GREATEST(COALESCE(_limit, 50), 1), 500) OFFSET GREATEST(COALESCE(_offset, 0), 0);
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_stock_movements(timestamptz, text[], text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_stock_movements(timestamptz, text[], text, text, integer, integer) TO authenticated;

-- Números do período: unidades por motivo (saídas negativas, entradas positivas) e quantos movimentos.
CREATE OR REPLACE FUNCTION public.admin_stock_summary(_since timestamptz DEFAULT NULL, _product_id text DEFAULT NULL)
RETURNS TABLE (reason text, units_in bigint, units_out bigint, movements bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT COALESCE(public.has_role(auth.uid(), 'admin'::app_role), false) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT m.reason, COALESCE(sum(m.change) FILTER (WHERE m.change > 0), 0)::bigint, COALESCE(-sum(m.change) FILTER (WHERE m.change < 0), 0)::bigint, count(*)
    FROM public.stock_movements m
   WHERE (_since IS NULL OR m.created_at >= _since) AND (_product_id IS NULL OR m.product_id = _product_id)
   GROUP BY m.reason;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_stock_summary(timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_stock_summary(timestamptz, text) TO authenticated;
