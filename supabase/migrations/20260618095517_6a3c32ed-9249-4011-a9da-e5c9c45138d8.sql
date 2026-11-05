
ALTER TABLE public.user_addresses RENAME COLUMN neighborhood TO parish;
ALTER TABLE public.user_addresses RENAME COLUMN state TO district;
ALTER TABLE public.user_addresses RENAME COLUMN zip_code TO postal_code;
ALTER TABLE public.user_addresses ALTER COLUMN number DROP NOT NULL;
ALTER TABLE public.user_addresses ALTER COLUMN parish DROP NOT NULL;
ALTER TABLE public.user_addresses ALTER COLUMN country SET DEFAULT 'Portugal';
UPDATE public.user_addresses SET country = 'Portugal' WHERE country IS NULL OR country IN ('Brasil','Brazil');

ALTER TABLE public.user_profiles DROP COLUMN IF EXISTS document_type;
ALTER TABLE public.user_profiles DROP COLUMN IF EXISTS document_number;
COMMENT ON COLUMN public.user_profiles.tax_id IS 'NIF (9 digits) or NIPC for Portuguese tax identification';

ALTER TABLE public.orders ALTER COLUMN payment_method SET DEFAULT 'multibanco';
UPDATE public.orders SET payment_method = 'multibanco' WHERE payment_method = 'pix';
