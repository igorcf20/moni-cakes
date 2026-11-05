
-- 1. Usage guide sections
CREATE TABLE public.usage_guide_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  image_url text,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.usage_guide_sections TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.usage_guide_sections TO authenticated;
GRANT ALL ON public.usage_guide_sections TO service_role;
ALTER TABLE public.usage_guide_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read active sections" ON public.usage_guide_sections FOR SELECT USING (is_active OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins manage sections" ON public.usage_guide_sections FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_usage_guide_sections_updated BEFORE UPDATE ON public.usage_guide_sections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Usage guide FAQs
CREATE TABLE public.usage_guide_faqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question text NOT NULL,
  answer text NOT NULL DEFAULT '',
  category text,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.usage_guide_faqs TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.usage_guide_faqs TO authenticated;
GRANT ALL ON public.usage_guide_faqs TO service_role;
ALTER TABLE public.usage_guide_faqs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read active faqs" ON public.usage_guide_faqs FOR SELECT USING (is_active OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins manage faqs" ON public.usage_guide_faqs FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_usage_guide_faqs_updated BEFORE UPDATE ON public.usage_guide_faqs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Products display_order
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_products_display_order ON public.products(display_order);

-- 4. Order designs
CREATE TABLE public.order_designs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  plano_index integer NOT NULL DEFAULT 0,
  plano_name text,
  file_path text NOT NULL,
  preview_path text,
  width_px integer,
  height_px integer,
  dpi integer,
  size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_order_designs_order ON public.order_designs(order_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_designs TO authenticated;
GRANT ALL ON public.order_designs TO service_role;
ALTER TABLE public.order_designs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read own designs" ON public.order_designs FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.user_id = auth.uid())
  );
CREATE POLICY "Authenticated insert designs" ON public.order_designs FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'admin')
    OR EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.user_id = auth.uid())
  );
CREATE POLICY "Admins manage designs" ON public.order_designs FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 5. Seed menu (3 items)
INSERT INTO public.menu_items (title, url, display_order, is_active)
SELECT v.title, v.url, v.ord, true FROM (VALUES
  ('Produtos', '/produtos', 1),
  ('Como Utilizar', '/como-utilizar', 2),
  ('Pedidos', '/minhas-compras', 3)
) v(title, url, ord)
WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE url = v.url);

-- 6. Seed default usage guide content
INSERT INTO public.usage_guide_sections (title, body, display_order) VALUES
  ('Como funciona o DTF', 'O DTF (Direct to Film) permite transferir impressões em alta resolução para diversos tecidos. Envia o teu ficheiro, configura o tamanho e nós imprimimos.', 1),
  ('Preparação do ficheiro', 'Usa PNG-24 ou PDF vetorial a 300 dpi, com fundo transparente e cores em CMYK quando possível.', 2),
  ('Aplicação do transfer', 'Posiciona o transfer sobre o tecido, aplica calor a 160 ºC durante 15 s com pressão média. Aguarda arrefecer antes de remover o filme.', 3);

INSERT INTO public.usage_guide_faqs (question, answer, display_order) VALUES
  ('Qual o DPI mínimo aceite?', 'Recomendamos 300 dpi para obter a melhor qualidade de impressão.', 1),
  ('Em que tecidos posso aplicar?', 'O DTF funciona em algodão, poliéster, malhas, lonas e a maioria dos tecidos sintéticos.', 2),
  ('Posso reaproveitar transfers?', 'Não. Cada transfer DTF é de uso único após aplicação com calor.', 3),
  ('Qual o prazo de produção?', 'Produzimos em 24-48 h úteis após confirmação do pagamento.', 4);
