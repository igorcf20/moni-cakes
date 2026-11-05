-- =============================================================================================
-- Especificações e filtros (recurso spec_filters em Admin > Recursos da loja, ligado por padrão).
--   spec_attributes        característica (ex.: Material, Cor, Tamanho, Uva, Tecido), nome por idioma, unidade,
--                          se aparece nos filtros da listagem e na ficha do produto, ordem
--   spec_options           valores possíveis de cada característica (ex.: PLA, PETG), nome por idioma, cor opcional
--   product_spec_options   que valores cada produto tem (um produto pode ter vários valores da mesma característica)
-- Leitura pública (são dados do catálogo); só o Admin escreve. A listagem filtra no navegador, como os outros filtros.
-- =============================================================================================

CREATE TABLE IF NOT EXISTS public.spec_attributes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  name_i18n jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(name_i18n) = 'object'),
  unit text CHECK (unit IS NULL OR char_length(unit) <= 20),
  show_in_filters boolean NOT NULL DEFAULT true,
  show_on_product boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.spec_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attribute_id uuid NOT NULL REFERENCES public.spec_attributes(id) ON DELETE CASCADE,
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,59}$'),
  label_i18n jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(label_i18n) = 'object'),
  color text CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (attribute_id, slug)
);
CREATE INDEX IF NOT EXISTS spec_options_attribute_idx ON public.spec_options (attribute_id, sort_order);

CREATE TABLE IF NOT EXISTS public.product_spec_options (
  product_id text NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  option_id uuid NOT NULL REFERENCES public.spec_options(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, option_id)
);
CREATE INDEX IF NOT EXISTS product_spec_options_option_idx ON public.product_spec_options (option_id);

ALTER TABLE public.spec_attributes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spec_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_spec_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone reads spec attributes" ON public.spec_attributes;
CREATE POLICY "Anyone reads spec attributes" ON public.spec_attributes FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Admins manage spec attributes" ON public.spec_attributes;
CREATE POLICY "Admins manage spec attributes" ON public.spec_attributes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Anyone reads spec options" ON public.spec_options;
CREATE POLICY "Anyone reads spec options" ON public.spec_options FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Admins manage spec options" ON public.spec_options;
CREATE POLICY "Admins manage spec options" ON public.spec_options FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Anyone reads product specs" ON public.product_spec_options;
CREATE POLICY "Anyone reads product specs" ON public.product_spec_options FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Admins manage product specs" ON public.product_spec_options;
CREATE POLICY "Admins manage product specs" ON public.product_spec_options FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

GRANT SELECT ON public.spec_attributes, public.spec_options, public.product_spec_options TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.spec_attributes, public.spec_options, public.product_spec_options TO authenticated;

-- Trocar os valores de um produto de uma vez (aba Especificações do produto no Admin).
CREATE OR REPLACE FUNCTION public.admin_set_product_specs(_product_id text, _option_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  IF NOT coalesce(public.has_role(auth.uid(), 'admin'::app_role), false) THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = _product_id) THEN RAISE EXCEPTION 'product_not_found'; END IF;
  DELETE FROM public.product_spec_options WHERE product_id = _product_id;
  INSERT INTO public.product_spec_options (product_id, option_id)
  SELECT _product_id, o.id FROM public.spec_options o WHERE o.id = ANY (coalesce(_option_ids, '{}'))
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.admin_set_product_specs(text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_product_specs(text, uuid[]) TO authenticated;
