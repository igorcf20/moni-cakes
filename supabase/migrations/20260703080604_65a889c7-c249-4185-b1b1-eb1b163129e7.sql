ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS promo_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS promo_type text,
  ADD COLUMN IF NOT EXISTS promo_value numeric,
  ADD COLUMN IF NOT EXISTS promo_label text,
  ADD COLUMN IF NOT EXISTS promo_starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS promo_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS promo_show_countdown boolean NOT NULL DEFAULT true;

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_promo_type_check;
ALTER TABLE public.products
  ADD CONSTRAINT products_promo_type_check
  CHECK (promo_type IS NULL OR promo_type IN ('percentage','fixed'));

CREATE INDEX IF NOT EXISTS idx_products_promo_active ON public.products(promo_active) WHERE promo_active = true;