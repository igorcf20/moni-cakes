
ALTER TABLE public.product_reviews
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS image_url text,
  ALTER COLUMN user_id DROP NOT NULL;
