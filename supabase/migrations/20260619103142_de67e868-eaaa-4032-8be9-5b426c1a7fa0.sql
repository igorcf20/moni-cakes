
-- 1) coupons: remove public enumeration; expose only RPC for code validation
DROP POLICY IF EXISTS "Anyone can view active coupons" ON public.coupons;
CREATE POLICY "Admins can view coupons"
ON public.coupons
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.validate_coupon(_code text)
RETURNS TABLE(code text, discount_type text, discount_value numeric, min_purchase numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.code, c.discount_type, c.discount_value, c.min_purchase
  FROM public.coupons c
  WHERE c.active = true
    AND lower(c.code) = lower(_code)
    AND (c.expires_at IS NULL OR c.expires_at > now())
    AND (c.max_uses IS NULL OR c.current_uses < c.max_uses)
  LIMIT 1;
$$;
REVOKE EXECUTE ON FUNCTION public.validate_coupon(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_coupon(text) TO anon, authenticated;

-- 2) email_templates: admin-only read
DROP POLICY IF EXISTS "Anyone read templates" ON public.email_templates;
-- "Admins manage email templates" (FOR ALL) already covers admin SELECT.

-- 3) tracking_events: remove unrestricted anon read; keep owner & admin policies
DROP POLICY IF EXISTS "Anon read tracking" ON public.tracking_events;

-- 4) product_views: tighten INSERT to prevent user_id spoofing
DROP POLICY IF EXISTS "Anyone can insert product views" ON public.product_views;
CREATE POLICY "Anyone can insert product views"
ON public.product_views
FOR INSERT
TO anon, authenticated
WITH CHECK (
  product_id IS NOT NULL
  AND (user_id IS NULL OR user_id = auth.uid())
);

-- 5) payment_config: hide sensitive `details` from public; expose safe columns via view
DROP POLICY IF EXISTS "Anyone can read active payment config" ON public.payment_config;
DROP POLICY IF EXISTS "Anyone can view active payment configurations" ON public.payment_config;
CREATE POLICY "Admins can read payment_config"
ON public.payment_config
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Public-facing view: includes details (these are payment instructions intended for
-- customers: PIX key, IBAN, bank name). True secrets (API keys) live in
-- integration_credentials which remains locked down.
CREATE OR REPLACE VIEW public.payment_methods_public
WITH (security_invoker = true)
AS
SELECT id, type, name, is_active, details, display_order
FROM public.payment_config
WHERE is_active = true;

-- View needs its own grants; underlying table is admin-only, so we wrap with a
-- security definer function instead to avoid invoker permissions issues.
DROP VIEW IF EXISTS public.payment_methods_public;

CREATE OR REPLACE FUNCTION public.get_active_payment_methods()
RETURNS TABLE(id uuid, type text, name text, is_active boolean, details jsonb, display_order integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, type, name, is_active, details, display_order
  FROM public.payment_config
  WHERE is_active = true
  ORDER BY display_order;
$$;
REVOKE EXECUTE ON FUNCTION public.get_active_payment_methods() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_payment_methods() TO anon, authenticated;

-- 6) Storage: prevent public listing of objects; URL-based reads keep working
DROP POLICY IF EXISTS "Anyone can view banner images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view customer photos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view gallery walls" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view processed images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view product images" ON storage.objects;

CREATE POLICY "Admins can list public bucket objects"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id IN ('banners','customer-photos','gallery-walls','product-processed','product-images')
  AND has_role(auth.uid(), 'admin'::app_role)
);
