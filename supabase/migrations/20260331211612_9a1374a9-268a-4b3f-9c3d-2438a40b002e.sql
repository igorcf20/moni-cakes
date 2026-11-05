-- Add columns to banners table
ALTER TABLE public.banners ADD COLUMN IF NOT EXISTS subtitle TEXT;
ALTER TABLE public.banners ADD COLUMN IF NOT EXISTS button_text TEXT;

-- Ensure store_settings has initial values if they don't exist
INSERT INTO public.store_settings (key, value)
VALUES 
  ('benefits_config', '[
    {"icon": "Truck", "title": "Frete Grátis", "desc": "Acima de R$ 199"},
    {"icon": "Shield", "title": "Compra Segura", "desc": "Dados protegidos"},
    {"icon": "CreditCard", "title": "Parcelamento", "desc": "Até 10x sem juros"},
    {"icon": "RotateCcw", "title": "Troca Fácil", "desc": "Até 30 dias"}
  ]'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Update the position constraint for banners if it exists, or just allow any text
-- (If there was a check constraint, we'd alter it here, but usually it's just text)
