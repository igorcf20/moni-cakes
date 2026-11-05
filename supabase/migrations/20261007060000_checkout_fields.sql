-- =============================================================================================
-- Campos extra no checkout (recurso checkout_fields em Admin > Recursos da loja, ligado por padrão):
-- Admin > Vendas > Campos do checkout. Ex.: "Embrulhar para presente" (caixa com preço), "Mensagem no cartão"
-- (texto), "Horário de entrega" (lista com preço por opção).
--  1) checkout_fields   nome interno, tipo (checkbox, select, text, textarea), texto e ajuda por idioma, opções com
--                       preço, preço da caixa ou do texto, obrigatório, tamanho máximo, países, ordem, ativo.
--                       Leitura pública só dos ativos; escrita só do Admin. Fica no registo de atividade.
--  2) orders.checkout_fields  respostas do cliente com os textos da época (gravadas pelo create-order)
--     orders.extras_amount    soma dos preços (moeda base, sem imposto); orders.extras_vat imposto do país sobre ela.
--     Só o servidor grava (orders_lock_server_columns). O total do pedido já os inclui.
--  3) admin_update_order_items passa a manter os extras no total ao editar os itens.
-- As regras (validar e somar) ficam em supabase/functions/_shared/checkoutFields.ts (cópia em src/lib).
-- =============================================================================================

CREATE TABLE IF NOT EXISTS public.checkout_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'checkbox',
  label_i18n jsonb NOT NULL DEFAULT '{}'::jsonb,
  help_i18n jsonb NOT NULL DEFAULT '{}'::jsonb,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  price numeric(10,2) NOT NULL DEFAULT 0,
  required boolean NOT NULL DEFAULT false,
  max_length integer NOT NULL DEFAULT 200,
  countries text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT checkout_fields_kind CHECK (kind IN ('checkbox', 'select', 'text', 'textarea')),
  CONSTRAINT checkout_fields_name_len CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  CONSTRAINT checkout_fields_i18n CHECK (jsonb_typeof(label_i18n) = 'object' AND jsonb_typeof(help_i18n) = 'object'),
  CONSTRAINT checkout_fields_options CHECK (jsonb_typeof(options) = 'array' AND jsonb_array_length(options) <= 30),
  CONSTRAINT checkout_fields_price CHECK (price >= 0 AND price <= 100000),
  CONSTRAINT checkout_fields_max_length CHECK (max_length BETWEEN 1 AND 1000)
);
CREATE INDEX IF NOT EXISTS checkout_fields_order_idx ON public.checkout_fields (display_order, name);

COMMENT ON TABLE public.checkout_fields IS 'Campos extra no checkout (Admin > Campos do checkout). Preço validado e somado no create-order.';
COMMENT ON COLUMN public.checkout_fields.options IS 'Só para kind=select: [{id, label_i18n, price}].';
COMMENT ON COLUMN public.checkout_fields.countries IS 'Códigos ISO dos países onde aparece; vazio = todos.';

CREATE OR REPLACE FUNCTION public.checkout_fields_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.name := btrim(NEW.name);
  NEW.countries := ARRAY(SELECT DISTINCT upper(c) FROM unnest(COALESCE(NEW.countries, '{}')) c WHERE upper(c) ~ '^[A-Z]{2}$');
  IF NEW.kind <> 'select' THEN NEW.options := '[]'::jsonb; ELSE NEW.price := 0; END IF;
  IF NEW.kind = 'select' AND jsonb_array_length(NEW.options) = 0 THEN
    RAISE EXCEPTION 'options_required' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.options) o
              WHERE jsonb_typeof(o) <> 'object' OR COALESCE(o ->> 'id', '') = ''
                 OR COALESCE((o ->> 'price')::numeric, 0) < 0 OR COALESCE((o ->> 'price')::numeric, 0) > 100000) THEN
    RAISE EXCEPTION 'invalid_option' USING ERRCODE = '22023';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS checkout_fields_touch_biu ON public.checkout_fields;
CREATE TRIGGER checkout_fields_touch_biu
BEFORE INSERT OR UPDATE ON public.checkout_fields
FOR EACH ROW EXECUTE FUNCTION public.checkout_fields_touch();

ALTER TABLE public.checkout_fields ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone reads active checkout fields" ON public.checkout_fields;
CREATE POLICY "Anyone reads active checkout fields" ON public.checkout_fields
  FOR SELECT TO anon, authenticated
  USING (is_active);

DROP POLICY IF EXISTS "Admins manage checkout fields" ON public.checkout_fields;
CREATE POLICY "Admins manage checkout fields" ON public.checkout_fields
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

GRANT SELECT ON public.checkout_fields TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checkout_fields TO authenticated;
GRANT ALL ON public.checkout_fields TO service_role;

-- Registo de atividade do Admin (mesma função das outras tabelas).
DO $$
BEGIN
  IF to_regprocedure('public.admin_activity_capture()') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS zz_admin_activity ON public.checkout_fields;
    CREATE TRIGGER zz_admin_activity AFTER INSERT OR UPDATE OR DELETE ON public.checkout_fields
      FOR EACH ROW EXECUTE FUNCTION public.admin_activity_capture();
  END IF;
END $$;

-- ---------------------------------------------------------------------------------------------
-- No pedido
-- ---------------------------------------------------------------------------------------------
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS checkout_fields jsonb;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS extras_amount numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS extras_vat numeric(10,2) NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.orders.checkout_fields IS 'Respostas aos campos extra do checkout: [{field_id, name, kind, label, value, option_label, price}].';
COMMENT ON COLUMN public.orders.extras_amount IS 'Soma dos preços dos campos extra (moeda base, sem imposto). Já está no total.';
COMMENT ON COLUMN public.orders.extras_vat IS 'Imposto do país sobre extras_amount. Já está no total.';

-- Colunas que só o servidor grava (as anteriores e as dos campos extra).
CREATE OR REPLACE FUNCTION public.orders_lock_server_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE jwt_role text;
BEGIN
  BEGIN
    jwt_role := coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
                         (current_setting('request.jwt.claims', true)::jsonb ->> 'role'));
  EXCEPTION WHEN OTHERS THEN jwt_role := NULL; END;
  IF jwt_role IS NULL OR jwt_role = 'service_role' OR public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;
  NEW.payment_discount    := OLD.payment_discount;
  NEW.shipping_service_id := OLD.shipping_service_id;
  NEW.shipping_details    := OLD.shipping_details;
  NEW.checkout_fields     := OLD.checkout_fields;
  NEW.extras_amount       := OLD.extras_amount;
  NEW.extras_vat          := OLD.extras_vat;
  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------------------------
-- Editar itens no Admin mantém os extras no total
-- ---------------------------------------------------------------------------------------------
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

  -- Campos extra do checkout (embrulho, cartão...) continuam no pedido com o imposto da época.
  v_total := GREATEST(round(v_items + v_vat + v_ship + COALESCE(o.extras_amount, 0) + COALESCE(o.extras_vat, 0) - v_disc - COALESCE(o.payment_discount, 0) - COALESCE(o.gift_card_amount, 0) - COALESCE(o.reward_points_amount, 0), 2), 0);

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

