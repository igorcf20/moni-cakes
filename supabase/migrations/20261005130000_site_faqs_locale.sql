-- =====================================================================================
-- Perguntas frequentes do Admin no site (/faq): idioma de cada pergunta.
--   locale  NULL = aparece em todos os idiomas; senão só nesse idioma (ex.: 'pt-BR', 'en', 'es', 'pt-PT').
-- As perguntas padrão da loja ficam no i18n (src/i18n/pages.ts); os grupos padrão escondidos no Admin
-- ficam em store_settings.faq_settings ({"hiddenGroups": ["produtos"]}).
-- =====================================================================================
ALTER TABLE public.site_faqs ADD COLUMN IF NOT EXISTS locale text;

ALTER TABLE public.site_faqs DROP CONSTRAINT IF EXISTS site_faqs_locale_format;
ALTER TABLE public.site_faqs ADD CONSTRAINT site_faqs_locale_format
  CHECK (locale IS NULL OR locale ~ '^[a-z]{2}(-[A-Z]{2})?$');
