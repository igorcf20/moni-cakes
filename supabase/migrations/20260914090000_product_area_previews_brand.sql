-- Execute manualmente no SQL Editor do Supabase antes de publicar o frontend.
-- Cada área pertence a um produto; preços e imagens nunca são partilhados implicitamente.
ALTER TABLE public.product_print_areas
  ADD COLUMN IF NOT EXISTS preview_image_url text,
  ADD COLUMN IF NOT EXISTS observation_required boolean NOT NULL DEFAULT false;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_print_areas_nonnegative_price') THEN
    ALTER TABLE public.product_print_areas ADD CONSTRAINT product_print_areas_nonnegative_price
      CHECK (base_price >= 0 AND min_price >= 0 AND (price_per_cm2 IS NULL OR price_per_cm2 >= 0)) NOT VALID;
  END IF;
END $$;

-- Atualiza apenas as imagens das áreas de demonstração existentes. Nomes e preços
-- já modificados pelo administrador permanecem intactos.
UPDATE public.product_print_areas AS a SET preview_image_url = v.image_url
FROM (VALUES
  ('bml-tshirt-navy', 'front', '/personalization-areas/tshirt-front-center.png'),
  ('bml-tshirt-navy', 'back', '/personalization-areas/tshirt-back-center.png'),
  ('bml-tshirt-navy', 'left_sleeve', '/personalization-areas/tshirt-left-sleeve.png'),
  ('bml-caneca-preta-350', 'wrap', '/personalization-areas/mug-wrap.png')
) AS v(product_id, key, image_url)
WHERE a.product_id = v.product_id AND a.key = v.key
  AND (a.preview_image_url IS NULL OR a.preview_image_url = '');

-- Nos dados de exemplo, a frente/envolvente eram obrigatórias. Tornamo-las
-- opcionais para o cliente poder escolher só uma posição diferente. A
-- condição de nome/preço protege configurações já personalizadas pelo painel.
UPDATE public.product_print_areas SET required = false
WHERE (product_id = 'bml-tshirt-navy' AND key = 'front' AND label = 'Frente do peito' AND base_price = 4.50)
   OR (product_id = 'bml-caneca-preta-350' AND key = 'wrap' AND label = 'Área envolvente' AND base_price = 3.00);

UPDATE public.product_print_areas SET label = 'Meio das costas'
WHERE product_id = 'bml-tshirt-navy' AND key = 'back' AND label = 'Costas';

-- Novas posições para a t-shirt e caneca da amostra. Valores iniciais são
-- editáveis por produto no painel e não são reaplicados após a criação.
INSERT INTO public.product_print_areas
  (product_id, key, label, description, preview_image_url, max_width_cm, max_height_cm,
   area_width_cm, area_height_cm, pricing_mode, base_price, price_per_cm2, min_price,
   allowed_techniques, default_technique, display_order, required, is_active, observation_required)
SELECT p.id, v.key, v.label, v.description, v.image_url, v.width_cm, v.height_cm,
       v.width_cm, v.height_cm, 'flat', v.addon, NULL, 0,
       v.techniques, v.default_technique, v.sort_order, false, true, v.observation_required
FROM (VALUES
  ('bml-tshirt-navy', 'chest_right', 'Peito à direita', 'Lado direito de quem veste.', '/personalization-areas/tshirt-chest-right.png', 12::numeric, 12::numeric, 3.00::numeric, ARRAY['dtf','bordado'], 'dtf', 3, false),
  ('bml-tshirt-navy', 'chest_left', 'Peito à esquerda', 'Lado esquerdo de quem veste.', '/personalization-areas/tshirt-chest-left.png', 12::numeric, 12::numeric, 3.00::numeric, ARRAY['dtf','bordado'], 'dtf', 4, false),
  ('bml-tshirt-navy', 'back_lower', 'Costas — parte inferior', 'Zona inferior das costas.', '/personalization-areas/tshirt-back-lower.png', 28::numeric, 12::numeric, 3.50::numeric, ARRAY['dtf','serigrafia'], 'dtf', 5, false),
  ('bml-tshirt-navy', 'custom', 'Área personalizada', 'Descreva a localização pretendida nas observações.', '/personalization-areas/tshirt-custom.png', 30::numeric, 40::numeric, 5.00::numeric, ARRAY['dtf','serigrafia','bordado'], 'dtf', 6, true),
  ('bml-caneca-preta-350', 'front', 'Frente da caneca', 'Face oposta à asa.', '/personalization-areas/mug-front.png', 9::numeric, 8::numeric, 2.50::numeric, ARRAY['sublimacao','dtf_uv'], 'sublimacao', 1, false),
  ('bml-caneca-preta-350', 'back', 'Verso da caneca', 'Face junto à asa.', '/personalization-areas/mug-back.png', 9::numeric, 8::numeric, 2.50::numeric, ARRAY['sublimacao','dtf_uv'], 'sublimacao', 2, false)
) AS v(product_id, key, label, description, image_url, width_cm, height_cm, addon, techniques, default_technique, sort_order, observation_required)
JOIN public.products p ON p.id = v.product_id AND p.customizable = true
WHERE true
ON CONFLICT (product_id, key) DO NOTHING;

-- A marca continua configurável no painel; a migração define somente o novo
-- valor inicial solicitado. Um upload futuro no painel pode substituí-lo.
UPDATE public.store_settings
SET value = jsonb_set(COALESCE(value::jsonb, '{}'::jsonb), '{logo_url}', '"/brand-logo.png"'::jsonb, true),
    updated_at = now()
WHERE key = 'visual_settings';

UPDATE public.store_settings
SET value = jsonb_set(COALESCE(value::jsonb, '{}'::jsonb), '{favicon_url}', '"/favicon.png"'::jsonb, true),
    updated_at = now()
WHERE key = 'seo_settings';
