
CREATE TABLE public.home_product_sections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  eyebrow TEXT,
  title TEXT NOT NULL,
  subtitle TEXT,
  source TEXT NOT NULL DEFAULT 'featured',
  category_slug TEXT,
  cta_text TEXT DEFAULT 'Ver todos',
  cta_url TEXT DEFAULT '/produtos',
  item_limit INTEGER NOT NULL DEFAULT 8,
  layout TEXT NOT NULL DEFAULT 'carousel',
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT home_product_sections_source_check CHECK (source IN ('featured','promo','bestsellers','low_stock','new_arrivals','customizable','ready_made','category')),
  CONSTRAINT home_product_sections_layout_check CHECK (layout IN ('grid','carousel'))
);

GRANT SELECT ON public.home_product_sections TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.home_product_sections TO authenticated;
GRANT ALL ON public.home_product_sections TO service_role;

ALTER TABLE public.home_product_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "home_product_sections public read"
  ON public.home_product_sections FOR SELECT
  USING (true);

CREATE POLICY "home_product_sections admin write"
  ON public.home_product_sections FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_home_product_sections_updated
  BEFORE UPDATE ON public.home_product_sections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.home_product_sections (key, eyebrow, title, subtitle, source, cta_text, cta_url, item_limit, layout, display_order, is_active) VALUES
  ('featured', 'Destaques', 'Produtos em destaque', 'Uma seleção premium de brindes personalizados prontos para representar a sua marca.', 'featured', 'Ver todos os destaques', '/produtos', 8, 'carousel', 10, true),
  ('ready_made', 'Prontos a comprar', 'Já personalizados por nós', 'Modelos exclusivos com design pronto — só escolher e receber.', 'ready_made', 'Ver todos', '/produtos?tipo=pronto', 8, 'grid', 20, true),
  ('promo', 'Promoções', 'Em promoção', 'Ofertas limitadas com desconto direto — enquanto durarem os stocks.', 'promo', 'Ver todas as promoções', '/produtos?promo=1', 8, 'carousel', 30, true),
  ('bestsellers', 'Top vendas', 'Mais vendidos', 'Os favoritos dos nossos clientes empresariais e criativos.', 'bestsellers', 'Ver ranking completo', '/produtos', 8, 'carousel', 40, true),
  ('low_stock', 'Últimas unidades', 'Quase a esgotar', 'Aproveita antes que acabem — reposição sujeita a disponibilidade.', 'low_stock', 'Ver todos', '/produtos', 8, 'grid', 50, false);
