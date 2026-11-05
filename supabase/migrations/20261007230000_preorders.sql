-- Pré-venda (recurso preorders, ligado por padrão; aba Pré-venda do produto e Admin > Outras formas de vender > Pré-venda).
--
-- Um produto em pré-venda vende-se antes de estar disponível: o cliente compra e paga agora e o envio fica para a
-- data de lançamento. Enquanto a pré-venda vale (ativa e antes da data de lançamento, ou sem data), todas as vendas
-- do produto são de pré-venda: não mexem no estoque (o lojista recebe as peças depois) e só contam para o limite
-- opcional de unidades. Na data de lançamento a pré-venda acaba sozinha e o produto volta a vender pelo estoque.
--
--   product_preorders            regras do produto: ligada, data de lançamento, limite de unidades, mensagem por idioma
--   _preorder_info               estado de agora (ativa, data, limite, vendidas em pedidos não cancelados)
--   preorders_public             site: produtos em pré-venda com data, unidades que restam e mensagem
--   order_items_preorder_mark    marca a linha do pedido (design_data.preorder) pelo estado do produto, nunca
--                                pelo que o navegador mandou
--   _adjust_order_item_stock     linhas de pré-venda não mexem no estoque (venda, cancelamento, edição)
--   _order_item_stock_slot       carrinho, checkout e reserva: o "estoque" da pré-venda é o limite que resta
--   order_items_reserve_stock    na compra do cliente, o limite é estrito (com as reservas no carrinho dos outros)
--   admin_preorders              Admin: produtos com pré-venda, vendidas e pedidos

-- ---------------------------------------------------------------------------------------------
-- Tabela.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_preorders (
  product_id text PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  -- primeiro dia em que o produto deixa de ser pré-venda (envio previsto a partir dele); NULL = até desligar
  release_date date,
  -- unidades que se podem vender na pré-venda; NULL = sem limite
  max_units integer CHECK (max_units IS NULL OR max_units > 0),
  -- mensagem opcional para o cliente, por idioma ({"pt-BR": "...", "en": "..."})
  note_i18n jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(note_i18n) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.product_preorders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage preorders" ON public.product_preorders;
CREATE POLICY "Admins manage preorders" ON public.product_preorders FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
REVOKE ALL ON public.product_preorders FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_preorders TO authenticated;
GRANT ALL ON public.product_preorders TO service_role;

CREATE OR REPLACE FUNCTION public.product_preorders_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS product_preorders_touch ON public.product_preorders;
CREATE TRIGGER product_preorders_touch BEFORE UPDATE ON public.product_preorders
  FOR EACH ROW EXECUTE FUNCTION public.product_preorders_touch();

-- Registo de atividade do Admin.
DO $$
BEGIN
  IF to_regprocedure('public.admin_activity_capture()') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS zz_admin_activity ON public.product_preorders;
    CREATE TRIGGER zz_admin_activity AFTER INSERT OR UPDATE OR DELETE ON public.product_preorders
      FOR EACH ROW EXECUTE FUNCTION public.admin_activity_capture();
  END IF;
END $$;

-- ---------------------------------------------------------------------------------------------
-- Estado de agora. Vendidas = linhas marcadas como pré-venda em pedidos que não foram cancelados nem reembolsados.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._preorder_info(_product_id text,
  OUT active boolean, OUT release_date date, OUT max_units integer, OUT sold integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE cfg record;
BEGIN
  active := false; release_date := NULL; max_units := NULL; sold := 0;
  IF _product_id IS NULL OR NOT public.feature_enabled('preorders', true) THEN RETURN; END IF;
  SELECT * INTO cfg FROM public.product_preorders p WHERE p.product_id = _product_id AND p.is_active;
  IF NOT FOUND THEN RETURN; END IF;
  IF cfg.release_date IS NOT NULL AND cfg.release_date <= current_date THEN RETURN; END IF;
  active := true;
  release_date := cfg.release_date;
  max_units := cfg.max_units;
  SELECT COALESCE(sum(oi.quantity), 0)::integer INTO sold
    FROM public.order_items oi JOIN public.orders o ON o.id = oi.order_id
   WHERE oi.product_id = _product_id
     AND oi.design_data ? 'preorder'
     AND o.status NOT IN ('cancelled', 'refunded');
END;
$function$;
REVOKE ALL ON FUNCTION public._preorder_info(text) FROM PUBLIC, anon, authenticated;

-- Site: produtos em pré-venda agora (só números e a mensagem).
CREATE OR REPLACE FUNCTION public.preorders_public()
RETURNS TABLE (product_id text, release_date date, max_units integer, remaining integer, note_i18n jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p.product_id, i.release_date, i.max_units,
         CASE WHEN i.max_units IS NULL THEN NULL ELSE GREATEST(0, i.max_units - i.sold) END,
         p.note_i18n
    FROM public.product_preorders p
    CROSS JOIN LATERAL public._preorder_info(p.product_id) i
   WHERE p.is_active AND i.active;
$function$;
REVOKE ALL ON FUNCTION public.preorders_public() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preorders_public() TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- Linha do pedido: a marca de pré-venda vem do estado do produto. O Admin (fora da compra do cliente) pode manter
-- a marca que a linha já tinha (ex.: editar itens depois da data de lançamento).
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.order_items_preorder_mark()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  i record;
  customer boolean := COALESCE(current_setting('loja3d.customer_checkout', true), '') = '1';
  design jsonb := CASE WHEN jsonb_typeof(NEW.design_data) = 'object' THEN NEW.design_data END;
BEGIN
  IF design IS NULL THEN
    design := '{}'::jsonb;
  ELSIF design ? 'preorder' THEN
    IF NOT customer AND public._is_trusted_writer() THEN RETURN NEW; END IF;
    design := design - 'preorder';
  END IF;
  -- Personalizadas e aluguéis têm regras próprias.
  IF NOT (design ? 'customization' OR design ? 'rental') THEN
    SELECT * INTO i FROM public._preorder_info(NEW.product_id);
    IF i.active THEN
      design := design || jsonb_build_object('preorder', jsonb_build_object('release_date', i.release_date));
    END IF;
  END IF;
  IF design = '{}'::jsonb AND NEW.design_data IS NULL THEN RETURN NEW; END IF;
  NEW.design_data := design;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.order_items_preorder_mark() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS order_items_preorder_mark_bi ON public.order_items;
CREATE TRIGGER order_items_preorder_mark_bi BEFORE INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.order_items_preorder_mark();

-- ---------------------------------------------------------------------------------------------
-- Baixa de estoque (igual a 20261007110000_digital_products.sql + linhas de pré-venda de fora).
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
  -- Pré-venda (recurso preorders): vendida antes de haver estoque; só conta para o limite da pré-venda.
  IF _design IS NOT NULL AND jsonb_typeof(_design) = 'object' AND _design ? 'preorder' THEN RETURN; END IF;
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

-- ---------------------------------------------------------------------------------------------
-- De que "estoque" sai a linha (igual a 20261007210000 + pré-venda): com pré-venda ativa, o slot é o limite
-- ('pre:<produto>', o que resta); sem limite, a linha não tem controle.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._order_item_stock_slot(_product_id text, _design jsonb, OUT slot text, OUT available integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  p record;
  pre record;
  s_label text;
  v_name text;
  has_sizes boolean;
  s_id public.product_sizes.id%TYPE;
  v_id public.product_variations.id%TYPE;
  m_stock integer;
  m_found boolean := false;
BEGIN
  slot := NULL; available := NULL;
  IF _product_id IS NULL THEN RETURN; END IF;

  SELECT id, customizable, stock_quantity INTO p FROM public.products WHERE id = _product_id;
  IF NOT FOUND OR COALESCE(p.customizable, false) THEN RETURN; END IF;
  IF _design IS NOT NULL AND jsonb_typeof(_design) = 'object'
     AND (_design ? 'customization' OR _design ? 'rental') THEN RETURN; END IF;
  SELECT * INTO pre FROM public._preorder_info(_product_id);
  IF pre.active THEN
    IF pre.max_units IS NOT NULL THEN
      slot := 'pre:' || _product_id;
      available := GREATEST(0, pre.max_units - pre.sold);
    END IF;
    RETURN;
  END IF;
  IF public.feature_enabled('digital_products', false)
     AND EXISTS (SELECT 1 FROM public.product_digital WHERE product_id = _product_id AND is_active AND NOT ships) THEN RETURN; END IF;

  s_label := lower(btrim(COALESCE(_design->>'size', '')));
  v_name  := lower(btrim(COALESCE(_design->>'variation', '')));
  SELECT EXISTS (SELECT 1 FROM public.product_sizes WHERE product_id = _product_id) INTO has_sizes;

  IF has_sizes THEN
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
        SELECT true, stock_quantity INTO m_found, m_stock FROM public.product_variation_size_availability
         WHERE variation_id = v_id AND product_size_id = s_id;
      END IF;
    END IF;
    IF COALESCE(m_found, false) THEN
      slot := 'm:' || v_id::text || ':' || s_id::text;
      available := GREATEST(0, COALESCE(m_stock, 0));
    ELSE
      slot := 's:' || s_id::text;
      SELECT GREATEST(0, COALESCE(stock_quantity, 0)) INTO available FROM public.product_sizes WHERE id = s_id;
    END IF;
    RETURN;
  END IF;

  IF v_name <> '' AND public.feature_enabled('variants', true) THEN
    SELECT id, stock_quantity INTO v_id, m_stock FROM public.product_variations
     WHERE product_id = _product_id AND lower(btrim(name)) = v_name AND stock_quantity IS NOT NULL
     ORDER BY is_active DESC, display_order LIMIT 1;
  END IF;
  IF v_id IS NOT NULL THEN
    slot := 'v:' || v_id::text;
    available := GREATEST(0, m_stock);
  ELSIF p.stock_quantity IS NOT NULL THEN
    slot := 'p:' || _product_id;
    available := GREATEST(0, p.stock_quantity);
  END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public._order_item_stock_slot(text, jsonb) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Baixa da linha (igual a 20261007220000_cart_reservations.sql + pré-venda). A linha de pré-venda já está gravada
-- quando este trigger corre (AFTER INSERT), por isso as vendidas já a incluem: passa se não ultrapassar o limite
-- menos o que os outros têm reservado no carrinho.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.order_items_reserve_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  prev text := COALESCE(current_setting('loja3d.stock_ctx', true), '');
  customer boolean := COALESCE(current_setting('loja3d.customer_checkout', true), '') = '1';
  must boolean := customer OR NOT public._is_trusted_writer();
  reserving boolean := customer AND public.feature_enabled('cart_reservations', true);
  buyer text := CASE WHEN auth.uid() IS NOT NULL THEN 'u:' || auth.uid()::text END;
  r record;
  s text;
  held integer;
BEGIN
  IF NEW.quantity IS NULL OR NEW.quantity <= 0 THEN RETURN NEW; END IF;

  -- Pré-venda: sem estoque; na compra do cliente, o limite de unidades é estrito.
  IF jsonb_typeof(NEW.design_data) = 'object' AND NEW.design_data ? 'preorder' THEN
    IF must THEN
      s := 'pre:' || NEW.product_id;
      PERFORM pg_advisory_xact_lock(hashtext('loja3d.reserve:' || s));
      -- Depois do lock: as vendidas de outras compras já gravadas contam.
      SELECT * INTO r FROM public._preorder_info(NEW.product_id);
      held := CASE WHEN reserving THEN public._reserved_by_others(s, buyer) ELSE 0 END;
      IF r.active AND r.max_units IS NOT NULL AND r.max_units - r.sold - held < 0 THEN
        RAISE EXCEPTION 'Stock insuficiente para um dos artigos. Reduza a quantidade ou remova o artigo do carrinho.';
      END IF;
      IF reserving THEN DELETE FROM public.cart_reservations WHERE holder = buyer AND slot = s; END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- Compra do cliente com a reserva ligada: as unidades reservadas por outros não estão à venda.
  IF reserving THEN
    SELECT * INTO r FROM public._order_item_stock_slot(NEW.product_id, NEW.design_data);
    IF r.slot IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(hashtext('loja3d.reserve:' || r.slot));
      IF r.available - public._reserved_by_others(r.slot, buyer) < NEW.quantity THEN
        RAISE EXCEPTION 'Stock insuficiente para um dos artigos. Reduza a quantidade ou remova o artigo do carrinho.';
      END IF;
      -- A reserva do comprador vira venda.
      DELETE FROM public.cart_reservations WHERE holder = buyer AND slot = r.slot;
    END IF;
  END IF;
  -- Dentro da edição de itens do Admin o motivo já é order_edit.
  IF prev = '' THEN
    PERFORM set_config('loja3d.stock_ctx', jsonb_build_object('reason', 'sale', 'order_id', NEW.order_id)::text, true);
  END IF;
  PERFORM public._adjust_order_item_stock(NEW.product_id, NEW.design_data, -NEW.quantity, must);
  PERFORM set_config('loja3d.stock_ctx', prev, true);
  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------------------------
-- Admin: produtos com pré-venda configurada, com vendidas e pedidos (ativos e terminados).
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_preorders()
RETURNS TABLE (product_id text, product_name text, product_image text, is_active boolean, release_date date,
               max_units integer, running boolean, sold integer, orders integer, updated_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT p.product_id, pr.name::text, pr.image::text, p.is_active, p.release_date, p.max_units,
         (SELECT i.active FROM public._preorder_info(p.product_id) i),
         COALESCE(st.sold, 0)::integer, COALESCE(st.orders, 0)::integer, p.updated_at
    FROM public.product_preorders p
    JOIN public.products pr ON pr.id = p.product_id
    LEFT JOIN LATERAL (
      SELECT sum(oi.quantity) AS sold, count(DISTINCT oi.order_id) AS orders
        FROM public.order_items oi JOIN public.orders o ON o.id = oi.order_id
       WHERE oi.product_id = p.product_id AND oi.design_data ? 'preorder'
         AND o.status NOT IN ('cancelled', 'refunded')
    ) st ON true
   ORDER BY p.is_active DESC, p.release_date NULLS LAST, pr.name;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_preorders() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_preorders() TO authenticated, service_role;
