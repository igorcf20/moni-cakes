-- Add store_origin to store_settings if it doesn't exist
INSERT INTO public.store_settings (key, value)
SELECT 'store_origin', '"PT"'
WHERE NOT EXISTS (SELECT 1 FROM public.store_settings WHERE key = 'store_origin');

-- Ensure PT exists in international shipping allowed countries if it's the origin
UPDATE public.store_settings
SET value = jsonb_set(value, '{allowed_countries}', (value->'allowed_countries') || '"PT"')
WHERE key = 'international_shipping' 
AND NOT (value->'allowed_countries' @> '"PT"');

-- Add some default Portugal shipping zones if they don't exist
-- We'll use this to show some PT zones if PT is selected as origin
-- But first, let's see if we can just update the UI to be more flexible.
