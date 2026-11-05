-- Preços de personalização por técnica e materiais de bordado.
-- Seguro para bases existentes: as áreas atuais são copiadas como fallback por técnica.

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

CREATE TABLE IF NOT EXISTS public.customization_technique_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  technique text NOT NULL CHECK (technique IN ('dtf', 'serigrafia', 'bordado')),
  pricing_mode text NOT NULL DEFAULT 'flat' CHECK (pricing_mode IN ('flat', 'per_cm2')),
  base_price numeric(12,2) NOT NULL DEFAULT 0 CHECK (base_price >= 0),
  price_per_cm2 numeric(12,4) NOT NULL DEFAULT 0 CHECK (price_per_cm2 >= 0),
  min_price numeric(12,2) NOT NULL DEFAULT 0 CHECK (min_price >= 0),
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.customization_technique_preset_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preset_id uuid NOT NULL REFERENCES public.customization_technique_presets(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  default_price_adjustment numeric(12,2) NOT NULL DEFAULT 0 CHECK (default_price_adjustment >= 0),
  pricing_mode text NOT NULL DEFAULT 'fixed' CHECK (pricing_mode IN ('fixed', 'per_linear_meter')),
  price_per_meter numeric(12,4) NOT NULL DEFAULT 0 CHECK (price_per_meter >= 0),
  calculation_dimension text NOT NULL DEFAULT 'height' CHECK (calculation_dimension IN ('width', 'height', 'longest_side')),
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_print_area_techniques (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  print_area_id uuid NOT NULL REFERENCES public.product_print_areas(id) ON DELETE CASCADE,
  technique text NOT NULL,
  source_preset_id uuid REFERENCES public.customization_technique_presets(id) ON DELETE SET NULL,
  pricing_mode text NOT NULL DEFAULT 'flat' CHECK (pricing_mode IN ('flat', 'per_cm2')),
  base_price numeric(12,2) NOT NULL DEFAULT 0 CHECK (base_price >= 0),
  price_per_cm2 numeric(12,4) NOT NULL DEFAULT 0 CHECK (price_per_cm2 >= 0),
  min_price numeric(12,2) NOT NULL DEFAULT 0 CHECK (min_price >= 0),
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (print_area_id, technique)
);

CREATE TABLE IF NOT EXISTS public.product_print_area_technique_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area_technique_id uuid NOT NULL REFERENCES public.product_print_area_techniques(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  price_adjustment numeric(12,2) NOT NULL DEFAULT 0 CHECK (price_adjustment >= 0),
  pricing_mode text NOT NULL DEFAULT 'fixed' CHECK (pricing_mode IN ('fixed', 'per_linear_meter')),
  price_per_meter numeric(12,4) NOT NULL DEFAULT 0 CHECK (price_per_meter >= 0),
  calculation_dimension text NOT NULL DEFAULT 'height' CHECK (calculation_dimension IN ('width', 'height', 'longest_side')),
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS customization_preset_material_name_unique
  ON public.customization_technique_preset_materials (preset_id, lower(btrim(name)));
CREATE UNIQUE INDEX IF NOT EXISTS product_area_technique_material_name_unique
  ON public.product_print_area_technique_materials (area_technique_id, lower(btrim(name)));
CREATE INDEX IF NOT EXISTS product_area_techniques_area_idx
  ON public.product_print_area_techniques (print_area_id, display_order);

-- Preserva o preço anteriormente configurado na área como regra inicial de cada técnica.
INSERT INTO public.product_print_area_techniques (
  print_area_id, technique, pricing_mode, base_price, price_per_cm2, min_price, display_order
)
SELECT
  area.id,
  technique.value,
  area.pricing_mode,
  COALESCE(area.base_price, 0),
  COALESCE(area.price_per_cm2, 0),
  COALESCE(area.min_price, 0),
  technique.ordinality - 1
FROM public.product_print_areas area
CROSS JOIN LATERAL unnest(
  CASE
    WHEN COALESCE(cardinality(area.allowed_techniques), 0) = 0 THEN ARRAY[COALESCE(area.default_technique, 'dtf')]
    ELSE area.allowed_techniques
  END
) WITH ORDINALITY AS technique(value, ordinality)
WHERE technique.value IS NOT NULL AND length(btrim(technique.value)) > 0
ON CONFLICT (print_area_id, technique) DO NOTHING;

ALTER TABLE public.customization_technique_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customization_technique_preset_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_print_area_techniques ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_print_area_technique_materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage customization technique presets" ON public.customization_technique_presets;
CREATE POLICY "Admins manage customization technique presets"
  ON public.customization_technique_presets FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins manage customization preset materials" ON public.customization_technique_preset_materials;
CREATE POLICY "Admins manage customization preset materials"
  ON public.customization_technique_preset_materials FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Public reads active area techniques" ON public.product_print_area_techniques;
CREATE POLICY "Public reads active area techniques"
  ON public.product_print_area_techniques FOR SELECT TO anon, authenticated
  USING (is_active = true);
DROP POLICY IF EXISTS "Admins manage area techniques" ON public.product_print_area_techniques;
CREATE POLICY "Admins manage area techniques"
  ON public.product_print_area_techniques FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Public reads active area technique materials" ON public.product_print_area_technique_materials;
CREATE POLICY "Public reads active area technique materials"
  ON public.product_print_area_technique_materials FOR SELECT TO anon, authenticated
  USING (is_active = true);
DROP POLICY IF EXISTS "Admins manage area technique materials" ON public.product_print_area_technique_materials;
CREATE POLICY "Admins manage area technique materials"
  ON public.product_print_area_technique_materials FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'customization_technique_presets',
    'customization_technique_preset_materials',
    'product_print_area_techniques',
    'product_print_area_technique_materials'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'set_' || table_name || '_updated_at', table_name);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()',
      'set_' || table_name || '_updated_at', table_name
    );
  END LOOP;
END $$;
