
-- Multi-area customization tables

CREATE TABLE IF NOT EXISTS public.product_print_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id text NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  key text NOT NULL,
  label text NOT NULL,
  max_width_cm numeric NOT NULL CHECK (max_width_cm > 0),
  max_height_cm numeric NOT NULL CHECK (max_height_cm > 0),
  base_price numeric NOT NULL DEFAULT 0,
  price_per_cm2 numeric,
  allowed_techniques text[] NOT NULL DEFAULT ARRAY['dtf'],
  default_technique text,
  preview_anchor jsonb NOT NULL DEFAULT '{}'::jsonb,
  display_order int NOT NULL DEFAULT 0,
  required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, key)
);

GRANT SELECT ON public.product_print_areas TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.product_print_areas TO authenticated;
GRANT ALL ON public.product_print_areas TO service_role;

ALTER TABLE public.product_print_areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read print areas"
  ON public.product_print_areas FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Admins manage print areas"
  ON public.product_print_areas FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_product_print_areas_updated
  BEFORE UPDATE ON public.product_print_areas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


CREATE TABLE IF NOT EXISTS public.product_3d_models (
  product_id text PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  model_kind text NOT NULL DEFAULT 'tshirt', -- tshirt | mug | tote | backpack | sticker | box
  base_color text NOT NULL DEFAULT '#0F172A',
  camera_preset jsonb NOT NULL DEFAULT '{}'::jsonb,
  spots_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  model_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.product_3d_models TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.product_3d_models TO authenticated;
GRANT ALL ON public.product_3d_models TO service_role;

ALTER TABLE public.product_3d_models ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read 3d models"
  ON public.product_3d_models FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Admins manage 3d models"
  ON public.product_3d_models FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_product_3d_models_updated
  BEFORE UPDATE ON public.product_3d_models
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ============= SEEDS =============
-- T-shirt Navy: frente, costas, manga
INSERT INTO public.product_print_areas (product_id, key, label, max_width_cm, max_height_cm, base_price, price_per_cm2, allowed_techniques, default_technique, preview_anchor, display_order, required)
VALUES
  ('bml-tshirt-navy', 'front',       'Frente do peito',   30, 40, 4.50, 0.010, ARRAY['dtf','serigrafia','sublimacao'], 'dtf',       '{"x":0,"y":0.15,"z":0.06,"rot":0,"scale":0.35}'::jsonb, 0, true),
  ('bml-tshirt-navy', 'back',        'Costas',            30, 40, 4.50, 0.010, ARRAY['dtf','serigrafia'],              'dtf',       '{"x":0,"y":0.15,"z":-0.06,"rot":3.1416,"scale":0.35}'::jsonb, 1, false),
  ('bml-tshirt-navy', 'left_sleeve', 'Manga esquerda',     8,  8, 2.50, 0.020, ARRAY['dtf','bordado'],                  'bordado',   '{"x":-0.28,"y":0.28,"z":0,"rot":0,"scale":0.08}'::jsonb, 2, false),

-- Caneca 350ml: wrap único
  ('bml-caneca-preta-350', 'wrap',   'Área envolvente',   20,  8, 3.00, 0.015, ARRAY['sublimacao','laser'],             'sublimacao','{"x":0,"y":0,"z":0.06,"rot":0,"scale":0.5}'::jsonb, 0, true),

-- Tote bag: frente e costas
  ('bml-tote-natural', 'front',      'Frente',            25, 25, 3.50, 0.008, ARRAY['dtf','serigrafia'],               'serigrafia','{"x":0,"y":0,"z":0.02,"rot":0,"scale":0.4}'::jsonb, 0, true),
  ('bml-tote-natural', 'back',       'Verso',             25, 25, 3.50, 0.008, ARRAY['dtf','serigrafia'],               'serigrafia','{"x":0,"y":0,"z":-0.02,"rot":3.1416,"scale":0.4}'::jsonb, 1, false),

-- Mochila: bolso frontal
  ('bml-mochila-preta', 'front',     'Bolso frontal',     18, 12, 5.00, 0.020, ARRAY['bordado','dtf'],                  'bordado',   '{"x":0,"y":0,"z":0.05,"rot":0,"scale":0.3}'::jsonb, 0, true),

-- Autocolantes: uma área folha inteira
  ('bml-autocolantes-circulares', 'sheet', 'Arte do autocolante', 30, 30, 0, 0.020, ARRAY['vinil','uv'],                  'vinil',     '{}'::jsonb, 0, true),

-- Kit corporativo: dois brindes personalizáveis
  ('bml-kit-corporativo', 'mug_wrap', 'Caneca — envolvente', 20,  8, 3.00, 0.015, ARRAY['sublimacao'],                    'sublimacao','{}'::jsonb, 0, true),
  ('bml-kit-corporativo', 'notebook_cover', 'Caderno — capa', 12, 18, 4.00, 0.012, ARRAY['laser','uv'],                    'laser',     '{}'::jsonb, 1, true)
ON CONFLICT (product_id, key) DO NOTHING;

-- 3D model kinds per product
INSERT INTO public.product_3d_models (product_id, model_kind, base_color, camera_preset)
VALUES
  ('bml-tshirt-navy',              'tshirt',   '#001A33', '{"pos":[0,0.2,1.6],"target":[0,0.1,0]}'::jsonb),
  ('bml-caneca-preta-350',         'mug',      '#0A0A0A', '{"pos":[0,0.1,1.4],"target":[0,0,0]}'::jsonb),
  ('bml-tote-natural',             'tote',     '#EFE7D6', '{"pos":[0,0.1,1.5],"target":[0,0,0]}'::jsonb),
  ('bml-mochila-preta',            'backpack', '#101010', '{"pos":[0,0.1,1.7],"target":[0,0,0]}'::jsonb),
  ('bml-autocolantes-circulares',  'sticker',  '#FFFFFF', '{"pos":[0,0.6,1.2],"target":[0,0,0]}'::jsonb),
  ('bml-kit-corporativo',          'box',      '#0057B8', '{"pos":[0.6,0.6,1.5],"target":[0,0,0]}'::jsonb)
ON CONFLICT (product_id) DO NOTHING;
