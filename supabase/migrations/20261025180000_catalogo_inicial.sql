-- Moni Cakes: na loja-modelo (PRINT3D) esta migration criava 21 produtos e 3 banners de impressão 3D.
-- A Moni Cakes nasce sem produtos nem banners de exemplo (o catálogo real entra no Admin); fica só a
-- mudança de estrutura que outras partes do código usam.

-- Textos dos banners noutros idiomas: {"en": {"title": "...", "subtitle": "...", "cta_text": "..."}}.
-- title, subtitle e cta_text continuam a ser os do idioma principal; o que faltar numa tradução usa-os.
ALTER TABLE public.banners ADD COLUMN IF NOT EXISTS texts_i18n jsonb NOT NULL DEFAULT '{}'::jsonb;
