-- Reparação idempotente da gestão de variações e do Viva Smart Checkout.
-- Seguro após uma execução parcial de 20260920073000_admin_variation_presets_complete.sql.

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

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

CREATE INDEX IF NOT EXISTS idx_variation_presets_order ON public.variation_presets(display_order, name);
CREATE INDEX IF NOT EXISTS idx_variation_preset_items_order ON public.variation_preset_items(preset_id, display_order);
CREATE INDEX IF NOT EXISTS idx_variation_preset_sizes_order ON public.variation_preset_sizes(preset_id, display_order);
CREATE INDEX IF NOT EXISTS idx_variation_preset_items_normalized_name ON public.variation_preset_items(preset_id, lower(trim(name)));

GRANT SELECT ON public.size_presets TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.size_presets TO authenticated;
GRANT ALL ON public.size_presets TO service_role;
GRANT SELECT ON public.product_variation_size_availability TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_variation_size_availability TO authenticated;
GRANT ALL ON public.product_variation_size_availability TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.variation_presets, public.variation_preset_items, public.variation_preset_sizes TO authenticated;
GRANT ALL ON public.variation_presets, public.variation_preset_items, public.variation_preset_sizes TO service_role;

ALTER TABLE public.size_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variation_size_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.variation_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.variation_preset_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.variation_preset_sizes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view size presets" ON public.size_presets;
CREATE POLICY "Anyone can view size presets" ON public.size_presets FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins manage size presets" ON public.size_presets;
DROP POLICY IF EXISTS "Admins can manage size presets" ON public.size_presets;
CREATE POLICY "Admins manage size presets" ON public.size_presets FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Public can read variation size availability" ON public.product_variation_size_availability;
CREATE POLICY "Public can read variation size availability" ON public.product_variation_size_availability FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins manage variation size availability" ON public.product_variation_size_availability;
CREATE POLICY "Admins manage variation size availability" ON public.product_variation_size_availability FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins manage variation presets" ON public.variation_presets;
CREATE POLICY "Admins manage variation presets" ON public.variation_presets FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins manage variation preset items" ON public.variation_preset_items;
CREATE POLICY "Admins manage variation preset items" ON public.variation_preset_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins manage variation preset sizes" ON public.variation_preset_sizes;
CREATE POLICY "Admins manage variation preset sizes" ON public.variation_preset_sizes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS trg_size_presets_updated_at ON public.size_presets;
CREATE TRIGGER trg_size_presets_updated_at BEFORE UPDATE ON public.size_presets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS set_pvs_avail_updated_at ON public.product_variation_size_availability;
CREATE TRIGGER set_pvs_avail_updated_at BEFORE UPDATE ON public.product_variation_size_availability
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auditoria do Smart Checkout e confirmação pelo UUID da transação Viva.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS category_display_order integer,
  ADD COLUMN IF NOT EXISTS featured_display_order integer;
UPDATE public.products
SET category_display_order = COALESCE(category_display_order, display_order),
    featured_display_order = CASE
      WHEN is_featured THEN COALESCE(featured_display_order, display_order)
      ELSE featured_display_order
    END;
CREATE INDEX IF NOT EXISTS idx_products_category_display_order
  ON public.products(category, category_display_order, display_order);
CREATE INDEX IF NOT EXISTS idx_products_featured_display_order
  ON public.products(featured_display_order, display_order) WHERE is_featured = true;

CREATE TABLE IF NOT EXISTS public.viva_payment_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  viva_order_code text NOT NULL,
  viva_transaction_id text,
  amount_cents integer NOT NULL,
  status text NOT NULL DEFAULT 'created',
  checkout_url text,
  failure_reason text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.viva_payment_sessions
  ADD COLUMN IF NOT EXISTS viva_transaction_id text,
  ADD COLUMN IF NOT EXISTS failure_reason text;
CREATE INDEX IF NOT EXISTS viva_sessions_order_idx ON public.viva_payment_sessions(order_id);
CREATE INDEX IF NOT EXISTS viva_sessions_code_idx ON public.viva_payment_sessions(viva_order_code);
CREATE INDEX IF NOT EXISTS viva_sessions_transaction_idx ON public.viva_payment_sessions(viva_transaction_id)
  WHERE viva_transaction_id IS NOT NULL;
GRANT ALL ON public.viva_payment_sessions TO service_role;
ALTER TABLE public.viva_payment_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Deny all" ON public.viva_payment_sessions;
CREATE POLICY "Deny all" ON public.viva_payment_sessions FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);

COMMENT ON COLUMN public.size_presets.items IS
  'Itens ordenados no formato {label, defaultPriceAdjustment, displayOrder}. Presets antigos mantêm sizes para compatibilidade.';
COMMENT ON COLUMN public.viva_payment_sessions.viva_transaction_id IS
  'UUID da transação devolvido pela Viva no parâmetro t e usado na confirmação server-side.';
