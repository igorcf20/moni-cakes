-- =============================================================================================
-- Entradas e conferência de estoque (recurso barcode_stock, Admin > Estoque > Entradas e conferência).
-- Várias peças de uma vez, lidas pelo leitor de código de barras ou escolhidas à mão, gravadas numa transação:
--  1) stock_entries        cabeçalho de cada entrada: tipo (entrada de mercadoria, contagem, perda, outro),
--                          fornecedor, documento (nota fiscal, fatura), nota, linhas e unidades. Só leitura do Admin.
--  2) stock_movements.entry_id   cada movimento da entrada aponta para ela (Histórico de estoque).
--  3) stock_movements_log  igual ao de 20261007030000_stock_history.sql + entry_id vindo de loja3d.stock_ctx.
--  4) _admin_stock_apply   muda o estoque de um alvo (produto, cor, tamanho, cor x tamanho); usado por
--                          admin_adjust_stock (mesmo comportamento de antes) e por admin_stock_entry.
--  5) admin_stock_entry, admin_stock_entries, admin_stock_entry_lines (só admin).
--  6) admin_stock_movements devolve também a entrada (id e número) de cada movimento.
-- Erros estáveis: forbidden, invalid_kind, no_lines, too_many_lines, not_found, invalid_value.
-- =============================================================================================

CREATE TABLE IF NOT EXISTS public.stock_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number bigserial UNIQUE,
  kind text NOT NULL,
  supplier text,
  document_ref text,
  note text,
  lines integer NOT NULL DEFAULT 0,
  units_in integer NOT NULL DEFAULT 0,
  units_out integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stock_entries_kind CHECK (kind IN ('receive', 'count', 'damage', 'other')),
  CONSTRAINT stock_entries_supplier_len CHECK (supplier IS NULL OR char_length(supplier) <= 120),
  CONSTRAINT stock_entries_document_len CHECK (document_ref IS NULL OR char_length(document_ref) <= 80),
  CONSTRAINT stock_entries_note_len CHECK (note IS NULL OR char_length(note) <= 500)
);
CREATE INDEX IF NOT EXISTS stock_entries_recent_idx ON public.stock_entries (created_at DESC);

COMMENT ON TABLE public.stock_entries IS 'Entradas e conferências de estoque (Admin > Entradas e conferência). Escrita só por admin_stock_entry.';

ALTER TABLE public.stock_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read stock entries" ON public.stock_entries;
CREATE POLICY "Admins read stock entries" ON public.stock_entries
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
REVOKE ALL ON public.stock_entries FROM anon, authenticated;
GRANT SELECT ON public.stock_entries TO authenticated;
GRANT ALL ON public.stock_entries TO service_role;

ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS entry_id uuid REFERENCES public.stock_entries(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS stock_movements_entry_idx ON public.stock_movements (entry_id) WHERE entry_id IS NOT NULL;

-- ---------------------------------------------------------------------------------------------
-- Registo: mesmo corpo de 20261007030000_stock_history.sql, com entry_id do contexto.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.stock_movements_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  n jsonb := to_jsonb(NEW);
  ctx jsonb;
  raw text := COALESCE(current_setting('loja3d.stock_ctx', true), '');
  v_reason text;
  v_order uuid;
  v_entry uuid;
  v_note text;
  v_product text;
  v_variation uuid;
  v_size uuid;
BEGIN
  IF OLD.stock_quantity IS NOT DISTINCT FROM NEW.stock_quantity THEN RETURN NEW; END IF;

  IF raw <> '' THEN
    BEGIN
      ctx := raw::jsonb;
    EXCEPTION WHEN others THEN ctx := NULL;
    END;
  END IF;
  v_reason := ctx ->> 'reason';
  IF v_reason IS NULL OR v_reason NOT IN ('sale', 'order_restock', 'order_edit', 'receive', 'count', 'damage', 'other') THEN
    v_reason := CASE WHEN auth.uid() IS NOT NULL AND COALESCE(public.has_role(auth.uid(), 'admin'::app_role), false) THEN 'admin' ELSE 'system' END;
  END IF;
  BEGIN
    v_order := NULLIF(ctx ->> 'order_id', '')::uuid;
  EXCEPTION WHEN others THEN v_order := NULL;
  END;
  BEGIN
    v_entry := NULLIF(ctx ->> 'entry_id', '')::uuid;
  EXCEPTION WHEN others THEN v_entry := NULL;
  END;
  IF v_entry IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.stock_entries WHERE id = v_entry) THEN v_entry := NULL; END IF;
  v_note := left(NULLIF(btrim(COALESCE(ctx ->> 'note', '')), ''), 500);

  IF TG_TABLE_NAME = 'products' THEN
    v_product := n ->> 'id';
  ELSIF TG_TABLE_NAME = 'product_sizes' THEN
    v_product := n ->> 'product_id'; v_size := (n ->> 'id')::uuid;
  ELSIF TG_TABLE_NAME = 'product_variations' THEN
    v_product := n ->> 'product_id'; v_variation := (n ->> 'id')::uuid;
  ELSE
    v_variation := (n ->> 'variation_id')::uuid; v_size := (n ->> 'product_size_id')::uuid;
    SELECT product_id INTO v_product FROM public.product_variations WHERE id = v_variation;
  END IF;
  IF v_product IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.stock_movements (product_id, variation_id, size_id, sku, quantity_before, quantity_after, change, reason, order_id, actor, note, entry_id)
  VALUES (v_product, v_variation, v_size, NULLIF(n ->> 'sku', ''), OLD.stock_quantity, NEW.stock_quantity,
          COALESCE(NEW.stock_quantity, 0) - COALESCE(OLD.stock_quantity, 0), v_reason, v_order, auth.uid(), v_note, v_entry);
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.stock_movements_log() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Muda o estoque de um alvo. _mode 'set' (novo valor) ou 'add' (soma, com sinal). Devolve antes e depois.
-- Sem verificação de admin nem contexto: quem chama faz as duas coisas.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._admin_stock_apply(
  _product_id text, _variation_id uuid, _size_id uuid, _mode text, _value integer, OUT before_qty integer, OUT after_qty integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF _value IS NULL OR _mode NOT IN ('set', 'add') OR (_mode = 'set' AND _value < 0) OR (_mode = 'add' AND _value = 0) OR abs(_value) > 1000000 THEN
    RAISE EXCEPTION 'invalid_value' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = _product_id) THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF _variation_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.product_variations WHERE id = _variation_id AND product_id = _product_id) THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;
  IF _size_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.product_sizes WHERE id = _size_id AND product_id = _product_id) THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Estoque atual do alvo (combinação sem linha na matriz = estoque do tamanho, como a loja mostra).
  IF _variation_id IS NOT NULL AND _size_id IS NOT NULL THEN
    SELECT stock_quantity INTO before_qty FROM public.product_variation_size_availability
     WHERE variation_id = _variation_id AND product_size_id = _size_id FOR UPDATE;
    IF NOT FOUND THEN
      SELECT stock_quantity INTO before_qty FROM public.product_sizes WHERE id = _size_id;
      INSERT INTO public.product_variation_size_availability (variation_id, product_size_id, is_available, stock_quantity)
      VALUES (_variation_id, _size_id, true, COALESCE(before_qty, 0));
    END IF;
  ELSIF _size_id IS NOT NULL THEN
    SELECT stock_quantity INTO before_qty FROM public.product_sizes WHERE id = _size_id FOR UPDATE;
  ELSIF _variation_id IS NOT NULL THEN
    SELECT stock_quantity INTO before_qty FROM public.product_variations WHERE id = _variation_id FOR UPDATE;
  ELSE
    SELECT stock_quantity INTO before_qty FROM public.products WHERE id = _product_id FOR UPDATE;
  END IF;

  after_qty := CASE WHEN _mode = 'set' THEN _value ELSE COALESCE(before_qty, 0) + _value END;
  IF after_qty < 0 THEN RAISE EXCEPTION 'invalid_value' USING ERRCODE = '22023'; END IF;

  IF _variation_id IS NOT NULL AND _size_id IS NOT NULL THEN
    UPDATE public.product_variation_size_availability SET stock_quantity = after_qty WHERE variation_id = _variation_id AND product_size_id = _size_id;
  ELSIF _size_id IS NOT NULL THEN
    UPDATE public.product_sizes SET stock_quantity = after_qty WHERE id = _size_id;
  ELSIF _variation_id IS NOT NULL THEN
    UPDATE public.product_variations SET stock_quantity = after_qty WHERE id = _variation_id;
  ELSE
    UPDATE public.products SET stock_quantity = after_qty WHERE id = _product_id;
  END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public._admin_stock_apply(text, uuid, uuid, text, integer) FROM PUBLIC, anon, authenticated;

-- Ajuste de um alvo no Admin (Histórico de estoque > Ajustar estoque): mesmo comportamento de antes.
CREATE OR REPLACE FUNCTION public.admin_adjust_stock(
  _product_id text, _variation_id uuid, _size_id uuid, _mode text, _value integer, _reason text, _note text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  prev text := COALESCE(current_setting('loja3d.stock_ctx', true), '');
BEGIN
  IF NOT COALESCE(public.has_role(auth.uid(), 'admin'::app_role), false) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF _reason IS NULL OR _reason NOT IN ('receive', 'count', 'damage', 'other') THEN RAISE EXCEPTION 'invalid_reason' USING ERRCODE = '22023'; END IF;
  PERFORM set_config('loja3d.stock_ctx', jsonb_build_object('reason', _reason, 'note', left(NULLIF(btrim(COALESCE(_note, '')), ''), 500))::text, true);
  SELECT * INTO r FROM public._admin_stock_apply(_product_id, _variation_id, _size_id, _mode, _value);
  PERFORM set_config('loja3d.stock_ctx', prev, true);
  RETURN r.after_qty;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_adjust_stock(text, uuid, uuid, text, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_adjust_stock(text, uuid, uuid, text, integer, text, text) TO authenticated;

-- ---------------------------------------------------------------------------------------------
-- Entrada inteira numa transação. _lines = [{product_id, variation_id, size_id, qty}], até 500.
--   receive  soma qty (> 0)        count  define qty (>= 0)
--   damage   tira qty (> 0)        other  soma qty com sinal (<> 0)
-- Uma linha inválida desfaz tudo (nada fica pela metade). Devolve {id, number, lines, units_in, units_out}.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_stock_entry(
  _kind text, _lines jsonb, _supplier text DEFAULT NULL, _document text DEFAULT NULL, _note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  e record;
  it jsonb;
  r record;
  v_qty integer;
  v_in integer := 0;
  v_out integer := 0;
  v_note text := left(NULLIF(btrim(COALESCE(_note, '')), ''), 500);
  prev text := COALESCE(current_setting('loja3d.stock_ctx', true), '');
BEGIN
  IF NOT COALESCE(public.has_role(auth.uid(), 'admin'::app_role), false) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF _kind IS NULL OR _kind NOT IN ('receive', 'count', 'damage', 'other') THEN RAISE EXCEPTION 'invalid_kind' USING ERRCODE = '22023'; END IF;
  IF _lines IS NULL OR jsonb_typeof(_lines) <> 'array' OR jsonb_array_length(_lines) = 0 THEN RAISE EXCEPTION 'no_lines' USING ERRCODE = '22023'; END IF;
  IF jsonb_array_length(_lines) > 500 THEN RAISE EXCEPTION 'too_many_lines' USING ERRCODE = '22023'; END IF;

  INSERT INTO public.stock_entries (kind, supplier, document_ref, note, created_by)
  VALUES (_kind, left(NULLIF(btrim(COALESCE(_supplier, '')), ''), 120), left(NULLIF(btrim(COALESCE(_document, '')), ''), 80), v_note, auth.uid())
  RETURNING id, number INTO e;

  PERFORM set_config('loja3d.stock_ctx', jsonb_build_object('reason', _kind, 'entry_id', e.id, 'note', v_note)::text, true);
  FOR it IN SELECT * FROM jsonb_array_elements(_lines) LOOP
    BEGIN
      v_qty := (it ->> 'qty')::integer;
    EXCEPTION WHEN others THEN RAISE EXCEPTION 'invalid_value' USING ERRCODE = '22023';
    END;
    IF v_qty IS NULL
       OR (_kind IN ('receive', 'damage') AND v_qty <= 0)
       OR (_kind = 'count' AND v_qty < 0)
       OR (_kind = 'other' AND v_qty = 0) THEN
      RAISE EXCEPTION 'invalid_value' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO r FROM public._admin_stock_apply(
      it ->> 'product_id',
      NULLIF(it ->> 'variation_id', '')::uuid,
      NULLIF(it ->> 'size_id', '')::uuid,
      CASE WHEN _kind = 'count' THEN 'set' ELSE 'add' END,
      CASE WHEN _kind = 'damage' THEN -v_qty ELSE v_qty END
    );
    IF r.after_qty > COALESCE(r.before_qty, 0) THEN v_in := v_in + r.after_qty - COALESCE(r.before_qty, 0); END IF;
    IF r.after_qty < COALESCE(r.before_qty, 0) THEN v_out := v_out + COALESCE(r.before_qty, 0) - r.after_qty; END IF;
  END LOOP;
  PERFORM set_config('loja3d.stock_ctx', prev, true);

  UPDATE public.stock_entries SET lines = jsonb_array_length(_lines), units_in = v_in, units_out = v_out WHERE id = e.id;
  RETURN jsonb_build_object('id', e.id, 'number', e.number, 'lines', jsonb_array_length(_lines), 'units_in', v_in, 'units_out', v_out);
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_stock_entry(text, jsonb, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_stock_entry(text, jsonb, text, text, text) TO authenticated;

-- Lista de entradas (mais recentes primeiro), com quem fez e total para paginar.
CREATE OR REPLACE FUNCTION public.admin_stock_entries(_kind text DEFAULT NULL, _q text DEFAULT NULL, _limit integer DEFAULT 20, _offset integer DEFAULT 0)
RETURNS TABLE (
  id uuid, number bigint, kind text, supplier text, document_ref text, note text, lines integer, units_in integer, units_out integer,
  actor_email text, created_at timestamptz, total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE q text := NULLIF(lower(btrim(COALESCE(_q, ''))), '');
BEGIN
  IF NOT COALESCE(public.has_role(auth.uid(), 'admin'::app_role), false) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT s.id, s.number, s.kind, s.supplier, s.document_ref, s.note, s.lines, s.units_in, s.units_out, u.email::text, s.created_at, count(*) OVER ()
    FROM public.stock_entries s
    LEFT JOIN auth.users u ON u.id = s.created_by
   WHERE (_kind IS NULL OR s.kind = _kind)
     AND (q IS NULL OR lower(COALESCE(s.supplier, '')) LIKE '%' || q || '%' OR lower(COALESCE(s.document_ref, '')) LIKE '%' || q || '%'
          OR lower(COALESCE(s.note, '')) LIKE '%' || q || '%' OR s.number::text = q)
   ORDER BY s.created_at DESC, s.number DESC
   LIMIT LEAST(GREATEST(COALESCE(_limit, 20), 1), 200) OFFSET GREATEST(COALESCE(_offset, 0), 0);
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_stock_entries(text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_stock_entries(text, text, integer, integer) TO authenticated;

-- Linhas de uma entrada (os movimentos que ela gravou), com nome, cor, tamanho e códigos para reimprimir etiquetas.
CREATE OR REPLACE FUNCTION public.admin_stock_entry_lines(_entry_id uuid)
RETURNS TABLE (
  id bigint, product_id text, product_name text, product_image text, variation_id uuid, variation_name text, size_id uuid, size_label text,
  sku text, quantity_before integer, quantity_after integer, change integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT COALESCE(public.has_role(auth.uid(), 'admin'::app_role), false) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT m.id, m.product_id, p.name, p.image, m.variation_id, v.name, m.size_id, s.size_label, m.sku, m.quantity_before, m.quantity_after, m.change
    FROM public.stock_movements m
    JOIN public.products p ON p.id = m.product_id
    LEFT JOIN public.product_variations v ON v.id = m.variation_id
    LEFT JOIN public.product_sizes s ON s.id = m.size_id
   WHERE m.entry_id = _entry_id
   ORDER BY m.id;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_stock_entry_lines(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_stock_entry_lines(uuid) TO authenticated;

-- Lista do Histórico de estoque: igual à de 20261007030000_stock_history.sql + a entrada (id e número) de cada movimento.
-- O tipo de retorno muda, por isso a função é apagada e criada de novo.
DROP FUNCTION IF EXISTS public.admin_stock_movements(timestamptz, text[], text, text, integer, integer);
CREATE FUNCTION public.admin_stock_movements(
  _since timestamptz DEFAULT NULL, _reasons text[] DEFAULT NULL, _q text DEFAULT NULL, _product_id text DEFAULT NULL,
  _limit integer DEFAULT 50, _offset integer DEFAULT 0
)
RETURNS TABLE (
  id bigint, created_at timestamptz, product_id text, product_name text, product_image text, variation_name text, size_label text,
  sku text, quantity_before integer, quantity_after integer, change integer, reason text, order_id uuid, actor_email text, note text,
  entry_id uuid, entry_number bigint, total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE q text := NULLIF(lower(btrim(COALESCE(_q, ''))), '');
BEGIN
  IF NOT COALESCE(public.has_role(auth.uid(), 'admin'::app_role), false) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT m.id, m.created_at, m.product_id, p.name, p.image, v.name, s.size_label, m.sku, m.quantity_before, m.quantity_after,
         m.change, m.reason, m.order_id, u.email::text, m.note, m.entry_id, e.number, count(*) OVER ()
    FROM public.stock_movements m
    JOIN public.products p ON p.id = m.product_id
    LEFT JOIN public.product_variations v ON v.id = m.variation_id
    LEFT JOIN public.product_sizes s ON s.id = m.size_id
    LEFT JOIN public.stock_entries e ON e.id = m.entry_id
    LEFT JOIN auth.users u ON u.id = m.actor
   WHERE (_since IS NULL OR m.created_at >= _since)
     AND (_reasons IS NULL OR cardinality(_reasons) = 0 OR m.reason = ANY (_reasons))
     AND (_product_id IS NULL OR m.product_id = _product_id)
     AND (q IS NULL OR lower(p.name) LIKE '%' || q || '%' OR lower(COALESCE(m.sku, '')) LIKE '%' || q || '%'
          OR lower(COALESCE(p.sku, '')) LIKE '%' || q || '%' OR m.order_id::text LIKE q || '%'
          OR lower(COALESCE(e.supplier, '')) LIKE '%' || q || '%' OR lower(COALESCE(e.document_ref, '')) LIKE '%' || q || '%')
   ORDER BY m.created_at DESC, m.id DESC
   LIMIT LEAST(GREATEST(COALESCE(_limit, 50), 1), 500) OFFSET GREATEST(COALESCE(_offset, 0), 0);
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_stock_movements(timestamptz, text[], text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_stock_movements(timestamptz, text[], text, text, integer, integer) TO authenticated;
