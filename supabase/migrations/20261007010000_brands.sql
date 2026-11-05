-- =============================================================================================
-- Marcas (recurso brands em Admin > Recursos da loja, desligado por padrão): Admin > Catálogo > Marcas.
--  1) brands            nome, endereço (slug), logo, site, descrição por idioma, ordem e ativa/escondida.
--                       Leitura pública só das ativas; escrita só do Admin.
--  2) products.brand_id marca do produto (apagar a marca deixa o produto sem marca).
-- Na loja: filtro "Marca" nas listagens (?marca=slug), página /marcas, marca na página do produto e no JSON-LD.
-- =============================================================================================

CREATE TABLE IF NOT EXISTS public.brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  name text NOT NULL,
  logo_url text,
  website text,
  description_i18n jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT brands_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 80),
  CONSTRAINT brands_name_len CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  CONSTRAINT brands_logo_url CHECK (logo_url IS NULL OR logo_url ~ '^(https?://|/)'),
  CONSTRAINT brands_website CHECK (website IS NULL OR website ~ '^https?://'),
  CONSTRAINT brands_i18n_object CHECK (jsonb_typeof(description_i18n) = 'object')
);
CREATE UNIQUE INDEX IF NOT EXISTS brands_slug_unique ON public.brands (slug);
CREATE INDEX IF NOT EXISTS brands_order_idx ON public.brands (display_order, name);

COMMENT ON TABLE public.brands IS 'Marcas ou fabricantes (Admin > Marcas). Filtro e página na loja com o recurso brands ligado.';
COMMENT ON COLUMN public.brands.slug IS 'Endereço da marca na loja: /produtos?marca=<slug>.';

CREATE OR REPLACE FUNCTION public.brands_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.name := btrim(NEW.name);
  NEW.slug := lower(btrim(NEW.slug));
  NEW.logo_url := NULLIF(btrim(COALESCE(NEW.logo_url, '')), '');
  NEW.website := NULLIF(btrim(COALESCE(NEW.website, '')), '');
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS brands_touch_biu ON public.brands;
CREATE TRIGGER brands_touch_biu
BEFORE INSERT OR UPDATE ON public.brands
FOR EACH ROW EXECUTE FUNCTION public.brands_touch();

ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone reads active brands" ON public.brands;
CREATE POLICY "Anyone reads active brands" ON public.brands
  FOR SELECT TO anon, authenticated
  USING (is_active);

-- O Admin vê também as escondidas por esta política (anon não pode chamar has_role).
DROP POLICY IF EXISTS "Admins manage brands" ON public.brands;
CREATE POLICY "Admins manage brands" ON public.brands
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

GRANT SELECT ON public.brands TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brands TO authenticated;
GRANT ALL ON public.brands TO service_role;

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS products_brand_idx ON public.products (brand_id) WHERE brand_id IS NOT NULL;
COMMENT ON COLUMN public.products.brand_id IS 'Marca do produto (Admin > Marcas); vazio = sem marca.';
