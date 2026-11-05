-- Páginas da loja editáveis no Admin > Páginas da loja: Sobre, Contato, Termos, Privacidade e Devoluções.
-- Uma linha por página e idioma. Sem linha publicada para o idioma do visitante, o site mostra o texto padrão
-- (src/i18n/pages.ts e src/legal/<país>.ts). body é HTML do editor do Admin; o site limpa-o (DOMPurify) antes de mostrar.

CREATE TABLE IF NOT EXISTS public.site_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page text NOT NULL CHECK (page IN ('about', 'contact', 'terms', 'privacy', 'returns')),
  locale text NOT NULL CHECK (locale IN ('pt-BR', 'pt-PT', 'en', 'es')),
  title text CHECK (title IS NULL OR length(title) <= 160),
  intro text CHECK (intro IS NULL OR length(intro) <= 600),
  body text CHECK (body IS NULL OR length(body) <= 200000),
  seo_description text CHECK (seo_description IS NULL OR length(seo_description) <= 300),
  published boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid DEFAULT auth.uid(),
  UNIQUE (page, locale)
);

ALTER TABLE public.site_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone reads published pages" ON public.site_pages;
CREATE POLICY "Anyone reads published pages" ON public.site_pages
  FOR SELECT TO anon, authenticated USING (published);

DROP POLICY IF EXISTS "Admins manage pages" ON public.site_pages;
CREATE POLICY "Admins manage pages" ON public.site_pages
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

GRANT SELECT ON public.site_pages TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.site_pages TO authenticated;

CREATE OR REPLACE FUNCTION public.site_pages_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := coalesce(auth.uid(), NEW.updated_by);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS site_pages_touch ON public.site_pages;
CREATE TRIGGER site_pages_touch BEFORE INSERT OR UPDATE ON public.site_pages
  FOR EACH ROW EXECUTE FUNCTION public.site_pages_touch();

COMMENT ON TABLE public.site_pages IS 'Textos próprios das páginas Sobre, Contato, Termos, Privacidade e Devoluções, por idioma.';
