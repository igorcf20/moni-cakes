-- Biblioteca administrativa independente. Não modifica áreas ou preços existentes.
-- LOJA 3D: sem BEGIN/COMMIT explícitos; o deploy/migrate.sh já corre cada ficheiro numa transação.
CREATE TABLE IF NOT EXISTS public.customization_area_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  items jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(items) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.customization_area_presets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage area presets" ON public.customization_area_presets;
CREATE POLICY "Admins manage area presets"
ON public.customization_area_presets FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customization_area_presets TO authenticated;

