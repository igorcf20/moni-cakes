-- =============================================================================================
-- Pedido de orçamento B2B (recurso quotes em Admin > Recursos da loja, desligado por padrão): o cliente pede preço
-- para quantidades maiores, a loja responde com uma proposta e o cliente compra pelo checkout normal com esse preço.
--  1) quote_requests   pedido do cliente: empresa, contato, mensagem; estado new (novo), sent (proposta enviada),
--                      accepted (aceita), ordered (virou pedido), declined (cliente recusou), rejected (loja recusou),
--                      cancelled (cliente cancelou antes da proposta). Vencida = sent/accepted com valid_until passado.
--  2) quote_items      produtos pedidos (produto, cor, tamanho, quantidade, preço desejado) e o preço da proposta
--  3) funções do cliente (request_quote, my_quotes, accept_quote, decline_quote, cancel_quote_request) e do Admin
--     (admin_quote_send, admin_quote_reject)
--  4) o preço do orçamento entra no pedido pelo create-order: _shared/pricing.ts confere dono, estado, validade,
--     produto, cor, tamanho e quantidade (design_data.quote {id, item_id}). Gravar o pedido marca o orçamento como
--     ordered (order_items_quote); cancelar o pedido devolve o orçamento a accepted (orders_quote_release).
-- Regras em store_settings.quotes: valid_days, product_button, cart_button, min_quantity.
-- =============================================================================================

CREATE TABLE IF NOT EXISTS public.quote_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number bigint GENERATED ALWAYS AS IDENTITY (START WITH 1001),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'new',
  company text,
  contact_name text NOT NULL,
  email text,
  phone text,
  tax_id text,
  country text,
  message text,
  store_message text,
  admin_note text,
  valid_until date,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  sent_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quote_requests_status CHECK (status IN ('new', 'sent', 'accepted', 'ordered', 'declined', 'rejected', 'cancelled')),
  CONSTRAINT quote_requests_len CHECK (
    (company IS NULL OR char_length(company) <= 160) AND char_length(btrim(contact_name)) BETWEEN 1 AND 120
    AND (email IS NULL OR char_length(email) <= 200) AND (phone IS NULL OR char_length(phone) <= 40)
    AND (tax_id IS NULL OR char_length(tax_id) <= 40) AND (country IS NULL OR char_length(country) <= 2)
    AND (message IS NULL OR char_length(message) <= 3000) AND (store_message IS NULL OR char_length(store_message) <= 3000)
    AND (admin_note IS NULL OR char_length(admin_note) <= 3000))
);
CREATE UNIQUE INDEX IF NOT EXISTS quote_requests_number_key ON public.quote_requests (number);
CREATE INDEX IF NOT EXISTS quote_requests_user_idx ON public.quote_requests (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS quote_requests_status_idx ON public.quote_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS quote_requests_order_idx ON public.quote_requests (order_id) WHERE order_id IS NOT NULL;
COMMENT ON TABLE public.quote_requests IS 'Pedidos de orçamento B2B (Admin > Vendas > Orçamentos). O cliente lê os seus por my_quotes().';

CREATE TABLE IF NOT EXISTS public.quote_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quote_requests(id) ON DELETE CASCADE,
  product_id text NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variation_id uuid REFERENCES public.product_variations(id) ON DELETE SET NULL,
  variation_name text,
  size_label text,
  quantity integer NOT NULL,
  list_price numeric(12,2) NOT NULL DEFAULT 0,
  target_price numeric(12,2),
  note text,
  unit_price numeric(12,2),
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quote_items_quantity CHECK (quantity BETWEEN 1 AND 100000),
  CONSTRAINT quote_items_prices CHECK (list_price >= 0 AND (target_price IS NULL OR target_price >= 0) AND (unit_price IS NULL OR unit_price >= 0)),
  CONSTRAINT quote_items_len CHECK (
    (variation_name IS NULL OR char_length(variation_name) <= 120) AND (size_label IS NULL OR char_length(size_label) <= 60)
    AND (note IS NULL OR char_length(note) <= 500))
);
CREATE INDEX IF NOT EXISTS quote_items_quote_idx ON public.quote_items (quote_id, position);

-- ---------------------------------------------------------------------------------------------
-- Segurança: Admin gere tudo; o cliente só por funções (a nota interna nunca chega a ele).
-- ---------------------------------------------------------------------------------------------
ALTER TABLE public.quote_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage quote requests" ON public.quote_requests;
CREATE POLICY "Admins manage quote requests" ON public.quote_requests FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins manage quote items" ON public.quote_items;
CREATE POLICY "Admins manage quote items" ON public.quote_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

REVOKE ALL ON public.quote_requests, public.quote_items FROM anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON public.quote_requests TO authenticated;
GRANT SELECT, UPDATE, DELETE ON public.quote_items TO authenticated;
GRANT ALL ON public.quote_requests, public.quote_items TO service_role;

-- Campos limpos e updated_at.
CREATE OR REPLACE FUNCTION public.quote_requests_normalize()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.company := NULLIF(btrim(COALESCE(NEW.company, '')), '');
  NEW.contact_name := btrim(NEW.contact_name);
  NEW.email := NULLIF(lower(btrim(COALESCE(NEW.email, ''))), '');
  NEW.phone := NULLIF(btrim(COALESCE(NEW.phone, '')), '');
  NEW.tax_id := NULLIF(btrim(COALESCE(NEW.tax_id, '')), '');
  NEW.country := NULLIF(upper(btrim(COALESCE(NEW.country, ''))), '');
  NEW.message := NULLIF(btrim(COALESCE(NEW.message, '')), '');
  NEW.store_message := NULLIF(btrim(COALESCE(NEW.store_message, '')), '');
  NEW.admin_note := NULLIF(btrim(COALESCE(NEW.admin_note, '')), '');
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS quote_requests_normalize ON public.quote_requests;
CREATE TRIGGER quote_requests_normalize BEFORE INSERT OR UPDATE ON public.quote_requests
  FOR EACH ROW EXECUTE FUNCTION public.quote_requests_normalize();

DO $$
BEGIN
  IF to_regprocedure('public.admin_activity_capture()') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS zz_admin_activity ON public.quote_requests;
    CREATE TRIGGER zz_admin_activity AFTER INSERT OR UPDATE OR DELETE ON public.quote_requests
      FOR EACH ROW EXECUTE FUNCTION public.admin_activity_capture();
    DROP TRIGGER IF EXISTS zz_admin_activity ON public.quote_items;
    CREATE TRIGGER zz_admin_activity AFTER INSERT OR UPDATE OR DELETE ON public.quote_items
      FOR EACH ROW EXECUTE FUNCTION public.admin_activity_capture();
  END IF;
END $$;

INSERT INTO public.store_settings (key, value)
VALUES ('quotes', '{"valid_days": 15, "product_button": true, "cart_button": true, "min_quantity": 1}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------------------------
-- Cliente
-- ---------------------------------------------------------------------------------------------

-- Pede um orçamento. _items: [{product_id, quantity, variation_id?, size_label?, target_price?, note?}].
CREATE OR REPLACE FUNCTION public.request_quote(
  _items jsonb, _company text, _contact text, _phone text, _tax_id text, _country text, _message text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  qid uuid;
  it jsonb;
  pos integer := 0;
  p record;
  vid uuid;
  vname text;
  sz text;
  qty integer;
  target numeric;
  total_units integer := 0;
  min_units integer;
BEGIN
  IF NOT public.feature_enabled('quotes', false) THEN RAISE EXCEPTION 'feature_off'; END IF;
  IF uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN RAISE EXCEPTION 'empty'; END IF;
  IF jsonb_array_length(_items) > 50 OR char_length(btrim(COALESCE(_contact, ''))) NOT BETWEEN 1 AND 120
     OR char_length(COALESCE(_company, '')) > 160 OR char_length(COALESCE(_phone, '')) > 40
     OR char_length(COALESCE(_tax_id, '')) > 40 OR char_length(COALESCE(_message, '')) > 3000 THEN
    RAISE EXCEPTION 'invalid';
  END IF;
  IF (SELECT count(*) FROM public.quote_requests WHERE user_id = uid AND status = 'new') >= 5 THEN
    RAISE EXCEPTION 'too_many';
  END IF;

  INSERT INTO public.quote_requests (user_id, company, contact_name, email, phone, tax_id, country, message)
  VALUES (uid, _company, _contact, (SELECT email FROM auth.users WHERE id = uid), _phone, _tax_id,
          NULLIF(left(regexp_replace(upper(COALESCE(_country, '')), '[^A-Z]', '', 'g'), 2), ''), _message)
  RETURNING id INTO qid;

  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    SELECT id, price, is_active INTO p FROM public.products WHERE id = it->>'product_id';
    IF p.id IS NULL OR p.is_active IS NOT TRUE THEN RAISE EXCEPTION 'invalid'; END IF;
    BEGIN
      qty := (it->>'quantity')::integer;
      target := NULLIF(it->>'target_price', '')::numeric;
    EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'invalid';
    END;
    IF qty IS NULL OR qty < 1 OR qty > 100000 OR (target IS NOT NULL AND (target < 0 OR target > 100000000)) THEN
      RAISE EXCEPTION 'invalid';
    END IF;
    vid := NULL;
    vname := NULL;
    IF NULLIF(it->>'variation_id', '') IS NOT NULL THEN
      SELECT id, name INTO vid, vname FROM public.product_variations
       WHERE id::text = it->>'variation_id' AND product_id = p.id;
      IF vid IS NULL THEN RAISE EXCEPTION 'invalid'; END IF;
    END IF;
    sz := NULLIF(btrim(COALESCE(it->>'size_label', '')), '');
    IF sz IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.product_sizes WHERE product_id = p.id AND size_label = sz) THEN
      RAISE EXCEPTION 'invalid';
    END IF;
    INSERT INTO public.quote_items (quote_id, product_id, variation_id, variation_name, size_label, quantity, list_price, target_price, note, position)
    VALUES (qid, p.id, vid, vname, sz, qty, COALESCE(p.price, 0), round(target, 2),
            NULLIF(left(btrim(COALESCE(it->>'note', '')), 500), ''), pos);
    pos := pos + 1;
    total_units := total_units + qty;
  END LOOP;

  SELECT GREATEST(1, COALESCE((value->>'min_quantity')::integer, 1)) INTO min_units FROM public.store_settings WHERE key = 'quotes';
  IF total_units < COALESCE(min_units, 1) THEN RAISE EXCEPTION 'min_quantity'; END IF;
  RETURN qid;
END;
$function$;
REVOKE ALL ON FUNCTION public.request_quote(jsonb, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_quote(jsonb, text, text, text, text, text, text) TO authenticated;

-- Orçamentos do cliente, com os itens (sem a nota interna). expired = proposta com a validade passada.
CREATE OR REPLACE FUNCTION public.my_quotes()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(jsonb_agg(q ORDER BY q.created_at DESC), '[]'::jsonb) FROM (
    SELECT r.id, r.number, r.status, r.company, r.contact_name, r.phone, r.message, r.store_message, r.valid_until,
           r.order_id, r.sent_at, r.decided_at, r.created_at,
           (r.status IN ('sent', 'accepted') AND r.valid_until IS NOT NULL AND r.valid_until < current_date) AS expired,
           (SELECT COALESCE(jsonb_agg(jsonb_build_object(
              'id', i.id, 'product_id', i.product_id, 'name', p.name, 'slug', p.slug, 'image', p.image,
              'variation_id', i.variation_id, 'variation_name', i.variation_name, 'size_label', i.size_label,
              'quantity', i.quantity, 'list_price', i.list_price, 'target_price', i.target_price, 'note', i.note,
              'unit_price', CASE WHEN r.status IN ('sent', 'accepted', 'ordered', 'declined') THEN i.unit_price END
            ) ORDER BY i.position), '[]'::jsonb)
              FROM public.quote_items i LEFT JOIN public.products p ON p.id = i.product_id WHERE i.quote_id = r.id) AS items
      FROM public.quote_requests r
     WHERE r.user_id = auth.uid() AND public.feature_enabled('quotes', false)
  ) q;
$function$;
REVOKE ALL ON FUNCTION public.my_quotes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_quotes() TO authenticated;

CREATE OR REPLACE FUNCTION public.accept_quote(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE r record;
BEGIN
  IF NOT public.feature_enabled('quotes', false) THEN RAISE EXCEPTION 'feature_off'; END IF;
  SELECT * INTO r FROM public.quote_requests WHERE id = _id AND user_id = auth.uid() FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF r.status NOT IN ('sent', 'accepted') THEN RAISE EXCEPTION 'invalid_status'; END IF;
  IF r.valid_until IS NOT NULL AND r.valid_until < current_date THEN RAISE EXCEPTION 'expired'; END IF;
  UPDATE public.quote_requests SET status = 'accepted', decided_at = COALESCE(decided_at, now()) WHERE id = _id;
END;
$function$;
REVOKE ALL ON FUNCTION public.accept_quote(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_quote(uuid) TO authenticated;

-- Recusar a proposta (sent/accepted) ou cancelar o pedido ainda sem proposta (new).
CREATE OR REPLACE FUNCTION public.decline_quote(_id uuid, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE r record;
BEGIN
  IF NOT public.feature_enabled('quotes', false) THEN RAISE EXCEPTION 'feature_off'; END IF;
  SELECT * INTO r FROM public.quote_requests WHERE id = _id AND user_id = auth.uid() FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF r.status NOT IN ('new', 'sent', 'accepted') THEN RAISE EXCEPTION 'invalid_status'; END IF;
  UPDATE public.quote_requests
     SET status = CASE WHEN r.status = 'new' THEN 'cancelled' ELSE 'declined' END,
         decided_at = now(),
         message = CASE WHEN NULLIF(btrim(COALESCE(_reason, '')), '') IS NULL THEN message
                        ELSE left(concat_ws(E'\n\n', message, btrim(_reason)), 3000) END
   WHERE id = _id;
END;
$function$;
REVOKE ALL ON FUNCTION public.decline_quote(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decline_quote(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------------------------------------

-- Envia (ou reenvia) a proposta. _items: [{id, quantity, unit_price, remove?}]. Itens fora da lista ficam como estão.
CREATE OR REPLACE FUNCTION public.admin_quote_send(_id uuid, _items jsonb, _valid_until date, _message text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  it jsonb;
  qty integer;
  unit numeric;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO r FROM public.quote_requests WHERE id = _id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF r.status = 'ordered' THEN RAISE EXCEPTION 'ordered'; END IF;
  IF _valid_until IS NOT NULL AND _valid_until < current_date THEN RAISE EXCEPTION 'invalid'; END IF;
  IF char_length(COALESCE(_message, '')) > 3000 THEN RAISE EXCEPTION 'invalid'; END IF;
  FOR it IN SELECT * FROM jsonb_array_elements(COALESCE(_items, '[]'::jsonb)) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.quote_items WHERE id::text = it->>'id' AND quote_id = _id) THEN RAISE EXCEPTION 'invalid'; END IF;
    IF (it->>'remove')::boolean IS TRUE THEN
      DELETE FROM public.quote_items WHERE id::text = it->>'id';
      CONTINUE;
    END IF;
    BEGIN
      qty := (it->>'quantity')::integer;
      unit := round((it->>'unit_price')::numeric, 2);
    EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'invalid';
    END;
    IF qty IS NULL OR qty < 1 OR qty > 100000 OR unit IS NULL OR unit < 0 OR unit > 100000000 THEN RAISE EXCEPTION 'invalid'; END IF;
    UPDATE public.quote_items SET quantity = qty, unit_price = unit WHERE id::text = it->>'id';
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM public.quote_items WHERE quote_id = _id) THEN RAISE EXCEPTION 'empty'; END IF;
  IF EXISTS (SELECT 1 FROM public.quote_items WHERE quote_id = _id AND unit_price IS NULL) THEN RAISE EXCEPTION 'missing_price'; END IF;
  UPDATE public.quote_requests
     SET status = 'sent', valid_until = _valid_until, store_message = _message, sent_at = now(), decided_at = NULL
   WHERE id = _id;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_quote_send(uuid, jsonb, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_quote_send(uuid, jsonb, date, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_quote_reject(_id uuid, _message text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE r record;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO r FROM public.quote_requests WHERE id = _id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF r.status = 'ordered' THEN RAISE EXCEPTION 'ordered'; END IF;
  IF char_length(COALESCE(_message, '')) > 3000 THEN RAISE EXCEPTION 'invalid'; END IF;
  UPDATE public.quote_requests SET status = 'rejected', store_message = _message, decided_at = now() WHERE id = _id;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_quote_reject(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_quote_reject(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------------------------
-- Pedido: gravar uma linha com design_data.quote marca o orçamento como pedido; cancelar o pedido devolve-o.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.order_items_quote()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE qid text := NEW.design_data #>> '{quote,id}';
BEGIN
  IF qid IS NULL OR qid !~ '^[0-9a-fA-F-]{36}$' THEN RETURN NEW; END IF;
  UPDATE public.quote_requests r
     SET status = 'ordered', order_id = NEW.order_id
    FROM public.orders o
   WHERE r.id = qid::uuid AND o.id = NEW.order_id AND r.user_id = o.user_id AND r.status IN ('sent', 'accepted');
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.order_items_quote() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS order_items_quote ON public.order_items;
CREATE TRIGGER order_items_quote AFTER INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.order_items_quote();

CREATE OR REPLACE FUNCTION public.orders_quote_release()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    UPDATE public.quote_requests SET status = 'accepted', order_id = NULL WHERE order_id = NEW.id AND status = 'ordered';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.orders_quote_release() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS orders_quote_release ON public.orders;
CREATE TRIGGER orders_quote_release AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_quote_release();
