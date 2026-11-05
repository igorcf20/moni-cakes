
-- Restrict public SELECT on product_reviews to protect user_id/order_id.
-- Public consumers should use the safe view public.product_reviews_public.

DROP POLICY IF EXISTS "Everyone can view approved reviews" ON public.product_reviews;

CREATE POLICY "Users can view their own reviews"
ON public.product_reviews
FOR SELECT
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));

-- Safe public view: excludes user_id and order_id
CREATE OR REPLACE VIEW public.product_reviews_public
WITH (security_invoker = true) AS
SELECT
  r.id,
  r.product_id,
  r.rating,
  r.title,
  r.comment,
  r.customer_name,
  r.created_at,
  r.approved,
  COALESCE(NULLIF(r.customer_name, ''), p.full_name) AS display_name
FROM public.product_reviews r
LEFT JOIN public.user_profiles p ON p.user_id = r.user_id
WHERE r.approved = true;

GRANT SELECT ON public.product_reviews_public TO anon, authenticated;
