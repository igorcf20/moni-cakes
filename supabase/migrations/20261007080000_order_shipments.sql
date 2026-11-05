-- =============================================================================================
-- Envios parciais (recurso partial_shipments em Admin > Recursos da loja, desligado por padrão).
-- Um pedido pode sair em várias remessas, cada uma com os seus itens e quantidades, transportadora, rastreio e estado.
--   order_shipments          remessa (número 1, 2... por pedido; estado preparing / shipped / delivered)
--   order_shipment_items     itens e quantidades de cada remessa (nunca mais do que o pedido tem)
--   admin_save_shipment      cria ou altera uma remessa (só Admin; confere as quantidades)
--   admin_delete_shipment    apaga uma remessa
--   _order_shipments_sync    tudo enviado = pedido "Enviado"; tudo entregue = "Entregue"; guarda o 1.º rastreio no pedido
--   order_items_shipped_guard  item já enviado numa remessa não pode ser apagado nem ficar com menos unidades
-- O cliente lê as remessas dos seus pedidos (RLS); escrever só pelas funções.
-- =============================================================================================

CREATE TABLE IF NOT EXISTS public.order_shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  number integer NOT NULL CHECK (number > 0),
  status text NOT NULL DEFAULT 'shipped' CHECK (status IN ('preparing', 'shipped', 'delivered')),
  carrier text CHECK (carrier IS NULL OR length(carrier) <= 80),
  tracking_code text CHECK (tracking_code IS NULL OR length(tracking_code) <= 200),
  tracking_url text CHECK (tracking_url IS NULL OR (length(tracking_url) <= 1000 AND tracking_url ~* '^https?://')),
  note text CHECK (note IS NULL OR length(note) <= 1000),
  shipped_at timestamptz,
  delivered_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, number)
);

CREATE TABLE IF NOT EXISTS public.order_shipment_items (
  shipment_id uuid NOT NULL REFERENCES public.order_shipments(id) ON DELETE CASCADE,
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  quantity integer NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (shipment_id, order_item_id)
);
CREATE INDEX IF NOT EXISTS order_shipment_items_item_idx ON public.order_shipment_items (order_item_id);
CREATE INDEX IF NOT EXISTS order_shipment_items_order_idx ON public.order_shipment_items (order_id);

ALTER TABLE public.order_shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_shipment_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read shipments" ON public.order_shipments;
CREATE POLICY "Admins read shipments" ON public.order_shipments FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Customers read own shipments" ON public.order_shipments;
CREATE POLICY "Customers read own shipments" ON public.order_shipments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.user_id = auth.uid()));

DROP POLICY IF EXISTS "Admins read shipment items" ON public.order_shipment_items;
CREATE POLICY "Admins read shipment items" ON public.order_shipment_items FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Customers read own shipment items" ON public.order_shipment_items;
CREATE POLICY "Customers read own shipment items" ON public.order_shipment_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.user_id = auth.uid()));

REVOKE ALL ON public.order_shipments, public.order_shipment_items FROM anon;
GRANT SELECT ON public.order_shipments, public.order_shipment_items TO authenticated;
GRANT ALL ON public.order_shipments, public.order_shipment_items TO service_role;

-- Registo de atividade do Admin (mesma função das outras tabelas; parent_id = order_id).
DO $$
BEGIN
  IF to_regprocedure('public.admin_activity_capture()') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS zz_admin_activity ON public.order_shipments;
    CREATE TRIGGER zz_admin_activity AFTER INSERT OR UPDATE OR DELETE ON public.order_shipments
      FOR EACH ROW EXECUTE FUNCTION public.admin_activity_capture();
  END IF;
END $$;

-- ---------------------------------------------------------------------------------------------
-- Estado do pedido a partir das remessas
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._order_shipments_sync(_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  o record;
  total_qty integer;
  shipped_qty integer;
  delivered_qty integer;
  first_code text;
BEGIN
  SELECT id, status, tracking_number INTO o FROM public.orders WHERE id = _order_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT COALESCE(sum(quantity), 0) INTO total_qty FROM public.order_items WHERE order_id = _order_id;
  SELECT COALESCE(sum(si.quantity) FILTER (WHERE s.status IN ('shipped', 'delivered')), 0),
         COALESCE(sum(si.quantity) FILTER (WHERE s.status = 'delivered'), 0)
    INTO shipped_qty, delivered_qty
    FROM public.order_shipment_items si JOIN public.order_shipments s ON s.id = si.shipment_id
   WHERE si.order_id = _order_id;

  SELECT tracking_code INTO first_code FROM public.order_shipments
   WHERE order_id = _order_id AND status IN ('shipped', 'delivered') AND COALESCE(tracking_code, '') <> ''
   ORDER BY number LIMIT 1;

  IF o.tracking_number IS NULL AND first_code IS NOT NULL THEN
    UPDATE public.orders SET tracking_number = first_code WHERE id = _order_id;
  END IF;

  IF total_qty > 0 AND shipped_qty >= total_qty AND o.status IN ('paid', 'preparing') THEN
    UPDATE public.orders SET status = 'shipped', shipped_at = COALESCE(shipped_at, now()) WHERE id = _order_id;
    o.status := 'shipped';
  END IF;
  IF total_qty > 0 AND delivered_qty >= total_qty AND o.status = 'shipped' THEN
    UPDATE public.orders SET status = 'delivered', delivered_at = COALESCE(delivered_at, now()) WHERE id = _order_id;
  END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public._order_shipments_sync(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Criar ou alterar uma remessa. _items = [{ "order_item_id": uuid, "quantity": n }]; null ao alterar = mantém os itens.
-- Erros estáveis (o Admin traduz): not_allowed, feature_off, order_not_found, order_closed, shipment_not_found,
-- no_items, invalid_item, too_many, invalid_status.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_save_shipment(
  _order_id uuid, _shipment_id uuid, _items jsonb, _status text,
  _carrier text DEFAULT NULL, _tracking_code text DEFAULT NULL, _tracking_url text DEFAULT NULL, _note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  o record;
  sid uuid := _shipment_id;
  prev record;
  line jsonb;
  item_id uuid;
  qty integer;
  ordered integer;
  other integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'not_allowed'; END IF;
  IF NOT public.feature_enabled('partial_shipments', false) THEN RAISE EXCEPTION 'feature_off'; END IF;
  IF _status IS NULL OR _status NOT IN ('preparing', 'shipped', 'delivered') THEN RAISE EXCEPTION 'invalid_status'; END IF;

  SELECT id, status INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF o.status IN ('cancelled', 'refunded') THEN RAISE EXCEPTION 'order_closed'; END IF;

  IF sid IS NOT NULL THEN
    SELECT * INTO prev FROM public.order_shipments WHERE id = sid AND order_id = _order_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'shipment_not_found'; END IF;
  ELSIF _items IS NULL THEN
    RAISE EXCEPTION 'no_items';
  END IF;

  IF _items IS NOT NULL THEN
    IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN RAISE EXCEPTION 'no_items'; END IF;
    -- Mesma linha repetida = erro (cada item uma vez por remessa)
    IF (SELECT count(*) FROM jsonb_array_elements(_items)) <> (SELECT count(DISTINCT x ->> 'order_item_id') FROM jsonb_array_elements(_items) x) THEN
      RAISE EXCEPTION 'invalid_item';
    END IF;
    FOR line IN SELECT * FROM jsonb_array_elements(_items) LOOP
      BEGIN
        item_id := (line ->> 'order_item_id')::uuid;
        qty := (line ->> 'quantity')::integer;
      EXCEPTION WHEN others THEN RAISE EXCEPTION 'invalid_item';
      END;
      IF qty IS NULL OR qty <= 0 THEN RAISE EXCEPTION 'invalid_item'; END IF;
      SELECT quantity INTO ordered FROM public.order_items WHERE id = item_id AND order_id = _order_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'invalid_item'; END IF;
      SELECT COALESCE(sum(quantity), 0) INTO other FROM public.order_shipment_items
       WHERE order_item_id = item_id AND (sid IS NULL OR shipment_id <> sid);
      IF other + qty > ordered THEN RAISE EXCEPTION 'too_many'; END IF;
    END LOOP;
  END IF;

  IF sid IS NULL THEN
    INSERT INTO public.order_shipments (order_id, number, status, carrier, tracking_code, tracking_url, note, shipped_at, delivered_at, created_by)
    VALUES (
      _order_id,
      (SELECT COALESCE(max(number), 0) + 1 FROM public.order_shipments WHERE order_id = _order_id),
      _status,
      NULLIF(trim(_carrier), ''), NULLIF(trim(_tracking_code), ''), NULLIF(trim(_tracking_url), ''), NULLIF(trim(_note), ''),
      CASE WHEN _status IN ('shipped', 'delivered') THEN now() END,
      CASE WHEN _status = 'delivered' THEN now() END,
      auth.uid()
    )
    RETURNING id INTO sid;
  ELSE
    UPDATE public.order_shipments SET
      status = _status,
      carrier = NULLIF(trim(_carrier), ''),
      tracking_code = NULLIF(trim(_tracking_code), ''),
      tracking_url = NULLIF(trim(_tracking_url), ''),
      note = NULLIF(trim(_note), ''),
      shipped_at = CASE WHEN _status IN ('shipped', 'delivered') THEN COALESCE(prev.shipped_at, now()) END,
      delivered_at = CASE WHEN _status = 'delivered' THEN COALESCE(prev.delivered_at, now()) END,
      updated_at = now()
    WHERE id = sid;
  END IF;

  IF _items IS NOT NULL THEN
    DELETE FROM public.order_shipment_items WHERE shipment_id = sid;
    INSERT INTO public.order_shipment_items (shipment_id, order_item_id, order_id, quantity)
    SELECT sid, (x ->> 'order_item_id')::uuid, _order_id, (x ->> 'quantity')::integer FROM jsonb_array_elements(_items) x;
  END IF;

  PERFORM public._order_shipments_sync(_order_id);
  RETURN sid;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_save_shipment(uuid, uuid, jsonb, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_shipment(uuid, uuid, jsonb, text, text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete_shipment(_shipment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  oid uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'not_allowed'; END IF;
  DELETE FROM public.order_shipments WHERE id = _shipment_id RETURNING order_id INTO oid;
  IF oid IS NULL THEN RAISE EXCEPTION 'shipment_not_found'; END IF;
  PERFORM public._order_shipments_sync(oid);
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_delete_shipment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_shipment(uuid) TO authenticated;

-- ---------------------------------------------------------------------------------------------
-- Item já enviado não some nem fica com menos unidades do que as enviadas (edição de itens do pedido).
-- Apagar o pedido inteiro continua a funcionar: a cascata corre num nível de trigger acima e é ignorada aqui.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.order_items_shipped_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  sent integer;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT COALESCE(sum(quantity), 0) INTO sent FROM public.order_shipment_items WHERE order_item_id = OLD.id;
  IF sent > 0 AND (TG_OP = 'DELETE' OR NEW.quantity < sent) THEN
    RAISE EXCEPTION 'shipped_items';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS order_items_shipped_guard ON public.order_items;
CREATE TRIGGER order_items_shipped_guard BEFORE UPDATE OF quantity OR DELETE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.order_items_shipped_guard();
