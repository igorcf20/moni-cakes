
-- 1. price_modifier per size
ALTER TABLE public.product_variation_sizes
  ADD COLUMN IF NOT EXISTS price_modifier numeric NOT NULL DEFAULT 0;

-- 2. order_designs: keep preview only flag (after shipped cleanup)
ALTER TABLE public.order_designs
  ADD COLUMN IF NOT EXISTS keep_preview_only boolean NOT NULL DEFAULT false;

-- 3. Trigger: when status changes to 'shipped', schedule cleanup for 24h
CREATE OR REPLACE FUNCTION public.schedule_design_cleanup_on_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- delivered/completed -> hard delete in 5 days (existing behavior)
  IF NEW.status IN ('delivered','completed') AND COALESCE(OLD.status,'') NOT IN ('delivered','completed') THEN
    UPDATE public.order_designs
      SET delete_after = now() + interval '5 days'
      WHERE order_id = NEW.id AND deleted_at IS NULL AND delete_after IS NULL;
  ELSIF NEW.status NOT IN ('delivered','completed','shipped') AND COALESCE(OLD.status,'') IN ('delivered','completed') THEN
    UPDATE public.order_designs
      SET delete_after = NULL
      WHERE order_id = NEW.id AND deleted_at IS NULL;
  END IF;

  -- shipped -> keep preview only after 24h
  IF NEW.status = 'shipped' AND COALESCE(OLD.status,'') <> 'shipped' THEN
    UPDATE public.order_designs
      SET delete_after = now() + interval '24 hours',
          keep_preview_only = true
      WHERE order_id = NEW.id AND deleted_at IS NULL;
  ELSIF COALESCE(OLD.status,'') = 'shipped' AND NEW.status NOT IN ('shipped','delivered','completed') THEN
    UPDATE public.order_designs
      SET delete_after = NULL,
          keep_preview_only = false
      WHERE order_id = NEW.id AND deleted_at IS NULL;
  END IF;

  RETURN NEW;
END;
$function$;

-- 4. Variation Presets tables
CREATE TABLE IF NOT EXISTS public.variation_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.variation_presets TO authenticated;
GRANT ALL ON public.variation_presets TO service_role;
ALTER TABLE public.variation_presets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage variation presets" ON public.variation_presets;
CREATE POLICY "Admins manage variation presets"
  ON public.variation_presets FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

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
CREATE INDEX IF NOT EXISTS idx_vpi_preset ON public.variation_preset_items(preset_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.variation_preset_items TO authenticated;
GRANT ALL ON public.variation_preset_items TO service_role;
ALTER TABLE public.variation_preset_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage variation preset items" ON public.variation_preset_items;
CREATE POLICY "Admins manage variation preset items"
  ON public.variation_preset_items FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.variation_preset_sizes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preset_id uuid NOT NULL REFERENCES public.variation_presets(id) ON DELETE CASCADE,
  size_label text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  price_modifier numeric NOT NULL DEFAULT 0,
  default_stock integer NOT NULL DEFAULT 10,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vps_preset ON public.variation_preset_sizes(preset_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.variation_preset_sizes TO authenticated;
GRANT ALL ON public.variation_preset_sizes TO service_role;
ALTER TABLE public.variation_preset_sizes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage variation preset sizes" ON public.variation_preset_sizes;
CREATE POLICY "Admins manage variation preset sizes"
  ON public.variation_preset_sizes FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
