
-- 1. material_tags catalog
CREATE TABLE IF NOT EXISTS public.material_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  label text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.material_tags TO anon, authenticated;
GRANT ALL ON public.material_tags TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.material_tags TO authenticated;

ALTER TABLE public.material_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "material_tags public read"
  ON public.material_tags FOR SELECT
  USING (true);

CREATE POLICY "material_tags admin write"
  ON public.material_tags FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_material_tags_updated_at
BEFORE UPDATE ON public.material_tags
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Seed defaults
INSERT INTO public.material_tags (slug, label, display_order) VALUES
  ('algodao-100', '100% Algodão', 10),
  ('algodao-155', 'Algodão 155 g/m²', 20),
  ('algodao-165', 'Algodão 165 g/m²', 30),
  ('algodao-180', 'Algodão 180 g/m²', 40),
  ('poliester', 'Poliéster', 50),
  ('algodao-viscosa', 'Algodão / Viscosa', 60),
  ('canelado', 'Canelado 1x1', 70),
  ('felpa', 'Felpa', 80)
ON CONFLICT (slug) DO NOTHING;

-- 3. Backfill products.materials from the free-text "material" description
UPDATE public.products p
SET materials = ARRAY(
  SELECT unnest FROM unnest(ARRAY[
    CASE WHEN p.material ILIKE '%100%%algod%' THEN 'algodao-100' END,
    CASE WHEN p.material ILIKE '%155%g%' THEN 'algodao-155' END,
    CASE WHEN p.material ILIKE '%165%g%' THEN 'algodao-165' END,
    CASE WHEN p.material ILIKE '%180%g%' THEN 'algodao-180' END,
    CASE WHEN p.material ILIKE '%poli%ster%' THEN 'poliester' END,
    CASE WHEN p.material ILIKE '%viscos%' THEN 'algodao-viscosa' END,
    CASE WHEN p.material ILIKE '%canelad%' THEN 'canelado' END,
    CASE WHEN p.material ILIKE '%felpa%' THEN 'felpa' END
  ]) WHERE unnest IS NOT NULL
)
WHERE p.material IS NOT NULL AND length(trim(p.material)) > 0
  AND (p.materials IS NULL OR array_length(p.materials, 1) IS NULL);
