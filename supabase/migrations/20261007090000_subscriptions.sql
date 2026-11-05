-- =============================================================================================
-- Assinaturas (recurso subscriptions em Admin > Recursos da loja, desligado por padrão).
--   product_subscription_plans   planos por produto: a cada N semanas ou meses, desconto, mínimo de ciclos
--   subscriptions                assinatura do cliente (produto, quantidade, cor e tamanho, plano copiado, próxima data)
--   subscription_orders          pedidos de cada assinatura (ciclo, data prevista antes do pedido, para desfazer)
--   order_items_subscription     trigger: a linha do pedido com design_data.subscription cria ou renova a assinatura
--   orders_subscription_cancel   trigger: pedido cancelado ou reembolsado desfaz o ciclo (ou cancela a assinatura nova)
--   my_subscription_action       cliente: pausar, retomar, pular um ciclo, cancelar (conforme as regras da loja)
--   admin_subscription_update    Admin: estado, próxima data, quantidade, motivo
-- O desconto do preço é conferido no servidor em _shared/pricing.ts (priceItems) com _shared/subscriptions.ts.
-- Cobrança: cada renovação é um pedido que o cliente faz pela conta e paga como qualquer pedido.
-- =============================================================================================

CREATE TABLE IF NOT EXISTS public.product_subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id text NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  interval_unit text NOT NULL DEFAULT 'month' CHECK (interval_unit IN ('week', 'month')),
  interval_count integer NOT NULL DEFAULT 1 CHECK (interval_count BETWEEN 1 AND 52),
  discount_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (discount_percent BETWEEN 0 AND 90),
  min_cycles integer NOT NULL DEFAULT 0 CHECK (min_cycles BETWEEN 0 AND 60),
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS product_subscription_plans_product_idx ON public.product_subscription_plans (product_id);

ALTER TABLE public.product_subscription_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public reads active plans" ON public.product_subscription_plans;
CREATE POLICY "Public reads active plans" ON public.product_subscription_plans FOR SELECT
  USING (is_active);
DROP POLICY IF EXISTS "Admins manage plans" ON public.product_subscription_plans;
CREATE POLICY "Admins manage plans" ON public.product_subscription_plans FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
GRANT SELECT ON public.product_subscription_plans TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_subscription_plans TO authenticated;
GRANT ALL ON public.product_subscription_plans TO service_role;

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id text REFERENCES public.products(id) ON DELETE SET NULL,
  plan_id uuid REFERENCES public.product_subscription_plans(id) ON DELETE SET NULL,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 100000),
  options jsonb NOT NULL DEFAULT '{}'::jsonb,
  interval_unit text NOT NULL CHECK (interval_unit IN ('week', 'month')),
  interval_count integer NOT NULL CHECK (interval_count BETWEEN 1 AND 52),
  discount_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (discount_percent BETWEEN 0 AND 90),
  min_cycles integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled')),
  next_date date,
  cycles_done integer NOT NULL DEFAULT 0 CHECK (cycles_done >= 0),
  origin_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  last_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  cancelled_at timestamptz,
  cancel_reason text CHECK (cancel_reason IS NULL OR length(cancel_reason) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subscriptions_user_idx ON public.subscriptions (user_id);
CREATE INDEX IF NOT EXISTS subscriptions_next_idx ON public.subscriptions (status, next_date);

CREATE TABLE IF NOT EXISTS public.subscription_orders (
  subscription_id uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  cycle integer NOT NULL,
  prev_next_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (subscription_id, order_id)
);
CREATE INDEX IF NOT EXISTS subscription_orders_order_idx ON public.subscription_orders (order_id);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Own or admin reads subscriptions" ON public.subscriptions;
CREATE POLICY "Own or admin reads subscriptions" ON public.subscriptions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Own or admin reads subscription orders" ON public.subscription_orders;
CREATE POLICY "Own or admin reads subscription orders" ON public.subscription_orders FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.id = subscription_id AND s.user_id = auth.uid()));
REVOKE ALL ON public.subscriptions, public.subscription_orders FROM anon;
GRANT SELECT ON public.subscriptions, public.subscription_orders TO authenticated;
GRANT ALL ON public.subscriptions, public.subscription_orders TO service_role;

-- Registo de atividade do Admin (planos e assinaturas alteradas no Admin).
DO $$
BEGIN
  IF to_regprocedure('public.admin_activity_capture()') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS zz_admin_activity ON public.product_subscription_plans;
    CREATE TRIGGER zz_admin_activity AFTER INSERT OR UPDATE OR DELETE ON public.product_subscription_plans
      FOR EACH ROW EXECUTE FUNCTION public.admin_activity_capture();
    DROP TRIGGER IF EXISTS zz_admin_activity ON public.subscriptions;
    CREATE TRIGGER zz_admin_activity AFTER INSERT OR UPDATE OR DELETE ON public.subscriptions
      FOR EACH ROW EXECUTE FUNCTION public.admin_activity_capture();
  END IF;
END $$;

-- ---------------------------------------------------------------------------------------------
-- Datas (igual a addInterval em src/lib/subscriptions.ts: o mês mantém o dia ou fica no último dia)
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.subscription_add_interval(_d date, _unit text, _count integer)
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN _unit = 'week' THEN _d + 7 * _count
              ELSE (_d + make_interval(months => _count))::date END;
$$;

CREATE OR REPLACE FUNCTION public.subscription_settings()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'customer_pause', COALESCE((s.value ->> 'customer_pause')::boolean, true),
    'customer_cancel', COALESCE((s.value ->> 'customer_cancel')::boolean, true),
    'renew_days_before', LEAST(30, GREATEST(0, COALESCE(floor((s.value ->> 'renew_days_before')::numeric)::int, 3))))
  FROM (SELECT (SELECT value FROM public.store_settings WHERE key = 'subscriptions') AS value) s;
$$;

-- ---------------------------------------------------------------------------------------------
-- Linha do pedido com design_data.subscription: cria a assinatura (plan_id) ou renova (subscription_id)
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.order_items_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  o record;
  p record;
  s record;
  sub jsonb := NEW.design_data -> 'subscription';
  new_id uuid;
BEGIN
  IF jsonb_typeof(sub) <> 'object' OR NOT public.feature_enabled('subscriptions', false) THEN RETURN NULL; END IF;
  SELECT id, user_id INTO o FROM public.orders WHERE id = NEW.order_id;
  IF o.user_id IS NULL THEN RETURN NULL; END IF;

  IF sub ? 'subscription_id' THEN
    SELECT * INTO s FROM public.subscriptions
     WHERE id = NULLIF(sub ->> 'subscription_id', '')::uuid AND user_id = o.user_id AND status <> 'cancelled'
       AND product_id = NEW.product_id
     FOR UPDATE;
    IF NOT FOUND THEN RETURN NULL; END IF;
    IF EXISTS (SELECT 1 FROM public.subscription_orders WHERE subscription_id = s.id AND order_id = NEW.order_id) THEN RETURN NULL; END IF;
    INSERT INTO public.subscription_orders (subscription_id, order_id, cycle, prev_next_date)
    VALUES (s.id, NEW.order_id, s.cycles_done + 1, s.next_date);
    UPDATE public.subscriptions SET
      cycles_done = cycles_done + 1,
      next_date = public.subscription_add_interval(GREATEST(COALESCE(next_date, current_date), current_date), interval_unit, interval_count),
      status = 'active',
      last_order_id = NEW.order_id,
      updated_at = now()
    WHERE id = s.id;
  ELSIF sub ? 'plan_id' THEN
    SELECT * INTO p FROM public.product_subscription_plans
     WHERE id = NULLIF(sub ->> 'plan_id', '')::uuid AND is_active AND product_id = NEW.product_id;
    IF NOT FOUND THEN RETURN NULL; END IF;
    INSERT INTO public.subscriptions (user_id, product_id, plan_id, quantity, options, interval_unit, interval_count,
                                      discount_percent, min_cycles, status, next_date, cycles_done, origin_order_id, last_order_id)
    VALUES (o.user_id, NEW.product_id, p.id, NEW.quantity,
            jsonb_strip_nulls(jsonb_build_object('variation', NEW.design_data ->> 'variation', 'size', NEW.design_data ->> 'size')),
            p.interval_unit, p.interval_count, p.discount_percent, p.min_cycles, 'active',
            public.subscription_add_interval(current_date, p.interval_unit, p.interval_count), 1, NEW.order_id, NEW.order_id)
    RETURNING id INTO new_id;
    INSERT INTO public.subscription_orders (subscription_id, order_id, cycle, prev_next_date) VALUES (new_id, NEW.order_id, 1, NULL);
  END IF;
  RETURN NULL;
EXCEPTION WHEN invalid_text_representation THEN
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.order_items_subscription() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS order_items_subscription ON public.order_items;
CREATE TRIGGER order_items_subscription AFTER INSERT ON public.order_items
  FOR EACH ROW WHEN (NEW.design_data ? 'subscription') EXECUTE FUNCTION public.order_items_subscription();

-- ---------------------------------------------------------------------------------------------
-- Pedido cancelado ou reembolsado: a assinatura nova é cancelada; a renovação volta atrás (ciclo e próxima data)
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.orders_subscription_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r record;
BEGIN
  IF NEW.status NOT IN ('cancelled', 'refunded') OR OLD.status IN ('cancelled', 'refunded') THEN RETURN NULL; END IF;
  FOR r IN SELECT so.*, s.origin_order_id, s.last_order_id FROM public.subscription_orders so
           JOIN public.subscriptions s ON s.id = so.subscription_id WHERE so.order_id = NEW.id LOOP
    IF r.cycle = 1 AND r.origin_order_id = NEW.id THEN
      UPDATE public.subscriptions SET status = 'cancelled', cancelled_at = now(), cancel_reason = 'order_cancelled', updated_at = now()
       WHERE id = r.subscription_id AND status <> 'cancelled';
    ELSE
      UPDATE public.subscriptions SET
        cycles_done = GREATEST(cycles_done - 1, 0),
        next_date = COALESCE(r.prev_next_date, next_date),
        last_order_id = CASE WHEN last_order_id = NEW.id THEN NULL ELSE last_order_id END,
        updated_at = now()
       WHERE id = r.subscription_id;
    END IF;
    DELETE FROM public.subscription_orders WHERE subscription_id = r.subscription_id AND order_id = NEW.id;
  END LOOP;
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.orders_subscription_cancel() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS orders_subscription_cancel ON public.orders;
CREATE TRIGGER orders_subscription_cancel AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_subscription_cancel();

-- ---------------------------------------------------------------------------------------------
-- Cliente: pause / resume / skip / cancel. Erros estáveis: not_found, feature_off, not_allowed, min_cycles, invalid_action.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.my_subscription_action(_id uuid, _action text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  s record;
  cfg jsonb := public.subscription_settings();
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.feature_enabled('subscriptions', false) THEN RAISE EXCEPTION 'feature_off'; END IF;
  SELECT * INTO s FROM public.subscriptions WHERE id = _id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND OR s.status = 'cancelled' THEN RAISE EXCEPTION 'not_found'; END IF;

  IF _action IN ('pause', 'resume', 'skip') AND NOT (cfg ->> 'customer_pause')::boolean THEN RAISE EXCEPTION 'not_allowed'; END IF;
  IF _action = 'pause' THEN
    UPDATE public.subscriptions SET status = 'paused', updated_at = now() WHERE id = _id;
  ELSIF _action = 'resume' THEN
    UPDATE public.subscriptions SET status = 'active',
      next_date = CASE WHEN next_date < current_date THEN current_date ELSE next_date END, updated_at = now() WHERE id = _id;
  ELSIF _action = 'skip' THEN
    UPDATE public.subscriptions SET
      next_date = public.subscription_add_interval(GREATEST(COALESCE(next_date, current_date), current_date), interval_unit, interval_count),
      updated_at = now() WHERE id = _id;
  ELSIF _action = 'cancel' THEN
    IF NOT (cfg ->> 'customer_cancel')::boolean THEN RAISE EXCEPTION 'not_allowed'; END IF;
    IF s.cycles_done < s.min_cycles THEN RAISE EXCEPTION 'min_cycles'; END IF;
    UPDATE public.subscriptions SET status = 'cancelled', cancelled_at = now(), cancel_reason = 'customer', updated_at = now() WHERE id = _id;
  ELSE
    RAISE EXCEPTION 'invalid_action';
  END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public.my_subscription_action(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_subscription_action(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------------------------
-- Admin: estado, próxima data, quantidade e motivo do cancelamento.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_subscription_update(_id uuid, _status text, _next_date date, _quantity integer, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  s record;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'not_allowed'; END IF;
  IF _status NOT IN ('active', 'paused', 'cancelled') THEN RAISE EXCEPTION 'invalid_action'; END IF;
  IF _quantity IS NULL OR _quantity < 1 OR _quantity > 100000 THEN RAISE EXCEPTION 'invalid_quantity'; END IF;
  SELECT * INTO s FROM public.subscriptions WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  UPDATE public.subscriptions SET
    status = _status,
    next_date = COALESCE(_next_date, next_date),
    quantity = _quantity,
    cancelled_at = CASE WHEN _status = 'cancelled' THEN COALESCE(cancelled_at, now()) END,
    cancel_reason = CASE WHEN _status = 'cancelled' THEN COALESCE(NULLIF(trim(_reason), ''), cancel_reason, 'admin') END,
    updated_at = now()
  WHERE id = _id;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_subscription_update(uuid, text, date, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_subscription_update(uuid, text, date, integer, text) TO authenticated;
