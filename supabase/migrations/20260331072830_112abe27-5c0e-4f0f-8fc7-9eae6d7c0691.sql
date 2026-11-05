-- Add variation_id to product_images
ALTER TABLE public.product_images 
ADD COLUMN variation_id UUID REFERENCES public.product_variations(id) ON DELETE CASCADE;

-- Add currency and international settings to store_settings if not exists
INSERT INTO public.store_settings (key, value)
VALUES 
('currency_settings', '{"default": "BRL", "available": ["BRL", "USD", "EUR"], "rates": {"USD": 5.0, "EUR": 5.5}}'::jsonb),
('international_shipping', '{"enabled": true, "allowed_countries": ["US", "PT", "ES", "FR", "GB", "CA"]}'::jsonb)
ON CONFLICT (key) DO UPDATE 
SET value = EXCLUDED.value;

-- Create an index for faster variation image lookups
CREATE INDEX idx_product_images_variation_id ON public.product_images(variation_id);
