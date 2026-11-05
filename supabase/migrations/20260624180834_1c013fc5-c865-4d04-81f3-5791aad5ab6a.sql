-- Remove duplicates, keeping the oldest row per (order_id, cart_item_key, plano_index, kind)
DELETE FROM public.order_designs a
USING public.order_designs b
WHERE a.id <> b.id
  AND a.order_id = b.order_id
  AND a.cart_item_key = b.cart_item_key
  AND a.plano_index = b.plano_index
  AND COALESCE(a.kind,'layout') = COALESCE(b.kind,'layout')
  AND a.created_at > b.created_at;

-- Unique index so race conditions can never create dupes again
CREATE UNIQUE INDEX IF NOT EXISTS order_designs_unique_plano
  ON public.order_designs (order_id, cart_item_key, plano_index, (COALESCE(kind,'layout')));