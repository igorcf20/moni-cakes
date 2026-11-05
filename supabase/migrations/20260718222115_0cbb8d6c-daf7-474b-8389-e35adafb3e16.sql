-- Backfill: para cada item de pedidos pagos sem linha em order_item_rolls,
-- criar linha (com roll_id NULL se não houver rolo activo do produto).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT oi.id
      FROM public.order_items oi
      JOIN public.orders o ON o.id = oi.order_id
     WHERE o.payment_status = 'paid'
       AND NOT EXISTS (SELECT 1 FROM public.order_item_rolls oir WHERE oir.order_item_id = oi.id)
  LOOP
    PERFORM public.assign_item_to_active_roll(r.id);
  END LOOP;
END $$;