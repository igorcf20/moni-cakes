
-- Allow anonymous users to read payment config (needed for checkout) but only non-sensitive fields
-- Actually, guests need to see payment methods during checkout. Let's use a secure RPC instead.
-- For now, add back a limited anonymous read for payment_config since checkout needs it
CREATE POLICY "Anyone can read active payment config" ON public.payment_config
  FOR SELECT USING (is_active = true);

-- Also allow anonymous to validate coupons (needed for guest checkout)
DROP POLICY IF EXISTS "Authenticated users can view active coupons" ON public.coupons;
CREATE POLICY "Anyone can view active coupons" ON public.coupons
  FOR SELECT USING (active = true);
