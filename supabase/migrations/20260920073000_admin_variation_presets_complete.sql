-- Gestão completa e retrocompatível de presets de tamanhos e variações.
-- Esta migration é autocontida: pode ser aplicada mesmo que a migration
-- 20260630084632 ainda não tenha sido executada.

CREATE TABLE IF NOT EXISTS public.size_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sizes jsonb NOT NULL DEFAULT '[]'::jsonb,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.size_presets
  ADD COLUMN IF NOT EXISTS sizes jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS items jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS trg_size_presets_updated_at ON public.size_presets;
CREATE TRIGGER trg_size_presets_updated_at
  BEFORE UPDATE ON public.size_presets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Campos monetários usados pelo produto, pelo tamanho e pela combinação.
-- São repetidos aqui com IF NOT EXISTS para que este seja o único SQL
-- necessário, independentemente das migrations antigas já aplicadas.
ALTER TABLE public.product_variations
  ADD COLUMN IF NOT EXISTS price_modifier numeric NOT NULL DEFAULT 0;

ALTER TABLE public.product_sizes
  ADD COLUMN IF NOT EXISTS price_modifier numeric NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.product_variation_size_availability (
  variation_id uuid NOT NULL REFERENCES public.product_variations(id) ON DELETE CASCADE,
  product_size_id uuid NOT NULL REFERENCES public.product_sizes(id) ON DELETE CASCADE,
  is_available boolean NOT NULL DEFAULT true,
  stock_quantity integer NOT NULL DEFAULT 0,
  price_modifier numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (variation_id, product_size_id)
);

ALTER TABLE public.product_variation_size_availability
  ADD COLUMN IF NOT EXISTS price_modifier numeric NOT NULL DEFAULT 0;

ALTER TABLE IF EXISTS public.product_variation_sizes
  ADD COLUMN IF NOT EXISTS price_modifier numeric NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.variation_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  display_order integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.variation_presets
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.variation_preset_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preset_id uuid NOT NULL REFERENCES public.variation_presets(id) ON DELETE CASCADE,
  name text NOT NULL,
  color_hex text,
  image_url text,
  display_order integer NOT NULL DEFAULT 0,
  price_modifier numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.variation_preset_items
  ADD COLUMN IF NOT EXISTS color_hex text,
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_modifier numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.variation_preset_sizes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preset_id uuid NOT NULL REFERENCES public.variation_presets(id) ON DELETE CASCADE,
  size_label text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  price_modifier numeric NOT NULL DEFAULT 0,
  default_stock integer NOT NULL DEFAULT 10,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.variation_preset_sizes
  ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_modifier numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS default_stock integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- Converte presets antigos (lista de textos) para itens com default zero.
UPDATE public.size_presets AS preset
SET items = converted.items
FROM (
  SELECT sp.id,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'label', entry.value,
          'defaultPriceAdjustment', 0,
          'displayOrder', entry.ordinality - 1
        ) ORDER BY entry.ordinality
      ) FILTER (WHERE entry.value IS NOT NULL),
      '[]'::jsonb
    ) AS items
  FROM public.size_presets sp
  LEFT JOIN LATERAL jsonb_array_elements_text(
    CASE WHEN jsonb_typeof(sp.sizes) = 'array' THEN sp.sizes ELSE '[]'::jsonb END
  ) WITH ORDINALITY AS entry(value, ordinality) ON true
  GROUP BY sp.id
) AS converted
WHERE preset.id = converted.id
  AND (preset.items IS NULL OR preset.items = '[]'::jsonb);

CREATE INDEX IF NOT EXISTS idx_variation_presets_order
  ON public.variation_presets(display_order, name);
CREATE INDEX IF NOT EXISTS idx_variation_preset_items_order
  ON public.variation_preset_items(preset_id, display_order);
CREATE INDEX IF NOT EXISTS idx_variation_preset_sizes_order
  ON public.variation_preset_sizes(preset_id, display_order);
CREATE INDEX IF NOT EXISTS idx_variation_preset_items_normalized_name
  ON public.variation_preset_items(preset_id, lower(trim(name)));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.variation_presets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.variation_preset_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.variation_preset_sizes TO authenticated;
GRANT ALL ON public.variation_presets, public.variation_preset_items, public.variation_preset_sizes TO service_role;
GRANT SELECT ON public.size_presets TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.size_presets TO authenticated;
GRANT ALL ON public.size_presets TO service_role;

ALTER TABLE public.variation_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.variation_preset_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.variation_preset_sizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.size_presets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view size presets" ON public.size_presets;
CREATE POLICY "Anyone can view size presets"
  ON public.size_presets FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins manage size presets" ON public.size_presets;
DROP POLICY IF EXISTS "Admins can manage size presets" ON public.size_presets;
CREATE POLICY "Admins manage size presets"
  ON public.size_presets FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins manage variation presets" ON public.variation_presets;
CREATE POLICY "Admins manage variation presets"
  ON public.variation_presets FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins manage variation preset items" ON public.variation_preset_items;
CREATE POLICY "Admins manage variation preset items"
  ON public.variation_preset_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins manage variation preset sizes" ON public.variation_preset_sizes;
CREATE POLICY "Admins manage variation preset sizes"
  ON public.variation_preset_sizes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

COMMENT ON COLUMN public.size_presets.items IS
  'Itens ordenados no formato {label, defaultPriceAdjustment, displayOrder}. Presets antigos mantêm sizes para compatibilidade.';
COMMENT ON COLUMN public.variation_preset_items.price_modifier IS
  'Acréscimo padrão copiado para a variação ao aplicar o preset.';
