-- =====================================================================================
-- Menu de categorias editável no Admin > Categorias (modelo de loja).
--   icon          nome de um ícone Lucide da lista do Admin (src/lib/catalogMenu.ts, CATEGORY_ICONS)
--   name_i18n     nome noutros idiomas: {"en": "...", "es": "...", "pt-PT": "..."}; o idioma padrão fica em name
--   link_url      subcategoria que abre outra página da loja (ex.: /personalizar); só caminhos internos
--   show_in_menu  aparece no cabeçalho, mega menu, menu do celular e página inicial (a página da categoria
--                 continua aberta enquanto is_active = true)
-- Sem nenhuma categoria principal no menu, o site usa o catálogo padrão em código (src/lib/catalog.ts).
-- =====================================================================================
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS icon text;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS name_i18n jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS link_url text;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS show_in_menu boolean NOT NULL DEFAULT true;

ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_name_i18n_object;
ALTER TABLE public.categories ADD CONSTRAINT categories_name_i18n_object CHECK (jsonb_typeof(name_i18n) = 'object');

-- Links do menu só para páginas da própria loja (sem "//outro-site" nem "javascript:").
ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_link_url_internal;
ALTER TABLE public.categories ADD CONSTRAINT categories_link_url_internal
  CHECK (link_url IS NULL OR link_url ~ '^/[^/]' OR link_url = '/');
