-- Catálogo editável de métodos de estampagem (DTF, serigrafia, bordado, ...).
-- Substitui a lista fixa no código: o administrador cria, edita e elimina métodos.
-- LOJA 3D: sem BEGIN/COMMIT explícitos; o deploy/migrate.sh já corre cada ficheiro numa transação.

CREATE TABLE IF NOT EXISTS public.print_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE CHECK (key ~ '^[a-z0-9_]+$'),
  label text NOT NULL CHECK (length(btrim(label)) > 0),
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.print_methods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read print methods" ON public.print_methods;
CREATE POLICY "Anyone can read print methods" ON public.print_methods FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage print methods" ON public.print_methods;
CREATE POLICY "Admins manage print methods" ON public.print_methods FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.print_methods (key, label, display_order) VALUES
  ('dtf', 'DTF', 0),
  ('serigrafia', 'Serigrafia', 1),
  ('bordado', 'Bordado', 2),
  ('dtf_uv', 'DTF UV', 3),
  ('sublimacao', 'Sublimação', 4),
  ('gravacao_laser', 'Gravação a laser', 5),
  ('vinil', 'Vinil termocolante', 6)
ON CONFLICT (key) DO NOTHING;

-- Os métodos passam a ser dinâmicos: remove a lista fechada dos presets.
ALTER TABLE public.customization_technique_presets
  DROP CONSTRAINT IF EXISTS customization_technique_presets_technique_check;

-- Uniformiza chaves antigas ('laser' -> 'gravacao_laser', 'uv' -> 'dtf_uv').
UPDATE public.product_print_areas SET
  allowed_techniques = array_replace(array_replace(allowed_techniques, 'laser', 'gravacao_laser'), 'uv', 'dtf_uv'),
  default_technique = CASE default_technique WHEN 'laser' THEN 'gravacao_laser' WHEN 'uv' THEN 'dtf_uv' ELSE default_technique END
WHERE allowed_techniques && ARRAY['laser', 'uv'] OR default_technique IN ('laser', 'uv');

UPDATE public.product_print_area_techniques t SET technique = 'gravacao_laser'
WHERE technique = 'laser' AND NOT EXISTS (
  SELECT 1 FROM public.product_print_area_techniques o WHERE o.print_area_id = t.print_area_id AND o.technique = 'gravacao_laser');
UPDATE public.product_print_area_techniques t SET technique = 'dtf_uv'
WHERE technique = 'uv' AND NOT EXISTS (
  SELECT 1 FROM public.product_print_area_techniques o WHERE o.print_area_id = t.print_area_id AND o.technique = 'dtf_uv');

