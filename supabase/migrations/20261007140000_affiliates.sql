-- =============================================================================================
-- Afiliados (recurso affiliates em Admin > Recursos da loja, desligado por padrão): parceiros divulgam a loja com
-- um link próprio (?ref=<código>) e ganham uma comissão sobre os pedidos pagos que trazem.
--  1) affiliates            parceiros: código do link, contato, comissão, estado (pending, active, paused, rejected).
--                           Pedido de cadastro em /afiliados cria um parceiro pending; o Admin aprova ou recusa.
--  2) affiliate_visits      visitas pelo link, contadas por dia (sem guardar nada do visitante)
--  3) orders.affiliate_id   parceiro do pedido: só o servidor grava (create-order confere o código e recusa
--                           indicar a si mesmo); o cliente não muda (orders_lock_server_columns)
--  4) affiliate_ledger      uma linha por pedido: base (itens menos cupom, sem frete), comissão fixada no pagamento.
--                           Cancelar ou reembolsar anula; editar os itens acerta com a mesma percentagem.
--  5) affiliate_payouts     pagamentos feitos ao parceiro (saldo = comissão - pago)
--  6) funções do Admin (admin_affiliate_*), do parceiro (my_affiliate, my_affiliate_orders, request_affiliate) e do
--     site (affiliate_visit).
-- Regras em store_settings.affiliates: default_commission, cookie_days, applications_open, min_payout.
-- =============================================================================================

CREATE TABLE IF NOT EXISTS public.affiliates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  email text,
  phone text,
  website text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  commission_percent numeric(5,2) NOT NULL DEFAULT 5,
  status text NOT NULL DEFAULT 'active',
  message text,
  payout_info text,
  admin_note text,
  notes text,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT affiliates_code CHECK (code ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(code) BETWEEN 3 AND 40),
  CONSTRAINT affiliates_name_len CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  CONSTRAINT affiliates_status CHECK (status IN ('pending', 'active', 'paused', 'rejected')),
  CONSTRAINT affiliates_commission CHECK (commission_percent BETWEEN 0 AND 100),
  CONSTRAINT affiliates_len CHECK (
    (email IS NULL OR char_length(email) <= 200) AND (phone IS NULL OR char_length(phone) <= 40)
    AND (website IS NULL OR char_length(website) <= 300) AND (message IS NULL OR char_length(message) <= 2000)
    AND (payout_info IS NULL OR char_length(payout_info) <= 1000) AND (admin_note IS NULL OR char_length(admin_note) <= 1000)
    AND (notes IS NULL OR char_length(notes) <= 4000))
);
CREATE UNIQUE INDEX IF NOT EXISTS affiliates_code_key ON public.affiliates (code);
CREATE UNIQUE INDEX IF NOT EXISTS affiliates_user_key ON public.affiliates (user_id) WHERE user_id IS NOT NULL;
COMMENT ON TABLE public.affiliates IS 'Afiliados (Admin > Marketing > Afiliados). O parceiro lê os seus dados por my_affiliate().';

CREATE TABLE IF NOT EXISTS public.affiliate_visits (
  affiliate_id uuid NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  day date NOT NULL DEFAULT current_date,
  visits integer NOT NULL DEFAULT 0,
  PRIMARY KEY (affiliate_id, day)
);

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS affiliate_id uuid REFERENCES public.affiliates(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS orders_affiliate_idx ON public.orders (affiliate_id) WHERE affiliate_id IS NOT NULL;
COMMENT ON COLUMN public.orders.affiliate_id IS 'Afiliado que trouxe o pedido. Só o servidor (create-order) e o Admin gravam.';

CREATE TABLE IF NOT EXISTS public.affiliate_ledger (
  id bigserial PRIMARY KEY,
  affiliate_id uuid NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  base numeric(12,2) NOT NULL,
  commission_percent numeric(5,2) NOT NULL,
  commission numeric(12,2) NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT affiliate_ledger_status CHECK (status IN ('active', 'cancelled'))
);
CREATE UNIQUE INDEX IF NOT EXISTS affiliate_ledger_order_key ON public.affiliate_ledger (order_id);
CREATE INDEX IF NOT EXISTS affiliate_ledger_affiliate_idx ON public.affiliate_ledger (affiliate_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.affiliate_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id uuid NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL,
  paid_at date NOT NULL DEFAULT current_date,
  method text,
  reference text,
  note text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT affiliate_payouts_amount CHECK (amount > 0 AND amount <= 100000000),
  CONSTRAINT affiliate_payouts_len CHECK (
    (method IS NULL OR char_length(method) <= 60) AND (reference IS NULL OR char_length(reference) <= 120) AND (note IS NULL OR char_length(note) <= 500))
);
CREATE INDEX IF NOT EXISTS affiliate_payouts_affiliate_idx ON public.affiliate_payouts (affiliate_id, paid_at DESC);

-- ---------------------------------------------------------------------------------------------
-- Segurança: Admin gere tudo; o parceiro lê os seus pagamentos; o resto só por funções.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE public.affiliates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_payouts ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.my_affiliate_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT id FROM public.affiliates
   WHERE user_id = auth.uid() AND status IN ('active', 'paused') AND public.feature_enabled('affiliates', false);
$function$;
REVOKE ALL ON FUNCTION public.my_affiliate_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_affiliate_id() TO authenticated;

DROP POLICY IF EXISTS "Admins manage affiliates" ON public.affiliates;
CREATE POLICY "Admins manage affiliates" ON public.affiliates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins read affiliate visits" ON public.affiliate_visits;
CREATE POLICY "Admins read affiliate visits" ON public.affiliate_visits FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins read affiliate ledger" ON public.affiliate_ledger;
CREATE POLICY "Admins read affiliate ledger" ON public.affiliate_ledger FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins manage affiliate payouts" ON public.affiliate_payouts;
CREATE POLICY "Admins manage affiliate payouts" ON public.affiliate_payouts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Affiliates read own payouts" ON public.affiliate_payouts;
CREATE POLICY "Affiliates read own payouts" ON public.affiliate_payouts FOR SELECT TO authenticated
  USING (affiliate_id = public.my_affiliate_id());

REVOKE ALL ON public.affiliates, public.affiliate_visits, public.affiliate_ledger, public.affiliate_payouts FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.affiliates, public.affiliate_payouts TO authenticated;
GRANT SELECT ON public.affiliate_visits, public.affiliate_ledger TO authenticated;
GRANT ALL ON public.affiliates, public.affiliate_visits, public.affiliate_ledger, public.affiliate_payouts TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.affiliate_ledger_id_seq TO service_role;

-- Campos limpos e updated_at; aprovar grava a data.
CREATE OR REPLACE FUNCTION public.affiliates_normalize()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.name := btrim(NEW.name);
  NEW.code := lower(btrim(NEW.code));
  NEW.email := NULLIF(lower(btrim(COALESCE(NEW.email, ''))), '');
  NEW.phone := NULLIF(btrim(COALESCE(NEW.phone, '')), '');
  NEW.website := NULLIF(btrim(COALESCE(NEW.website, '')), '');
  NEW.payout_info := NULLIF(btrim(COALESCE(NEW.payout_info, '')), '');
  NEW.notes := NULLIF(btrim(COALESCE(NEW.notes, '')), '');
  NEW.admin_note := NULLIF(btrim(COALESCE(NEW.admin_note, '')), '');
  IF NEW.status = 'active' AND NEW.approved_at IS NULL THEN NEW.approved_at := now(); END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS affiliates_normalize ON public.affiliates;
CREATE TRIGGER affiliates_normalize BEFORE INSERT OR UPDATE ON public.affiliates
  FOR EACH ROW EXECUTE FUNCTION public.affiliates_normalize();

DO $$
BEGIN
  IF to_regprocedure('public.admin_activity_capture()') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS zz_admin_activity ON public.affiliates;
    CREATE TRIGGER zz_admin_activity AFTER INSERT OR UPDATE OR DELETE ON public.affiliates
      FOR EACH ROW EXECUTE FUNCTION public.admin_activity_capture();
    DROP TRIGGER IF EXISTS zz_admin_activity ON public.affiliate_payouts;
    CREATE TRIGGER zz_admin_activity AFTER INSERT OR UPDATE OR DELETE ON public.affiliate_payouts
      FOR EACH ROW EXECUTE FUNCTION public.admin_activity_capture();
  END IF;
END $$;

INSERT INTO public.store_settings (key, value)
VALUES ('affiliates', '{"default_commission": 5, "cookie_days": 30, "applications_open": true, "min_payout": 0}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- O cliente não muda o afiliado do pedido (o servidor e o Admin sim). Mesma função de 20261007070000 + affiliate_id.
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
  NEW.payment_discount        := OLD.payment_discount;
  NEW.shipping_service_id     := OLD.shipping_service_id;
  NEW.shipping_details        := OLD.shipping_details;
  NEW.checkout_fields         := OLD.checkout_fields;
  NEW.extras_amount           := OLD.extras_amount;
  NEW.extras_vat              := OLD.extras_vat;
  NEW.estimated_ship_by       := OLD.estimated_ship_by;
  NEW.estimated_delivery_from := OLD.estimated_delivery_from;
  NEW.estimated_delivery_to   := OLD.estimated_delivery_to;
  NEW.affiliate_id            := OLD.affiliate_id;
  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------------------------
-- Comissão do pedido: refaz a linha a partir dos itens, do cupom e do estado do pagamento.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._affiliate_ledger_sync(_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  o record;
  v_pct numeric(5,2);
  v_base numeric(12,2);
BEGIN
  IF _order_id IS NULL THEN RETURN; END IF;
  SELECT id, status, payment_status, affiliate_id, COALESCE(discount_amount, 0) AS discount INTO o FROM public.orders WHERE id = _order_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF o.affiliate_id IS NULL OR o.payment_status IS DISTINCT FROM 'paid' OR o.status IN ('cancelled', 'refunded') THEN
    UPDATE public.affiliate_ledger SET status = 'cancelled', updated_at = now() WHERE order_id = _order_id AND status = 'active';
    RETURN;
  END IF;

  SELECT GREATEST(round(COALESCE(sum(COALESCE(price, 0) * GREATEST(COALESCE(quantity, 0), 0)), 0) - o.discount, 2), 0)
    INTO v_base FROM public.order_items WHERE order_id = _order_id;
  SELECT commission_percent INTO v_pct FROM public.affiliates WHERE id = o.affiliate_id;
  IF v_pct IS NULL THEN RETURN; END IF;

  INSERT INTO public.affiliate_ledger (affiliate_id, order_id, base, commission_percent, commission)
  VALUES (o.affiliate_id, _order_id, v_base, v_pct, round(v_base * v_pct / 100, 2))
  ON CONFLICT (order_id) DO UPDATE SET
    -- Mudou o parceiro do pedido (só o Admin): vale a percentagem do novo; senão, a do pagamento.
    commission_percent = CASE WHEN public.affiliate_ledger.affiliate_id = EXCLUDED.affiliate_id THEN public.affiliate_ledger.commission_percent ELSE EXCLUDED.commission_percent END,
    commission = round(EXCLUDED.base * (CASE WHEN public.affiliate_ledger.affiliate_id = EXCLUDED.affiliate_id THEN public.affiliate_ledger.commission_percent ELSE EXCLUDED.commission_percent END) / 100, 2),
    affiliate_id = EXCLUDED.affiliate_id,
    base = EXCLUDED.base,
    status = 'active',
    updated_at = now();
END;
$function$;
REVOKE ALL ON FUNCTION public._affiliate_ledger_sync(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.orders_affiliate_ledger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF (NEW.affiliate_id IS NOT NULL OR OLD.affiliate_id IS NOT NULL)
     AND (OLD.payment_status IS DISTINCT FROM NEW.payment_status OR OLD.status IS DISTINCT FROM NEW.status
          OR OLD.affiliate_id IS DISTINCT FROM NEW.affiliate_id OR OLD.discount_amount IS DISTINCT FROM NEW.discount_amount) THEN
    PERFORM public._affiliate_ledger_sync(NEW.id);
  END IF;
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.orders_affiliate_ledger() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS orders_affiliate_ledger ON public.orders;
CREATE TRIGGER orders_affiliate_ledger AFTER UPDATE OF payment_status, status, affiliate_id, discount_amount ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_affiliate_ledger();

CREATE OR REPLACE FUNCTION public.order_items_affiliate_ledger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE oid uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.order_id ELSE NEW.order_id END;
BEGIN
  IF EXISTS (SELECT 1 FROM public.orders WHERE id = oid AND affiliate_id IS NOT NULL) THEN
    PERFORM public._affiliate_ledger_sync(oid);
  END IF;
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.order_items_affiliate_ledger() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS order_items_affiliate_ledger ON public.order_items;
CREATE TRIGGER order_items_affiliate_ledger AFTER INSERT OR UPDATE OF quantity, price OR DELETE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.order_items_affiliate_ledger();

-- ---------------------------------------------------------------------------------------------
-- Site: visita pelo link. Conta por dia e diz se o código vale (parceiro ativo e recurso ligado).
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.affiliate_visit(_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE aid uuid;
BEGIN
  IF NOT public.feature_enabled('affiliates', false) THEN RETURN false; END IF;
  SELECT id INTO aid FROM public.affiliates WHERE code = lower(btrim(COALESCE(_code, ''))) AND status = 'active';
  IF aid IS NULL THEN RETURN false; END IF;
  INSERT INTO public.affiliate_visits (affiliate_id, day, visits) VALUES (aid, current_date, 1)
  ON CONFLICT (affiliate_id, day) DO UPDATE SET visits = public.affiliate_visits.visits + 1;
  RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION public.affiliate_visit(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.affiliate_visit(text) TO anon, authenticated;

-- Parceiro válido para um pedido (create-order, com a chave de serviço): ativo e não é o próprio comprador.
CREATE OR REPLACE FUNCTION public.affiliate_for_order(_code text, _buyer uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT id FROM public.affiliates
   WHERE public.feature_enabled('affiliates', false)
     AND code = lower(btrim(COALESCE(_code, ''))) AND status = 'active'
     AND (user_id IS NULL OR _buyer IS NULL OR user_id <> _buyer);
$function$;
REVOKE ALL ON FUNCTION public.affiliate_for_order(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.affiliate_for_order(text, uuid) TO service_role;

-- ---------------------------------------------------------------------------------------------
-- Números (Admin e parceiro). "Liberado" = comissão de pedidos entregues; "a pagar" = liberado - pago.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._affiliate_totals(_affiliate_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH l AS (
    SELECT l.*, o.status AS order_status FROM public.affiliate_ledger l JOIN public.orders o ON o.id = l.order_id
     WHERE l.affiliate_id = _affiliate_id AND l.status = 'active'
  ), p AS (SELECT COALESCE(sum(amount), 0) AS paid FROM public.affiliate_payouts WHERE affiliate_id = _affiliate_id),
  v AS (SELECT COALESCE(sum(visits), 0) AS all_v, COALESCE(sum(visits) FILTER (WHERE day >= current_date - 29), 0) AS v30
          FROM public.affiliate_visits WHERE affiliate_id = _affiliate_id)
  SELECT jsonb_build_object(
    'visits', (SELECT all_v FROM v),
    'visits_30d', (SELECT v30 FROM v),
    'orders', (SELECT count(*) FROM l),
    'orders_30d', (SELECT count(*) FROM l WHERE created_at >= now() - interval '30 days'),
    'sales', (SELECT COALESCE(sum(base), 0) FROM l),
    'commission', (SELECT COALESCE(sum(commission), 0) FROM l),
    'pending', (SELECT COALESCE(sum(commission), 0) FROM l WHERE order_status NOT IN ('delivered', 'completed')),
    'released', (SELECT COALESCE(sum(commission), 0) FROM l WHERE order_status IN ('delivered', 'completed')),
    'paid', (SELECT paid FROM p),
    'balance', (SELECT COALESCE(sum(commission), 0) FROM l WHERE order_status IN ('delivered', 'completed')) - (SELECT paid FROM p),
    'last_order', (SELECT max(created_at) FROM l)
  );
$function$;
REVOKE ALL ON FUNCTION public._affiliate_totals(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_affiliate_stats()
RETURNS TABLE (affiliate_id uuid, totals jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT COALESCE(public.has_role(auth.uid(), 'admin'::app_role), false) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT a.id, public._affiliate_totals(a.id) FROM public.affiliates a;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_affiliate_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_affiliate_stats() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_affiliate_ledger(_affiliate_id uuid DEFAULT NULL, _limit integer DEFAULT 25, _offset integer DEFAULT 0)
RETURNS TABLE (
  id bigint, created_at timestamptz, affiliate_id uuid, affiliate_name text, order_id uuid, order_status text, order_total numeric,
  base numeric, commission_percent numeric, commission numeric, status text, total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT COALESCE(public.has_role(auth.uid(), 'admin'::app_role), false) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT l.id, l.created_at, l.affiliate_id, a.name, l.order_id, o.status, o.total, l.base, l.commission_percent, l.commission, l.status, count(*) OVER ()
    FROM public.affiliate_ledger l
    JOIN public.affiliates a ON a.id = l.affiliate_id
    JOIN public.orders o ON o.id = l.order_id
   WHERE _affiliate_id IS NULL OR l.affiliate_id = _affiliate_id
   ORDER BY l.created_at DESC, l.id DESC
   LIMIT LEAST(GREATEST(COALESCE(_limit, 25), 1), 200) OFFSET GREATEST(COALESCE(_offset, 0), 0);
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_affiliate_ledger(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_affiliate_ledger(uuid, integer, integer) TO authenticated;

-- Ligar a conta de cliente pelo e-mail (Admin). Erros: forbidden, not_found, user_not_found, other_affiliate.
CREATE OR REPLACE FUNCTION public.admin_affiliate_link_user(_affiliate_id uuid, _email text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE uid uuid;
BEGIN
  IF NOT COALESCE(public.has_role(auth.uid(), 'admin'::app_role), false) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.affiliates WHERE id = _affiliate_id) THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF NULLIF(btrim(COALESCE(_email, '')), '') IS NULL THEN
    UPDATE public.affiliates SET user_id = NULL WHERE id = _affiliate_id;
    RETURN NULL;
  END IF;
  SELECT id INTO uid FROM auth.users WHERE lower(email) = lower(btrim(_email)) LIMIT 1;
  IF uid IS NULL THEN RAISE EXCEPTION 'user_not_found' USING ERRCODE = 'P0002'; END IF;
  IF EXISTS (SELECT 1 FROM public.affiliates WHERE user_id = uid AND id <> _affiliate_id) THEN RAISE EXCEPTION 'other_affiliate' USING ERRCODE = '23505'; END IF;
  UPDATE public.affiliates SET user_id = uid WHERE id = _affiliate_id;
  RETURN uid;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_affiliate_link_user(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_affiliate_link_user(uuid, text) TO authenticated;

-- E-mail da conta ligada (para o Admin mostrar).
CREATE OR REPLACE FUNCTION public.admin_affiliate_accounts()
RETURNS TABLE (affiliate_id uuid, email text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT COALESCE(public.has_role(auth.uid(), 'admin'::app_role), false) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT a.id, u.email::text FROM public.affiliates a JOIN auth.users u ON u.id = a.user_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_affiliate_accounts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_affiliate_accounts() TO authenticated;

-- ---------------------------------------------------------------------------------------------
-- Parceiro: cadastro, os seus dados e os seus pedidos (sem dados do comprador).
-- Erros do cadastro: feature_off, closed, auth_required, invalid, already_affiliate.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_affiliate(_name text, _email text, _phone text, _website text, _message text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  rid uuid;
  st jsonb := COALESCE((SELECT value FROM public.store_settings WHERE key = 'affiliates'), '{}'::jsonb);
  v_name text := left(btrim(COALESCE(_name, '')), 120);
  v_email text := lower(left(btrim(COALESCE(_email, '')), 200));
  v_pct numeric := LEAST(GREATEST(COALESCE((st ->> 'default_commission')::numeric, 5), 0), 100);
  base text;
  v_code text;
  n integer := 1;
BEGIN
  IF NOT public.feature_enabled('affiliates', false) THEN RAISE EXCEPTION 'feature_off' USING ERRCODE = '42501'; END IF;
  IF COALESCE((st ->> 'applications_open')::boolean, true) IS NOT TRUE THEN RAISE EXCEPTION 'closed' USING ERRCODE = '42501'; END IF;
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501'; END IF;
  IF v_name = '' OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'invalid' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM public.affiliates WHERE user_id = auth.uid()) THEN RAISE EXCEPTION 'already_affiliate' USING ERRCODE = '23505'; END IF;
  base := left(trim(BOTH '-' FROM regexp_replace(lower(translate(v_name,
    'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn')), '[^a-z0-9]+', '-', 'g')), 30);
  base := trim(BOTH '-' FROM base);
  IF char_length(base) < 3 THEN base := 'parceiro'; END IF;
  v_code := base;
  WHILE EXISTS (SELECT 1 FROM public.affiliates WHERE code = v_code) LOOP
    n := n + 1;
    v_code := base || '-' || n;
  END LOOP;
  INSERT INTO public.affiliates (code, name, email, phone, website, message, user_id, commission_percent, status)
  VALUES (v_code, v_name, v_email, NULLIF(left(btrim(COALESCE(_phone, '')), 40), ''), NULLIF(left(btrim(COALESCE(_website, '')), 300), ''),
          NULLIF(left(btrim(COALESCE(_message, '')), 2000), ''), auth.uid(), v_pct, 'pending')
  RETURNING id INTO rid;
  RETURN rid;
END;
$function$;
REVOKE ALL ON FUNCTION public.request_affiliate(text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_affiliate(text, text, text, text, text) TO authenticated;

-- Aprovar ou recusar um cadastro (Admin). Erros: forbidden, not_found, decided.
CREATE OR REPLACE FUNCTION public.admin_affiliate_decide(_id uuid, _approve boolean, _note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE cur text;
BEGIN
  IF NOT COALESCE(public.has_role(auth.uid(), 'admin'::app_role), false) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  SELECT status INTO cur FROM public.affiliates WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF cur <> 'pending' THEN RAISE EXCEPTION 'decided' USING ERRCODE = '22023'; END IF;
  UPDATE public.affiliates
     SET status = CASE WHEN _approve THEN 'active' ELSE 'rejected' END,
         admin_note = NULLIF(left(btrim(COALESCE(_note, '')), 1000), '')
   WHERE id = _id;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_affiliate_decide(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_affiliate_decide(uuid, boolean, text) TO authenticated;

-- Os dados do parceiro da conta (qualquer estado, para /afiliados mostrar "em análise" ou "recusado").
CREATE OR REPLACE FUNCTION public.my_affiliate()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'id', a.id, 'code', a.code, 'name', a.name, 'status', a.status, 'commission_percent', a.commission_percent,
    'payout_info', a.payout_info, 'admin_note', a.admin_note, 'created_at', a.created_at,
    'totals', CASE WHEN a.status IN ('active', 'paused') THEN public._affiliate_totals(a.id) ELSE NULL END)
    FROM public.affiliates a
   WHERE a.user_id = auth.uid() AND public.feature_enabled('affiliates', false);
$function$;
REVOKE ALL ON FUNCTION public.my_affiliate() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_affiliate() TO authenticated;

-- O parceiro guarda como quer receber (o resto dos dados é do Admin).
CREATE OR REPLACE FUNCTION public.my_affiliate_payout_info(_info text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE aid uuid := public.my_affiliate_id();
BEGIN
  IF aid IS NULL THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  UPDATE public.affiliates SET payout_info = left(btrim(COALESCE(_info, '')), 1000) WHERE id = aid;
END;
$function$;
REVOKE ALL ON FUNCTION public.my_affiliate_payout_info(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_affiliate_payout_info(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.my_affiliate_orders(_limit integer DEFAULT 20, _offset integer DEFAULT 0)
RETURNS TABLE (id bigint, created_at timestamptz, order_ref text, order_status text, base numeric, commission_percent numeric, commission numeric, status text, total_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE aid uuid := public.my_affiliate_id();
BEGIN
  IF aid IS NULL THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT l.id, l.created_at, upper(left(l.order_id::text, 8)), o.status, l.base, l.commission_percent, l.commission, l.status, count(*) OVER ()
    FROM public.affiliate_ledger l JOIN public.orders o ON o.id = l.order_id
   WHERE l.affiliate_id = aid
   ORDER BY l.created_at DESC, l.id DESC
   LIMIT LEAST(GREATEST(COALESCE(_limit, 20), 1), 100) OFFSET GREATEST(COALESCE(_offset, 0), 0);
END;
$function$;
REVOKE ALL ON FUNCTION public.my_affiliate_orders(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_affiliate_orders(integer, integer) TO authenticated;
