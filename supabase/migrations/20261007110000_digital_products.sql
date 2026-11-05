-- =============================================================================================
-- Produtos digitais (recurso digital_products, desligado por padrão; Admin > Vendas > Downloads)
--   product_digital          produto digital: limite de downloads por arquivo, dias de acesso, chaves de licença,
--                            se também tem entrega física e instruções por idioma (leitura pública só do ativo)
--   digital_files            arquivos do produto (bucket privado digital-files, até 50 MB) ou link externo; só Admin
--   digital_license_keys     chaves de licença do produto (uma por unidade vendida); só Admin
--   digital_grants           acesso do cliente: nasce quando o pedido fica pago (trigger), uma linha por item
--   digital_download_log     cada download (quem, qual arquivo, quando); conta para o limite
--   my_digital_downloads     conta do cliente: acessos, arquivos, downloads usados e chaves
--   digital_download_start   confere dono, pagamento, prazo e limite, regista o download e devolve o caminho
--                            (o storage só deixa ler o ficheiro a quem acabou de passar por aqui)
--   admin_digital_grants / admin_digital_grant_update   Admin: lista e ações (revogar, reativar, zerar, prazo, limite)
-- Pedido cancelado ou reembolsado revoga os acessos. Carrinho só com produtos digitais sem entrega física não paga
-- frete (create-order e _shared/shipping/quote.ts, por _shared/digitalProducts.ts).
-- =============================================================================================

CREATE TABLE IF NOT EXISTS public.product_digital (
  product_id text PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  download_limit integer CHECK (download_limit IS NULL OR download_limit BETWEEN 1 AND 1000),
  access_days integer CHECK (access_days IS NULL OR access_days BETWEEN 1 AND 3650),
  license_keys boolean NOT NULL DEFAULT false,
  ships boolean NOT NULL DEFAULT false,
  instructions_i18n jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(instructions_i18n) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.product_digital ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public reads active digital products" ON public.product_digital;
CREATE POLICY "Public reads active digital products" ON public.product_digital FOR SELECT USING (is_active);
DROP POLICY IF EXISTS "Admins manage digital products" ON public.product_digital;
CREATE POLICY "Admins manage digital products" ON public.product_digital FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
GRANT SELECT ON public.product_digital TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_digital TO authenticated;
GRANT ALL ON public.product_digital TO service_role;

CREATE TABLE IF NOT EXISTS public.digital_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id text NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  storage_path text UNIQUE CHECK (storage_path IS NULL OR (storage_path !~ '\.\.' AND length(storage_path) <= 500)),
  url text CHECK (url IS NULL OR (url ~* '^https://' AND length(url) <= 2000)),
  size_bytes bigint CHECK (size_bytes IS NULL OR size_bytes >= 0),
  sort integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((storage_path IS NULL) <> (url IS NULL))
);
CREATE INDEX IF NOT EXISTS digital_files_product_idx ON public.digital_files (product_id, sort);

ALTER TABLE public.digital_files ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage digital files" ON public.digital_files;
CREATE POLICY "Admins manage digital files" ON public.digital_files FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
REVOKE ALL ON public.digital_files FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.digital_files TO authenticated;
GRANT ALL ON public.digital_files TO service_role;

CREATE TABLE IF NOT EXISTS public.digital_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_item_id uuid UNIQUE REFERENCES public.order_items(id) ON DELETE SET NULL,
  product_id text REFERENCES public.products(id) ON DELETE SET NULL,
  user_id uuid,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  download_limit integer CHECK (download_limit IS NULL OR download_limit >= 1),
  expires_at timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  reset_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS digital_grants_user_idx ON public.digital_grants (user_id);
CREATE INDEX IF NOT EXISTS digital_grants_order_idx ON public.digital_grants (order_id);
CREATE INDEX IF NOT EXISTS digital_grants_product_idx ON public.digital_grants (product_id, created_at);

ALTER TABLE public.digital_grants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Own or admin reads digital grants" ON public.digital_grants;
CREATE POLICY "Own or admin reads digital grants" ON public.digital_grants FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));
REVOKE ALL ON public.digital_grants FROM anon;
GRANT SELECT ON public.digital_grants TO authenticated;
GRANT ALL ON public.digital_grants TO service_role;

CREATE TABLE IF NOT EXISTS public.digital_license_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id text NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  license_code text NOT NULL CHECK (length(btrim(license_code)) BETWEEN 1 AND 500),
  grant_id uuid REFERENCES public.digital_grants(id) ON DELETE SET NULL,
  assigned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, license_code)
);
CREATE INDEX IF NOT EXISTS digital_license_keys_free_idx ON public.digital_license_keys (product_id, created_at) WHERE grant_id IS NULL;
CREATE INDEX IF NOT EXISTS digital_license_keys_grant_idx ON public.digital_license_keys (grant_id);

ALTER TABLE public.digital_license_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage license keys" ON public.digital_license_keys;
CREATE POLICY "Admins manage license keys" ON public.digital_license_keys FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
REVOKE ALL ON public.digital_license_keys FROM anon;
GRANT SELECT, INSERT, DELETE ON public.digital_license_keys TO authenticated;
GRANT ALL ON public.digital_license_keys TO service_role;

CREATE TABLE IF NOT EXISTS public.digital_download_log (
  id bigserial PRIMARY KEY,
  grant_id uuid NOT NULL REFERENCES public.digital_grants(id) ON DELETE CASCADE,
  file_id uuid REFERENCES public.digital_files(id) ON DELETE SET NULL,
  user_id uuid,
  storage_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS digital_download_log_grant_idx ON public.digital_download_log (grant_id, file_id, created_at);
CREATE INDEX IF NOT EXISTS digital_download_log_path_idx ON public.digital_download_log (user_id, storage_path, created_at);

ALTER TABLE public.digital_download_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read download log" ON public.digital_download_log;
CREATE POLICY "Admins read download log" ON public.digital_download_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
REVOKE ALL ON public.digital_download_log FROM anon;
GRANT SELECT ON public.digital_download_log TO authenticated;
GRANT ALL ON public.digital_download_log TO service_role;
GRANT USAGE ON SEQUENCE public.digital_download_log_id_seq TO service_role;

-- Registo de atividade do Admin (as chaves de licença ficam de fora: são segredo do cliente).
DO $$
BEGIN
  IF to_regprocedure('public.admin_activity_capture()') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS zz_admin_activity ON public.product_digital;
    CREATE TRIGGER zz_admin_activity AFTER INSERT OR UPDATE OR DELETE ON public.product_digital
      FOR EACH ROW EXECUTE FUNCTION public.admin_activity_capture();
    DROP TRIGGER IF EXISTS zz_admin_activity ON public.digital_files;
    CREATE TRIGGER zz_admin_activity AFTER INSERT OR UPDATE OR DELETE ON public.digital_files
      FOR EACH ROW EXECUTE FUNCTION public.admin_activity_capture();
  END IF;
END $$;

-- ---------------------------------------------------------------------------------------------
-- Ficheiros: bucket privado. Admin gere tudo; o cliente só lê um ficheiro nos 10 minutos depois de
-- digital_download_start ter registado o download dele.
-- ---------------------------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('digital-files', 'digital-files', false, 52428800)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.digital_file_readable(_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.digital_download_log l
     WHERE l.user_id = auth.uid() AND l.storage_path = _path AND l.created_at > now() - interval '10 minutes');
$$;
REVOKE ALL ON FUNCTION public.digital_file_readable(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.digital_file_readable(text) TO authenticated;

DROP POLICY IF EXISTS "Admins manage digital files objects" ON storage.objects;
CREATE POLICY "Admins manage digital files objects" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'digital-files' AND public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (bucket_id = 'digital-files' AND public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Customers read granted digital files" ON storage.objects;
CREATE POLICY "Customers read granted digital files" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'digital-files' AND public.digital_file_readable(name));

-- ---------------------------------------------------------------------------------------------
-- Chaves de licença: entrega as que faltam a um acesso (uma por unidade), as mais antigas primeiro
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._digital_assign_keys(_grant uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  g record;
  missing integer;
BEGIN
  SELECT g0.*, d.license_keys INTO g FROM public.digital_grants g0
    JOIN public.product_digital d ON d.product_id = g0.product_id
   WHERE g0.id = _grant AND g0.status = 'active';
  IF NOT FOUND OR NOT g.license_keys THEN RETURN; END IF;
  missing := g.quantity - (SELECT count(*) FROM public.digital_license_keys WHERE grant_id = _grant);
  IF missing <= 0 THEN RETURN; END IF;
  UPDATE public.digital_license_keys k SET grant_id = _grant, assigned_at = now()
   WHERE k.id IN (SELECT id FROM public.digital_license_keys
                   WHERE product_id = g.product_id AND grant_id IS NULL
                   ORDER BY created_at, id LIMIT missing FOR UPDATE SKIP LOCKED);
END;
$function$;
REVOKE ALL ON FUNCTION public._digital_assign_keys(uuid) FROM PUBLIC, anon, authenticated;

-- Chaves novas no Admin: vão primeiro para os clientes que estão à espera de uma.
CREATE OR REPLACE FUNCTION public.digital_license_keys_fill()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  gid uuid;
  pid text;
BEGIN
  FOR pid IN SELECT DISTINCT product_id FROM new_keys WHERE grant_id IS NULL LOOP
    FOR gid IN
      SELECT g.id FROM public.digital_grants g
       WHERE g.product_id = pid AND g.status = 'active'
         AND (SELECT count(*) FROM public.digital_license_keys k WHERE k.grant_id = g.id) < g.quantity
       ORDER BY g.created_at
    LOOP
      PERFORM public._digital_assign_keys(gid);
    END LOOP;
  END LOOP;
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.digital_license_keys_fill() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS digital_license_keys_fill ON public.digital_license_keys;
CREATE TRIGGER digital_license_keys_fill AFTER INSERT ON public.digital_license_keys
  REFERENCING NEW TABLE AS new_keys FOR EACH STATEMENT EXECUTE FUNCTION public.digital_license_keys_fill();

-- ---------------------------------------------------------------------------------------------
-- Acessos: nascem quando o pedido fica pago, um por item digital; somem (revogados) se o pedido for
-- cancelado ou reembolsado
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._digital_grant_order(_order uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  o record;
  it record;
  gid uuid;
BEGIN
  IF NOT public.feature_enabled('digital_products', false) THEN RETURN; END IF;
  SELECT id, user_id, status, payment_status INTO o FROM public.orders WHERE id = _order;
  IF NOT FOUND OR o.payment_status IS DISTINCT FROM 'paid' OR o.status IN ('cancelled', 'refunded') THEN RETURN; END IF;
  FOR it IN
    SELECT i.id, i.product_id, i.quantity, d.download_limit, d.access_days
      FROM public.order_items i
      JOIN public.product_digital d ON d.product_id = i.product_id AND d.is_active
     WHERE i.order_id = _order
       AND NOT EXISTS (SELECT 1 FROM public.digital_grants g WHERE g.order_item_id = i.id)
  LOOP
    INSERT INTO public.digital_grants (order_id, order_item_id, product_id, user_id, quantity, download_limit, expires_at)
    VALUES (_order, it.id, it.product_id, o.user_id, GREATEST(1, COALESCE(it.quantity, 1)), it.download_limit,
            CASE WHEN it.access_days IS NULL THEN NULL ELSE now() + make_interval(days => it.access_days) END)
    ON CONFLICT (order_item_id) DO NOTHING
    RETURNING id INTO gid;
    IF gid IS NOT NULL THEN PERFORM public._digital_assign_keys(gid); END IF;
  END LOOP;
END;
$function$;
REVOKE ALL ON FUNCTION public._digital_grant_order(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.orders_digital_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IN ('cancelled', 'refunded') THEN
    IF TG_OP = 'UPDATE' AND OLD.status NOT IN ('cancelled', 'refunded') THEN
      UPDATE public.digital_grants SET status = 'revoked', updated_at = now() WHERE order_id = NEW.id AND status = 'active';
    END IF;
    RETURN NULL;
  END IF;
  IF NEW.payment_status = 'paid' AND (TG_OP = 'INSERT' OR OLD.payment_status IS DISTINCT FROM 'paid' OR OLD.status IN ('cancelled', 'refunded')) THEN
    PERFORM public._digital_grant_order(NEW.id);
  END IF;
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.orders_digital_events() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS orders_digital_events ON public.orders;
CREATE TRIGGER orders_digital_events AFTER INSERT OR UPDATE OF status, payment_status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_digital_events();

-- Item digital acrescentado a um pedido já pago (edição de itens no Admin).
CREATE OR REPLACE FUNCTION public.order_items_digital()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM public.product_digital WHERE product_id = NEW.product_id AND is_active) THEN
    PERFORM public._digital_grant_order(NEW.order_id);
  END IF;
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.order_items_digital() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS order_items_digital ON public.order_items;
CREATE TRIGGER order_items_digital AFTER INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.order_items_digital();

-- Item apagado do pedido: o acesso é revogado (a linha do acesso fica para o histórico).
CREATE OR REPLACE FUNCTION public.order_items_digital_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.digital_grants SET status = 'revoked', updated_at = now() WHERE order_item_id = OLD.id AND status = 'active';
  RETURN OLD;
END;
$function$;
REVOKE ALL ON FUNCTION public.order_items_digital_delete() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS order_items_digital_delete ON public.order_items;
CREATE TRIGGER order_items_digital_delete BEFORE DELETE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.order_items_digital_delete();

-- ---------------------------------------------------------------------------------------------
-- Conta do cliente
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._digital_used(_grant uuid, _file uuid, _since timestamptz)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT count(*)::int FROM public.digital_download_log
   WHERE grant_id = _grant AND file_id = _file AND (_since IS NULL OR created_at > _since);
$$;
REVOKE ALL ON FUNCTION public._digital_used(uuid, uuid, timestamptz) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.my_digital_downloads()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(jsonb_agg(x ORDER BY x ->> 'created_at' DESC), '[]'::jsonb) FROM (
    SELECT jsonb_build_object(
      'id', g.id, 'order_id', g.order_id, 'product_id', g.product_id, 'quantity', g.quantity,
      'download_limit', g.download_limit, 'expires_at', g.expires_at, 'status', g.status, 'created_at', g.created_at,
      'product', CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object('id', p.id, 'name', p.name, 'image', p.image) END,
      'instructions_i18n', COALESCE(d.instructions_i18n, '{}'::jsonb),
      'license_keys', COALESCE(d.license_keys, false),
      'files', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'size_bytes', f.size_bytes,
                                  'link', f.url IS NOT NULL, 'used', public._digital_used(g.id, f.id, g.reset_at)) ORDER BY f.sort, f.created_at)
                          FROM public.digital_files f WHERE f.product_id = g.product_id), '[]'::jsonb),
      'keys', CASE WHEN g.status = 'active' THEN COALESCE((SELECT jsonb_agg(k.license_code ORDER BY k.assigned_at, k.id)
                          FROM public.digital_license_keys k WHERE k.grant_id = g.id), '[]'::jsonb) ELSE '[]'::jsonb END
    ) AS x
      FROM public.digital_grants g
      LEFT JOIN public.products p ON p.id = g.product_id
      LEFT JOIN public.product_digital d ON d.product_id = g.product_id
     WHERE g.user_id = auth.uid()
  ) s;
$$;
REVOKE ALL ON FUNCTION public.my_digital_downloads() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_digital_downloads() TO authenticated;

-- Erros estáveis (src/lib/digitalProducts.ts): feature_off, not_found, revoked, expired, limit_reached.
-- Devolve { path } (ficheiro no bucket, ler com URL assinada logo a seguir) ou { url } (link externo) e o nome.
CREATE OR REPLACE FUNCTION public.digital_download_start(_grant uuid, _file uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  g record;
  f record;
BEGIN
  IF NOT public.feature_enabled('digital_products', false) THEN RAISE EXCEPTION 'feature_off'; END IF;
  SELECT * INTO g FROM public.digital_grants WHERE id = _grant AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF g.status <> 'active' THEN RAISE EXCEPTION 'revoked'; END IF;
  IF g.expires_at IS NOT NULL AND g.expires_at < now() THEN RAISE EXCEPTION 'expired'; END IF;
  SELECT * INTO f FROM public.digital_files WHERE id = _file AND product_id = g.product_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF g.download_limit IS NOT NULL AND public._digital_used(g.id, f.id, g.reset_at) >= g.download_limit THEN
    RAISE EXCEPTION 'limit_reached';
  END IF;
  INSERT INTO public.digital_download_log (grant_id, file_id, user_id, storage_path) VALUES (g.id, f.id, auth.uid(), f.storage_path);
  RETURN jsonb_build_object('name', f.name, 'path', f.storage_path, 'url', f.url);
END;
$function$;
REVOKE ALL ON FUNCTION public.digital_download_start(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.digital_download_start(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_digital_grants()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'not_allowed'; END IF;
  RETURN (SELECT COALESCE(jsonb_agg(x ORDER BY x ->> 'created_at' DESC), '[]'::jsonb) FROM (
    SELECT jsonb_build_object(
      'id', g.id, 'order_id', g.order_id, 'product_id', g.product_id, 'user_id', g.user_id, 'quantity', g.quantity,
      'download_limit', g.download_limit, 'expires_at', g.expires_at, 'status', g.status, 'reset_at', g.reset_at,
      'created_at', g.created_at,
      'product', CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object('id', p.id, 'name', p.name, 'image', p.image) END,
      'order', jsonb_build_object('status', o.status, 'total', o.total, 'name', COALESCE(o.manual_customer_name, o.shipping_address ->> 'name')),
      'downloads', (SELECT count(*) FROM public.digital_download_log l WHERE l.grant_id = g.id),
      'downloads_30d', (SELECT count(*) FROM public.digital_download_log l WHERE l.grant_id = g.id AND l.created_at > now() - interval '30 days'),
      'last_download', (SELECT max(created_at) FROM public.digital_download_log l WHERE l.grant_id = g.id),
      'max_used', COALESCE((SELECT max(public._digital_used(g.id, f.id, g.reset_at)) FROM public.digital_files f WHERE f.product_id = g.product_id), 0),
      'files', (SELECT count(*) FROM public.digital_files f WHERE f.product_id = g.product_id),
      'license_keys', COALESCE(d.license_keys, false),
      'keys', (SELECT count(*) FROM public.digital_license_keys k WHERE k.grant_id = g.id)
    ) AS x
      FROM public.digital_grants g
      JOIN public.orders o ON o.id = g.order_id
      LEFT JOIN public.products p ON p.id = g.product_id
      LEFT JOIN public.product_digital d ON d.product_id = g.product_id
     ORDER BY g.created_at DESC
     LIMIT 3000
  ) s);
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_digital_grants() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_digital_grants() TO authenticated;

-- Ações: revoke, restore, reset (zera os downloads usados), expires (_value dias a partir de agora; NULL = sem
-- prazo), limit (_value downloads por arquivo; NULL = sem limite). Erros: not_allowed, not_found, invalid_action,
-- invalid_value.
CREATE OR REPLACE FUNCTION public.admin_digital_grant_update(_id uuid, _action text, _value integer DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'not_allowed'; END IF;
  PERFORM 1 FROM public.digital_grants WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF _action IN ('expires', 'limit') AND _value IS NOT NULL AND (_value < 1 OR _value > CASE WHEN _action = 'limit' THEN 1000 ELSE 3650 END) THEN
    RAISE EXCEPTION 'invalid_value';
  END IF;
  CASE _action
    WHEN 'revoke' THEN UPDATE public.digital_grants SET status = 'revoked', updated_at = now() WHERE id = _id;
    WHEN 'restore' THEN
      UPDATE public.digital_grants SET status = 'active', updated_at = now() WHERE id = _id;
      PERFORM public._digital_assign_keys(_id);
    WHEN 'reset' THEN UPDATE public.digital_grants SET reset_at = now(), updated_at = now() WHERE id = _id;
    WHEN 'expires' THEN
      UPDATE public.digital_grants SET expires_at = CASE WHEN _value IS NULL THEN NULL ELSE now() + make_interval(days => _value) END,
             updated_at = now() WHERE id = _id;
    WHEN 'limit' THEN UPDATE public.digital_grants SET download_limit = _value, updated_at = now() WHERE id = _id;
    ELSE RAISE EXCEPTION 'invalid_action';
  END CASE;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_digital_grant_update(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_digital_grant_update(uuid, text, integer) TO authenticated;

-- ---------------------------------------------------------------------------------------------
-- Estoque: produtos digitais sem entrega física não mexem no estoque (nunca esgotam). Cópia de
-- 20261007100000_rentals.sql + 3 linhas.
-- ---------------------------------------------------------------------------------------------
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
  -- Aluguel (recurso rentals): as unidades para alugar são controladas pelas reservas, não pelo estoque.
  IF _design IS NOT NULL AND jsonb_typeof(_design) = 'object' AND _design ? 'rental' THEN RETURN; END IF;
  -- Produto digital sem entrega física (recurso digital_products): só arquivos, sem estoque.
  IF public.feature_enabled('digital_products', false)
     AND EXISTS (SELECT 1 FROM public.product_digital WHERE product_id = _product_id AND is_active AND NOT ships) THEN RETURN; END IF;

  s_label := lower(btrim(COALESCE(_design->>'size', '')));
  v_name  := lower(btrim(COALESCE(_design->>'variation', '')));
  SELECT EXISTS (SELECT 1 FROM public.product_sizes WHERE product_id = _product_id) INTO has_sizes;

  IF has_sizes THEN
    -- Sem tamanho identificável não sabemos que estoque mexer: não controlamos esta linha.
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
    -- Cor com estoque próprio (recurso variants): baixa na cor; senão no produto.
    IF v_name <> '' AND public.feature_enabled('variants', true) THEN
      SELECT id INTO v_id FROM public.product_variations
       WHERE product_id = _product_id AND lower(btrim(name)) = v_name AND stock_quantity IS NOT NULL
       ORDER BY is_active DESC, display_order LIMIT 1;
    END IF;
    IF v_id IS NOT NULL THEN
      UPDATE public.product_variations
         SET stock_quantity = CASE WHEN _delta < 0 AND NOT _strict THEN GREATEST(0, stock_quantity + _delta) ELSE stock_quantity + _delta END
       WHERE id = v_id
         AND (_delta > 0 OR NOT _strict OR stock_quantity >= -_delta);
    ELSE
      IF p.stock_quantity IS NULL THEN RETURN; END IF;
      UPDATE public.products
         SET stock_quantity = CASE WHEN _delta < 0 AND NOT _strict THEN GREATEST(0, stock_quantity + _delta) ELSE stock_quantity + _delta END
       WHERE id = _product_id
         AND (_delta > 0 OR NOT _strict OR stock_quantity >= -_delta);
    END IF;
  END IF;

  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 AND _strict AND _delta < 0 THEN
    RAISE EXCEPTION 'Stock insuficiente para um dos artigos. Reduza a quantidade ou remova o artigo do carrinho.';
  END IF;
END;
$function$;
