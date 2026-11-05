-- =============================================================================================
-- Editar os itens de um pedido já criado (Admin > Pedidos > página do pedido > Editar itens).
-- public.admin_update_order_items(_order_id, _items, _shipping_cost, _discount, _note):
--   * só administradores; pedido ainda não enviado, entregue, cancelado nem reembolsado;
--   * _items = lista completa dos itens que o pedido passa a ter:
--       [{ "id": <uuid do item existente ou null>, "product_id", "quantity", "price", "vat_rate",
--          "custom_name", "custom_description" }]
--     itens existentes mantêm design_data (personalização, arquivos); os que faltam na lista são apagados;
--   * estoque: devolve o dos itens apagados, acerta a diferença dos alterados; os novos reservam pelo
--     trigger order_items_reserve_stock_ai (como no pedido manual);
--   * recalcula imposto (vat_rate de cada item), subtotal_net, vat_total e total
--     (itens + imposto + frete - desconto - desconto do meio de pagamento) e regista no histórico.
-- =============================================================================================

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

  v_total := GREATEST(round(v_items + v_vat + v_ship - v_disc - COALESCE(o.payment_discount, 0), 2), 0);

  UPDATE public.orders
     SET subtotal_net = v_items,
         vat_total = v_vat,
         shipping_cost = v_ship,
         discount_amount = v_disc,
         total = v_total
   WHERE id = _order_id;

  INSERT INTO public.order_status_history (order_id, status, notes)
  VALUES (_order_id, o.status, NULLIF(btrim(COALESCE(_note, '')), ''));

  RETURN v_total;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_update_order_items(uuid, jsonb, numeric, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_order_items(uuid, jsonb, numeric, numeric, text) TO authenticated;

COMMENT ON FUNCTION public.admin_update_order_items(uuid, jsonb, numeric, numeric, text) IS
  'Admin: substitui os itens de um pedido ainda não enviado, acerta o estoque e recalcula os totais.';
