
-- 1) Add price_modifier to product_sizes
ALTER TABLE public.product_sizes ADD COLUMN IF NOT EXISTS price_modifier numeric NOT NULL DEFAULT 0;

-- 2) Matrix table for color x size availability
CREATE TABLE IF NOT EXISTS public.product_variation_size_availability (
  variation_id uuid NOT NULL REFERENCES public.product_variations(id) ON DELETE CASCADE,
  product_size_id uuid NOT NULL REFERENCES public.product_sizes(id) ON DELETE CASCADE,
  is_available boolean NOT NULL DEFAULT true,
  stock_quantity integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (variation_id, product_size_id)
);

GRANT SELECT ON public.product_variation_size_availability TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_variation_size_availability TO authenticated;
GRANT ALL ON public.product_variation_size_availability TO service_role;

ALTER TABLE public.product_variation_size_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read variation size availability"
  ON public.product_variation_size_availability FOR SELECT
  USING (true);

CREATE POLICY "Admins manage variation size availability"
  ON public.product_variation_size_availability FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER set_pvs_avail_updated_at
  BEFORE UPDATE ON public.product_variation_size_availability
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Backfill from old product_variation_sizes: ensure product_sizes row exists per (product, size_label), then add availability rows.
INSERT INTO public.product_sizes (product_id, size_label, stock_quantity, display_order, is_active)
SELECT DISTINCT pv.product_id, pvs.size_label, 0, pvs.display_order, true
FROM public.product_variation_sizes pvs
JOIN public.product_variations pv ON pv.id = pvs.variation_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.product_sizes ps
  WHERE ps.product_id = pv.product_id AND ps.size_label = pvs.size_label
);

INSERT INTO public.product_variation_size_availability (variation_id, product_size_id, is_available, stock_quantity)
SELECT pvs.variation_id, ps.id, pvs.is_active, pvs.stock_quantity
FROM public.product_variation_sizes pvs
JOIN public.product_variations pv ON pv.id = pvs.variation_id
JOIN public.product_sizes ps ON ps.product_id = pv.product_id AND ps.size_label = pvs.size_label
ON CONFLICT (variation_id, product_size_id) DO NOTHING;
