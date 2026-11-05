
-- ============ TABELAS ============

CREATE TABLE public.product_rolls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id text NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  code text NOT NULL,
  internal_name text,
  description text,
  length_m numeric NOT NULL CHECK (length_m > 0),
  usable_width_cm numeric,
  cost_total numeric NOT NULL DEFAULT 0 CHECK (cost_total >= 0),
  started_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed','no_orders','manual')),
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_id, code)
);
CREATE UNIQUE INDEX product_rolls_one_active_per_product
  ON public.product_rolls(product_id) WHERE status = 'active';
CREATE INDEX product_rolls_product_idx ON public.product_rolls(product_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_rolls TO authenticated;
GRANT ALL ON public.product_rolls TO service_role;
ALTER TABLE public.product_rolls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage product_rolls" ON public.product_rolls
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_product_rolls_updated_at
  BEFORE UPDATE ON public.product_rolls
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.product_roll_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roll_id uuid NOT NULL REFERENCES public.product_rolls(id) ON DELETE CASCADE,
  description text NOT NULL,
  amount numeric NOT NULL CHECK (amount >= 0),
  expense_date date NOT NULL DEFAULT current_date,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX product_roll_expenses_roll_idx ON public.product_roll_expenses(roll_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_roll_expenses TO authenticated;
GRANT ALL ON public.product_roll_expenses TO service_role;
ALTER TABLE public.product_roll_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage roll_expenses" ON public.product_roll_expenses
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_roll_expenses_updated_at
  BEFORE UPDATE ON public.product_roll_expenses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.order_item_rolls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id uuid NOT NULL UNIQUE REFERENCES public.order_items(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id text REFERENCES public.products(id) ON DELETE SET NULL,
  roll_id uuid REFERENCES public.product_rolls(id) ON DELETE SET NULL,
  meters_charged numeric NOT NULL DEFAULT 0,
  meters_used numeric,
  net_amount numeric NOT NULL DEFAULT 0,
  vat_amount numeric NOT NULL DEFAULT 0,
  gross_amount numeric NOT NULL DEFAULT 0,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid,
  source text NOT NULL DEFAULT 'auto' CHECK (source IN ('auto','manual','backfill')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_item_rolls_roll_idx ON public.order_item_rolls(roll_id);
CREATE INDEX order_item_rolls_product_idx ON public.order_item_rolls(product_id);
CREATE INDEX order_item_rolls_order_idx ON public.order_item_rolls(order_id);
CREATE INDEX order_item_rolls_orphan_idx ON public.order_item_rolls(product_id) WHERE roll_id IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_item_rolls TO authenticated;
GRANT ALL ON public.order_item_rolls TO service_role;
ALTER TABLE public.order_item_rolls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage order_item_rolls" ON public.order_item_rolls
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_order_item_rolls_updated_at
  BEFORE UPDATE ON public.order_item_rolls
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.order_item_roll_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  from_roll_id uuid REFERENCES public.product_rolls(id) ON DELETE SET NULL,
  to_roll_id uuid REFERENCES public.product_rolls(id) ON DELETE SET NULL,
  changed_by uuid,
  reason text,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_item_roll_history_item_idx ON public.order_item_roll_history(order_item_id);

GRANT SELECT, INSERT ON public.order_item_roll_history TO authenticated;
GRANT ALL ON public.order_item_roll_history TO service_role;
ALTER TABLE public.order_item_roll_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view roll_history" ON public.order_item_roll_history
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins insert roll_history" ON public.order_item_roll_history
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- ============ FUNÇÕES ============

-- Sugere próximo código com base no produto (prefixo derivado do slug/name)
CREATE OR REPLACE FUNCTION public.suggest_roll_code(_product_id text)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prefix text;
  next_num int;
  base text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT COALESCE(slug, name, id) INTO base FROM public.products WHERE id = _product_id;
  IF base IS NULL THEN RAISE EXCEPTION 'produto não encontrado'; END IF;

  -- extract main word: last hyphen-separated token (e.g. "dtf-gold" -> "gold")
  base := regexp_replace(lower(base), '[^a-z0-9\-\s]', '', 'g');
  base := regexp_replace(base, '\s+', '-', 'g');
  prefix := split_part(base, '-', GREATEST(1, array_length(regexp_split_to_array(base, '-'), 1)));
  IF prefix IS NULL OR prefix = '' THEN prefix := 'ROLL'; END IF;
  prefix := upper(prefix);

  SELECT COALESCE(MAX(
    NULLIF(regexp_replace(code, '^' || prefix || '-?', ''), '')::int
  ), 0) + 1 INTO next_num
  FROM public.product_rolls
  WHERE product_id = _product_id
    AND code ~ ('^' || prefix || '-?\d+$');

  RETURN prefix || '-' || lpad(next_num::text, 3, '0');
END $$;

-- Calcula metros cobrados de um item
CREATE OR REPLACE FUNCTION public._roll_meters_for_item(_item public.order_items)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE m numeric;
BEGIN
  m := _item.length_m;
  IF m IS NOT NULL AND m > 0 THEN RETURN m; END IF;
  BEGIN
    m := (_item.design_data->>'meters')::numeric;
    IF m IS NOT NULL AND m > 0 THEN RETURN m; END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  BEGIN
    m := (_item.config->>'meters')::numeric;
    IF m IS NOT NULL AND m > 0 THEN RETURN m; END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN 0;
END $$;

-- Associa um item ao rolo activo do respectivo produto (idempotente)
CREATE OR REPLACE FUNCTION public.assign_item_to_active_roll(_order_item_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  it public.order_items%ROWTYPE;
  active_roll_id uuid;
  meters numeric;
  net numeric;
  vat numeric;
  gross numeric;
  vrate numeric;
BEGIN
  SELECT * INTO it FROM public.order_items WHERE id = _order_item_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  meters := public._roll_meters_for_item(it);
  gross := COALESCE(it.price,0) * COALESCE(it.quantity,1);
  vrate := COALESCE(it.vat_rate, (SELECT vat_rate FROM public.products WHERE id = it.product_id), 23);
  net := gross / (1 + vrate/100.0);
  vat := gross - net;

  SELECT id INTO active_roll_id
    FROM public.product_rolls
    WHERE product_id = it.product_id AND status = 'active'
    LIMIT 1;

  INSERT INTO public.order_item_rolls (
    order_item_id, order_id, product_id, roll_id,
    meters_charged, net_amount, vat_amount, gross_amount, source
  ) VALUES (
    it.id, it.order_id, it.product_id, active_roll_id,
    meters, net, vat, gross, 'auto'
  )
  ON CONFLICT (order_item_id) DO UPDATE
    SET roll_id = COALESCE(public.order_item_rolls.roll_id, EXCLUDED.roll_id),
        meters_charged = EXCLUDED.meters_charged,
        net_amount = EXCLUDED.net_amount,
        vat_amount = EXCLUDED.vat_amount,
        gross_amount = EXCLUDED.gross_amount;

  RETURN active_roll_id;
END $$;

-- Trigger: quando payment_status passa a 'paid', associar todos os itens
CREATE OR REPLACE FUNCTION public._orders_assign_rolls_on_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r record;
BEGIN
  IF NEW.payment_status = 'paid'
     AND COALESCE(OLD.payment_status,'') IS DISTINCT FROM 'paid' THEN
    FOR r IN SELECT id FROM public.order_items WHERE order_id = NEW.id LOOP
      PERFORM public.assign_item_to_active_roll(r.id);
    END LOOP;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_orders_assign_rolls_on_paid
  AFTER UPDATE OF payment_status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public._orders_assign_rolls_on_paid();

-- ============ RPCs ADMIN ============

-- Marcar pedido como pago / não pago SEM alterar o estado do pedido
CREATE OR REPLACE FUNCTION public.admin_set_payment_status(
  _order_id uuid, _payment_status text, _note text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE cur record;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF _payment_status NOT IN ('pending','paid','failed','refunded') THEN
    RAISE EXCEPTION 'payment_status inválido';
  END IF;

  SELECT id, status, payment_status INTO cur FROM public.orders WHERE id = _order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'pedido não encontrado'; END IF;

  PERFORM set_config('app.bypass_orders_lock', '1', true);
  UPDATE public.orders
     SET payment_status = _payment_status,
         paid_at = CASE WHEN _payment_status = 'paid' THEN COALESCE(paid_at, now()) ELSE paid_at END
   WHERE id = _order_id;
  PERFORM set_config('app.bypass_orders_lock', '', true);

  BEGIN
    INSERT INTO public.order_status_history (order_id, status, note, created_by)
    VALUES (_order_id, cur.status,
      'Pagamento marcado como ' || _payment_status ||
      CASE WHEN _note IS NOT NULL AND btrim(_note) <> '' THEN ' — ' || _note ELSE '' END,
      auth.uid());
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;
END $$;

-- Fechar rolo
CREATE OR REPLACE FUNCTION public.admin_close_roll(_roll_id uuid, _note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  UPDATE public.product_rolls
    SET status = 'closed', closed_at = COALESCE(closed_at, now()),
        notes = COALESCE(notes,'') || CASE WHEN _note IS NOT NULL THEN E'\n' || _note ELSE '' END
   WHERE id = _roll_id;
END $$;

-- Mover item para outro rolo (motivo obrigatório)
CREATE OR REPLACE FUNCTION public.admin_move_item_to_roll(
  _order_item_id uuid, _new_roll_id uuid, _reason text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE prev uuid; item_product text; new_product text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF _reason IS NULL OR btrim(_reason) = '' THEN RAISE EXCEPTION 'motivo obrigatório'; END IF;

  IF _new_roll_id IS NOT NULL THEN
    SELECT product_id INTO new_product FROM public.product_rolls WHERE id = _new_roll_id;
    SELECT product_id INTO item_product FROM public.order_items WHERE id = _order_item_id;
    IF new_product IS DISTINCT FROM item_product THEN
      RAISE EXCEPTION 'o rolo pertence a outro produto';
    END IF;
  END IF;

  SELECT roll_id INTO prev FROM public.order_item_rolls WHERE order_item_id = _order_item_id;
  IF NOT FOUND THEN
    PERFORM public.assign_item_to_active_roll(_order_item_id);
  END IF;

  UPDATE public.order_item_rolls
    SET roll_id = _new_roll_id, source = 'manual', assigned_by = auth.uid(), assigned_at = now()
   WHERE order_item_id = _order_item_id;

  INSERT INTO public.order_item_roll_history(order_item_id, from_roll_id, to_roll_id, changed_by, reason)
  VALUES (_order_item_id, prev, _new_roll_id, auth.uid(), _reason);
END $$;

-- Definir início de um rolo a partir de um pedido (reassocia itens do mesmo produto criados a partir de então)
CREATE OR REPLACE FUNCTION public.admin_set_roll_start_from_order(
  _roll_id uuid, _order_id uuid, _reason text
) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ord_date timestamptz; pid text; affected int := 0; r record;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF _reason IS NULL OR btrim(_reason)='' THEN RAISE EXCEPTION 'observação obrigatória'; END IF;

  SELECT product_id INTO pid FROM public.product_rolls WHERE id = _roll_id;
  SELECT created_at INTO ord_date FROM public.orders WHERE id = _order_id;
  IF pid IS NULL OR ord_date IS NULL THEN RAISE EXCEPTION 'rolo ou pedido inválido'; END IF;

  UPDATE public.product_rolls SET started_at = ord_date WHERE id = _roll_id;

  FOR r IN
    SELECT oi.id AS item_id, oir.roll_id AS current_roll
      FROM public.order_items oi
      JOIN public.orders o ON o.id = oi.order_id
      LEFT JOIN public.order_item_rolls oir ON oir.order_item_id = oi.id
     WHERE oi.product_id = pid
       AND o.created_at >= ord_date
       AND o.payment_status = 'paid'
  LOOP
    IF r.current_roll IS NULL THEN
      PERFORM public.assign_item_to_active_roll(r.item_id);
      UPDATE public.order_item_rolls SET roll_id = _roll_id, source='backfill',
        assigned_by = auth.uid(), assigned_at = now()
        WHERE order_item_id = r.item_id;
    ELSE
      UPDATE public.order_item_rolls SET roll_id = _roll_id, source='backfill',
        assigned_by = auth.uid(), assigned_at = now()
        WHERE order_item_id = r.item_id;
    END IF;
    INSERT INTO public.order_item_roll_history(order_item_id, from_roll_id, to_roll_id, changed_by, reason)
    VALUES (r.item_id, r.current_roll, _roll_id, auth.uid(), _reason);
    affected := affected + 1;
  END LOOP;

  RETURN affected;
END $$;

-- ============ VISTAS ============

CREATE OR REPLACE VIEW public.v_roll_financials AS
SELECT
  r.id AS roll_id,
  r.product_id,
  r.code,
  r.internal_name,
  r.status,
  r.started_at,
  r.closed_at,
  r.length_m,
  r.cost_total AS cost_initial,
  COALESCE(exp.total_extra, 0) AS extra_expenses,
  (r.cost_total + COALESCE(exp.total_extra, 0)) AS cost_total_considered,
  CASE WHEN r.length_m > 0 THEN (r.cost_total + COALESCE(exp.total_extra, 0)) / r.length_m ELSE 0 END AS cost_per_meter,
  COALESCE(agg.orders_count, 0) AS orders_count,
  COALESCE(agg.items_count, 0) AS items_count,
  COALESCE(agg.customers_count, 0) AS customers_count,
  COALESCE(agg.meters_charged, 0) AS meters_charged,
  COALESCE(agg.meters_used, 0) AS meters_used,
  GREATEST(r.length_m - COALESCE(agg.meters_charged, 0), 0) AS meters_remaining,
  CASE WHEN r.length_m > 0 THEN LEAST(COALESCE(agg.meters_charged,0) / r.length_m * 100, 100) ELSE 0 END AS percent_used,
  COALESCE(agg.net_total, 0) AS net_total,
  COALESCE(agg.vat_total, 0) AS vat_total,
  COALESCE(agg.gross_total, 0) AS gross_total,
  (COALESCE(agg.meters_charged, 0) *
    CASE WHEN r.length_m > 0 THEN (r.cost_total + COALESCE(exp.total_extra, 0)) / r.length_m ELSE 0 END
  ) AS cost_proportional,
  (COALESCE(agg.net_total,0) - COALESCE(agg.meters_charged, 0) *
    CASE WHEN r.length_m > 0 THEN (r.cost_total + COALESCE(exp.total_extra, 0)) / r.length_m ELSE 0 END
  ) AS profit_estimated,
  CASE WHEN COALESCE(agg.net_total,0) > 0 THEN
    (COALESCE(agg.net_total,0) - COALESCE(agg.meters_charged, 0) *
      CASE WHEN r.length_m > 0 THEN (r.cost_total + COALESCE(exp.total_extra, 0)) / r.length_m ELSE 0 END
    ) / agg.net_total * 100
  ELSE 0 END AS margin_pct
FROM public.product_rolls r
LEFT JOIN (
  SELECT roll_id, SUM(amount) AS total_extra
  FROM public.product_roll_expenses GROUP BY roll_id
) exp ON exp.roll_id = r.id
LEFT JOIN (
  SELECT oir.roll_id,
         COUNT(DISTINCT oir.order_id) AS orders_count,
         COUNT(*) AS items_count,
         COUNT(DISTINCT COALESCE(o.user_id::text, o.guest_email)) AS customers_count,
         SUM(oir.meters_charged) AS meters_charged,
         SUM(COALESCE(oir.meters_used, oir.meters_charged)) AS meters_used,
         SUM(oir.net_amount) AS net_total,
         SUM(oir.vat_amount) AS vat_total,
         SUM(oir.gross_amount) AS gross_total
  FROM public.order_item_rolls oir
  JOIN public.orders o ON o.id = oir.order_id
  WHERE oir.roll_id IS NOT NULL
    AND o.payment_status = 'paid'
    AND o.status NOT IN ('cancelled','refunded')
  GROUP BY oir.roll_id
) agg ON agg.roll_id = r.id;

GRANT SELECT ON public.v_roll_financials TO authenticated;

CREATE OR REPLACE VIEW public.v_product_roll_summary AS
SELECT
  p.id AS product_id,
  p.name AS product_name,
  COUNT(r.id) AS rolls_count,
  COUNT(*) FILTER (WHERE r.status='active') AS active_rolls,
  COUNT(*) FILTER (WHERE r.status='closed') AS closed_rolls,
  COUNT(*) FILTER (WHERE r.status='no_orders') AS empty_rolls,
  COALESCE(SUM(f.net_total),0) AS net_total,
  COALESCE(SUM(f.vat_total),0) AS vat_total,
  COALESCE(SUM(f.gross_total),0) AS gross_total,
  COALESCE(SUM(f.cost_total_considered),0) AS cost_total,
  COALESCE(SUM(f.extra_expenses),0) AS extra_expenses,
  COALESCE(SUM(f.profit_estimated),0) AS profit_total,
  CASE WHEN SUM(f.net_total) > 0 THEN SUM(f.profit_estimated)/SUM(f.net_total)*100 ELSE 0 END AS avg_margin
FROM public.products p
LEFT JOIN public.product_rolls r ON r.product_id = p.id
LEFT JOIN public.v_roll_financials f ON f.roll_id = r.id
GROUP BY p.id, p.name;

GRANT SELECT ON public.v_product_roll_summary TO authenticated;
