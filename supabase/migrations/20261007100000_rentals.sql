-- =============================================================================================
-- Aluguel (recurso rentals, desligado por padrão; Admin > Vendas > Aluguéis)
--   product_rentals        produto para alugar: preço do produto = preço por período (dia, semana, mês), mínimo e
--                          máximo de períodos, unidades para alugar e caução (paga na entrega, fora da loja)
--   rental_bookings        reservas: datas, quantidade, estado (reservado, com o cliente, devolvido, cancelado)
--   rental_free_units      unidades livres num período (público, só números; usa os dias livres entre reservas)
--   order_items_rental     trigger: a linha do pedido com design_data.rental confere as unidades livres (com bloqueio
--                          por produto) e cria a reserva; sem unidades, o pedido inteiro é recusado
--   orders_rental_cancel   trigger: pedido cancelado ou reembolsado cancela as reservas
--   admin_rental_update    Admin: estado, datas e notas da reserva
--   _adjust_order_item_stock  passa a ignorar as linhas de aluguel (não mexem no estoque)
-- O preço (preço por período x períodos) e as datas são conferidos no servidor em _shared/pricing.ts com
-- _shared/rentals.ts. Regras da loja em store_settings.rentals (lead_days, buffer_days, max_days_ahead).
-- =============================================================================================

CREATE TABLE IF NOT EXISTS public.product_rentals (
  product_id text PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  unit text NOT NULL DEFAULT 'day' CHECK (unit IN ('day', 'week', 'month')),
  min_periods integer NOT NULL DEFAULT 1 CHECK (min_periods BETWEEN 1 AND 365),
  max_periods integer CHECK (max_periods IS NULL OR max_periods BETWEEN 1 AND 730),
  units integer NOT NULL DEFAULT 1 CHECK (units BETWEEN 1 AND 10000),
  deposit numeric(12,2) NOT NULL DEFAULT 0 CHECK (deposit >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (max_periods IS NULL OR max_periods >= min_periods)
);

ALTER TABLE public.product_rentals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public reads active rentals" ON public.product_rentals;
CREATE POLICY "Public reads active rentals" ON public.product_rentals FOR SELECT USING (is_active);
DROP POLICY IF EXISTS "Admins manage rentals" ON public.product_rentals;
CREATE POLICY "Admins manage rentals" ON public.product_rentals FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
GRANT SELECT ON public.product_rentals TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_rentals TO authenticated;
GRANT ALL ON public.product_rentals TO service_role;

CREATE TABLE IF NOT EXISTS public.rental_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  order_item_id uuid REFERENCES public.order_items(id) ON DELETE SET NULL,
  product_id text REFERENCES public.products(id) ON DELETE SET NULL,
  user_id uuid,
  start_date date NOT NULL,
  end_date date NOT NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'out', 'returned', 'cancelled')),
  deposit numeric(12,2) NOT NULL DEFAULT 0,
  picked_up_at timestamptz,
  returned_at timestamptz,
  notes text CHECK (notes IS NULL OR length(notes) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS rental_bookings_product_dates_idx ON public.rental_bookings (product_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS rental_bookings_order_idx ON public.rental_bookings (order_id);
CREATE INDEX IF NOT EXISTS rental_bookings_user_idx ON public.rental_bookings (user_id);

ALTER TABLE public.rental_bookings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Own or admin reads bookings" ON public.rental_bookings;
CREATE POLICY "Own or admin reads bookings" ON public.rental_bookings FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));
REVOKE ALL ON public.rental_bookings FROM anon;
GRANT SELECT ON public.rental_bookings TO authenticated;
GRANT ALL ON public.rental_bookings TO service_role;

-- Registo de atividade do Admin.
DO $$
BEGIN
  IF to_regprocedure('public.admin_activity_capture()') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS zz_admin_activity ON public.product_rentals;
    CREATE TRIGGER zz_admin_activity AFTER INSERT OR UPDATE OR DELETE ON public.product_rentals
      FOR EACH ROW EXECUTE FUNCTION public.admin_activity_capture();
    DROP TRIGGER IF EXISTS zz_admin_activity ON public.rental_bookings;
    CREATE TRIGGER zz_admin_activity AFTER INSERT OR UPDATE OR DELETE ON public.rental_bookings
      FOR EACH ROW EXECUTE FUNCTION public.admin_activity_capture();
  END IF;
END $$;

-- ---------------------------------------------------------------------------------------------
-- Regras da loja (iguais a normalizeRentalSettings em src/lib/rentals.ts)
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rental_settings()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'lead_days', LEAST(365, GREATEST(0, COALESCE(floor((s.value ->> 'lead_days')::numeric)::int, 1))),
    'buffer_days', LEAST(30, GREATEST(0, COALESCE(floor((s.value ->> 'buffer_days')::numeric)::int, 0))),
    'max_days_ahead', LEAST(730, GREATEST(7, COALESCE(floor((s.value ->> 'max_days_ahead')::numeric)::int, 180))))
  FROM (SELECT (SELECT value FROM public.store_settings WHERE key = 'rentals') AS value) s;
$$;

-- ---------------------------------------------------------------------------------------------
-- Unidades livres de um produto entre duas datas (o pior dia manda; igual a freeUnits em src/lib/rentals.ts).
-- _exclude: reserva a ignorar (quando o Admin muda as datas de uma reserva).
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rental_free_units(_product_id text, _start date, _end date, _exclude uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  total integer;
  buf integer := (public.rental_settings() ->> 'buffer_days')::int;
  worst integer;
BEGIN
  IF _start IS NULL OR _end IS NULL OR _end < _start OR _end - _start > 730 THEN RETURN 0; END IF;
  SELECT units INTO total FROM public.product_rentals WHERE product_id = _product_id AND is_active;
  IF NOT FOUND THEN RETURN 0; END IF;
  SELECT COALESCE(max(used), 0) INTO worst FROM (
    SELECT d, (SELECT COALESCE(sum(b.quantity), 0) FROM public.rental_bookings b
                WHERE b.product_id = _product_id AND b.status IN ('reserved', 'out')
                  AND (_exclude IS NULL OR b.id <> _exclude)
                  AND b.start_date - buf <= d AND d <= b.end_date + buf) AS used
      FROM generate_series(_start, _end, interval '1 day') AS g(d)
  ) x;
  RETURN GREATEST(0, total - worst);
END;
$function$;
REVOKE ALL ON FUNCTION public.rental_free_units(text, date, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rental_free_units(text, date, date, uuid) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- Linha do pedido com design_data.rental: confere as unidades livres e cria a reserva
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.order_items_rental()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r jsonb := NEW.design_data -> 'rental';
  cfg record;
  o record;
  d_start date;
  d_end date;
BEGIN
  IF jsonb_typeof(r) <> 'object' OR NOT public.feature_enabled('rentals', false) THEN RETURN NULL; END IF;
  SELECT * INTO cfg FROM public.product_rentals WHERE product_id = NEW.product_id AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Aluguel: este produto não está disponível para alugar.'; END IF;
  BEGIN
    d_start := (r ->> 'start')::date;
    d_end := (r ->> 'end')::date;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'Aluguel: datas inválidas.';
  END;
  IF d_start IS NULL OR d_end IS NULL OR d_end < d_start THEN RAISE EXCEPTION 'Aluguel: datas inválidas.'; END IF;
  -- Um pedido de cada vez por produto, para duas pessoas não ficarem com a última unidade.
  PERFORM pg_advisory_xact_lock(hashtext('rental:' || NEW.product_id));
  IF public.rental_free_units(NEW.product_id, d_start, d_end) < NEW.quantity THEN
    RAISE EXCEPTION 'Aluguel: não há unidades livres nessas datas. Escolha outras datas.';
  END IF;
  SELECT user_id INTO o FROM public.orders WHERE id = NEW.order_id;
  INSERT INTO public.rental_bookings (order_id, order_item_id, product_id, user_id, start_date, end_date, quantity, deposit)
  VALUES (NEW.order_id, NEW.id, NEW.product_id, o.user_id, d_start, d_end, NEW.quantity, cfg.deposit * NEW.quantity);
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.order_items_rental() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS order_items_rental ON public.order_items;
CREATE TRIGGER order_items_rental AFTER INSERT ON public.order_items
  FOR EACH ROW WHEN (NEW.design_data ? 'rental') EXECUTE FUNCTION public.order_items_rental();

-- Linha de aluguel apagada (edição de itens no Admin): a reserva é cancelada.
CREATE OR REPLACE FUNCTION public.order_items_rental_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.rental_bookings SET status = 'cancelled', updated_at = now()
   WHERE order_item_id = OLD.id AND status IN ('reserved', 'out');
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.order_items_rental_delete() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS order_items_rental_delete ON public.order_items;
CREATE TRIGGER order_items_rental_delete BEFORE DELETE ON public.order_items
  FOR EACH ROW WHEN (OLD.design_data ? 'rental') EXECUTE FUNCTION public.order_items_rental_delete();

-- ---------------------------------------------------------------------------------------------
-- Pedido cancelado ou reembolsado: as reservas ainda em aberto são canceladas
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.orders_rental_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IN ('cancelled', 'refunded') AND OLD.status NOT IN ('cancelled', 'refunded') THEN
    UPDATE public.rental_bookings SET status = 'cancelled', updated_at = now()
     WHERE order_id = NEW.id AND status IN ('reserved', 'out');
  END IF;
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.orders_rental_cancel() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS orders_rental_cancel ON public.orders;
CREATE TRIGGER orders_rental_cancel AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_rental_cancel();

-- ---------------------------------------------------------------------------------------------
-- Admin: estado, datas e notas. Erros estáveis: not_allowed, not_found, invalid_status, invalid_dates, unavailable.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_rental_update(_id uuid, _status text, _start date, _end date, _notes text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  b record;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'not_allowed'; END IF;
  IF _status NOT IN ('reserved', 'out', 'returned', 'cancelled') THEN RAISE EXCEPTION 'invalid_status'; END IF;
  SELECT * INTO b FROM public.rental_bookings WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  _start := COALESCE(_start, b.start_date);
  _end := COALESCE(_end, b.end_date);
  IF _end < _start OR _end - _start > 730 THEN RAISE EXCEPTION 'invalid_dates'; END IF;
  IF _status IN ('reserved', 'out') AND b.product_id IS NOT NULL
     AND (_start <> b.start_date OR _end <> b.end_date OR b.status NOT IN ('reserved', 'out')) THEN
    PERFORM pg_advisory_xact_lock(hashtext('rental:' || b.product_id));
    IF EXISTS (SELECT 1 FROM public.product_rentals WHERE product_id = b.product_id)
       AND public.rental_free_units(b.product_id, _start, _end, _id) < b.quantity THEN
      RAISE EXCEPTION 'unavailable';
    END IF;
  END IF;
  UPDATE public.rental_bookings SET
    status = _status,
    start_date = _start,
    end_date = _end,
    notes = CASE WHEN _notes IS NULL THEN notes ELSE NULLIF(left(trim(_notes), 2000), '') END,
    picked_up_at = CASE WHEN _status IN ('out', 'returned') THEN COALESCE(picked_up_at, now()) ELSE picked_up_at END,
    returned_at = CASE WHEN _status = 'returned' THEN COALESCE(returned_at, now()) WHEN _status IN ('reserved', 'out') THEN NULL ELSE returned_at END,
    updated_at = now()
  WHERE id = _id;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_rental_update(uuid, text, date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_rental_update(uuid, text, date, date, text) TO authenticated;

-- ---------------------------------------------------------------------------------------------
-- Estoque: as linhas de aluguel não mexem no estoque (cópia de 20261006220000_product_variants.sql + 1 linha)
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
