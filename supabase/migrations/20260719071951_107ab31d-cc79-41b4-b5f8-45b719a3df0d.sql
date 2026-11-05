
-- Remove sistema de rolos
DROP TRIGGER IF EXISTS trg_orders_assign_rolls_on_paid ON public.orders;

DROP VIEW IF EXISTS public.v_roll_financials CASCADE;
DROP VIEW IF EXISTS public.v_product_roll_summary CASCADE;

DROP TABLE IF EXISTS public.order_item_roll_history CASCADE;
DROP TABLE IF EXISTS public.order_item_rolls CASCADE;
DROP TABLE IF EXISTS public.product_roll_expenses CASCADE;
DROP TABLE IF EXISTS public.product_rolls CASCADE;

DROP FUNCTION IF EXISTS public.assign_item_to_active_roll(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.admin_close_roll(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.admin_move_item_to_roll(uuid, uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.admin_set_roll_start_from_order(uuid, uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.suggest_roll_code(text) CASCADE;
DROP FUNCTION IF EXISTS public._orders_assign_rolls_on_paid() CASCADE;
DROP FUNCTION IF EXISTS public._roll_meters_for_item(public.order_items) CASCADE;
