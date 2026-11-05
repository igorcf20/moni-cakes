
-- Home sections + items + Google settings
CREATE TABLE IF NOT EXISTS public.home_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  eyebrow text,
  title text,
  subtitle text,
  image_url text,
  cta_text text,
  cta_url text,
  secondary_cta_text text,
  secondary_cta_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.home_sections TO anon, authenticated;
GRANT ALL ON public.home_sections TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.home_sections TO authenticated;
ALTER TABLE public.home_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "home_sections public read" ON public.home_sections FOR SELECT USING (true);
CREATE POLICY "home_sections admin write" ON public.home_sections FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_home_sections_updated BEFORE UPDATE ON public.home_sections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.home_section_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_key text NOT NULL,
  kind text NOT NULL,
  display_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  title text,
  subtitle text,
  body text,
  image_url text,
  icon text,
  stat_value text,
  stat_label text,
  author_name text,
  author_role text,
  author_location text,
  rating int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.home_section_items TO anon, authenticated;
GRANT ALL ON public.home_section_items TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.home_section_items TO authenticated;
ALTER TABLE public.home_section_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "home_items public read" ON public.home_section_items FOR SELECT USING (true);
CREATE POLICY "home_items admin write" ON public.home_section_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_home_items_updated BEFORE UPDATE ON public.home_section_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default sections (idempotent)
INSERT INTO public.home_sections (key, eyebrow, title, subtitle, image_url, cta_text, cta_url, secondary_cta_text, secondary_cta_url)
VALUES
  ('cta_production', 'Produção começa hoje', 'Pronto para imprimir?', 'Envia o teu ficheiro e recebe o orçamento em horas. Produção em 24h úteis.', NULL, 'Personalizar agora', '/configurar/dtf-textil', 'Ver tabela de preços', '/produto/dtf-textil'),
  ('features', 'O que nos destaca', 'Qualidade que se sente, cor que impacta.', 'Cinco pilares que tornam cada metro impresso por nós uma escolha segura para a tua marca.', NULL, NULL, NULL, NULL, NULL),
  ('testimonials', 'Quem já imprime connosco', 'Marcas e ateliers que confiam na Bom DTF.', 'Vê o que os nossos clientes dizem — e deixa a tua avaliação no Google.', NULL, 'Deixar avaliação no Google', NULL, 'Ver no Google Maps', NULL)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.home_section_items (section_key, kind, display_order, title, body, icon, stat_value)
SELECT 'features', 'feature', n, t, b, i, s FROM (VALUES
  (1, 'Cores vivas', 'Tintas DTF de última geração — preto profundo, brancos puros e fluorescentes opcionais.', 'Palette', '16M cores'),
  (2, 'Aderência total', 'Resistente a lavagens a 60°C, dobras, estiramentos e uso intenso diário.', 'ShieldCheck', '50+ lavagens'),
  (3, 'Todos os tecidos', 'Algodão, poliéster, mistos, lycra, sarja, polar, lona — escuros ou claros.', 'Layers', '8 famílias'),
  (4, 'Acabamento pro', 'Sem brilho excessivo, tato suave e flexível que acompanha o tecido.', 'Sparkles', 'Matte premium'),
  (5, 'Produção 24h úteis', 'Encomenda hoje até às 16h, expedimos amanhã. Sem mínimos absurdos.', 'Zap', '24h úteis')
) AS v(n, t, b, i, s)
WHERE NOT EXISTS (SELECT 1 FROM public.home_section_items WHERE section_key='features' AND kind='feature');

INSERT INTO public.home_section_items (section_key, kind, display_order, stat_value, stat_label, icon)
SELECT 'features', 'trust_stat', n, v, l, i FROM (VALUES
  (1, '8 anos', 'no mercado', 'Award'),
  (2, '+1.200', 'clientes ativos', 'Users2'),
  (3, '24h', 'produção média', 'Clock'),
  (4, '4,9/5', 'avaliação Google', 'Star')
) AS v(n, v, l, i)
WHERE NOT EXISTS (SELECT 1 FROM public.home_section_items WHERE section_key='features' AND kind='trust_stat');

INSERT INTO public.home_section_items (section_key, kind, display_order, author_name, author_role, author_location, rating, body)
SELECT 'testimonials', 'testimonial', n, a, r, l, 5, t FROM (VALUES
  (1, 'Rui Marques', 'Fundador · Marca de streetwear', 'Lisboa', 'Cores absurdas e produção em 24h. Mudei toda a minha produção para a Bom DTF — não há comparação no mercado português.'),
  (2, 'Mariana Costa', 'Designer · Atelier de moda', 'Porto', 'Aderência impecável em algodão e lycra. Os clientes elogiam o tato suave do print e a durabilidade após dezenas de lavagens.'),
  (3, 'Pedro Lourenço', 'Proprietário · Print shop', 'Cadaval', 'Fiável, rápido e a qualidade é constante de encomenda para encomenda. O configurador online poupa-me horas todas as semanas.')
) AS v(n, a, r, l, t)
WHERE NOT EXISTS (SELECT 1 FROM public.home_section_items WHERE section_key='testimonials' AND kind='testimonial');

-- Google reviews settings rows in store_settings (key/value structure)
INSERT INTO public.store_settings (key, value)
VALUES
  ('google_place_id', '""'::jsonb),
  ('google_maps_review_url', '""'::jsonb),
  ('google_rating_cache', '{"rating": null, "total": null, "updated_at": null}'::jsonb)
ON CONFLICT (key) DO NOTHING;
