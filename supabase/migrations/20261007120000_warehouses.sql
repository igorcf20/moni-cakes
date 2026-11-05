-- =============================================================================================
-- Vários armazéns (recurso warehouses em Admin > Recursos da loja, desligado por padrão): Admin > Catálogo > Armazéns.
-- O estoque que a loja mostra continua nas 4 tabelas de sempre (produto, cor, tamanho, cor x tamanho). Os armazéns
-- dizem ONDE essas unidades estão:
--  1) warehouses            armazéns (nome, código, endereço, países que atende, prioridade, padrão, ativo)
--  2) warehouse_stock       unidades de uma parte (produto, cor, tamanho ou cor x tamanho) num armazém. Uma parte com
--                           linhas aqui é "distribuída": a soma das linhas é o estoque da parte.
--  3) warehouse_allocations de que armazém saiu cada unidade de um pedido (para devolver ao mesmo lugar)
--  4) warehouse_moves       ajustes, transferências e cargas iniciais feitos no Admin
--  5) trigger warehouse_stock_sync nas 4 tabelas: quando o total muda por outro caminho (venda, cancelamento, edição
--     do pedido, edição do produto, ajuste do Histórico de estoque), reparte a diferença pelos armazéns:
--       venda / edição do pedido que tira   sai primeiro dos armazéns que atendem o país de entrega, depois pela
--                                           prioridade; pausados por último. Fica registado em warehouse_allocations.
--       cancelamento / edição que devolve   volta aos armazéns de onde saiu; o resto vai para o padrão.
--       outras entradas                     armazém padrão.   Outras saídas: pela prioridade.
--  6) admin_warehouse_set, admin_warehouse_transfer, admin_warehouse_load, admin_warehouse_slots,
--     admin_warehouse_moves, admin_order_allocations (só admin).
-- A sincronização acontece sempre (o recurso só esconde as telas), para os números não se desencontrarem.
-- =============================================================================================

CREATE TABLE IF NOT EXISTS public.warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text,
  address text,
  city text,
  country text,
  serves_countries text[] NOT NULL DEFAULT '{}',
  priority integer NOT NULL DEFAULT 100,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT warehouses_name_len CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  CONSTRAINT warehouses_code_len CHECK (code IS NULL OR char_length(code) <= 30),
  CONSTRAINT warehouses_address_len CHECK (address IS NULL OR char_length(address) <= 500),
  CONSTRAINT warehouses_city_len CHECK (city IS NULL OR char_length(city) <= 120),
  CONSTRAINT warehouses_country CHECK (country IS NULL OR country ~ '^[A-Z]{2}$'),
  CONSTRAINT warehouses_serves CHECK (array_length(serves_countries, 1) IS NULL OR array_length(serves_countries, 1) <= 300),
  CONSTRAINT warehouses_priority CHECK (priority BETWEEN 0 AND 10000),
  CONSTRAINT warehouses_notes_len CHECK (notes IS NULL OR char_length(notes) <= 2000)
);
CREATE UNIQUE INDEX IF NOT EXISTS warehouses_one_default ON public.warehouses ((true)) WHERE is_default;
CREATE UNIQUE INDEX IF NOT EXISTS warehouses_code_key ON public.warehouses (upper(code)) WHERE code IS NOT NULL;
COMMENT ON TABLE public.warehouses IS 'Armazéns da loja (Admin > Armazéns). Um só padrão (recebe entradas sem armazém indicado).';

CREATE TABLE IF NOT EXISTS public.warehouse_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  product_id text NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variation_id uuid REFERENCES public.product_variations(id) ON DELETE CASCADE,
  size_id uuid REFERENCES public.product_sizes(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 0,
  bin text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT warehouse_stock_quantity CHECK (quantity >= 0 AND quantity <= 10000000),
  CONSTRAINT warehouse_stock_bin_len CHECK (bin IS NULL OR char_length(bin) <= 60)
);
CREATE UNIQUE INDEX IF NOT EXISTS warehouse_stock_slot_key ON public.warehouse_stock
  (warehouse_id, product_id, COALESCE(variation_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(size_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX IF NOT EXISTS warehouse_stock_product_idx ON public.warehouse_stock (product_id);
COMMENT ON TABLE public.warehouse_stock IS 'Unidades por armazém. Escrita só pelas funções do servidor; a soma de uma parte é o estoque dela.';

CREATE TABLE IF NOT EXISTS public.warehouse_allocations (
  id bigserial PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  product_id text NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variation_id uuid,
  size_id uuid,
  quantity integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT warehouse_allocations_quantity CHECK (quantity > 0)
);
CREATE INDEX IF NOT EXISTS warehouse_allocations_order_idx ON public.warehouse_allocations (order_id);

CREATE TABLE IF NOT EXISTS public.warehouse_moves (
  id bigserial PRIMARY KEY,
  kind text NOT NULL,
  from_warehouse uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  to_warehouse uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  product_id text NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variation_id uuid,
  size_id uuid,
  quantity_before integer,
  quantity_after integer,
  quantity integer NOT NULL,
  reason text,
  note text,
  actor uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT warehouse_moves_kind CHECK (kind IN ('adjust', 'transfer', 'load')),
  CONSTRAINT warehouse_moves_note_len CHECK (note IS NULL OR char_length(note) <= 500)
);
CREATE INDEX IF NOT EXISTS warehouse_moves_recent_idx ON public.warehouse_moves (created_at DESC, id DESC);

-- RLS: tudo só para admin. Armazéns editáveis pela tabela; o resto só pelas funções abaixo.
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_moves ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage warehouses" ON public.warehouses;
CREATE POLICY "Admins manage warehouses" ON public.warehouses FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins read warehouse stock" ON public.warehouse_stock;
CREATE POLICY "Admins read warehouse stock" ON public.warehouse_stock FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins read warehouse allocations" ON public.warehouse_allocations;
CREATE POLICY "Admins read warehouse allocations" ON public.warehouse_allocations FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins read warehouse moves" ON public.warehouse_moves;
CREATE POLICY "Admins read warehouse moves" ON public.warehouse_moves FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
REVOKE ALL ON public.warehouses, public.warehouse_stock, public.warehouse_allocations, public.warehouse_moves FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warehouses TO authenticated;
GRANT SELECT ON public.warehouse_stock, public.warehouse_allocations, public.warehouse_moves TO authenticated;
GRANT ALL ON public.warehouses, public.warehouse_stock, public.warehouse_allocations, public.warehouse_moves TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.warehouse_allocations_id_seq, public.warehouse_moves_id_seq TO service_role;

-- ---------------------------------------------------------------------------------------------
-- Armazém: normaliza campos, um só padrão, e não apaga armazém com unidades.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.warehouses_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.warehouse_stock WHERE warehouse_id = OLD.id AND quantity > 0) THEN
      RAISE EXCEPTION 'warehouse_has_stock' USING ERRCODE = '23503';
    END IF;
    DELETE FROM public.warehouse_stock WHERE warehouse_id = OLD.id;
    RETURN OLD;
  END IF;
  NEW.name := btrim(NEW.name);
  NEW.code := NULLIF(upper(btrim(COALESCE(NEW.code, ''))), '');
  NEW.address := NULLIF(btrim(COALESCE(NEW.address, '')), '');
  NEW.city := NULLIF(btrim(COALESCE(NEW.city, '')), '');
  NEW.country := NULLIF(upper(btrim(COALESCE(NEW.country, ''))), '');
  NEW.notes := NULLIF(btrim(COALESCE(NEW.notes, '')), '');
  NEW.serves_countries := COALESCE((SELECT array_agg(DISTINCT c ORDER BY c) FROM (
      SELECT upper(btrim(x)) AS c FROM unnest(COALESCE(NEW.serves_countries, '{}')) x) s WHERE c ~ '^[A-Z]{2}$'), '{}');
  NEW.updated_at := now();
  -- O primeiro armazém é sempre o padrão; marcar outro como padrão tira a marca dos restantes. O padrão não se
  -- desmarca diretamente (marque outro); só a troca feita aqui (pg_trigger_depth() > 1) o desmarca.
  IF TG_OP = 'INSERT' AND NOT EXISTS (SELECT 1 FROM public.warehouses) THEN NEW.is_default := true; END IF;
  IF TG_OP = 'UPDATE' AND OLD.is_default AND NOT NEW.is_default AND pg_trigger_depth() <= 1 THEN NEW.is_default := true; END IF;
  IF NEW.is_default THEN
    UPDATE public.warehouses SET is_default = false WHERE is_default AND id <> NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.warehouses_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS warehouses_guard ON public.warehouses;
CREATE TRIGGER warehouses_guard BEFORE INSERT OR UPDATE OR DELETE ON public.warehouses
  FOR EACH ROW EXECUTE FUNCTION public.warehouses_guard();

-- Depois de apagar o padrão, o próximo pela prioridade passa a ser o padrão.
CREATE OR REPLACE FUNCTION public.warehouses_keep_default()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.warehouses WHERE is_default) THEN
    UPDATE public.warehouses SET is_default = true
     WHERE id = (SELECT id FROM public.warehouses ORDER BY is_active DESC, priority, created_at LIMIT 1);
  END IF;
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.warehouses_keep_default() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS warehouses_keep_default ON public.warehouses;
CREATE TRIGGER warehouses_keep_default AFTER DELETE ON public.warehouses
  FOR EACH STATEMENT EXECUTE FUNCTION public.warehouses_keep_default();

DO $$
BEGIN
  IF to_regprocedure('public.admin_activity_capture()') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS zz_admin_activity ON public.warehouses;
    CREATE TRIGGER zz_admin_activity AFTER INSERT OR UPDATE OR DELETE ON public.warehouses
      FOR EACH ROW EXECUTE FUNCTION public.admin_activity_capture();
  END IF;
END $$;

-- ---------------------------------------------------------------------------------------------
-- Peças internas.
-- ---------------------------------------------------------------------------------------------
-- Armazém padrão (ou o primeiro pela prioridade).
CREATE OR REPLACE FUNCTION public._warehouse_default()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT id FROM public.warehouses ORDER BY is_default DESC, is_active DESC, priority, created_at LIMIT 1;
$function$;
REVOKE ALL ON FUNCTION public._warehouse_default() FROM PUBLIC, anon, authenticated;

-- Soma uma quantidade (pode ser negativa, sem passar de 0) a um armazém numa parte; cria a linha se faltar.
CREATE OR REPLACE FUNCTION public._warehouse_add(_warehouse uuid, _product text, _variation uuid, _size uuid, _qty integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF _warehouse IS NULL OR COALESCE(_qty, 0) = 0 THEN RETURN; END IF;
  INSERT INTO public.warehouse_stock (warehouse_id, product_id, variation_id, size_id, quantity)
  VALUES (_warehouse, _product, _variation, _size, GREATEST(0, _qty))
  ON CONFLICT (warehouse_id, product_id, COALESCE(variation_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(size_id, '00000000-0000-0000-0000-000000000000'::uuid))
  DO UPDATE SET quantity = GREATEST(0, public.warehouse_stock.quantity + _qty), updated_at = now();
END;
$function$;
REVOKE ALL ON FUNCTION public._warehouse_add(uuid, text, uuid, uuid, integer) FROM PUBLIC, anon, authenticated;

-- Estoque atual de uma parte (null = não controlado) e se a parte existe.
CREATE OR REPLACE FUNCTION public._warehouse_slot_total(_product text, _variation uuid, _size uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v integer;
BEGIN
  IF _variation IS NOT NULL AND _size IS NOT NULL THEN
    SELECT a.stock_quantity INTO v FROM public.product_variation_size_availability a
      JOIN public.product_variations pv ON pv.id = a.variation_id
     WHERE a.variation_id = _variation AND a.product_size_id = _size AND pv.product_id = _product;
  ELSIF _size IS NOT NULL THEN
    SELECT stock_quantity INTO v FROM public.product_sizes WHERE id = _size AND product_id = _product;
  ELSIF _variation IS NOT NULL THEN
    SELECT stock_quantity INTO v FROM public.product_variations WHERE id = _variation AND product_id = _product;
  ELSE
    SELECT stock_quantity INTO v FROM public.products WHERE id = _product;
  END IF;
  RETURN v;
END;
$function$;
REVOKE ALL ON FUNCTION public._warehouse_slot_total(text, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Grava o total de uma parte (= soma dos armazéns) sem voltar a repartir; o Histórico de estoque regista com o motivo.
CREATE OR REPLACE FUNCTION public._warehouse_write_total(_product text, _variation uuid, _size uuid, _reason text, _note text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  total integer;
  prev text := COALESCE(current_setting('loja3d.stock_ctx', true), '');
BEGIN
  SELECT COALESCE(sum(quantity), 0)::integer INTO total FROM public.warehouse_stock
   WHERE product_id = _product AND variation_id IS NOT DISTINCT FROM _variation AND size_id IS NOT DISTINCT FROM _size;
  PERFORM set_config('loja3d.stock_ctx', jsonb_build_object('reason', _reason, 'note', _note, 'warehouse_sync', true)::text, true);
  IF _variation IS NOT NULL AND _size IS NOT NULL THEN
    UPDATE public.product_variation_size_availability SET stock_quantity = total WHERE variation_id = _variation AND product_size_id = _size;
  ELSIF _size IS NOT NULL THEN
    UPDATE public.product_sizes SET stock_quantity = total WHERE id = _size;
  ELSIF _variation IS NOT NULL THEN
    UPDATE public.product_variations SET stock_quantity = total WHERE id = _variation;
  ELSE
    UPDATE public.products SET stock_quantity = total WHERE id = _product;
  END IF;
  PERFORM set_config('loja3d.stock_ctx', prev, true);
  RETURN total;
END;
$function$;
REVOKE ALL ON FUNCTION public._warehouse_write_total(text, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Sincronização: o total de uma parte distribuída mudou por outro caminho; reparte a diferença.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.warehouse_stock_sync()
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
  v_country text;
  v_product text;
  v_variation uuid;
  v_size uuid;
  v_delta integer;
  need integer;
  take integer;
  diff integer;
  r record;
BEGIN
  IF OLD.stock_quantity IS NOT DISTINCT FROM NEW.stock_quantity OR NEW.stock_quantity IS NULL THEN RETURN NEW; END IF;
  IF raw <> '' THEN
    BEGIN ctx := raw::jsonb; EXCEPTION WHEN others THEN ctx := NULL; END;
  END IF;
  IF COALESCE((ctx ->> 'warehouse_sync')::boolean, false) THEN RETURN NEW; END IF;

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

  -- Só partes distribuídas (com linhas em warehouse_stock). Trava as linhas da parte.
  PERFORM 1 FROM public.warehouse_stock
   WHERE product_id = v_product AND variation_id IS NOT DISTINCT FROM v_variation AND size_id IS NOT DISTINCT FROM v_size
   FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;

  v_reason := ctx ->> 'reason';
  BEGIN v_order := NULLIF(ctx ->> 'order_id', '')::uuid; EXCEPTION WHEN others THEN v_order := NULL; END;
  v_delta := NEW.stock_quantity - COALESCE(OLD.stock_quantity, 0);

  IF v_delta < 0 THEN
    need := -v_delta;
    IF v_order IS NOT NULL AND v_reason IN ('sale', 'order_edit') THEN
      SELECT NULLIF(upper(btrim(COALESCE(shipping_address ->> 'country_code', shipping_address ->> 'country', ''))), '') INTO v_country
        FROM public.orders WHERE id = v_order;
    END IF;
    FOR r IN
      SELECT s.id, s.warehouse_id, s.quantity
        FROM public.warehouse_stock s JOIN public.warehouses w ON w.id = s.warehouse_id
       WHERE s.product_id = v_product AND s.variation_id IS NOT DISTINCT FROM v_variation AND s.size_id IS NOT DISTINCT FROM v_size
         AND s.quantity > 0
       ORDER BY w.is_active DESC,
                CASE WHEN v_country IS NOT NULL AND v_country = ANY (w.serves_countries) THEN 0
                     WHEN cardinality(w.serves_countries) = 0 THEN 1 ELSE 2 END,
                w.priority, w.is_default DESC, w.name
    LOOP
      EXIT WHEN need <= 0;
      take := LEAST(need, r.quantity);
      UPDATE public.warehouse_stock SET quantity = quantity - take, updated_at = now() WHERE id = r.id;
      IF v_order IS NOT NULL AND v_reason IN ('sale', 'order_edit') THEN
        INSERT INTO public.warehouse_allocations (order_id, warehouse_id, product_id, variation_id, size_id, quantity)
        VALUES (v_order, r.warehouse_id, v_product, v_variation, v_size, take);
      END IF;
      need := need - take;
    END LOOP;
  ELSE
    need := v_delta;
    -- Devolução de pedido: volta aos armazéns de onde saiu (as últimas saídas primeiro).
    IF v_order IS NOT NULL AND v_reason IN ('order_restock', 'order_edit') THEN
      FOR r IN
        SELECT id, warehouse_id, quantity FROM public.warehouse_allocations
         WHERE order_id = v_order AND product_id = v_product AND variation_id IS NOT DISTINCT FROM v_variation AND size_id IS NOT DISTINCT FROM v_size
         ORDER BY id DESC
         FOR UPDATE
      LOOP
        EXIT WHEN need <= 0;
        take := LEAST(need, r.quantity);
        PERFORM public._warehouse_add(r.warehouse_id, v_product, v_variation, v_size, take);
        IF take = r.quantity THEN
          DELETE FROM public.warehouse_allocations WHERE id = r.id;
        ELSE
          UPDATE public.warehouse_allocations SET quantity = quantity - take WHERE id = r.id;
        END IF;
        need := need - take;
      END LOOP;
    END IF;
    IF need > 0 THEN
      PERFORM public._warehouse_add(public._warehouse_default(), v_product, v_variation, v_size, need);
    END IF;
  END IF;

  -- Acerto final: a soma dos armazéns tem de ser o total da parte.
  SELECT NEW.stock_quantity - COALESCE(sum(quantity), 0)::integer INTO diff FROM public.warehouse_stock
   WHERE product_id = v_product AND variation_id IS NOT DISTINCT FROM v_variation AND size_id IS NOT DISTINCT FROM v_size;
  IF diff > 0 THEN
    PERFORM public._warehouse_add(public._warehouse_default(), v_product, v_variation, v_size, diff);
  ELSIF diff < 0 THEN
    need := -diff;
    FOR r IN
      SELECT s.id, s.quantity FROM public.warehouse_stock s JOIN public.warehouses w ON w.id = s.warehouse_id
       WHERE s.product_id = v_product AND s.variation_id IS NOT DISTINCT FROM v_variation AND s.size_id IS NOT DISTINCT FROM v_size AND s.quantity > 0
       ORDER BY w.is_active DESC, w.priority, w.is_default DESC, w.name
    LOOP
      EXIT WHEN need <= 0;
      take := LEAST(need, r.quantity);
      UPDATE public.warehouse_stock SET quantity = quantity - take, updated_at = now() WHERE id = r.id;
      need := need - take;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.warehouse_stock_sync() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS products_warehouse_sync ON public.products;
CREATE TRIGGER products_warehouse_sync AFTER UPDATE OF stock_quantity ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.warehouse_stock_sync();
DROP TRIGGER IF EXISTS product_sizes_warehouse_sync ON public.product_sizes;
CREATE TRIGGER product_sizes_warehouse_sync AFTER UPDATE OF stock_quantity ON public.product_sizes
  FOR EACH ROW EXECUTE FUNCTION public.warehouse_stock_sync();
DROP TRIGGER IF EXISTS product_variations_warehouse_sync ON public.product_variations;
CREATE TRIGGER product_variations_warehouse_sync AFTER UPDATE OF stock_quantity ON public.product_variations
  FOR EACH ROW EXECUTE FUNCTION public.warehouse_stock_sync();
DROP TRIGGER IF EXISTS pvsa_warehouse_sync ON public.product_variation_size_availability;
CREATE TRIGGER pvsa_warehouse_sync AFTER UPDATE OF stock_quantity ON public.product_variation_size_availability
  FOR EACH ROW EXECUTE FUNCTION public.warehouse_stock_sync();

-- ---------------------------------------------------------------------------------------------
-- Admin: validações comuns. Erros estáveis: forbidden, not_found, untracked, invalid_value, invalid_reason,
-- same_warehouse, insufficient, warehouse_has_stock.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._warehouse_check_slot(_warehouse uuid, _product text, _variation uuid, _size uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE cur integer;
BEGIN
  IF NOT COALESCE(public.has_role(auth.uid(), 'admin'::app_role), false) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF _warehouse IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.warehouses WHERE id = _warehouse) THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = _product) THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  cur := public._warehouse_slot_total(_product, _variation, _size);
  IF cur IS NULL THEN RAISE EXCEPTION 'untracked' USING ERRCODE = '22023'; END IF;
  RETURN cur;
END;
$function$;
REVOKE ALL ON FUNCTION public._warehouse_check_slot(uuid, text, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Primeira vez que uma parte entra nos armazéns: o estoque atual fica no armazém padrão.
CREATE OR REPLACE FUNCTION public._warehouse_seed_slot(_product text, _variation uuid, _size uuid, _current integer, _target uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM public.warehouse_stock
              WHERE product_id = _product AND variation_id IS NOT DISTINCT FROM _variation AND size_id IS NOT DISTINCT FROM _size) THEN RETURN; END IF;
  INSERT INTO public.warehouse_stock (warehouse_id, product_id, variation_id, size_id, quantity)
  VALUES (COALESCE(_target, public._warehouse_default()), _product, _variation, _size, GREATEST(0, COALESCE(_current, 0)));
END;
$function$;
REVOKE ALL ON FUNCTION public._warehouse_seed_slot(text, uuid, uuid, integer, uuid) FROM PUBLIC, anon, authenticated;

-- Define ou soma as unidades de uma parte num armazém; o total da parte passa a ser a soma.
CREATE OR REPLACE FUNCTION public.admin_warehouse_set(
  _warehouse_id uuid, _product_id text, _variation_id uuid, _size_id uuid, _mode text, _value integer, _reason text, _note text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  cur_total integer;
  before integer;
  after integer;
  v_note text := left(NULLIF(btrim(COALESCE(_note, '')), ''), 500);
BEGIN
  cur_total := public._warehouse_check_slot(_warehouse_id, _product_id, _variation_id, _size_id);
  IF _warehouse_id IS NULL THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF _reason IS NULL OR _reason NOT IN ('receive', 'count', 'damage', 'other') THEN RAISE EXCEPTION 'invalid_reason' USING ERRCODE = '22023'; END IF;
  IF _value IS NULL OR _mode NOT IN ('set', 'add') OR (_mode = 'set' AND _value < 0) OR (_mode = 'add' AND _value = 0) OR abs(_value) > 1000000 THEN
    RAISE EXCEPTION 'invalid_value' USING ERRCODE = '22023';
  END IF;

  PERFORM public._warehouse_seed_slot(_product_id, _variation_id, _size_id, cur_total, NULL);
  SELECT quantity INTO before FROM public.warehouse_stock
   WHERE warehouse_id = _warehouse_id AND product_id = _product_id AND variation_id IS NOT DISTINCT FROM _variation_id AND size_id IS NOT DISTINCT FROM _size_id
   FOR UPDATE;
  before := COALESCE(before, 0);
  after := CASE WHEN _mode = 'set' THEN _value ELSE before + _value END;
  IF after < 0 THEN RAISE EXCEPTION 'invalid_value' USING ERRCODE = '22023'; END IF;

  PERFORM public._warehouse_add(_warehouse_id, _product_id, _variation_id, _size_id, after - before);
  -- Linha a zero criada por "definir 0" num armazém novo: fica, para a parte aparecer nele.
  INSERT INTO public.warehouse_stock (warehouse_id, product_id, variation_id, size_id, quantity)
  VALUES (_warehouse_id, _product_id, _variation_id, _size_id, 0)
  ON CONFLICT DO NOTHING;
  INSERT INTO public.warehouse_moves (kind, to_warehouse, product_id, variation_id, size_id, quantity_before, quantity_after, quantity, reason, note, actor)
  VALUES ('adjust', _warehouse_id, _product_id, _variation_id, _size_id, before, after, after - before, _reason, v_note, auth.uid());
  RETURN public._warehouse_write_total(_product_id, _variation_id, _size_id, _reason, v_note);
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_warehouse_set(uuid, text, uuid, uuid, text, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_warehouse_set(uuid, text, uuid, uuid, text, integer, text, text) TO authenticated;

-- Transfere unidades entre armazéns (o total da parte não muda).
CREATE OR REPLACE FUNCTION public.admin_warehouse_transfer(
  _from uuid, _to uuid, _product_id text, _variation_id uuid, _size_id uuid, _quantity integer, _note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  cur_total integer;
  have integer;
BEGIN
  cur_total := public._warehouse_check_slot(_from, _product_id, _variation_id, _size_id);
  IF _from IS NULL OR _to IS NULL OR NOT EXISTS (SELECT 1 FROM public.warehouses WHERE id = _to) THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF _from = _to THEN RAISE EXCEPTION 'same_warehouse' USING ERRCODE = '22023'; END IF;
  IF _quantity IS NULL OR _quantity <= 0 OR _quantity > 1000000 THEN RAISE EXCEPTION 'invalid_value' USING ERRCODE = '22023'; END IF;

  PERFORM public._warehouse_seed_slot(_product_id, _variation_id, _size_id, cur_total, NULL);
  SELECT quantity INTO have FROM public.warehouse_stock
   WHERE warehouse_id = _from AND product_id = _product_id AND variation_id IS NOT DISTINCT FROM _variation_id AND size_id IS NOT DISTINCT FROM _size_id
   FOR UPDATE;
  IF COALESCE(have, 0) < _quantity THEN RAISE EXCEPTION 'insufficient' USING ERRCODE = '22023'; END IF;

  PERFORM public._warehouse_add(_from, _product_id, _variation_id, _size_id, -_quantity);
  PERFORM public._warehouse_add(_to, _product_id, _variation_id, _size_id, _quantity);
  INSERT INTO public.warehouse_moves (kind, from_warehouse, to_warehouse, product_id, variation_id, size_id, quantity, note, actor)
  VALUES ('transfer', _from, _to, _product_id, _variation_id, _size_id, _quantity, left(NULLIF(btrim(COALESCE(_note, '')), ''), 500), auth.uid());
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_warehouse_transfer(uuid, uuid, text, uuid, uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_warehouse_transfer(uuid, uuid, text, uuid, uuid, integer, text) TO authenticated;

-- ---------------------------------------------------------------------------------------------
-- Partes com estoque controlado (as mesmas que a loja usa ao vender):
--   sem tamanhos: o produto e as cores com estoque próprio; com tamanhos: os tamanhos e as cores x tamanhos com estoque.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._warehouse_slots()
RETURNS TABLE (product_id text, variation_id uuid, size_id uuid, stock integer, sku text, variation_name text, size_label text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p.id, NULL::uuid, NULL::uuid, p.stock_quantity, p.sku, NULL::text, NULL::text
    FROM public.products p
   WHERE p.stock_quantity IS NOT NULL AND NOT COALESCE(p.customizable, false)
     AND NOT EXISTS (SELECT 1 FROM public.product_sizes s WHERE s.product_id = p.id)
  UNION ALL
  SELECT v.product_id, v.id, NULL, v.stock_quantity, v.sku, v.name, NULL
    FROM public.product_variations v
   WHERE v.stock_quantity IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.product_sizes s WHERE s.product_id = v.product_id)
  UNION ALL
  SELECT s.product_id, NULL, s.id, s.stock_quantity, s.sku, NULL, s.size_label
    FROM public.product_sizes s WHERE s.stock_quantity IS NOT NULL
  UNION ALL
  SELECT v.product_id, a.variation_id, a.product_size_id, a.stock_quantity, a.sku, v.name, s.size_label
    FROM public.product_variation_size_availability a
    JOIN public.product_variations v ON v.id = a.variation_id
    JOIN public.product_sizes s ON s.id = a.product_size_id
   WHERE a.stock_quantity IS NOT NULL;
$function$;
REVOKE ALL ON FUNCTION public._warehouse_slots() FROM PUBLIC, anon, authenticated;

-- Grelha do Admin: cada parte com o total, se está distribuída e as unidades por armazém ({"<id>": n}).
-- _scope: all | managed | unmanaged | low (algum armazém com 0 a 2) | warehouse (só as que têm linha em _warehouse_id).
CREATE OR REPLACE FUNCTION public.admin_warehouse_slots(
  _q text DEFAULT NULL, _scope text DEFAULT 'all', _warehouse_id uuid DEFAULT NULL, _product_id text DEFAULT NULL,
  _limit integer DEFAULT 25, _offset integer DEFAULT 0
)
RETURNS TABLE (
  product_id text, variation_id uuid, size_id uuid, product_name text, product_image text, variation_name text, size_label text,
  sku text, stock integer, managed boolean, per_warehouse jsonb, total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE needle text := NULLIF(lower(btrim(COALESCE(_q, ''))), '');
BEGIN
  IF NOT COALESCE(public.has_role(auth.uid(), 'admin'::app_role), false) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  WITH s AS (
    SELECT x.*, p.name AS pname, p.image AS pimage, p.sku AS psku,
           (SELECT jsonb_object_agg(ws.warehouse_id::text, ws.quantity) FROM public.warehouse_stock ws
             WHERE ws.product_id = x.product_id AND ws.variation_id IS NOT DISTINCT FROM x.variation_id AND ws.size_id IS NOT DISTINCT FROM x.size_id) AS per
      FROM public._warehouse_slots() x JOIN public.products p ON p.id = x.product_id
     WHERE (_product_id IS NULL OR x.product_id = _product_id)
       AND (needle IS NULL OR lower(p.name) LIKE '%' || needle || '%' OR lower(COALESCE(x.sku, '')) LIKE '%' || needle || '%'
            OR lower(COALESCE(p.sku, '')) LIKE '%' || needle || '%' OR lower(COALESCE(x.variation_name, '')) LIKE '%' || needle || '%'
            OR lower(COALESCE(x.size_label, '')) LIKE '%' || needle || '%')
  ), f AS (
    SELECT * FROM s
     WHERE CASE COALESCE(_scope, 'all')
             WHEN 'managed' THEN s.per IS NOT NULL
             WHEN 'unmanaged' THEN s.per IS NULL
             WHEN 'low' THEN s.per IS NOT NULL AND EXISTS (SELECT 1 FROM jsonb_each_text(s.per) e WHERE e.value::int <= 2)
             WHEN 'warehouse' THEN s.per ? COALESCE(_warehouse_id::text, '')
             ELSE true END
  )
  SELECT f.product_id, f.variation_id, f.size_id, f.pname, f.pimage, f.variation_name, f.size_label,
         COALESCE(NULLIF(f.sku, ''), f.psku), f.stock, f.per IS NOT NULL, COALESCE(f.per, '{}'::jsonb), count(*) OVER ()
    FROM f
   ORDER BY f.pname, f.product_id, f.variation_name NULLS FIRST, f.size_label NULLS FIRST
   LIMIT LEAST(GREATEST(COALESCE(_limit, 25), 1), 200) OFFSET GREATEST(COALESCE(_offset, 0), 0);
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_warehouse_slots(text, text, uuid, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_warehouse_slots(text, text, uuid, text, integer, integer) TO authenticated;

-- Números de cada armazém: unidades, partes e partes a zero.
CREATE OR REPLACE FUNCTION public.admin_warehouse_summary()
RETURNS TABLE (warehouse_id uuid, units bigint, slots bigint, empty_slots bigint, products bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT COALESCE(public.has_role(auth.uid(), 'admin'::app_role), false) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT w.id, COALESCE(sum(s.quantity), 0)::bigint, count(s.id), count(s.id) FILTER (WHERE s.quantity = 0), count(DISTINCT s.product_id)
    FROM public.warehouses w LEFT JOIN public.warehouse_stock s ON s.warehouse_id = w.id
   GROUP BY w.id;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_warehouse_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_warehouse_summary() TO authenticated;

-- Carga inicial: põe o estoque atual de todas as partes ainda fora dos armazéns (ou de um produto) num armazém.
CREATE OR REPLACE FUNCTION public.admin_warehouse_load(_warehouse_id uuid, _product_id text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  n integer := 0;
BEGIN
  IF NOT COALESCE(public.has_role(auth.uid(), 'admin'::app_role), false) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF _warehouse_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.warehouses WHERE id = _warehouse_id) THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  FOR r IN
    SELECT x.* FROM public._warehouse_slots() x
     WHERE (_product_id IS NULL OR x.product_id = _product_id)
       AND NOT EXISTS (SELECT 1 FROM public.warehouse_stock ws
                        WHERE ws.product_id = x.product_id AND ws.variation_id IS NOT DISTINCT FROM x.variation_id AND ws.size_id IS NOT DISTINCT FROM x.size_id)
  LOOP
    PERFORM public._warehouse_seed_slot(r.product_id, r.variation_id, r.size_id, r.stock, _warehouse_id);
    INSERT INTO public.warehouse_moves (kind, to_warehouse, product_id, variation_id, size_id, quantity_before, quantity_after, quantity, actor)
    VALUES ('load', _warehouse_id, r.product_id, r.variation_id, r.size_id, 0, GREATEST(0, r.stock), GREATEST(0, r.stock), auth.uid());
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_warehouse_load(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_warehouse_load(uuid, text) TO authenticated;

-- Movimentos do Admin (ajustes, transferências, cargas), mais recentes primeiro.
CREATE OR REPLACE FUNCTION public.admin_warehouse_moves(_warehouse_id uuid DEFAULT NULL, _limit integer DEFAULT 25, _offset integer DEFAULT 0)
RETURNS TABLE (
  id bigint, created_at timestamptz, kind text, from_warehouse uuid, to_warehouse uuid, product_id text, product_name text,
  variation_name text, size_label text, quantity_before integer, quantity_after integer, quantity integer, reason text, note text,
  actor_email text, total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT COALESCE(public.has_role(auth.uid(), 'admin'::app_role), false) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT m.id, m.created_at, m.kind, m.from_warehouse, m.to_warehouse, m.product_id, p.name, v.name, s.size_label,
         m.quantity_before, m.quantity_after, m.quantity, m.reason, m.note, u.email::text, count(*) OVER ()
    FROM public.warehouse_moves m
    LEFT JOIN public.products p ON p.id = m.product_id
    LEFT JOIN public.product_variations v ON v.id = m.variation_id
    LEFT JOIN public.product_sizes s ON s.id = m.size_id
    LEFT JOIN auth.users u ON u.id = m.actor
   WHERE _warehouse_id IS NULL OR m.from_warehouse = _warehouse_id OR m.to_warehouse = _warehouse_id
   ORDER BY m.created_at DESC, m.id DESC
   LIMIT LEAST(GREATEST(COALESCE(_limit, 25), 1), 200) OFFSET GREATEST(COALESCE(_offset, 0), 0);
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_warehouse_moves(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_warehouse_moves(uuid, integer, integer) TO authenticated;

-- De que armazém sai cada item de um pedido (bloco na página do pedido).
CREATE OR REPLACE FUNCTION public.admin_order_allocations(_order_id uuid)
RETURNS TABLE (
  warehouse_id uuid, warehouse_name text, warehouse_code text, warehouse_city text, product_id text, product_name text,
  variation_name text, size_label text, quantity bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT COALESCE(public.has_role(auth.uid(), 'admin'::app_role), false) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT a.warehouse_id, w.name, w.code, w.city, a.product_id, p.name, v.name, s.size_label, sum(a.quantity)::bigint
    FROM public.warehouse_allocations a
    JOIN public.warehouses w ON w.id = a.warehouse_id
    LEFT JOIN public.products p ON p.id = a.product_id
    LEFT JOIN public.product_variations v ON v.id = a.variation_id
    LEFT JOIN public.product_sizes s ON s.id = a.size_id
   WHERE a.order_id = _order_id
   GROUP BY a.warehouse_id, w.name, w.code, w.city, a.product_id, p.name, v.name, s.size_label
   ORDER BY w.name, p.name;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_order_allocations(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_order_allocations(uuid) TO authenticated;
