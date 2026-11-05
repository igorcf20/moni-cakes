
-- 1. Fix guest orders: Remove overly permissive anonymous SELECT on orders
DROP POLICY IF EXISTS "Guests can view their orders by email" ON public.orders;

-- 2. Fix guest order items: Remove overly permissive anonymous SELECT on order_items  
DROP POLICY IF EXISTS "Guests can view order items for guest orders" ON public.order_items;

-- 3. Fix payment_config: Replace public read with authenticated-only read
DROP POLICY IF EXISTS "payment_config_public_read" ON public.payment_config;
CREATE POLICY "payment_config_authenticated_read" ON public.payment_config
  FOR SELECT TO authenticated USING (true);

-- 4. Fix coupons: Replace public read with a more restrictive policy (only active, no usage counts exposed)
DROP POLICY IF EXISTS "Everyone can view active coupons" ON public.coupons;
CREATE POLICY "Authenticated users can view active coupons" ON public.coupons
  FOR SELECT TO authenticated USING (active = true);

-- 5. Fix storage: customer-photos INSERT policy to enforce folder ownership
DROP POLICY IF EXISTS "Users can upload their customer photos" ON storage.objects;
CREATE POLICY "Users can upload their customer photos" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'customer-photos' 
    AND auth.uid() IS NOT NULL 
    AND (auth.uid())::text = (storage.foldername(name))[1]
  );

-- 6. Fix storage: gallery-walls INSERT policy to enforce folder ownership
DROP POLICY IF EXISTS "Users can upload their gallery walls" ON storage.objects;
CREATE POLICY "Users can upload their gallery walls" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'gallery-walls' 
    AND auth.uid() IS NOT NULL 
    AND (auth.uid())::text = (storage.foldername(name))[1]
  );
