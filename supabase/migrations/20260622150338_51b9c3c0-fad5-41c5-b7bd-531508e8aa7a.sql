
CREATE TABLE IF NOT EXISTS public.size_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sizes jsonb NOT NULL DEFAULT '[]'::jsonb,
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.size_presets TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.size_presets TO authenticated;
GRANT ALL ON public.size_presets TO service_role;

ALTER TABLE public.size_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view size presets"
  ON public.size_presets FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage size presets"
  ON public.size_presets FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_size_presets_updated_at
  BEFORE UPDATE ON public.size_presets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed defaults
INSERT INTO public.size_presets (name, sizes, display_order) VALUES
  ('PP-GGG', '["PP","P","M","G","GG","GGG"]'::jsonb, 0),
  ('EU S-3XL', '["S","M","L","XL","2XL","3XL"]'::jsonb, 1),
  ('Numeração 36-46', '["36","38","40","42","44","46"]'::jsonb, 2),
  ('Numeração 34-44', '["34","36","38","40","42","44"]'::jsonb, 3),
  ('Único', '["Único"]'::jsonb, 4)
ON CONFLICT (name) DO NOTHING;
