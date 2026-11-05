-- Kits completos: página própria (/kit/<slug>), textos por idioma, descrição longa, destaques, galeria, período de
-- validade, SEO, bloco na página inicial e números de venda no Admin.
-- kits.name / description continuam a ser o idioma padrão; *_i18n guardam os outros ({"en": "...", "es": "..."}).
-- long_description é HTML simples (o site limpa com DOMPurify); highlights = um destaque por linha.
-- starts_at / ends_at: fora do período o kit some do site e o desconto não vale (também em _shared/pricing.ts).
-- kit_items.note: texto curto por peça (ex.: "cor à sua escolha"); display_order: ordem das peças.

ALTER TABLE public.kits
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS name_i18n jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS description_i18n jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS long_description text,
  ADD COLUMN IF NOT EXISTS long_description_i18n jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS highlights text,
  ADD COLUMN IF NOT EXISTS highlights_i18n jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS gallery jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS show_on_home boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS seo_title text,
  ADD COLUMN IF NOT EXISTS seo_description text;

ALTER TABLE public.kit_items
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0;

-- Endereço curto a partir do nome (sem acentos), único; o Admin pode trocar.
CREATE OR REPLACE FUNCTION public._kit_slugify(_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT nullif(trim(both '-' from regexp_replace(lower(translate(coalesce(_name, ''),
    'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
    'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn')), '[^a-z0-9]+', '-', 'g')), '')
$$;

CREATE OR REPLACE FUNCTION public.kits_slug_fill()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  base text;
  candidate text;
  n integer := 1;
BEGIN
  NEW.slug := public._kit_slugify(NEW.slug);
  IF NEW.slug IS NULL THEN
    base := coalesce(public._kit_slugify(NEW.name), 'kit');
    candidate := base;
    WHILE EXISTS (SELECT 1 FROM public.kits k WHERE k.slug = candidate AND k.id <> NEW.id) LOOP
      n := n + 1;
      candidate := base || '-' || n;
    END LOOP;
    NEW.slug := candidate;
  END IF;
  IF jsonb_typeof(NEW.gallery) <> 'array' THEN
    NEW.gallery := '[]'::jsonb;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS kits_slug_fill ON public.kits;
CREATE TRIGGER kits_slug_fill BEFORE INSERT OR UPDATE OF slug, name, gallery ON public.kits
  FOR EACH ROW EXECUTE FUNCTION public.kits_slug_fill();

UPDATE public.kits SET slug = NULL WHERE slug IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS kits_slug_key ON public.kits (slug);
CREATE INDEX IF NOT EXISTS kit_items_product_idx ON public.kit_items (product_id);

-- Site: só kits ativos, dentro do período e com o recurso ligado.
CREATE OR REPLACE FUNCTION public.kit_is_live(_is_active boolean, _starts timestamptz, _ends timestamptz)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce(_is_active, false)
     AND (_starts IS NULL OR _starts <= now())
     AND (_ends IS NULL OR _ends > now())
     AND public.feature_enabled('kits', true)
$$;
GRANT EXECUTE ON FUNCTION public.kit_is_live(boolean, timestamptz, timestamptz) TO anon, authenticated;

DROP POLICY IF EXISTS "Anyone can view active kits" ON public.kits;
CREATE POLICY "Anyone can view active kits" ON public.kits FOR SELECT
  USING (public.kit_is_live(is_active, starts_at, ends_at));

-- Números de venda por kit (Admin > Kits). Venda = pedido pago e não cancelado (como em src/lib/salesStats.ts).
-- kits_sold = kits completos por pedido (menor razão entre a quantidade comprada e a pedida pelo kit).
-- discount = estimativa pelo percentual gravado na linha (design_data.kit.pct).
CREATE OR REPLACE FUNCTION public.admin_kit_stats(_from timestamptz DEFAULT NULL)
RETURNS TABLE (kit_id uuid, orders bigint, kits_sold bigint, units bigint, revenue numeric, discount numeric, last_order_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH lines AS (
    SELECT (i.design_data->'kit'->>'id')::uuid AS kid, i.order_id, i.product_id, i.quantity, i.price,
           least(greatest(coalesce((i.design_data->'kit'->>'pct')::numeric, 0), 0), 0.99) AS pct,
           i.design_data->'kit'->'items' AS parts, o.created_at
    FROM public.order_items i
    JOIN public.orders o ON o.id = i.order_id
    WHERE i.design_data->'kit'->>'id' ~* '^[0-9a-f-]{36}$'
      AND o.payment_status = 'paid' AND o.status <> 'cancelled'
      AND (_from IS NULL OR o.created_at >= _from)
  ),
  per_order AS (
    SELECT l.kid, l.order_id, min(l.created_at) AS at,
      coalesce((
        SELECT min(floor(coalesce((SELECT sum(l2.quantity) FROM lines l2 WHERE l2.kid = l.kid AND l2.order_id = l.order_id
                                     AND l2.product_id = p->>'product_id'), 0) / greatest((p->>'quantity')::numeric, 1)))
        FROM jsonb_array_elements(coalesce((array_agg(l.parts))[1], '[]'::jsonb)) p
      ), 0)::bigint AS complete
    FROM lines l
    GROUP BY l.kid, l.order_id
  )
  SELECT l.kid,
         count(DISTINCT l.order_id),
         coalesce((SELECT sum(po.complete) FROM per_order po WHERE po.kid = l.kid), 0)::bigint,
         sum(l.quantity)::bigint,
         round(sum(l.price * l.quantity), 2),
         round(sum(CASE WHEN l.pct > 0 THEN l.price * l.quantity * l.pct / (1 - l.pct) ELSE 0 END), 2),
         max(l.created_at)
  FROM lines l
  GROUP BY l.kid;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_kit_stats(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_kit_stats(timestamptz) TO authenticated;
