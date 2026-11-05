-- =============================================================================================
-- Marketplace com vendedores (recurso marketplace em Admin > Recursos da loja, desligado por padrão):
-- Admin > Vendas > Vendedores, página pública /vendedor/<slug>, "Vendido por" no produto, pedido de cadastro em
-- /vender e a aba Vendedor na conta de quem faz parte de um vendedor.
--  1) vendors              vendedores (nome, endereço da página, logo, descrição por idioma, comissão da loja)
--     vendors_public       vista pública (só ativos e com o recurso ligado; sem e-mail, telefone nem notas)
--  2) vendor_members       contas que entram como o vendedor (uma conta pertence a um só vendedor)
--  3) products.vendor_id   produto de um vendedor (o Admin escolhe na aba Dados do produto)
--  4) vendor_ledger        uma linha por item vendido: valor, comissão (fixada no pagamento) e o que é do vendedor.
--                          Nasce quando o pedido fica pago; cancelamento ou reembolso a anula; edição do pedido acerta.
--  5) vendor_payouts       repasses feitos pela loja ao vendedor (o saldo = a receber - repassado)
--  6) vendor_applications  pedidos de cadastro feitos em /vender (aprovar cria o vendedor e liga a conta)
--  7) funções do Admin (admin_vendor_*) e do vendedor (my_vendor, vendor_orders, vendor_products, vendor_set_stock).
-- Regras em store_settings.marketplace: default_commission, applications_open, show_vendor.
-- Valores do vendedor: preço dos itens (sem frete); descontos de cupom, vale e pontos ficam por conta da loja.
-- =============================================================================================

CREATE TABLE IF NOT EXISTS public.vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  name text NOT NULL,
  email text,
  phone text,
  logo_url text,
  description_i18n jsonb NOT NULL DEFAULT '{}'::jsonb,
  commission_percent numeric(5,2) NOT NULL DEFAULT 10,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendors_slug CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 80),
  CONSTRAINT vendors_name_len CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  CONSTRAINT vendors_email_len CHECK (email IS NULL OR char_length(email) <= 200),
  CONSTRAINT vendors_phone_len CHECK (phone IS NULL OR char_length(phone) <= 40),
  CONSTRAINT vendors_logo_len CHECK (logo_url IS NULL OR char_length(logo_url) <= 1000),
  CONSTRAINT vendors_description CHECK (jsonb_typeof(description_i18n) = 'object' AND char_length(description_i18n::text) <= 20000),
  CONSTRAINT vendors_commission CHECK (commission_percent BETWEEN 0 AND 100),
  CONSTRAINT vendors_notes_len CHECK (notes IS NULL OR char_length(notes) <= 4000)
);
CREATE UNIQUE INDEX IF NOT EXISTS vendors_slug_key ON public.vendors (slug);
COMMENT ON TABLE public.vendors IS 'Vendedores do marketplace (Admin > Vendedores). Público só pela vista vendors_public.';

CREATE TABLE IF NOT EXISTS public.vendor_members (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vendor_members_vendor_idx ON public.vendor_members (vendor_id);

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS products_vendor_idx ON public.products (vendor_id) WHERE vendor_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.vendor_ledger (
  id bigserial PRIMARY KEY,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_item_id uuid REFERENCES public.order_items(id) ON DELETE SET NULL,
  product_id text,
  product_name text,
  quantity integer NOT NULL,
  gross numeric(12,2) NOT NULL,
  commission_percent numeric(5,2) NOT NULL,
  commission numeric(12,2) NOT NULL,
  net numeric(12,2) NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendor_ledger_status CHECK (status IN ('active', 'cancelled'))
);
CREATE UNIQUE INDEX IF NOT EXISTS vendor_ledger_item_key ON public.vendor_ledger (order_item_id) WHERE order_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS vendor_ledger_vendor_idx ON public.vendor_ledger (vendor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS vendor_ledger_order_idx ON public.vendor_ledger (order_id);

CREATE TABLE IF NOT EXISTS public.vendor_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL,
  paid_at date NOT NULL DEFAULT current_date,
  method text,
  reference text,
  note text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendor_payouts_amount CHECK (amount > 0 AND amount <= 100000000),
  CONSTRAINT vendor_payouts_method_len CHECK (method IS NULL OR char_length(method) <= 60),
  CONSTRAINT vendor_payouts_reference_len CHECK (reference IS NULL OR char_length(reference) <= 120),
  CONSTRAINT vendor_payouts_note_len CHECK (note IS NULL OR char_length(note) <= 500)
);
CREATE INDEX IF NOT EXISTS vendor_payouts_vendor_idx ON public.vendor_payouts (vendor_id, paid_at DESC);

CREATE TABLE IF NOT EXISTS public.vendor_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  store_name text NOT NULL,
  contact_name text,
  email text NOT NULL,
  phone text,
  website text,
  message text,
  status text NOT NULL DEFAULT 'new',
  admin_note text,
  vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  CONSTRAINT vendor_applications_status CHECK (status IN ('new', 'approved', 'rejected')),
  CONSTRAINT vendor_applications_len CHECK (
    char_length(store_name) BETWEEN 1 AND 120 AND char_length(email) <= 200 AND (contact_name IS NULL OR char_length(contact_name) <= 120)
    AND (phone IS NULL OR char_length(phone) <= 40) AND (website IS NULL OR char_length(website) <= 300)
    AND (message IS NULL OR char_length(message) <= 2000) AND (admin_note IS NULL OR char_length(admin_note) <= 1000))
);
CREATE INDEX IF NOT EXISTS vendor_applications_recent_idx ON public.vendor_applications (created_at DESC);

-- ---------------------------------------------------------------------------------------------
-- Segurança: Admin gere tudo; o membro lê o seu vendedor e os seus repasses; o resto só por funções.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_applications ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.my_vendor_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT m.vendor_id FROM public.vendor_members m JOIN public.vendors v ON v.id = m.vendor_id
   WHERE m.user_id = auth.uid() AND v.is_active AND public.feature_enabled('marketplace', false);
$function$;
REVOKE ALL ON FUNCTION public.my_vendor_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_vendor_id() TO authenticated;

DROP POLICY IF EXISTS "Admins manage vendors" ON public.vendors;
CREATE POLICY "Admins manage vendors" ON public.vendors FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins manage vendor members" ON public.vendor_members;
CREATE POLICY "Admins manage vendor members" ON public.vendor_members FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins read vendor ledger" ON public.vendor_ledger;
CREATE POLICY "Admins read vendor ledger" ON public.vendor_ledger FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins manage vendor payouts" ON public.vendor_payouts;
CREATE POLICY "Admins manage vendor payouts" ON public.vendor_payouts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Vendors read own payouts" ON public.vendor_payouts;
CREATE POLICY "Vendors read own payouts" ON public.vendor_payouts FOR SELECT TO authenticated
  USING (vendor_id = public.my_vendor_id());
DROP POLICY IF EXISTS "Admins manage vendor applications" ON public.vendor_applications;
CREATE POLICY "Admins manage vendor applications" ON public.vendor_applications FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Users read own vendor applications" ON public.vendor_applications;
CREATE POLICY "Users read own vendor applications" ON public.vendor_applications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON public.vendors, public.vendor_members, public.vendor_ledger, public.vendor_payouts, public.vendor_applications FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendors, public.vendor_members, public.vendor_payouts TO authenticated;
GRANT SELECT, UPDATE, DELETE ON public.vendor_applications TO authenticated;
GRANT SELECT ON public.vendor_ledger TO authenticated;
GRANT ALL ON public.vendors, public.vendor_members, public.vendor_ledger, public.vendor_payouts, public.vendor_applications TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.vendor_ledger_id_seq TO service_role;

-- Vista pública: só o que a página do vendedor mostra.
CREATE OR REPLACE VIEW public.vendors_public AS
  SELECT id, slug, name, logo_url, description_i18n
    FROM public.vendors
   WHERE is_active AND public.feature_enabled('marketplace', false);
REVOKE ALL ON public.vendors_public FROM anon, authenticated;
GRANT SELECT ON public.vendors_public TO anon, authenticated;

-- Campos limpos e updated_at.
CREATE OR REPLACE FUNCTION public.vendors_normalize()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.name := btrim(NEW.name);
  NEW.slug := lower(btrim(NEW.slug));
  NEW.email := NULLIF(lower(btrim(COALESCE(NEW.email, ''))), '');
  NEW.phone := NULLIF(btrim(COALESCE(NEW.phone, '')), '');
  NEW.logo_url := NULLIF(btrim(COALESCE(NEW.logo_url, '')), '');
  NEW.notes := NULLIF(btrim(COALESCE(NEW.notes, '')), '');
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS vendors_normalize ON public.vendors;
CREATE TRIGGER vendors_normalize BEFORE INSERT OR UPDATE ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.vendors_normalize();

DO $$
BEGIN
  IF to_regprocedure('public.admin_activity_capture()') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS zz_admin_activity ON public.vendors;
    CREATE TRIGGER zz_admin_activity AFTER INSERT OR UPDATE OR DELETE ON public.vendors
      FOR EACH ROW EXECUTE FUNCTION public.admin_activity_capture();
    DROP TRIGGER IF EXISTS zz_admin_activity ON public.vendor_payouts;
    CREATE TRIGGER zz_admin_activity AFTER INSERT OR UPDATE OR DELETE ON public.vendor_payouts
      FOR EACH ROW EXECUTE FUNCTION public.admin_activity_capture();
  END IF;
END $$;

INSERT INTO public.store_settings (key, value)
VALUES ('marketplace', '{"default_commission": 10, "applications_open": true, "show_vendor": true}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------------------------
-- Livro do vendedor: refaz as linhas de um pedido a partir dos itens e do estado do pagamento.
-- A comissão fica com a percentagem do momento em que o pedido foi pago.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._vendor_ledger_sync(_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  o record;
  it record;
  v_gross numeric(12,2);
BEGIN
  IF _order_id IS NULL THEN RETURN; END IF;
  SELECT id, status, payment_status INTO o FROM public.orders WHERE id = _order_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF o.payment_status IS DISTINCT FROM 'paid' OR o.status IN ('cancelled', 'refunded') THEN
    UPDATE public.vendor_ledger SET status = 'cancelled', updated_at = now() WHERE order_id = _order_id AND status = 'active';
    RETURN;
  END IF;

  FOR it IN
    SELECT oi.id, oi.product_id, oi.quantity, oi.price, p.vendor_id, p.name, v.commission_percent
      FROM public.order_items oi
      JOIN public.products p ON p.id = oi.product_id
      JOIN public.vendors v ON v.id = p.vendor_id
     WHERE oi.order_id = _order_id
  LOOP
    v_gross := round(COALESCE(it.price, 0) * GREATEST(COALESCE(it.quantity, 0), 0), 2);
    INSERT INTO public.vendor_ledger (vendor_id, order_id, order_item_id, product_id, product_name, quantity, gross, commission_percent, commission, net)
    VALUES (it.vendor_id, _order_id, it.id, it.product_id, it.name, it.quantity, v_gross, it.commission_percent,
            round(v_gross * it.commission_percent / 100, 2), v_gross - round(v_gross * it.commission_percent / 100, 2))
    ON CONFLICT (order_item_id) WHERE order_item_id IS NOT NULL DO UPDATE SET
      quantity = EXCLUDED.quantity,
      gross = EXCLUDED.gross,
      commission = round(EXCLUDED.gross * public.vendor_ledger.commission_percent / 100, 2),
      net = EXCLUDED.gross - round(EXCLUDED.gross * public.vendor_ledger.commission_percent / 100, 2),
      status = 'active',
      updated_at = now();
  END LOOP;

  -- Itens tirados do pedido (ou que deixaram de ser do vendedor antes do pagamento) deixam de contar.
  UPDATE public.vendor_ledger l SET status = 'cancelled', updated_at = now()
   WHERE l.order_id = _order_id AND l.status = 'active'
     AND NOT EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.id = l.order_item_id AND oi.order_id = _order_id);
END;
$function$;
REVOKE ALL ON FUNCTION public._vendor_ledger_sync(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.orders_vendor_ledger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF (OLD.payment_status IS DISTINCT FROM NEW.payment_status OR OLD.status IS DISTINCT FROM NEW.status)
     AND EXISTS (SELECT 1 FROM public.vendors) THEN
    PERFORM public._vendor_ledger_sync(NEW.id);
  END IF;
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.orders_vendor_ledger() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS orders_vendor_ledger ON public.orders;
CREATE TRIGGER orders_vendor_ledger AFTER UPDATE OF payment_status, status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_vendor_ledger();

CREATE OR REPLACE FUNCTION public.order_items_vendor_ledger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.vendors) THEN RETURN NULL; END IF;
  IF TG_OP = 'DELETE' THEN
    PERFORM public._vendor_ledger_sync(OLD.order_id);
  ELSE
    PERFORM public._vendor_ledger_sync(NEW.order_id);
  END IF;
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.order_items_vendor_ledger() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS order_items_vendor_ledger ON public.order_items;
CREATE TRIGGER order_items_vendor_ledger AFTER INSERT OR UPDATE OF quantity, price, product_id OR DELETE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.order_items_vendor_ledger();

-- ---------------------------------------------------------------------------------------------
-- Números (Admin e vendedor).
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._vendor_totals(_vendor_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH l AS (
    SELECT l.*, o.status AS order_status FROM public.vendor_ledger l JOIN public.orders o ON o.id = l.order_id
     WHERE l.vendor_id = _vendor_id AND l.status = 'active'
  ), p AS (SELECT COALESCE(sum(amount), 0) AS paid FROM public.vendor_payouts WHERE vendor_id = _vendor_id)
  SELECT jsonb_build_object(
    'orders', (SELECT count(DISTINCT order_id) FROM l),
    'units', (SELECT COALESCE(sum(quantity), 0) FROM l),
    'gross', (SELECT COALESCE(sum(gross), 0) FROM l),
    'commission', (SELECT COALESCE(sum(commission), 0) FROM l),
    'net', (SELECT COALESCE(sum(net), 0) FROM l),
    'gross_30d', (SELECT COALESCE(sum(gross), 0) FROM l WHERE created_at >= now() - interval '30 days'),
    'net_undelivered', (SELECT COALESCE(sum(net), 0) FROM l WHERE order_status NOT IN ('delivered', 'completed')),
    'paid', (SELECT paid FROM p),
    'balance', (SELECT COALESCE(sum(net), 0) FROM l) - (SELECT paid FROM p),
    'last_sale', (SELECT max(created_at) FROM l),
    'products', (SELECT count(*) FROM public.products WHERE vendor_id = _vendor_id),
    'members', (SELECT count(*) FROM public.vendor_members WHERE vendor_id = _vendor_id)
  );
$function$;
REVOKE ALL ON FUNCTION public._vendor_totals(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_vendor_stats()
RETURNS TABLE (vendor_id uuid, totals jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT COALESCE(public.has_role(auth.uid(), 'admin'::app_role), false) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT v.id, public._vendor_totals(v.id) FROM public.vendors v;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_vendor_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_vendor_stats() TO authenticated;

-- Vendas de um vendedor (ou de todos), por item, mais recentes primeiro.
CREATE OR REPLACE FUNCTION public.admin_vendor_ledger(_vendor_id uuid DEFAULT NULL, _limit integer DEFAULT 25, _offset integer DEFAULT 0)
RETURNS TABLE (
  id bigint, created_at timestamptz, vendor_id uuid, vendor_name text, order_id uuid, order_status text, product_id text, product_name text,
  quantity integer, gross numeric, commission_percent numeric, commission numeric, net numeric, status text, total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT COALESCE(public.has_role(auth.uid(), 'admin'::app_role), false) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT l.id, l.created_at, l.vendor_id, v.name, l.order_id, o.status, l.product_id, l.product_name, l.quantity, l.gross,
         l.commission_percent, l.commission, l.net, l.status, count(*) OVER ()
    FROM public.vendor_ledger l
    JOIN public.vendors v ON v.id = l.vendor_id
    JOIN public.orders o ON o.id = l.order_id
   WHERE _vendor_id IS NULL OR l.vendor_id = _vendor_id
   ORDER BY l.created_at DESC, l.id DESC
   LIMIT LEAST(GREATEST(COALESCE(_limit, 25), 1), 200) OFFSET GREATEST(COALESCE(_offset, 0), 0);
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_vendor_ledger(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_vendor_ledger(uuid, integer, integer) TO authenticated;

-- Contas do vendedor: e-mail das contas ligadas.
CREATE OR REPLACE FUNCTION public.admin_vendor_members(_vendor_id uuid)
RETURNS TABLE (user_id uuid, email text, full_name text, created_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT COALESCE(public.has_role(auth.uid(), 'admin'::app_role), false) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT m.user_id, u.email::text, p.full_name, m.created_at
    FROM public.vendor_members m
    JOIN auth.users u ON u.id = m.user_id
    LEFT JOIN public.user_profiles p ON p.user_id = m.user_id
   WHERE m.vendor_id = _vendor_id
   ORDER BY m.created_at;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_vendor_members(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_vendor_members(uuid) TO authenticated;

-- Liga uma conta (pelo e-mail) a um vendedor. Erros: forbidden, not_found, user_not_found, other_vendor.
CREATE OR REPLACE FUNCTION public.admin_vendor_add_member(_vendor_id uuid, _email text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid;
  cur uuid;
BEGIN
  IF NOT COALESCE(public.has_role(auth.uid(), 'admin'::app_role), false) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = _vendor_id) THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  SELECT id INTO uid FROM auth.users WHERE lower(email) = lower(btrim(COALESCE(_email, ''))) LIMIT 1;
  IF uid IS NULL THEN RAISE EXCEPTION 'user_not_found' USING ERRCODE = 'P0002'; END IF;
  SELECT vendor_id INTO cur FROM public.vendor_members WHERE user_id = uid;
  IF cur IS NOT NULL AND cur <> _vendor_id THEN RAISE EXCEPTION 'other_vendor' USING ERRCODE = '23505'; END IF;
  INSERT INTO public.vendor_members (user_id, vendor_id) VALUES (uid, _vendor_id) ON CONFLICT (user_id) DO NOTHING;
  RETURN uid;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_vendor_add_member(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_vendor_add_member(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------------------------
-- Pedido de cadastro (/vender). Erros: feature_off, closed, auth_required, invalid, already_vendor, already_applied.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_vendor_application(
  _store_name text, _contact_name text, _email text, _phone text, _website text, _message text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  rid uuid;
  st jsonb := COALESCE((SELECT value FROM public.store_settings WHERE key = 'marketplace'), '{}'::jsonb);
  v_name text := left(btrim(COALESCE(_store_name, '')), 120);
  v_email text := lower(left(btrim(COALESCE(_email, '')), 200));
BEGIN
  IF NOT public.feature_enabled('marketplace', false) THEN RAISE EXCEPTION 'feature_off' USING ERRCODE = '42501'; END IF;
  IF COALESCE((st ->> 'applications_open')::boolean, true) IS NOT TRUE THEN RAISE EXCEPTION 'closed' USING ERRCODE = '42501'; END IF;
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501'; END IF;
  IF v_name = '' OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'invalid' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM public.vendor_members WHERE user_id = auth.uid()) THEN RAISE EXCEPTION 'already_vendor' USING ERRCODE = '23505'; END IF;
  IF EXISTS (SELECT 1 FROM public.vendor_applications WHERE user_id = auth.uid() AND status = 'new') THEN
    RAISE EXCEPTION 'already_applied' USING ERRCODE = '23505';
  END IF;
  INSERT INTO public.vendor_applications (user_id, store_name, contact_name, email, phone, website, message)
  VALUES (auth.uid(), v_name, NULLIF(left(btrim(COALESCE(_contact_name, '')), 120), ''), v_email,
          NULLIF(left(btrim(COALESCE(_phone, '')), 40), ''), NULLIF(left(btrim(COALESCE(_website, '')), 300), ''),
          NULLIF(left(btrim(COALESCE(_message, '')), 2000), ''))
  RETURNING id INTO rid;
  RETURN rid;
END;
$function$;
REVOKE ALL ON FUNCTION public.request_vendor_application(text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_vendor_application(text, text, text, text, text, text) TO authenticated;

-- Aprovar cria o vendedor (comissão padrão das regras) e liga a conta; recusar só marca. Erros: forbidden, not_found, decided.
CREATE OR REPLACE FUNCTION public.admin_vendor_application_decide(_id uuid, _approve boolean, _note text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  a record;
  vid uuid;
  base text;
  s text;
  n integer := 1;
  pct numeric := COALESCE(((SELECT value FROM public.store_settings WHERE key = 'marketplace') ->> 'default_commission')::numeric, 10);
BEGIN
  IF NOT COALESCE(public.has_role(auth.uid(), 'admin'::app_role), false) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  SELECT * INTO a FROM public.vendor_applications WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF a.status <> 'new' THEN RAISE EXCEPTION 'decided' USING ERRCODE = '22023'; END IF;
  IF NOT COALESCE(_approve, false) THEN
    UPDATE public.vendor_applications SET status = 'rejected', admin_note = NULLIF(left(btrim(COALESCE(_note, '')), 1000), ''), decided_at = now() WHERE id = _id;
    RETURN NULL;
  END IF;

  base := trim(BOTH '-' FROM regexp_replace(lower(translate(a.store_name,
    'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn')), '[^a-z0-9]+', '-', 'g'));
  base := left(COALESCE(NULLIF(base, ''), 'vendedor'), 70);
  s := base;
  WHILE EXISTS (SELECT 1 FROM public.vendors WHERE slug = s) LOOP
    n := n + 1; s := base || '-' || n;
  END LOOP;
  INSERT INTO public.vendors (slug, name, email, phone, commission_percent)
  VALUES (s, a.store_name, a.email, a.phone, LEAST(100, GREATEST(0, pct)))
  RETURNING id INTO vid;
  IF a.user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.vendor_members WHERE user_id = a.user_id) THEN
    INSERT INTO public.vendor_members (user_id, vendor_id) VALUES (a.user_id, vid);
  END IF;
  UPDATE public.vendor_applications SET status = 'approved', vendor_id = vid, admin_note = NULLIF(left(btrim(COALESCE(_note, '')), 1000), ''), decided_at = now()
   WHERE id = _id;
  RETURN vid;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_vendor_application_decide(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_vendor_application_decide(uuid, boolean, text) TO authenticated;

-- ---------------------------------------------------------------------------------------------
-- Painel do vendedor (aba Vendedor na conta). Só membros de um vendedor ativo, com o recurso ligado.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.my_vendor()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE vid uuid := public.my_vendor_id();
BEGIN
  IF vid IS NULL THEN RETURN NULL; END IF;
  RETURN (SELECT jsonb_build_object('id', v.id, 'slug', v.slug, 'name', v.name, 'logo_url', v.logo_url, 'commission_percent', v.commission_percent,
                                    'totals', public._vendor_totals(v.id))
            FROM public.vendors v WHERE v.id = vid);
END;
$function$;
REVOKE ALL ON FUNCTION public.my_vendor() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_vendor() TO authenticated;

-- Pedidos com itens do vendedor: itens dele, valores e, para pedidos ativos, o endereço de entrega.
CREATE OR REPLACE FUNCTION public.vendor_orders(_limit integer DEFAULT 20, _offset integer DEFAULT 0)
RETURNS TABLE (
  order_id uuid, created_at timestamptz, status text, tracking_number text, active boolean, ship_to jsonb, items jsonb,
  gross numeric, commission numeric, net numeric, total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE vid uuid := public.my_vendor_id();
BEGIN
  IF vid IS NULL THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  WITH g AS (
    SELECT l.order_id AS oid, bool_or(l.status = 'active') AS is_active, min(l.created_at) AS first_at,
           jsonb_agg(jsonb_build_object('name', l.product_name, 'quantity', l.quantity, 'gross', l.gross, 'net', l.net, 'status', l.status,
                                        'size', oi.design_data ->> 'size', 'variation', oi.design_data ->> 'variation') ORDER BY l.id) AS its,
           sum(l.gross) FILTER (WHERE l.status = 'active') AS s_gross,
           sum(l.commission) FILTER (WHERE l.status = 'active') AS s_comm,
           sum(l.net) FILTER (WHERE l.status = 'active') AS s_net
      FROM public.vendor_ledger l LEFT JOIN public.order_items oi ON oi.id = l.order_item_id
     WHERE l.vendor_id = vid
     GROUP BY l.order_id
  )
  SELECT o.id, o.created_at, o.status, o.tracking_number, g.is_active,
         CASE WHEN g.is_active THEN jsonb_strip_nulls(jsonb_build_object(
           'name', o.shipping_address ->> 'name', 'street', o.shipping_address ->> 'street', 'number', o.shipping_address ->> 'number',
           'complement', o.shipping_address ->> 'complement', 'parish', o.shipping_address ->> 'parish', 'city', o.shipping_address ->> 'city',
           'district', o.shipping_address ->> 'district', 'postal_code', o.shipping_address ->> 'postal_code',
           'country', COALESCE(o.shipping_address ->> 'country_code', o.shipping_address ->> 'country'), 'phone', o.shipping_address ->> 'phone'))
         END,
         g.its, COALESCE(g.s_gross, 0), COALESCE(g.s_comm, 0), COALESCE(g.s_net, 0), count(*) OVER ()
    FROM g JOIN public.orders o ON o.id = g.oid
   ORDER BY o.created_at DESC
   LIMIT LEAST(GREATEST(COALESCE(_limit, 20), 1), 100) OFFSET GREATEST(COALESCE(_offset, 0), 0);
END;
$function$;
REVOKE ALL ON FUNCTION public.vendor_orders(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendor_orders(integer, integer) TO authenticated;

-- Produtos do vendedor com o estoque de cada parte (as mesmas partes que a loja usa ao vender).
CREATE OR REPLACE FUNCTION public.vendor_products()
RETURNS TABLE (id text, name text, image text, sku text, price numeric, is_active boolean, stock integer, parts jsonb, sold_30d bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE vid uuid := public.my_vendor_id();
BEGIN
  IF vid IS NULL THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT p.id, p.name, p.image, p.sku, p.price::numeric, p.is_active,
         CASE WHEN EXISTS (SELECT 1 FROM public.product_sizes s WHERE s.product_id = p.id) THEN NULL ELSE p.stock_quantity END,
         COALESCE((
           SELECT jsonb_agg(x ORDER BY x ->> 'label') FROM (
             SELECT jsonb_build_object('variation_id', NULL, 'size_id', s.id, 'label', s.size_label, 'stock', s.stock_quantity) AS x
               FROM public.product_sizes s WHERE s.product_id = p.id AND s.stock_quantity IS NOT NULL
             UNION ALL
             SELECT jsonb_build_object('variation_id', v.id, 'size_id', NULL, 'label', v.name, 'stock', v.stock_quantity)
               FROM public.product_variations v
              WHERE v.product_id = p.id AND v.stock_quantity IS NOT NULL
                AND NOT EXISTS (SELECT 1 FROM public.product_sizes s WHERE s.product_id = p.id)
             UNION ALL
             SELECT jsonb_build_object('variation_id', a.variation_id, 'size_id', a.product_size_id, 'label', v.name || ' / ' || s.size_label, 'stock', a.stock_quantity)
               FROM public.product_variation_size_availability a
               JOIN public.product_variations v ON v.id = a.variation_id
               JOIN public.product_sizes s ON s.id = a.product_size_id
              WHERE v.product_id = p.id AND a.stock_quantity IS NOT NULL
           ) q), '[]'::jsonb),
         (SELECT COALESCE(sum(l.quantity), 0)::bigint FROM public.vendor_ledger l
           WHERE l.product_id = p.id AND l.vendor_id = vid AND l.status = 'active' AND l.created_at >= now() - interval '30 days')
    FROM public.products p
   WHERE p.vendor_id = vid
   ORDER BY p.name;
END;
$function$;
REVOKE ALL ON FUNCTION public.vendor_products() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendor_products() TO authenticated;

-- O vendedor acerta o estoque dos seus produtos (fica no Histórico de estoque como contagem, com a nota do vendedor).
-- Erros: forbidden, not_found, untracked, invalid_value.
CREATE OR REPLACE FUNCTION public.vendor_set_stock(_product_id text, _variation_id uuid, _size_id uuid, _value integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  vid uuid := public.my_vendor_id();
  vname text;
  cur integer;
  found_row boolean := false;
  prev text := COALESCE(current_setting('loja3d.stock_ctx', true), '');
BEGIN
  IF vid IS NULL THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = _product_id AND vendor_id = vid) THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF _value IS NULL OR _value < 0 OR _value > 1000000 THEN RAISE EXCEPTION 'invalid_value' USING ERRCODE = '22023'; END IF;

  IF _variation_id IS NOT NULL AND _size_id IS NOT NULL THEN
    SELECT a.stock_quantity, true INTO cur, found_row FROM public.product_variation_size_availability a JOIN public.product_variations v ON v.id = a.variation_id
     WHERE a.variation_id = _variation_id AND a.product_size_id = _size_id AND v.product_id = _product_id;
  ELSIF _size_id IS NOT NULL THEN
    SELECT stock_quantity, true INTO cur, found_row FROM public.product_sizes WHERE id = _size_id AND product_id = _product_id;
  ELSIF _variation_id IS NOT NULL THEN
    SELECT stock_quantity, true INTO cur, found_row FROM public.product_variations WHERE id = _variation_id AND product_id = _product_id;
  ELSE
    SELECT stock_quantity, true INTO cur, found_row FROM public.products WHERE id = _product_id;
  END IF;
  IF NOT COALESCE(found_row, false) THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF cur IS NULL THEN RAISE EXCEPTION 'untracked' USING ERRCODE = '22023'; END IF;

  SELECT name INTO vname FROM public.vendors WHERE id = vid;
  PERFORM set_config('loja3d.stock_ctx', jsonb_build_object('reason', 'count', 'note', left('Vendedor: ' || vname, 500))::text, true);
  IF _variation_id IS NOT NULL AND _size_id IS NOT NULL THEN
    UPDATE public.product_variation_size_availability SET stock_quantity = _value WHERE variation_id = _variation_id AND product_size_id = _size_id;
  ELSIF _size_id IS NOT NULL THEN
    UPDATE public.product_sizes SET stock_quantity = _value WHERE id = _size_id;
  ELSIF _variation_id IS NOT NULL THEN
    UPDATE public.product_variations SET stock_quantity = _value WHERE id = _variation_id;
  ELSE
    UPDATE public.products SET stock_quantity = _value WHERE id = _product_id;
  END IF;
  PERFORM set_config('loja3d.stock_ctx', prev, true);
  RETURN _value;
END;
$function$;
REVOKE ALL ON FUNCTION public.vendor_set_stock(text, uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendor_set_stock(text, uuid, uuid, integer) TO authenticated;
