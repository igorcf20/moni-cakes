ALTER TABLE public.order_designs ADD COLUMN IF NOT EXISTS cart_item_key text;
CREATE INDEX IF NOT EXISTS order_designs_order_cart_idx ON public.order_designs(order_id, cart_item_key);