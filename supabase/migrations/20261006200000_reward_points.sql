-- =============================================================================================
-- Programa de pontos (recurso reward_points em Admin > Recursos da loja, desligado por padrão).
--   reward_point_entries       extrato de cada cliente: ganhou (earn), bónus de cadastro (signup), usou (redeem),
--                              devolvido ao cancelar (refund), retirado ao cancelar (reverse), ajuste (adjust), venceu (expire)
--   store_settings.reward_points  regras: pontos por unidade de moeda, valor do ponto, mínimo para usar, máximo do pedido,
--                              quando ganha (pago ou entregue), validade em meses, bónus de cadastro
--   reward_points_settle       regista o vencimento dos pontos antigos (os mais antigos são usados primeiro)
--   my_reward_points           saldo do próprio cliente (conta e checkout)
--   reward_points_balance_for  saldo para o create-order (só service_role)
--   create_order_with_benefits create-order: desconta pontos e vale-presente e grava o pedido na mesma transação
--   admin_reward_points_*      lista, números e ajuste no Admin > Pontos
-- O desconto é sempre calculado no servidor (create-order). Ninguém escreve no extrato diretamente: só estas funções.
-- =============================================================================================

CREATE TABLE IF NOT EXISTS public.reward_point_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  points integer NOT NULL CHECK (points <> 0),
  kind text NOT NULL CHECK (kind IN ('earn', 'signup', 'redeem', 'refund', 'reverse', 'adjust', 'expire')),
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  note text CHECK (note IS NULL OR char_length(note) <= 500),
  expires_at timestamptz,
  expired_done boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reward_point_entries_user_idx ON public.reward_point_entries (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS reward_point_entries_order_idx ON public.reward_point_entries (order_id);
-- Um pedido ganha, usa, devolve e retira pontos no máximo uma vez; o bónus de cadastro é um por cliente.
CREATE UNIQUE INDEX IF NOT EXISTS reward_point_entries_order_kind_uq ON public.reward_point_entries (order_id, kind)
  WHERE order_id IS NOT NULL AND kind IN ('earn', 'redeem', 'refund', 'reverse');
CREATE UNIQUE INDEX IF NOT EXISTS reward_point_entries_signup_uq ON public.reward_point_entries (user_id) WHERE kind = 'signup';

ALTER TABLE public.reward_point_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Customers read own points" ON public.reward_point_entries;
CREATE POLICY "Customers read own points" ON public.reward_point_entries
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));
REVOKE INSERT, UPDATE, DELETE ON public.reward_point_entries FROM anon, authenticated;

-- Pedido: pontos usados e o valor descontado (gravados pelo servidor).
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS reward_points_used integer NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS reward_points_amount numeric(12,2) NOT NULL DEFAULT 0;

-- Regras com os valores padrão (iguais a src/lib/rewardPoints.ts).
CREATE OR REPLACE FUNCTION public.reward_points_settings()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'earn_per_unit', greatest(coalesce((v->>'earn_per_unit')::numeric, 1), 0),
    'point_value', greatest(coalesce((v->>'point_value')::numeric, 0.05), 0),
    'min_redeem', greatest(coalesce((v->>'min_redeem')::integer, 100), 1),
    'max_percent', least(greatest(coalesce((v->>'max_percent')::integer, 50), 0), 100),
    'award_on', CASE WHEN v->>'award_on' = 'delivered' THEN 'delivered' ELSE 'paid' END,
    'expire_months', greatest(coalesce((v->>'expire_months')::integer, 12), 0),
    'signup_bonus', greatest(coalesce((v->>'signup_bonus')::integer, 0), 0))
  FROM (SELECT coalesce((SELECT value FROM public.store_settings WHERE key = 'reward_points'), '{}'::jsonb) AS v) s
$$;
GRANT EXECUTE ON FUNCTION public.reward_points_settings() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.reward_points_expiry()
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE WHEN (public.reward_points_settings()->>'expire_months')::int > 0
              THEN now() + make_interval(months => (public.reward_points_settings()->>'expire_months')::int) END
$$;

-- Vencimento: os pontos usados saem dos lotes mais antigos; o que sobrar de um lote vencido vira um registo "expire".
CREATE OR REPLACE FUNCTION public.reward_points_settle(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  debits bigint;
  lot record;
  used integer;
BEGIN
  IF _user_id IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.reward_point_entries
                  WHERE user_id = _user_id AND points > 0 AND NOT expired_done AND expires_at IS NOT NULL AND expires_at < now()) THEN
    RETURN;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('reward_points:' || _user_id::text));
  SELECT coalesce(-sum(points), 0) INTO debits FROM public.reward_point_entries WHERE user_id = _user_id AND points < 0;
  FOR lot IN SELECT id, points, expires_at, expired_done FROM public.reward_point_entries
              WHERE user_id = _user_id AND points > 0 ORDER BY created_at, id LOOP
    used := least(lot.points, greatest(debits, 0));
    debits := debits - used;
    IF NOT lot.expired_done AND lot.expires_at IS NOT NULL AND lot.expires_at < now() THEN
      IF lot.points - used > 0 THEN
        INSERT INTO public.reward_point_entries (user_id, points, kind, note)
        VALUES (_user_id, -(lot.points - used), 'expire', NULL);
      END IF;
      UPDATE public.reward_point_entries SET expired_done = true WHERE id = lot.id;
    END IF;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.reward_points_settle(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.reward_points_balance_raw(_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT coalesce(sum(points), 0)::int FROM public.reward_point_entries WHERE user_id = _user_id $$;
REVOKE ALL ON FUNCTION public.reward_points_balance_raw(uuid) FROM PUBLIC, anon, authenticated;

-- Pontos que vencem nos próximos 30 dias (do que ainda sobra nos lotes mais antigos).
CREATE OR REPLACE FUNCTION public.reward_points_expiring(_user_id uuid, _days integer DEFAULT 30)
RETURNS TABLE (points integer, next_expiry timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  debits bigint;
  lot record;
  used integer;
  total integer := 0;
  first_at timestamptz;
BEGIN
  SELECT coalesce(-sum(e.points), 0) INTO debits FROM public.reward_point_entries e WHERE e.user_id = _user_id AND e.points < 0;
  FOR lot IN SELECT e.points, e.expires_at FROM public.reward_point_entries e
              WHERE e.user_id = _user_id AND e.points > 0 ORDER BY e.created_at, e.id LOOP
    used := least(lot.points, greatest(debits, 0));
    debits := debits - used;
    IF lot.points - used > 0 AND lot.expires_at IS NOT NULL AND lot.expires_at >= now() THEN
      IF first_at IS NULL OR lot.expires_at < first_at THEN first_at := lot.expires_at; END IF;
      IF lot.expires_at < now() + make_interval(days => _days) THEN total := total + (lot.points - used); END IF;
    END IF;
  END LOOP;
  RETURN QUERY SELECT total, first_at;
END $$;
REVOKE ALL ON FUNCTION public.reward_points_expiring(uuid, integer) FROM PUBLIC, anon, authenticated;

-- Saldo do próprio cliente (Minha conta > Pontos e checkout).
CREATE OR REPLACE FUNCTION public.my_reward_points()
RETURNS TABLE (balance integer, expiring integer, next_expiry timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'reward_points_login' USING ERRCODE = '42501'; END IF;
  IF NOT public.feature_enabled('reward_points', false) THEN RAISE EXCEPTION 'reward_points_disabled'; END IF;
  PERFORM public.reward_points_settle(uid);
  RETURN QUERY SELECT public.reward_points_balance_raw(uid), x.points, x.next_expiry FROM public.reward_points_expiring(uid, 30) x;
END $$;
REVOKE ALL ON FUNCTION public.my_reward_points() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_reward_points() TO authenticated;

-- Saldo para o create-order calcular o desconto.
CREATE OR REPLACE FUNCTION public.reward_points_balance_for(_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.reward_points_settle(_user_id);
  RETURN public.reward_points_balance_raw(_user_id);
END $$;
REVOKE ALL ON FUNCTION public.reward_points_balance_for(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reward_points_balance_for(uuid) TO service_role;

-- Colunas de pontos do pedido: só estas funções as mudam.
CREATE OR REPLACE FUNCTION public.orders_reward_points_lock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF coalesce(current_setting('app.reward_points_tx', true), '') <> '1' THEN
    NEW.reward_points_used := OLD.reward_points_used;
    NEW.reward_points_amount := OLD.reward_points_amount;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS zz_orders_reward_points_lock ON public.orders;
CREATE TRIGGER zz_orders_reward_points_lock BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_reward_points_lock();

-- Pedido novo com pontos e vale-presente (create-order). O total já vem com os dois descontados.
CREATE OR REPLACE FUNCTION public.create_order_with_benefits(
  _user_id uuid, _order jsonb, _items jsonb, _gift_code text, _gift_amount numeric, _points integer, _points_amount numeric
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders;
  pts integer := greatest(coalesce(_points, 0), 0);
  amt numeric := round(greatest(coalesce(_points_amount, 0), 0), 2);
  cfg jsonb;
BEGIN
  IF pts > 0 THEN
    IF NOT public.feature_enabled('reward_points', false) THEN
      RAISE EXCEPTION 'Pontos: indisponíveis nesta loja.';
    END IF;
    cfg := public.reward_points_settings();
    PERFORM pg_advisory_xact_lock(hashtext('reward_points:' || _user_id::text));
    PERFORM public.reward_points_settle(_user_id);
    IF pts < (cfg->>'min_redeem')::int OR public.reward_points_balance_raw(_user_id) < pts
       OR amt > round(pts * (cfg->>'point_value')::numeric, 2) THEN
      RAISE EXCEPTION 'Pontos: saldo insuficiente ou abaixo do mínimo para usar.';
    END IF;
  END IF;

  -- Os pontos ganhos só se calculam no fim, já com os pontos usados gravados no pedido.
  IF pts > 0 THEN PERFORM set_config('app.reward_points_hold', '1', true); END IF;
  o := public.create_order_with_gift_card(_user_id, _order, _items, _gift_code, _gift_amount);
  IF pts <= 0 THEN RETURN o; END IF;
  PERFORM set_config('app.reward_points_hold', '', true);

  -- De novo como servidor (create_order_server passou a sessão para o cliente).
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);

  INSERT INTO public.reward_point_entries (user_id, points, kind, order_id, created_by)
  VALUES (_user_id, -pts, 'redeem', o.id, _user_id);

  PERFORM set_config('app.reward_points_tx', '1', true);
  UPDATE public.orders
     SET reward_points_used = pts,
         reward_points_amount = amt,
         status = CASE WHEN o.total <= 0 THEN 'paid' ELSE status END,
         payment_status = CASE WHEN o.total <= 0 THEN 'paid' ELSE payment_status END
   WHERE id = o.id
   RETURNING * INTO o;
  PERFORM set_config('app.reward_points_tx', '', true);
  RETURN o;
END $$;
REVOKE ALL ON FUNCTION public.create_order_with_benefits(uuid, jsonb, jsonb, text, numeric, integer, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_with_benefits(uuid, jsonb, jsonb, text, numeric, integer, numeric) TO service_role;

-- Ganhar pontos quando o pedido é pago (ou entregue, conforme a regra); cancelar ou reembolsar retira os ganhos
-- e devolve os usados. A base é o valor dos produtos pago pelo cliente (sem frete, já com cupom e descontos).
CREATE OR REPLACE FUNCTION public.orders_reward_points_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg jsonb;
  base numeric;
  earned integer;
  closed boolean := NEW.status IN ('cancelled', 'refunded') OR NEW.payment_status = 'refunded';
  was_closed boolean := TG_OP = 'UPDATE' AND (OLD.status IN ('cancelled', 'refunded') OR OLD.payment_status = 'refunded');
BEGIN
  IF NEW.user_id IS NULL OR coalesce(current_setting('app.reward_points_hold', true), '') = '1' THEN RETURN NULL; END IF;

  IF closed AND NOT was_closed THEN
    SELECT points INTO earned FROM public.reward_point_entries WHERE order_id = NEW.id AND kind = 'earn';
    IF earned IS NOT NULL THEN
      INSERT INTO public.reward_point_entries (user_id, points, kind, order_id, created_by)
      VALUES (NEW.user_id, -earned, 'reverse', NEW.id, auth.uid()) ON CONFLICT DO NOTHING;
    END IF;
    IF NEW.reward_points_used > 0 THEN
      INSERT INTO public.reward_point_entries (user_id, points, kind, order_id, expires_at, created_by)
      VALUES (NEW.user_id, NEW.reward_points_used, 'refund', NEW.id, public.reward_points_expiry(), auth.uid()) ON CONFLICT DO NOTHING;
    END IF;
    RETURN NULL;
  END IF;
  IF closed OR NOT public.feature_enabled('reward_points', false) THEN RETURN NULL; END IF;

  cfg := public.reward_points_settings();
  IF NOT ((cfg->>'award_on' = 'paid' AND NEW.payment_status = 'paid')
          OR (cfg->>'award_on' = 'delivered' AND NEW.status = 'delivered')) THEN
    RETURN NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM public.reward_point_entries WHERE order_id = NEW.id AND kind IN ('earn', 'reverse')) THEN
    RETURN NULL;
  END IF;
  base := coalesce(NEW.subtotal_net, 0) + coalesce(NEW.vat_total, 0) - coalesce(NEW.discount_amount, 0)
          - coalesce(NEW.payment_discount, 0) - coalesce(NEW.reward_points_amount, 0);
  earned := floor(greatest(base, 0) * (cfg->>'earn_per_unit')::numeric)::int;
  IF earned > 0 THEN
    INSERT INTO public.reward_point_entries (user_id, points, kind, order_id, expires_at)
    VALUES (NEW.user_id, earned, 'earn', NEW.id, public.reward_points_expiry()) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS orders_reward_points_events ON public.orders;
CREATE TRIGGER orders_reward_points_events AFTER INSERT OR UPDATE OF status, payment_status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_reward_points_events();

-- Bónus de cadastro (quando a loja definiu um valor).
CREATE OR REPLACE FUNCTION public.user_profiles_reward_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE bonus integer;
BEGIN
  IF NEW.user_id IS NULL OR NOT public.feature_enabled('reward_points', false) THEN RETURN NULL; END IF;
  bonus := (public.reward_points_settings()->>'signup_bonus')::int;
  IF bonus > 0 THEN
    INSERT INTO public.reward_point_entries (user_id, points, kind, expires_at)
    VALUES (NEW.user_id, bonus, 'signup', public.reward_points_expiry()) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS user_profiles_reward_signup ON public.user_profiles;
CREATE TRIGGER user_profiles_reward_signup AFTER INSERT ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.user_profiles_reward_signup();

-- ---------- Admin ----------

-- Clientes com pontos (saldo, ganhos, usados, última mexida). Regista antes os vencimentos pendentes.
CREATE OR REPLACE FUNCTION public.admin_reward_points_customers()
RETURNS TABLE (user_id uuid, full_name text, email text, balance integer, earned integer, redeemed integer, last_activity timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE u uuid;
BEGIN
  IF NOT coalesce(public.has_role(auth.uid(), 'admin'::app_role), false) THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
  END IF;
  FOR u IN SELECT DISTINCT e.user_id FROM public.reward_point_entries e
            WHERE e.points > 0 AND NOT e.expired_done AND e.expires_at < now() LOOP
    PERFORM public.reward_points_settle(u);
  END LOOP;
  RETURN QUERY
  SELECT e.user_id, p.full_name::text, a.email::text,
         sum(e.points)::int,
         coalesce(sum(e.points) FILTER (WHERE e.kind IN ('earn', 'signup')), 0)::int,
         coalesce(-sum(e.points) FILTER (WHERE e.kind = 'redeem'), 0)::int,
         max(e.created_at)
    FROM public.reward_point_entries e
    LEFT JOIN public.user_profiles p ON p.user_id = e.user_id
    LEFT JOIN auth.users a ON a.id = e.user_id
   GROUP BY e.user_id, p.full_name, a.email
   ORDER BY max(e.created_at) DESC;
END $$;
REVOKE ALL ON FUNCTION public.admin_reward_points_customers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reward_points_customers() TO authenticated;

-- Ajuste manual (positivo ou negativo) com motivo.
CREATE OR REPLACE FUNCTION public.admin_adjust_reward_points(_user_id uuid, _points integer, _note text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT coalesce(public.has_role(auth.uid(), 'admin'::app_role), false) THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
  END IF;
  IF coalesce(_points, 0) = 0 OR abs(_points) > 10000000 THEN RAISE EXCEPTION 'invalid_points'; END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = _user_id) THEN RAISE EXCEPTION 'customer_not_found'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('reward_points:' || _user_id::text));
  PERFORM public.reward_points_settle(_user_id);
  IF _points < 0 AND public.reward_points_balance_raw(_user_id) + _points < 0 THEN
    RAISE EXCEPTION 'negative_balance';
  END IF;
  INSERT INTO public.reward_point_entries (user_id, points, kind, note, expires_at, created_by)
  VALUES (_user_id, _points, 'adjust', nullif(btrim(coalesce(_note, '')), ''),
          CASE WHEN _points > 0 THEN public.reward_points_expiry() END, auth.uid());
  RETURN public.reward_points_balance_raw(_user_id);
END $$;
REVOKE ALL ON FUNCTION public.admin_adjust_reward_points(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_adjust_reward_points(uuid, integer, text) TO authenticated;

-- Saldo e vencimento de um cliente (página do cliente no Admin > Pontos).
CREATE OR REPLACE FUNCTION public.admin_reward_points_of(_user_id uuid)
RETURNS TABLE (balance integer, expiring integer, next_expiry timestamptz, full_name text, email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT coalesce(public.has_role(auth.uid(), 'admin'::app_role), false) THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
  END IF;
  PERFORM public.reward_points_settle(_user_id);
  RETURN QUERY SELECT public.reward_points_balance_raw(_user_id), x.points, x.next_expiry,
                      (SELECT p.full_name::text FROM public.user_profiles p WHERE p.user_id = _user_id),
                      (SELECT a.email::text FROM auth.users a WHERE a.id = _user_id)
                 FROM public.reward_points_expiring(_user_id, 30) x;
END $$;
REVOKE ALL ON FUNCTION public.admin_reward_points_of(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reward_points_of(uuid) TO authenticated;

-- Editar itens do pedido no Admin: o total desconta também os pontos usados (igual à migration 20261006190000).
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

  RETURN v_total;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_update_order_items(uuid, jsonb, numeric, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_order_items(uuid, jsonb, numeric, numeric, text) TO authenticated;
