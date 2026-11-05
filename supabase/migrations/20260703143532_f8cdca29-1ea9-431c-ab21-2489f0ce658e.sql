ALTER TABLE public.banners
  ADD COLUMN IF NOT EXISTS secondary_cta_text text DEFAULT 'Ver tabela de preços',
  ADD COLUMN IF NOT EXISTS secondary_cta_url text,
  ADD COLUMN IF NOT EXISTS show_primary_cta boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_secondary_cta boolean NOT NULL DEFAULT true;