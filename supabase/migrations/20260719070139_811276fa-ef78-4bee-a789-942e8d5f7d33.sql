
-- 1) Extend product_3d_models
ALTER TABLE public.product_3d_models
  ADD COLUMN IF NOT EXISTS original_model_url text,
  ADD COLUMN IF NOT EXISTS optimized_model_url text,
  ADD COLUMN IF NOT EXISTS fallback_image_url text,
  ADD COLUMN IF NOT EXISTS original_file_size bigint,
  ADD COLUMN IF NOT EXISTS optimized_file_size bigint,
  ADD COLUMN IF NOT EXISTS compression_ratio numeric,
  ADD COLUMN IF NOT EXISTS optimization_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS optimization_error text,
  ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true;

-- 2) Extend product_print_areas
ALTER TABLE public.product_print_areas
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS area_width_cm numeric,
  ADD COLUMN IF NOT EXISTS area_height_cm numeric,
  ADD COLUMN IF NOT EXISTS pricing_mode text NOT NULL DEFAULT 'flat',
  ADD COLUMN IF NOT EXISTS min_price numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS position_x numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS position_y numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS position_z numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rotation_x numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rotation_y numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rotation_z numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS visual_area_width numeric NOT NULL DEFAULT 0.4,
  ADD COLUMN IF NOT EXISTS visual_area_height numeric NOT NULL DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS scale numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS min_scale numeric NOT NULL DEFAULT 0.2,
  ADD COLUMN IF NOT EXISTS max_scale numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS drag_min_x numeric NOT NULL DEFAULT -1,
  ADD COLUMN IF NOT EXISTS drag_max_x numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS drag_min_y numeric NOT NULL DEFAULT -1,
  ADD COLUMN IF NOT EXISTS drag_max_y numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS keep_aspect_ratio_default boolean NOT NULL DEFAULT true;

-- Migrate existing rows: derive area_width/height from max_width/height when null
UPDATE public.product_print_areas
   SET area_width_cm = COALESCE(area_width_cm, max_width_cm),
       area_height_cm = COALESCE(area_height_cm, max_height_cm);

ALTER TABLE public.product_print_areas
  ALTER COLUMN area_width_cm SET NOT NULL,
  ALTER COLUMN area_height_cm SET NOT NULL;

-- Constraint on pricing_mode
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'product_print_areas_pricing_mode_chk'
  ) THEN
    ALTER TABLE public.product_print_areas
      ADD CONSTRAINT product_print_areas_pricing_mode_chk
      CHECK (pricing_mode IN ('flat','per_cm2'));
  END IF;
END $$;

-- 3) product_colors
CREATE TABLE IF NOT EXISTS public.product_colors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id text NOT NULL,
  name text NOT NULL,
  hex text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_colors_product_id_idx ON public.product_colors(product_id);

GRANT SELECT ON public.product_colors TO anon, authenticated;
GRANT ALL ON public.product_colors TO service_role;

ALTER TABLE public.product_colors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read product colors" ON public.product_colors;
CREATE POLICY "Public can read product colors" ON public.product_colors
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage product colors" ON public.product_colors;
CREATE POLICY "Admins manage product colors" ON public.product_colors
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS trg_product_colors_updated_at ON public.product_colors;
CREATE TRIGGER trg_product_colors_updated_at
BEFORE UPDATE ON public.product_colors
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Ensure admin manage policies exist on product_print_areas and product_3d_models
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='product_print_areas'
      AND policyname='Admins manage print areas'
  ) THEN
    EXECUTE $p$CREATE POLICY "Admins manage print areas" ON public.product_print_areas
      FOR ALL TO authenticated
      USING (public.has_role(auth.uid(), 'admin'::app_role))
      WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role))$p$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='product_3d_models'
      AND policyname='Admins manage 3d models'
  ) THEN
    EXECUTE $p$CREATE POLICY "Admins manage 3d models" ON public.product_3d_models
      FOR ALL TO authenticated
      USING (public.has_role(auth.uid(), 'admin'::app_role))
      WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role))$p$;
  END IF;
END $$;
