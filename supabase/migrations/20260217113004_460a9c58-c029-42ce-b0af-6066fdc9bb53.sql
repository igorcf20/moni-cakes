
-- Add guest fields to orders table
ALTER TABLE public.orders 
  ALTER COLUMN user_id DROP NOT NULL,
  ADD COLUMN guest_email text,
  ADD COLUMN guest_name text,
  ADD COLUMN guest_phone text;

-- Create index for email lookups
CREATE INDEX idx_orders_guest_email ON public.orders(guest_email) WHERE guest_email IS NOT NULL;

-- Allow anonymous users to view orders by email (for guest tracking)
CREATE POLICY "Guests can view their orders by email"
  ON public.orders FOR SELECT
  USING (
    guest_email IS NOT NULL AND auth.role() = 'anon'
  );

-- Allow anonymous users to view order items for guest orders
CREATE POLICY "Guests can view order items for guest orders"
  ON public.order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM orders 
      WHERE orders.id = order_items.order_id 
      AND orders.guest_email IS NOT NULL
      AND auth.role() = 'anon'
    )
  );
