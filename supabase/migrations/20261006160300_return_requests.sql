-- Devoluções e trocas pedidas pela área do cliente (Minha conta > Devoluções) e tratadas no Admin > Devoluções.
--   return_requests   um pedido de devolução: itens e quantidades, motivo, o que o cliente quer (reembolso, troca,
--                     reparo ou crédito), comentário, estado, resposta da loja (o cliente vê) e notas internas
--   request_return()  única forma de o cliente criar um pedido: confere conta, estado do pedido, prazo,
--                     itens e quantidades (nunca mais do que comprou, descontando devoluções anteriores)
-- Regras da loja em store_settings.return_settings: { enabled, days, actions[] } (Admin > Devoluções > Regras).
-- O reembolso em si continua no pedido (bloco Cancelamento e reembolso); aqui fica o acompanhamento.

CREATE TABLE IF NOT EXISTS public.return_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  items jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(items) = 'array'),
  reason text NOT NULL CHECK (reason IN ('defective', 'damaged', 'wrong_item', 'not_as_described', 'size_fit', 'changed_mind', 'other')),
  action text NOT NULL CHECK (action IN ('refund', 'exchange', 'repair', 'credit')),
  comment text CHECK (comment IS NULL OR length(comment) <= 2000),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'approved', 'received', 'completed', 'rejected')),
  store_reply text CHECK (store_reply IS NULL OR length(store_reply) <= 2000),
  admin_notes text CHECK (admin_notes IS NULL OR length(admin_notes) <= 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS return_requests_order_idx ON public.return_requests (order_id);
CREATE INDEX IF NOT EXISTS return_requests_user_idx ON public.return_requests (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS return_requests_status_idx ON public.return_requests (status);

ALTER TABLE public.return_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage returns" ON public.return_requests;
CREATE POLICY "Admins manage returns" ON public.return_requests
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- O cliente lê os seus pedidos de devolução, sem as notas internas (a vista abaixo esconde a coluna).
DROP POLICY IF EXISTS "Customers read own returns" ON public.return_requests;
CREATE POLICY "Customers read own returns" ON public.return_requests
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Leitura por colunas: admin_notes fica de fora para toda a gente (o site pede as colunas pelo nome, nunca *).
-- Criar é só pela função request_return; alterar e apagar só passam a política dos administradores.
REVOKE ALL ON public.return_requests FROM anon;
REVOKE ALL ON public.return_requests FROM authenticated;
GRANT SELECT (id, order_id, user_id, items, reason, action, comment, status, store_reply, created_at, updated_at, resolved_at)
  ON public.return_requests TO authenticated;
GRANT UPDATE, DELETE ON public.return_requests TO authenticated;

-- Notas internas: só administradores, por esta função (o privilégio de coluna acima fecha-as para todos).
CREATE OR REPLACE FUNCTION public.admin_return_notes(_ids uuid[])
RETURNS TABLE (id uuid, admin_notes text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT coalesce(public.has_role(auth.uid(), 'admin'::app_role), false) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT r.id, r.admin_notes FROM public.return_requests r WHERE r.id = ANY (_ids);
END $$;
REVOKE ALL ON FUNCTION public.admin_return_notes(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_return_notes(uuid[]) TO authenticated;

-- Datas e campos protegidos: o cliente nunca escreve; o administrador não troca o pedido nem o cliente.
CREATE OR REPLACE FUNCTION public.return_requests_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.order_id := OLD.order_id;
  NEW.user_id := OLD.user_id;
  NEW.created_at := OLD.created_at;
  IF NEW.status IN ('completed', 'rejected') AND OLD.status NOT IN ('completed', 'rejected') THEN
    NEW.resolved_at := now();
  ELSIF NEW.status NOT IN ('completed', 'rejected') THEN
    NEW.resolved_at := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS return_requests_touch ON public.return_requests;
CREATE TRIGGER return_requests_touch BEFORE UPDATE ON public.return_requests
  FOR EACH ROW EXECUTE FUNCTION public.return_requests_touch();

INSERT INTO public.store_settings (key, value)
VALUES ('return_settings', '{"enabled": true, "days": 30, "actions": ["refund", "exchange"]}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Pedido de devolução do cliente. _items = [{ "order_item_id": uuid, "quantity": n }].
CREATE OR REPLACE FUNCTION public.request_return(_order_id uuid, _items jsonb, _reason text, _action text, _comment text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  cfg jsonb;
  o record;
  it jsonb;
  oi record;
  qty integer;
  already integer;
  days integer;
  since timestamptz;
  clean jsonb := '[]'::jsonb;
  new_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_signed_in' USING ERRCODE = '42501'; END IF;

  SELECT value INTO cfg FROM public.store_settings WHERE key = 'return_settings';
  cfg := coalesce(cfg, '{}'::jsonb);
  IF NOT coalesce((cfg->>'enabled')::boolean, true) THEN RAISE EXCEPTION 'returns_disabled' USING ERRCODE = 'P0001'; END IF;
  IF _reason NOT IN ('defective', 'damaged', 'wrong_item', 'not_as_described', 'size_fit', 'changed_mind', 'other') THEN
    RAISE EXCEPTION 'invalid_reason' USING ERRCODE = 'P0001';
  END IF;
  IF NOT (coalesce(cfg->'actions', '["refund","exchange"]'::jsonb) ? _action) THEN
    RAISE EXCEPTION 'invalid_action' USING ERRCODE = 'P0001';
  END IF;
  IF _comment IS NOT NULL AND length(_comment) > 2000 THEN RAISE EXCEPTION 'comment_too_long' USING ERRCODE = 'P0001'; END IF;

  SELECT id, user_id, status, created_at, shipped_at, delivered_at INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND OR o.user_id IS DISTINCT FROM uid THEN RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0001'; END IF;
  IF o.status NOT IN ('shipped', 'delivered', 'completed', 'ready_for_pickup') THEN
    RAISE EXCEPTION 'order_not_delivered' USING ERRCODE = 'P0001';
  END IF;
  days := greatest(0, coalesce((cfg->>'days')::integer, 30));
  since := coalesce(o.delivered_at, o.shipped_at, o.created_at);
  IF since + make_interval(days => days) < now() THEN RAISE EXCEPTION 'return_window_closed' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM public.return_requests r WHERE r.order_id = _order_id AND r.status IN ('requested', 'approved', 'received')) THEN
    RAISE EXCEPTION 'return_already_open' USING ERRCODE = 'P0001';
  END IF;

  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'no_items' USING ERRCODE = 'P0001';
  END IF;
  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    qty := CASE WHEN (it->>'quantity') ~ '^\d{1,6}$' THEN (it->>'quantity')::integer ELSE 0 END;
    CONTINUE WHEN qty <= 0;
    SELECT i.id, i.quantity, i.product_id, coalesce(p.name, i.custom_name, i.design_data->>'name') AS name
      INTO oi
      FROM public.order_items i LEFT JOIN public.products p ON p.id = i.product_id
      WHERE i.order_id = _order_id AND i.id::text = (it->>'order_item_id');
    IF NOT FOUND THEN RAISE EXCEPTION 'invalid_item' USING ERRCODE = 'P0001'; END IF;
    SELECT coalesce(sum((e->>'quantity')::integer), 0) INTO already
      FROM public.return_requests r, jsonb_array_elements(r.items) e
      WHERE r.order_id = _order_id AND r.status <> 'rejected' AND e->>'order_item_id' = oi.id::text;
    IF qty > oi.quantity - already THEN RAISE EXCEPTION 'invalid_quantity' USING ERRCODE = 'P0001'; END IF;
    IF clean @> jsonb_build_array(jsonb_build_object('order_item_id', oi.id::text)) THEN
      RAISE EXCEPTION 'invalid_item' USING ERRCODE = 'P0001';
    END IF;
    clean := clean || jsonb_build_array(jsonb_build_object(
      'order_item_id', oi.id::text, 'product_id', oi.product_id, 'name', coalesce(oi.name, ''), 'quantity', qty));
  END LOOP;
  IF jsonb_array_length(clean) = 0 THEN RAISE EXCEPTION 'no_items' USING ERRCODE = 'P0001'; END IF;

  INSERT INTO public.return_requests (order_id, user_id, items, reason, action, comment)
  VALUES (_order_id, uid, clean, _reason, _action, nullif(btrim(coalesce(_comment, '')), ''))
  RETURNING id INTO new_id;
  RETURN new_id;
END $$;

REVOKE ALL ON FUNCTION public.request_return(uuid, jsonb, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_return(uuid, jsonb, text, text, text) TO authenticated;

COMMENT ON TABLE public.return_requests IS 'Pedidos de devolução e troca feitos pelo cliente; tratados no Admin > Devoluções.';
