-- =============================================================================================
-- Variantes com código, código de barras, estoque e foto próprios (recurso variants em Admin > Recursos da loja,
-- ligado por padrão). Cada combinação vendável de um produto passa a ter a sua identidade:
--   products                              sku, gtin (produto sem cores nem tamanhos)
--   product_sizes                         sku, gtin (produto só com tamanhos; o estoque já existia)
--   product_variations                    sku, gtin, stock_quantity (produto só com cores; vazio = estoque do produto)
--   product_variation_size_availability   sku, gtin, image_url (cor x tamanho; estoque e acréscimo já existiam)
--   order_items.sku                       código vendido, gravado pelo servidor ao criar a linha (nunca pelo navegador)
-- O código (SKU) é único na loja inteira, sem diferença de maiúsculas, em qualquer das quatro tabelas.
-- O estoque por cor só é usado com o recurso ligado; desligado, a cor volta a usar o estoque do produto.
-- =============================================================================================

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sku text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS gtin text;
ALTER TABLE public.product_sizes ADD COLUMN IF NOT EXISTS sku text;
ALTER TABLE public.product_sizes ADD COLUMN IF NOT EXISTS gtin text;
ALTER TABLE public.product_variations ADD COLUMN IF NOT EXISTS sku text;
ALTER TABLE public.product_variations ADD COLUMN IF NOT EXISTS gtin text;
ALTER TABLE public.product_variations ADD COLUMN IF NOT EXISTS stock_quantity integer;
ALTER TABLE public.product_variation_size_availability ADD COLUMN IF NOT EXISTS sku text;
ALTER TABLE public.product_variation_size_availability ADD COLUMN IF NOT EXISTS gtin text;
ALTER TABLE public.product_variation_size_availability ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS sku text;

ALTER TABLE public.product_variations DROP CONSTRAINT IF EXISTS product_variations_stock_check;
ALTER TABLE public.product_variations ADD CONSTRAINT product_variations_stock_check
  CHECK (stock_quantity IS NULL OR stock_quantity >= 0);
ALTER TABLE public.product_variation_size_availability DROP CONSTRAINT IF EXISTS pvsa_image_url_check;
ALTER TABLE public.product_variation_size_availability ADD CONSTRAINT pvsa_image_url_check
  CHECK (image_url IS NULL OR (char_length(image_url) <= 1000 AND image_url ~ '^(https?://|/)'));

-- ---------------------------------------------------------------------------------------------
-- Formato e unicidade dos códigos
-- ---------------------------------------------------------------------------------------------
-- SKU: letras, números, ponto, traço, sublinhado e barra (até 64). GTIN/EAN/UPC: 8 a 14 dígitos.
-- Vazio vira NULL. Repetido em qualquer produto, tamanho, cor ou combinação: erro sku_taken (a própria linha não conta).
-- O NEW de cada tabela tem colunas diferentes: uma função por tabela evita referir colunas que não existem.
CREATE OR REPLACE FUNCTION public.variant_codes_guard_products() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s text; taken boolean;
BEGIN
  NEW.sku := nullif(btrim(coalesce(NEW.sku, '')), '');
  NEW.gtin := nullif(regexp_replace(coalesce(NEW.gtin, ''), '\s', '', 'g'), '');
  IF NEW.sku IS NOT NULL AND NEW.sku !~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$' THEN RAISE EXCEPTION 'sku_invalid' USING ERRCODE = '22023'; END IF;
  IF NEW.gtin IS NOT NULL AND NEW.gtin !~ '^[0-9]{8,14}$' THEN RAISE EXCEPTION 'gtin_invalid' USING ERRCODE = '22023'; END IF;
  IF NEW.sku IS NULL THEN RETURN NEW; END IF;
  s := lower(NEW.sku);
  SELECT EXISTS (SELECT 1 FROM public.products p WHERE lower(p.sku) = s AND p.id <> NEW.id)
      OR EXISTS (SELECT 1 FROM public.product_sizes z WHERE lower(z.sku) = s)
      OR EXISTS (SELECT 1 FROM public.product_variations v WHERE lower(v.sku) = s)
      OR EXISTS (SELECT 1 FROM public.product_variation_size_availability a WHERE lower(a.sku) = s)
    INTO taken;
  IF taken THEN RAISE EXCEPTION 'sku_taken' USING ERRCODE = '23505'; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.variant_codes_guard_sizes() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s text; taken boolean;
BEGIN
  NEW.sku := nullif(btrim(coalesce(NEW.sku, '')), '');
  NEW.gtin := nullif(regexp_replace(coalesce(NEW.gtin, ''), '\s', '', 'g'), '');
  IF NEW.sku IS NOT NULL AND NEW.sku !~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$' THEN RAISE EXCEPTION 'sku_invalid' USING ERRCODE = '22023'; END IF;
  IF NEW.gtin IS NOT NULL AND NEW.gtin !~ '^[0-9]{8,14}$' THEN RAISE EXCEPTION 'gtin_invalid' USING ERRCODE = '22023'; END IF;
  IF NEW.sku IS NULL THEN RETURN NEW; END IF;
  s := lower(NEW.sku);
  SELECT EXISTS (SELECT 1 FROM public.products p WHERE lower(p.sku) = s)
      OR EXISTS (SELECT 1 FROM public.product_sizes z WHERE lower(z.sku) = s AND z.id <> NEW.id)
      OR EXISTS (SELECT 1 FROM public.product_variations v WHERE lower(v.sku) = s)
      OR EXISTS (SELECT 1 FROM public.product_variation_size_availability a WHERE lower(a.sku) = s)
    INTO taken;
  IF taken THEN RAISE EXCEPTION 'sku_taken' USING ERRCODE = '23505'; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.variant_codes_guard_variations() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s text; taken boolean;
BEGIN
  NEW.sku := nullif(btrim(coalesce(NEW.sku, '')), '');
  NEW.gtin := nullif(regexp_replace(coalesce(NEW.gtin, ''), '\s', '', 'g'), '');
  IF NEW.sku IS NOT NULL AND NEW.sku !~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$' THEN RAISE EXCEPTION 'sku_invalid' USING ERRCODE = '22023'; END IF;
  IF NEW.gtin IS NOT NULL AND NEW.gtin !~ '^[0-9]{8,14}$' THEN RAISE EXCEPTION 'gtin_invalid' USING ERRCODE = '22023'; END IF;
  IF NEW.sku IS NULL THEN RETURN NEW; END IF;
  s := lower(NEW.sku);
  SELECT EXISTS (SELECT 1 FROM public.products p WHERE lower(p.sku) = s)
      OR EXISTS (SELECT 1 FROM public.product_sizes z WHERE lower(z.sku) = s)
      OR EXISTS (SELECT 1 FROM public.product_variations v WHERE lower(v.sku) = s AND v.id <> NEW.id)
      OR EXISTS (SELECT 1 FROM public.product_variation_size_availability a WHERE lower(a.sku) = s)
    INTO taken;
  IF taken THEN RAISE EXCEPTION 'sku_taken' USING ERRCODE = '23505'; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.variant_codes_guard_combos() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s text; taken boolean;
BEGIN
  NEW.sku := nullif(btrim(coalesce(NEW.sku, '')), '');
  NEW.gtin := nullif(regexp_replace(coalesce(NEW.gtin, ''), '\s', '', 'g'), '');
  NEW.image_url := nullif(btrim(coalesce(NEW.image_url, '')), '');
  IF NEW.sku IS NOT NULL AND NEW.sku !~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$' THEN RAISE EXCEPTION 'sku_invalid' USING ERRCODE = '22023'; END IF;
  IF NEW.gtin IS NOT NULL AND NEW.gtin !~ '^[0-9]{8,14}$' THEN RAISE EXCEPTION 'gtin_invalid' USING ERRCODE = '22023'; END IF;
  IF NEW.sku IS NULL THEN RETURN NEW; END IF;
  s := lower(NEW.sku);
  SELECT EXISTS (SELECT 1 FROM public.products p WHERE lower(p.sku) = s)
      OR EXISTS (SELECT 1 FROM public.product_sizes z WHERE lower(z.sku) = s)
      OR EXISTS (SELECT 1 FROM public.product_variations v WHERE lower(v.sku) = s)
      OR EXISTS (SELECT 1 FROM public.product_variation_size_availability a WHERE lower(a.sku) = s
                  AND NOT (a.variation_id = NEW.variation_id AND a.product_size_id = NEW.product_size_id))
    INTO taken;
  IF taken THEN RAISE EXCEPTION 'sku_taken' USING ERRCODE = '23505'; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS products_variant_codes ON public.products;
CREATE TRIGGER products_variant_codes BEFORE INSERT OR UPDATE OF sku, gtin ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.variant_codes_guard_products();
DROP TRIGGER IF EXISTS product_sizes_variant_codes ON public.product_sizes;
CREATE TRIGGER product_sizes_variant_codes BEFORE INSERT OR UPDATE OF sku, gtin ON public.product_sizes
  FOR EACH ROW EXECUTE FUNCTION public.variant_codes_guard_sizes();
DROP TRIGGER IF EXISTS product_variations_variant_codes ON public.product_variations;
CREATE TRIGGER product_variations_variant_codes BEFORE INSERT OR UPDATE OF sku, gtin ON public.product_variations
  FOR EACH ROW EXECUTE FUNCTION public.variant_codes_guard_variations();
DROP TRIGGER IF EXISTS pvsa_variant_codes ON public.product_variation_size_availability;
CREATE TRIGGER pvsa_variant_codes BEFORE INSERT OR UPDATE OF sku, gtin, image_url ON public.product_variation_size_availability
  FOR EACH ROW EXECUTE FUNCTION public.variant_codes_guard_combos();

REVOKE ALL ON FUNCTION public.variant_codes_guard_products() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.variant_codes_guard_sizes() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.variant_codes_guard_variations() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.variant_codes_guard_combos() FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS products_sku_idx ON public.products (lower(sku)) WHERE sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS product_sizes_sku_idx ON public.product_sizes (lower(sku)) WHERE sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS product_variations_sku_idx ON public.product_variations (lower(sku)) WHERE sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS pvsa_sku_idx ON public.product_variation_size_availability (lower(sku)) WHERE sku IS NOT NULL;

-- ---------------------------------------------------------------------------------------------
-- Código vendido em cada linha do pedido
-- ---------------------------------------------------------------------------------------------
-- Mesma identificação do estoque: cor pelo nome (design_data.variation), tamanho pelo rótulo (design_data.size).
-- Ordem: combinação cor x tamanho, cor, tamanho, produto.
CREATE OR REPLACE FUNCTION public._order_item_sku(_product_id text, _design jsonb)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s_label text := lower(btrim(coalesce(_design->>'size', '')));
  v_name text := lower(btrim(coalesce(_design->>'variation', '')));
  v_id uuid;
  v_sku text;
  z_id uuid;
  z_sku text;
  out_sku text;
BEGIN
  IF _product_id IS NULL THEN RETURN NULL; END IF;
  IF v_name <> '' THEN
    SELECT id, sku INTO v_id, v_sku FROM public.product_variations
     WHERE product_id = _product_id AND lower(btrim(name)) = v_name ORDER BY is_active DESC, display_order LIMIT 1;
  END IF;
  IF s_label <> '' THEN
    SELECT id, sku INTO z_id, z_sku FROM public.product_sizes
     WHERE product_id = _product_id AND lower(btrim(size_label)) = s_label ORDER BY is_active DESC, display_order LIMIT 1;
  END IF;
  IF v_id IS NOT NULL AND z_id IS NOT NULL THEN
    SELECT a.sku INTO out_sku FROM public.product_variation_size_availability a
     WHERE a.variation_id = v_id AND a.product_size_id = z_id;
  END IF;
  out_sku := coalesce(out_sku, v_sku, z_sku);
  IF out_sku IS NULL THEN SELECT p.sku INTO out_sku FROM public.products p WHERE p.id = _product_id; END IF;
  RETURN out_sku;
END $$;
REVOKE ALL ON FUNCTION public._order_item_sku(text, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.order_items_fill_sku()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.sku := public._order_item_sku(NEW.product_id, NEW.design_data);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.order_items_fill_sku() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS order_items_fill_sku_bi ON public.order_items;
CREATE TRIGGER order_items_fill_sku_bi BEFORE INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.order_items_fill_sku();

-- O código fica como foi vendido: só o servidor o grava.
CREATE OR REPLACE FUNCTION public.order_items_keep_sku()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.sku := OLD.sku;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS order_items_keep_sku_bu ON public.order_items;
CREATE TRIGGER order_items_keep_sku_bu BEFORE UPDATE OF sku ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.order_items_keep_sku();

-- ---------------------------------------------------------------------------------------------
-- Estoque: igual a 20261002100100, mais o estoque por cor em produtos sem tamanhos
-- ---------------------------------------------------------------------------------------------
-- _delta negativo = vender; positivo = devolver. _strict: falha se não houver estoque suficiente.
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
