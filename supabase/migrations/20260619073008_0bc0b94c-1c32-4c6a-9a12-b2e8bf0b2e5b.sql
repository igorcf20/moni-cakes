ALTER TABLE public.banners 
  ADD COLUMN IF NOT EXISTS overlay_opacity integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS overlay_color text NOT NULL DEFAULT '#000000',
  ADD COLUMN IF NOT EXISTS cta_text text,
  ADD COLUMN IF NOT EXISTS cta_url text;