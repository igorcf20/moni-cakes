-- Menor preço dos últimos 30 dias nas promoções (Diretiva Omnibus, UE 2019/2161; obrigatória em Portugal e Espanha).
-- Quando um produto está em promoção, a loja tem de mostrar o menor preço que praticou nos 30 dias ANTES da redução.
--   product_price_history   uma linha cada vez que o preço ou a promoção do produto muda (gravada pelo trigger),
--                           com o preço base e a configuração da promoção desde valid_from
--   product_lowest_prices   para os produtos com promoção ativa agora: o menor preço efetivo (com promoções antigas
--                           já descontadas) entre 30 dias antes do início da redução atual e esse início.
--                           Sem histórico nessa janela (produto novo ou histórico ainda curto), devolve o preço normal.
-- Onde mostrar (UE, sempre ou nunca) é regra da loja: store_settings.product_compliance.lowest_price_30d
-- (Admin > Preços e segurança). O cálculo é só para mostrar: o preço cobrado continua a vir de _shared/pricing.ts.

CREATE TABLE IF NOT EXISTS public.product_price_history (
  id bigserial PRIMARY KEY,
  product_id text NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  price numeric NOT NULL,
  promo_active boolean NOT NULL DEFAULT false,
  promo_type text,
  promo_value numeric,
  promo_starts_at timestamptz,
  promo_ends_at timestamptz,
  valid_from timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS product_price_history_product_idx ON public.product_price_history (product_id, valid_from DESC);

ALTER TABLE public.product_price_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read price history" ON public.product_price_history;
CREATE POLICY "Admins read price history" ON public.product_price_history
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
REVOKE ALL ON public.product_price_history FROM anon;
GRANT SELECT ON public.product_price_history TO authenticated;

-- Uma linha por mudança de preço ou de promoção (inserção do produto incluída).
CREATE OR REPLACE FUNCTION public.products_price_history_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.price IS NOT DISTINCT FROM OLD.price
     AND NEW.promo_active IS NOT DISTINCT FROM OLD.promo_active
     AND NEW.promo_type IS NOT DISTINCT FROM OLD.promo_type
     AND NEW.promo_value IS NOT DISTINCT FROM OLD.promo_value
     AND NEW.promo_starts_at IS NOT DISTINCT FROM OLD.promo_starts_at
     AND NEW.promo_ends_at IS NOT DISTINCT FROM OLD.promo_ends_at THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.product_price_history (product_id, price, promo_active, promo_type, promo_value, promo_starts_at, promo_ends_at)
  VALUES (NEW.id, coalesce(NEW.price, 0), coalesce(NEW.promo_active, false), NEW.promo_type, NEW.promo_value, NEW.promo_starts_at, NEW.promo_ends_at);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS products_price_history_log ON public.products;
CREATE TRIGGER products_price_history_log
  AFTER INSERT OR UPDATE OF price, promo_active, promo_type, promo_value, promo_starts_at, promo_ends_at ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.products_price_history_log();

-- Ponto de partida: o estado atual de cada produto, desde que o produto existe.
INSERT INTO public.product_price_history (product_id, price, promo_active, promo_type, promo_value, promo_starts_at, promo_ends_at, valid_from)
SELECT p.id, coalesce(p.price, 0), coalesce(p.promo_active, false), p.promo_type, p.promo_value, p.promo_starts_at, p.promo_ends_at,
       coalesce(p.created_at, now())
FROM public.products p
WHERE NOT EXISTS (SELECT 1 FROM public.product_price_history h WHERE h.product_id = p.id);

-- Preço efetivo de uma versão (mesma conta de src/utils/promo.ts): percentual ou valor fixo, nunca abaixo de zero.
CREATE OR REPLACE FUNCTION public.price_after_promo(_price numeric, _type text, _value numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT round(greatest(0, _price - CASE
    WHEN coalesce(_value, 0) <= 0 THEN 0
    WHEN lower(coalesce(_type, '')) = 'fixed' THEN least(_price, _value)
    ELSE least(_price, _price * _value / 100)
  END), 2);
$$;

CREATE OR REPLACE FUNCTION public.product_lowest_prices(_ids text[])
RETURNS TABLE (product_id text, lowest_price numeric, reduction_started_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p record;
  h record;
  r timestamptz;        -- início da redução atual
  w timestamptz;        -- início da janela (r - 30 dias)
  a timestamptz;
  b timestamptz;
  ps timestamptz;
  pe timestamptz;
  best numeric;
  last_diff timestamptz;
BEGIN
  IF _ids IS NULL OR cardinality(_ids) = 0 THEN RETURN; END IF;
  FOR p IN
    SELECT pr.id, coalesce(pr.price, 0) AS price, pr.promo_type, pr.promo_value, pr.promo_starts_at, pr.promo_ends_at
    FROM public.products pr
    WHERE pr.id = ANY (_ids[1:500]) AND pr.is_active AND pr.promo_active AND coalesce(pr.promo_value, 0) > 0
      AND (pr.promo_starts_at IS NULL OR pr.promo_starts_at <= now())
      AND (pr.promo_ends_at IS NULL OR pr.promo_ends_at > now())
  LOOP
    -- A redução atual começou na primeira versão igual à de agora (depois da última diferente),
    -- ou na data de início marcada na promoção, o que for mais tarde.
    SELECT max(x.valid_from) INTO last_diff
    FROM public.product_price_history x
    WHERE x.product_id = p.id AND x.valid_from <= now()
      AND NOT (x.promo_active AND x.price = p.price AND x.promo_type IS NOT DISTINCT FROM p.promo_type
               AND x.promo_value IS NOT DISTINCT FROM p.promo_value AND x.promo_starts_at IS NOT DISTINCT FROM p.promo_starts_at
               AND x.promo_ends_at IS NOT DISTINCT FROM p.promo_ends_at);
    SELECT min(x.valid_from) INTO r
    FROM public.product_price_history x
    WHERE x.product_id = p.id AND x.valid_from <= now() AND (last_diff IS NULL OR x.valid_from > last_diff);
    r := greatest(coalesce(r, now()), coalesce(p.promo_starts_at, '-infinity'::timestamptz));
    w := r - interval '30 days';
    best := NULL;

    -- Cada versão vale de valid_from até à seguinte; só conta o pedaço dentro de [w, r).
    FOR h IN
      SELECT x.*, lead(x.valid_from) OVER (ORDER BY x.valid_from, x.id) AS valid_to
      FROM public.product_price_history x
      WHERE x.product_id = p.id
      ORDER BY x.valid_from, x.id
    LOOP
      a := greatest(h.valid_from, w);
      b := least(coalesce(h.valid_to, 'infinity'::timestamptz), r);
      CONTINUE WHEN a >= b;
      IF h.promo_active AND coalesce(h.promo_value, 0) > 0 THEN
        ps := greatest(a, coalesce(h.promo_starts_at, '-infinity'::timestamptz));
        pe := least(b, coalesce(h.promo_ends_at, 'infinity'::timestamptz));
        IF ps < pe THEN
          best := least(coalesce(best, 'infinity'::numeric), public.price_after_promo(h.price, h.promo_type, h.promo_value));
        END IF;
        -- Preço normal se a promoção dessa versão não cobriu o pedaço todo.
        IF NOT (ps <= a AND pe >= b) THEN
          best := least(coalesce(best, 'infinity'::numeric), h.price);
        END IF;
      ELSE
        best := least(coalesce(best, 'infinity'::numeric), h.price);
      END IF;
    END LOOP;

    product_id := p.id;
    lowest_price := round(coalesce(best, p.price), 2);
    reduction_started_at := r;
    RETURN NEXT;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.product_lowest_prices(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.product_lowest_prices(text[]) TO anon, authenticated;

-- Regras de preço e segurança dos produtos (Admin > Preços e segurança). Leitura pública, como o resto de store_settings.
INSERT INTO public.store_settings (key, value)
VALUES ('product_compliance', '{"lowest_price_30d": "eu", "safety_show": "always", "manufacturer": {}, "responsible": {}, "warnings": ""}'::jsonb)
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE public.product_price_history IS 'Histórico de preço e promoção por produto (menor preço dos últimos 30 dias, Diretiva Omnibus).';
