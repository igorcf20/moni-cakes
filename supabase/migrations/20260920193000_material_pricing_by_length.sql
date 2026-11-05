-- Permite cobrar cada material por valor fixo ou por metro linear.
-- Pode ser executada mesmo se a migration anterior já tiver sido aplicada.

ALTER TABLE public.customization_technique_preset_materials
  ADD COLUMN IF NOT EXISTS pricing_mode text NOT NULL DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS price_per_meter numeric(12,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS calculation_dimension text NOT NULL DEFAULT 'height';

ALTER TABLE public.product_print_area_technique_materials
  ADD COLUMN IF NOT EXISTS pricing_mode text NOT NULL DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS price_per_meter numeric(12,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS calculation_dimension text NOT NULL DEFAULT 'height';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customization_preset_material_pricing_mode_check') THEN
    ALTER TABLE public.customization_technique_preset_materials ADD CONSTRAINT customization_preset_material_pricing_mode_check CHECK (pricing_mode IN ('fixed', 'per_linear_meter'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customization_preset_material_price_per_meter_check') THEN
    ALTER TABLE public.customization_technique_preset_materials ADD CONSTRAINT customization_preset_material_price_per_meter_check CHECK (price_per_meter >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customization_preset_material_dimension_check') THEN
    ALTER TABLE public.customization_technique_preset_materials ADD CONSTRAINT customization_preset_material_dimension_check CHECK (calculation_dimension IN ('width', 'height', 'longest_side'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_area_material_pricing_mode_check') THEN
    ALTER TABLE public.product_print_area_technique_materials ADD CONSTRAINT product_area_material_pricing_mode_check CHECK (pricing_mode IN ('fixed', 'per_linear_meter'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_area_material_price_per_meter_check') THEN
    ALTER TABLE public.product_print_area_technique_materials ADD CONSTRAINT product_area_material_price_per_meter_check CHECK (price_per_meter >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_area_material_dimension_check') THEN
    ALTER TABLE public.product_print_area_technique_materials ADD CONSTRAINT product_area_material_dimension_check CHECK (calculation_dimension IN ('width', 'height', 'longest_side'));
  END IF;
END $$;
