ALTER TABLE public.product_reviews ADD COLUMN IF NOT EXISTS order_id uuid;
ALTER TABLE public.product_reviews DROP CONSTRAINT IF EXISTS unique_user_product_review;
CREATE UNIQUE INDEX IF NOT EXISTS product_reviews_user_product_uidx
  ON public.product_reviews(user_id, product_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS product_reviews_order_product_uidx
  ON public.product_reviews(order_id, product_id) WHERE order_id IS NOT NULL;