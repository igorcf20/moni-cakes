
-- 1. Limpar catálogo antigo (KodeMI Shop) — preserva utilizadores, addresses, profiles, roles, store_settings
TRUNCATE TABLE
  public.cart_items,
  public.wishlist,
  public.product_views,
  public.product_reviews,
  public.related_products,
  public.product_frame_pricing,
  public.product_variation_sizes,
  public.product_variations,
  public.product_sizes,
  public.product_images,
  public.product_categories,
  public.kit_items,
  public.kits,
  public.frame_options,
  public.banners
RESTART IDENTITY CASCADE;

DELETE FROM public.products;
DELETE FROM public.categories;

-- 2. Estender products com campos DTF
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS unit_type text NOT NULL DEFAULT 'unit',
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS short_description text,
  ADD COLUMN IF NOT EXISTS hero_image text,
  ADD COLUMN IF NOT EXISTS roll_width_cm numeric,
  ADD COLUMN IF NOT EXISTS max_length_cm numeric,
  ADD COLUMN IF NOT EXISTS min_length_m numeric,
  ADD COLUMN IF NOT EXISTS length_increment_m numeric,
  ADD COLUMN IF NOT EXISTS required_dpi integer DEFAULT 300,
  ADD COLUMN IF NOT EXISTS accepted_file_types text[] DEFAULT ARRAY['png','pdf']::text[],
  ADD COLUMN IF NOT EXISTS price_per_meter numeric,
  ADD COLUMN IF NOT EXISTS applications text[] DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS materials text[] DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS usage_instructions text,
  ADD COLUMN IF NOT EXISTS technical_specs jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.products
  ADD CONSTRAINT products_unit_type_check
  CHECK (unit_type IN ('unit','meter'));

CREATE UNIQUE INDEX IF NOT EXISTS products_slug_unique ON public.products(slug) WHERE slug IS NOT NULL;

DROP TRIGGER IF EXISTS update_products_updated_at ON public.products;
CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Nova tabela: descontos por volume por produto
CREATE TABLE public.product_volume_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id text NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  min_meters numeric NOT NULL,
  price_per_meter numeric NOT NULL,
  label text,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.product_volume_tiers TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_volume_tiers TO authenticated;
GRANT ALL ON public.product_volume_tiers TO service_role;

ALTER TABLE public.product_volume_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view volume tiers" ON public.product_volume_tiers
  FOR SELECT USING (true);
CREATE POLICY "Admins manage volume tiers" ON public.product_volume_tiers
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_product_volume_tiers_updated_at
  BEFORE UPDATE ON public.product_volume_tiers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_volume_tiers_product ON public.product_volume_tiers(product_id, min_meters);

-- 4. Estender order_items com config do configurador
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS length_m numeric,
  ADD COLUMN IF NOT EXISTS config jsonb;

-- 5. Categorias DTF
INSERT INTO public.categories (id, name, slug, description, display_order, is_active, hero_visible)
VALUES
  (gen_random_uuid(), 'DTF Têxtil', 'dtf-textil', 'Impressão DTF para tecidos: t-shirts, sweats, sacos, bonés.', 1, true, true),
  (gen_random_uuid(), 'DTF UV', 'dtf-uv', 'Impressão DTF UV para superfícies rígidas: acrílico, madeira, metal, vidro.', 2, true, true);

-- 6. Produtos DTF
INSERT INTO public.products (
  id, name, slug, category, price, image, description, short_description,
  unit_type, roll_width_cm, max_length_cm, min_length_m, length_increment_m,
  required_dpi, accepted_file_types, price_per_meter,
  applications, materials, usage_instructions, technical_specs,
  is_featured, stock_quantity, customizable
) VALUES
(
  'dtf-textil',
  'DTF Têxtil',
  'dtf-textil',
  'DTF Têxtil',
  10.00,
  '/__l5e/placeholder/dtf-textil.png',
  'DTF Têxtil de alta qualidade para aplicação em todo o tipo de tecido. Rolo com 58 cm de largura útil. Cores vibrantes, ótima aderência e acabamento profissional. Vendido por metro linear.',
  'Impressão DTF para tecidos · rolo 58 cm · 300 dpi · CMYK',
  'meter', 58, 250, 0.5, 0.5,
  300, ARRAY['png','pdf'], 10.00,
  ARRAY['T-shirts','Sweats','Hoodies','Bonés','Sacos de pano','Uniformes','Toalhas','Brindes têxteis'],
  ARRAY['Algodão','Poliéster','Mistos','Lycra','Sarja','Polar','Lona'],
  E'## Modo de utilização — DTF Têxtil\n\n1. **Pré-aquecer** o tecido durante 5 segundos para remover humidade.\n2. **Posicionar** o transfer com o lado impresso virado para o tecido.\n3. **Prensar** a 150–160 °C durante 15 segundos, pressão média-alta.\n4. **Peel a quente** (hot peel): remover o filme imediatamente após a prensagem.\n5. **Pós-prensa**: cobrir com papel siliconado ou teflon e prensar mais 10 s para fixar.\n6. **Lavagem**: avesso, máx. 40 °C, sem amaciador. Não passar a ferro diretamente sobre o desenho.',
  '{"color_mode":"CMYK","min_stroke_px":3,"recommended_stroke_px":5,"transparent_background_required":true,"press_temp_c":"150-160","press_time_s":15,"peel":"hot"}'::jsonb,
  true, 9999, true
),
(
  'dtf-uv',
  'DTF UV',
  'dtf-uv',
  'DTF UV',
  13.00,
  '/__l5e/placeholder/dtf-uv.png',
  'DTF UV para aplicação em superfícies rígidas e irregulares. Rolo com 29,5 cm de largura útil. Adesão excelente sem necessidade de prensa térmica. Vendido por metro linear.',
  'Impressão DTF UV para superfícies rígidas · rolo 29,5 cm · 300 dpi · CMYK',
  'meter', 29.5, 250, 0.5, 0.5,
  300, ARRAY['png','pdf'], 13.00,
  ARRAY['Acrílico','Madeira','Metal','Vidro','Cerâmica','Pedra','Couro','Plástico rígido','Sinalética'],
  ARRAY['Acrílico','MDF','Madeira natural','Alumínio','Aço','Vidro','Cerâmica','Couro sintético','PVC'],
  E'## Modo de utilização — DTF UV\n\n1. **Limpar** a superfície com álcool isopropílico e deixar secar.\n2. **Destacar** o liner protetor do transfer.\n3. **Aplicar** o transfer sobre a superfície, alisando do centro para fora com espátula macia para evitar bolhas.\n4. **Pressionar firmemente** durante 30 segundos.\n5. **Remover o filme** lentamente num ângulo de 180°.\n6. **Curar** ao ar 24 h antes de manusear; resistente a riscos e UV após este período.',
  '{"color_mode":"CMYK","min_stroke_px":3,"recommended_stroke_px":5,"transparent_background_required":true,"application":"cold","cure_time_h":24}'::jsonb,
  true, 9999, true
);

-- 7. Tiers de volume
INSERT INTO public.product_volume_tiers (product_id, min_meters, price_per_meter, label, display_order) VALUES
  ('dtf-textil', 0.5, 12.00, 'Meio metro (6,00 €)', 1),
  ('dtf-textil', 1.0, 10.00, '1 metro', 2),
  ('dtf-textil', 5.0, 8.50,  'A partir de 5 m', 3),
  ('dtf-uv',     0.5, 14.00, 'Meio metro (7,00 €)', 1),
  ('dtf-uv',     1.0, 13.00, '1 metro', 2),
  ('dtf-uv',     5.0, 12.00, 'A partir de 5 m', 3);

-- 8. Configurações de loja Bom DTF
INSERT INTO public.store_settings (key, value) VALUES
  ('theme_mode',        '{"default":"dark","allow_toggle":true,"show_toggle":true}'::jsonb),
  ('brand',             '{"name":"Bom DTF","tagline":"A tua ideia pronta para estampar","whatsapp":"+351912345678","instagram":"@bomdtf.oficial","location":"Cadaval, Portugal"}'::jsonb),
  ('shipping_dtf',      '{"flat_rate_eur":6.00,"pickup_available":true,"pickup_label":"Levantamento no Cadaval (grátis)","production_lead_time":"24h úteis"}'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
