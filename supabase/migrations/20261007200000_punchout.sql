-- =============================================================================================
-- PunchOut (recurso punchout em Admin > Recursos da loja, desligado por padrão).
-- Empresas compram pelo próprio sistema de compras (SAP Ariba, Coupa, SAP SRM, Jaggaer...): o sistema abre a loja,
-- o comprador monta o carrinho e a loja devolve o carrinho ao sistema, que aprova e envia o pedido de compra.
--  1) punchout_buyers: cada empresa ligada, com o protocolo (cXML ou OCI), o login (identidade cXML ou utilizador
--     OCI) e a senha guardada só como hash (bcrypt), a conta de cliente cujos preços e pedidos valem para ela
--     (grupo de clientes, se houver), os endereços para onde o carrinho pode voltar e as regras dos pedidos.
--  2) punchout_sessions: cada entrada do sistema de compras na loja (token guardado só como hash SHA-256), com o
--     carrinho devolvido e o valor calculado no servidor.
--  3) punchout_orders: pedidos de compra recebidos (cXML OrderRequest), com o pedido criado na loja ou o motivo
--     da recusa, e o aviso quando o total do pedido de compra difere do da loja.
-- Quem fala com o sistema de compras é a Edge Function punchout (sem JWT; confere o login com punchout_authenticate).
-- O Admin lê as tabelas (RLS) e grava as empresas só por admin_save_punchout_buyer (para gerar o hash da senha).
-- =============================================================================================

-- ---------------------------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.punchout_buyers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  protocol text NOT NULL DEFAULT 'cxml',
  -- cXML: credencial From (domínio e identidade da empresa); OCI: utilizador (USERNAME)
  cxml_domain text NOT NULL DEFAULT 'NetworkID',
  cxml_identity text,
  oci_username text,
  -- SharedSecret (cXML) ou PASSWORD (OCI): só o hash bcrypt
  secret_hash text,
  has_secret boolean GENERATED ALWAYS AS (secret_hash IS NOT NULL) STORED,
  -- conta de cliente da empresa: preços do grupo dela e dona dos pedidos de compra
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  country_code text NOT NULL DEFAULT 'BR',
  -- endereços (host) para onde o carrinho pode voltar; vazio = qualquer endereço https
  return_hosts text[] NOT NULL DEFAULT '{}',
  -- classificação UNSPSC enviada em cada item (o Ariba pede uma); vazio = não envia
  unspsc text,
  accept_orders boolean NOT NULL DEFAULT true,
  shipping_fee numeric(12,2) NOT NULL DEFAULT 0,
  session_minutes integer NOT NULL DEFAULT 120,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT punchout_buyers_name CHECK (char_length(btrim(name)) BETWEEN 2 AND 120),
  CONSTRAINT punchout_buyers_protocol CHECK (protocol IN ('cxml', 'oci')),
  CONSTRAINT punchout_buyers_login CHECK (
    (protocol = 'cxml' AND cxml_identity IS NOT NULL AND char_length(cxml_identity) BETWEEN 1 AND 120 AND char_length(cxml_domain) BETWEEN 1 AND 60)
    OR (protocol = 'oci' AND oci_username IS NOT NULL AND oci_username ~ '^[A-Za-z0-9._@-]{3,60}$')),
  CONSTRAINT punchout_buyers_country CHECK (country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT punchout_buyers_fee CHECK (shipping_fee >= 0 AND shipping_fee <= 100000),
  CONSTRAINT punchout_buyers_minutes CHECK (session_minutes BETWEEN 10 AND 1440),
  CONSTRAINT punchout_buyers_hosts CHECK (cardinality(return_hosts) <= 20),
  CONSTRAINT punchout_buyers_unspsc CHECK (unspsc IS NULL OR unspsc ~ '^[0-9]{2,8}$'),
  CONSTRAINT punchout_buyers_notes CHECK (notes IS NULL OR char_length(notes) <= 1000)
);
CREATE UNIQUE INDEX IF NOT EXISTS punchout_buyers_cxml_uq ON public.punchout_buyers (lower(cxml_domain), lower(cxml_identity)) WHERE protocol = 'cxml';
CREATE UNIQUE INDEX IF NOT EXISTS punchout_buyers_oci_uq ON public.punchout_buyers (lower(oci_username)) WHERE protocol = 'oci';

CREATE TABLE IF NOT EXISTS public.punchout_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid NOT NULL REFERENCES public.punchout_buyers(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  protocol text NOT NULL,
  operation text NOT NULL DEFAULT 'create',
  buyer_cookie text,
  return_url text,
  -- OCI: campos que o sistema pede de volta (~OkCode, ~TARGET, ~CALLER)
  return_extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  test boolean NOT NULL DEFAULT false,
  contact_name text,
  contact_email text,
  -- itens do carrinho anterior (edit / inspect), já ligados aos produtos da loja
  initial_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  cart jsonb,
  cart_total numeric(12,2),
  currency text,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  opened_at timestamptz,
  returned_at timestamptz,
  expires_at timestamptz NOT NULL,
  CONSTRAINT punchout_sessions_protocol CHECK (protocol IN ('cxml', 'oci')),
  CONSTRAINT punchout_sessions_operation CHECK (operation IN ('create', 'edit', 'inspect')),
  CONSTRAINT punchout_sessions_status CHECK (status IN ('open', 'returned', 'cancelled')),
  CONSTRAINT punchout_sessions_lens CHECK (char_length(coalesce(buyer_cookie, '')) <= 500 AND char_length(coalesce(return_url, '')) <= 2000
    AND char_length(coalesce(contact_name, '')) <= 200 AND char_length(coalesce(contact_email, '')) <= 200)
);
CREATE INDEX IF NOT EXISTS punchout_sessions_buyer_idx ON public.punchout_sessions (buyer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.punchout_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid NOT NULL REFERENCES public.punchout_buyers(id) ON DELETE CASCADE,
  po_number text NOT NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  status text NOT NULL,
  reason text,
  po_total numeric(12,2),
  store_total numeric(12,2),
  currency text,
  mismatch boolean NOT NULL DEFAULT false,
  lines integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT punchout_orders_status CHECK (status IN ('created', 'rejected')),
  CONSTRAINT punchout_orders_po CHECK (char_length(po_number) BETWEEN 1 AND 120),
  CONSTRAINT punchout_orders_reason CHECK (reason IS NULL OR char_length(reason) <= 300)
);
-- Um pedido de compra criado uma vez por empresa (o sistema pode reenviar o mesmo).
CREATE UNIQUE INDEX IF NOT EXISTS punchout_orders_po_uq ON public.punchout_orders (buyer_id, po_number) WHERE status = 'created';
CREATE INDEX IF NOT EXISTS punchout_orders_buyer_idx ON public.punchout_orders (buyer_id, created_at DESC);

-- ---------------------------------------------------------------------------------------------
-- Acesso: só administradores leem; a senha (hash) nunca sai do banco.
-- ---------------------------------------------------------------------------------------------

ALTER TABLE public.punchout_buyers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.punchout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.punchout_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read punchout buyers" ON public.punchout_buyers;
CREATE POLICY "Admins read punchout buyers" ON public.punchout_buyers FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins delete punchout buyers" ON public.punchout_buyers;
CREATE POLICY "Admins delete punchout buyers" ON public.punchout_buyers FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins read punchout sessions" ON public.punchout_sessions;
CREATE POLICY "Admins read punchout sessions" ON public.punchout_sessions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins read punchout orders" ON public.punchout_orders;
CREATE POLICY "Admins read punchout orders" ON public.punchout_orders FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

REVOKE ALL ON public.punchout_buyers, public.punchout_sessions, public.punchout_orders FROM anon, authenticated;
GRANT SELECT (id, name, protocol, cxml_domain, cxml_identity, oci_username, has_secret, user_id, country_code, return_hosts, unspsc, accept_orders,
  shipping_fee, session_minutes, is_active, notes, last_used_at, created_at, updated_at) ON public.punchout_buyers TO authenticated;
GRANT DELETE ON public.punchout_buyers TO authenticated;
GRANT SELECT (id, buyer_id, protocol, operation, return_url, test, contact_name, contact_email, cart, cart_total, currency, status,
  created_at, opened_at, returned_at, expires_at) ON public.punchout_sessions TO authenticated;
GRANT SELECT ON public.punchout_orders TO authenticated;
GRANT ALL ON public.punchout_buyers, public.punchout_sessions, public.punchout_orders TO service_role;

DROP TRIGGER IF EXISTS punchout_buyers_updated_at ON public.punchout_buyers;
CREATE TRIGGER punchout_buyers_updated_at BEFORE UPDATE ON public.punchout_buyers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DO $$
BEGIN
  IF to_regprocedure('public.admin_activity_capture()') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS zz_admin_activity ON public.punchout_buyers;
    CREATE TRIGGER zz_admin_activity AFTER INSERT OR UPDATE OF name, protocol, cxml_domain, cxml_identity, oci_username, secret_hash, user_id,
      country_code, return_hosts, unspsc, accept_orders, shipping_fee, session_minutes, is_active, notes OR DELETE ON public.punchout_buyers
      FOR EACH ROW EXECUTE FUNCTION public.admin_activity_capture();
  END IF;
END $$;

-- ---------------------------------------------------------------------------------------------
-- Admin: gravar empresa (com o hash da senha) e sessão de teste
-- ---------------------------------------------------------------------------------------------

-- _secret: senha nova (mín. 12 caracteres) ou NULL para manter a atual. Erros com códigos estáveis
-- (src/lib/punchout.ts): name, login, login_taken, secret, country, hosts, unspsc, fee, minutes, account.
CREATE OR REPLACE FUNCTION public.admin_save_punchout_buyer(_id uuid, _data jsonb, _secret text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_protocol text := CASE WHEN _data->>'protocol' = 'oci' THEN 'oci' ELSE 'cxml' END;
  v_name text := btrim(coalesce(_data->>'name', ''));
  v_domain text := nullif(btrim(coalesce(_data->>'cxml_domain', '')), '');
  v_identity text := nullif(btrim(coalesce(_data->>'cxml_identity', '')), '');
  v_user text := nullif(btrim(coalesce(_data->>'oci_username', '')), '');
  v_country text := upper(btrim(coalesce(_data->>'country_code', 'BR')));
  v_hosts text[];
  v_fee numeric := coalesce(nullif(_data->>'shipping_fee', '')::numeric, 0);
  v_minutes integer := coalesce(nullif(_data->>'session_minutes', '')::integer, 120);
  v_account uuid := nullif(_data->>'user_id', '')::uuid;
  v_secret text := nullif(_secret, '');
  v_unspsc text := nullif(btrim(coalesce(_data->>'unspsc', '')), '');
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF char_length(v_name) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'name' USING ERRCODE = '22023'; END IF;
  IF v_protocol = 'cxml' AND (v_identity IS NULL OR char_length(v_identity) > 120 OR char_length(coalesce(v_domain, '')) NOT BETWEEN 1 AND 60) THEN
    RAISE EXCEPTION 'login' USING ERRCODE = '22023';
  END IF;
  IF v_protocol = 'oci' AND (v_user IS NULL OR v_user !~ '^[A-Za-z0-9._@-]{3,60}$') THEN RAISE EXCEPTION 'login' USING ERRCODE = '22023'; END IF;
  IF v_secret IS NOT NULL AND char_length(v_secret) NOT BETWEEN 12 AND 200 THEN RAISE EXCEPTION 'secret' USING ERRCODE = '22023'; END IF;
  IF _id IS NULL AND v_secret IS NULL THEN RAISE EXCEPTION 'secret' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.countries WHERE code = v_country) THEN RAISE EXCEPTION 'country' USING ERRCODE = '22023'; END IF;
  IF v_unspsc IS NOT NULL AND v_unspsc !~ '^[0-9]{2,8}$' THEN RAISE EXCEPTION 'unspsc' USING ERRCODE = '22023'; END IF;
  IF v_fee < 0 OR v_fee > 100000 THEN RAISE EXCEPTION 'fee' USING ERRCODE = '22023'; END IF;
  IF v_minutes NOT BETWEEN 10 AND 1440 THEN RAISE EXCEPTION 'minutes' USING ERRCODE = '22023'; END IF;
  IF v_account IS NOT NULL AND NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_account) THEN RAISE EXCEPTION 'account' USING ERRCODE = '22023'; END IF;
  SELECT coalesce(array_agg(DISTINCT h ORDER BY h), '{}') INTO v_hosts
    FROM (SELECT lower(btrim(x)) AS h FROM jsonb_array_elements_text(coalesce(_data->'return_hosts', '[]'::jsonb)) x) s
   WHERE h <> '';
  IF cardinality(v_hosts) > 20 OR EXISTS (SELECT 1 FROM unnest(v_hosts) h WHERE h !~ '^(\*\.)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:[0-9]{1,5})?$') THEN
    RAISE EXCEPTION 'hosts' USING ERRCODE = '22023';
  END IF;

  IF v_protocol = 'cxml' AND EXISTS (SELECT 1 FROM public.punchout_buyers WHERE protocol = 'cxml' AND lower(cxml_domain) = lower(v_domain)
       AND lower(cxml_identity) = lower(v_identity) AND id IS DISTINCT FROM _id)
     OR v_protocol = 'oci' AND EXISTS (SELECT 1 FROM public.punchout_buyers WHERE protocol = 'oci' AND lower(oci_username) = lower(v_user) AND id IS DISTINCT FROM _id) THEN
    RAISE EXCEPTION 'login_taken' USING ERRCODE = '23505';
  END IF;

  IF _id IS NULL THEN
    INSERT INTO public.punchout_buyers (name, protocol, cxml_domain, cxml_identity, oci_username, secret_hash, user_id, country_code, return_hosts,
      unspsc, accept_orders, shipping_fee, session_minutes, is_active, notes)
    VALUES (v_name, v_protocol, coalesce(v_domain, 'NetworkID'), CASE WHEN v_protocol = 'cxml' THEN v_identity END, CASE WHEN v_protocol = 'oci' THEN v_user END,
      extensions.crypt(v_secret, extensions.gen_salt('bf', 10)), v_account, v_country, v_hosts,
      v_unspsc, coalesce((_data->>'accept_orders')::boolean, true), round(v_fee, 2), v_minutes, coalesce((_data->>'is_active')::boolean, true),
      nullif(left(btrim(coalesce(_data->>'notes', '')), 1000), ''))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.punchout_buyers SET
      name = v_name, protocol = v_protocol, cxml_domain = coalesce(v_domain, 'NetworkID'),
      cxml_identity = CASE WHEN v_protocol = 'cxml' THEN v_identity END, oci_username = CASE WHEN v_protocol = 'oci' THEN v_user END,
      secret_hash = CASE WHEN v_secret IS NULL THEN secret_hash ELSE extensions.crypt(v_secret, extensions.gen_salt('bf', 10)) END,
      user_id = v_account, country_code = v_country, return_hosts = v_hosts, unspsc = v_unspsc,
      accept_orders = coalesce((_data->>'accept_orders')::boolean, true), shipping_fee = round(v_fee, 2), session_minutes = v_minutes,
      is_active = coalesce((_data->>'is_active')::boolean, true), notes = nullif(left(btrim(coalesce(_data->>'notes', '')), 1000), '')
    WHERE id = _id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  END IF;
  RETURN v_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_save_punchout_buyer(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_punchout_buyer(uuid, jsonb, text) TO authenticated;

-- Abre a loja como a empresa, sem sistema de compras: o carrinho devolvido aparece numa página de teste em vez
-- de seguir para o sistema. Devolve o token (só uma vez; no banco fica o hash).
CREATE OR REPLACE FUNCTION public.admin_punchout_test_session(_buyer uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  b public.punchout_buyers;
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF NOT public.feature_enabled('punchout', false) THEN RAISE EXCEPTION 'feature_off' USING ERRCODE = '42501'; END IF;
  SELECT * INTO b FROM public.punchout_buyers WHERE id = _buyer;
  IF b.id IS NULL THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  INSERT INTO public.punchout_sessions (buyer_id, token_hash, protocol, operation, test, contact_name, expires_at)
  VALUES (b.id, encode(extensions.digest(v_token, 'sha256'), 'hex'), b.protocol, 'create', true,
    (SELECT coalesce(nullif(full_name, ''), 'Admin') FROM public.user_profiles WHERE user_id = auth.uid()),
    now() + make_interval(mins => b.session_minutes));
  RETURN v_token;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_punchout_test_session(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_punchout_test_session(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_punchout_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN jsonb_build_object(
    'buyers', (SELECT count(*) FROM public.punchout_buyers WHERE is_active),
    'sessions_30d', (SELECT count(*) FROM public.punchout_sessions WHERE NOT test AND created_at > now() - interval '30 days'),
    'returned_30d', (SELECT count(*) FROM public.punchout_sessions WHERE NOT test AND status = 'returned' AND created_at > now() - interval '30 days'),
    'carts_value_30d', (SELECT coalesce(sum(cart_total), 0) FROM public.punchout_sessions WHERE NOT test AND status = 'returned' AND created_at > now() - interval '30 days'),
    'orders_30d', (SELECT count(*) FROM public.punchout_orders WHERE status = 'created' AND created_at > now() - interval '30 days'),
    'orders_value_30d', (SELECT coalesce(sum(store_total), 0) FROM public.punchout_orders WHERE status = 'created' AND created_at > now() - interval '30 days'),
    'rejected_30d', (SELECT count(*) FROM public.punchout_orders WHERE status = 'rejected' AND created_at > now() - interval '30 days'),
    'mismatch_30d', (SELECT count(*) FROM public.punchout_orders WHERE status = 'created' AND mismatch AND created_at > now() - interval '30 days'));
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_punchout_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_punchout_stats() TO authenticated;

-- ---------------------------------------------------------------------------------------------
-- Servidor (Edge Function punchout): login da empresa e códigos dos itens
-- ---------------------------------------------------------------------------------------------

-- Confere o login (cXML: domínio + identidade; OCI: utilizador) e a senha. Devolve a empresa (sem o hash) ou NULL.
-- Com o recurso desligado ou a empresa inativa, NULL.
CREATE OR REPLACE FUNCTION public.punchout_authenticate(_protocol text, _domain text, _login text, _secret text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  b public.punchout_buyers;
BEGIN
  IF NOT public.feature_enabled('punchout', false) OR coalesce(_secret, '') = '' OR coalesce(_login, '') = '' THEN RETURN NULL; END IF;
  IF _protocol = 'oci' THEN
    SELECT * INTO b FROM public.punchout_buyers WHERE protocol = 'oci' AND lower(oci_username) = lower(btrim(_login));
  ELSE
    SELECT * INTO b FROM public.punchout_buyers WHERE protocol = 'cxml' AND lower(cxml_identity) = lower(btrim(_login))
       AND lower(cxml_domain) = lower(btrim(coalesce(_domain, '')));
  END IF;
  IF b.id IS NULL OR NOT b.is_active OR b.secret_hash IS NULL OR b.secret_hash <> extensions.crypt(_secret, b.secret_hash) THEN RETURN NULL; END IF;
  UPDATE public.punchout_buyers SET last_used_at = now() WHERE id = b.id;
  RETURN to_jsonb(b) - 'secret_hash';
END;
$function$;
REVOKE ALL ON FUNCTION public.punchout_authenticate(text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.punchout_authenticate(text, text, text, text) TO service_role;

-- Código (SKU) de cada linha do carrinho, igual ao que o pedido grava (_order_item_sku).
CREATE OR REPLACE FUNCTION public.punchout_item_skus(_items jsonb)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT coalesce(array_agg(public._order_item_sku(i->>'product_id', coalesce(i->'design_data', '{}'::jsonb)) ORDER BY n), '{}')
    FROM jsonb_array_elements(coalesce(_items, '[]'::jsonb)) WITH ORDINALITY AS t(i, n)
$function$;
REVOKE ALL ON FUNCTION public.punchout_item_skus(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.punchout_item_skus(jsonb) TO service_role;

-- Produto pelo código (SKU) de um item de pedido de compra sem referência ao carrinho: produto, tamanho, cor ou
-- combinação. Devolve product_id e design_data (variation / size) ou NULL.
CREATE OR REPLACE FUNCTION public.punchout_product_by_sku(_sku text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT r FROM (
    SELECT 1 AS o, jsonb_build_object('product_id', p.id::text, 'design_data', '{}'::jsonb) AS r FROM public.products p WHERE lower(p.sku) = lower(_sku)
    UNION ALL
    SELECT 2, jsonb_build_object('product_id', z.product_id::text, 'design_data', jsonb_build_object('size', z.size_label)) FROM public.product_sizes z WHERE lower(z.sku) = lower(_sku)
    UNION ALL
    SELECT 3, jsonb_build_object('product_id', v.product_id::text, 'design_data', jsonb_build_object('variation', v.name)) FROM public.product_variations v WHERE lower(v.sku) = lower(_sku)
    UNION ALL
    SELECT 4, jsonb_build_object('product_id', v.product_id::text, 'design_data', jsonb_build_object('variation', v.name, 'size', z.size_label))
      FROM public.product_variation_size_availability a
      JOIN public.product_variations v ON v.id = a.variation_id
      JOIN public.product_sizes z ON z.id = a.product_size_id
     WHERE lower(a.sku) = lower(_sku)
  ) s ORDER BY o LIMIT 1
$function$;
REVOKE ALL ON FUNCTION public.punchout_product_by_sku(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.punchout_product_by_sku(text) TO service_role;
