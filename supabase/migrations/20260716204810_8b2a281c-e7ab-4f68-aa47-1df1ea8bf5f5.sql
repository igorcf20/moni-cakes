
ALTER VIEW public.v_roll_financials SET (security_invoker = true);
ALTER VIEW public.v_product_roll_summary SET (security_invoker = true);

ALTER FUNCTION public._roll_meters_for_item(public.order_items) SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.suggest_roll_code(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.assign_item_to_active_roll(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_payment_status(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_close_roll(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_move_item_to_roll(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_roll_start_from_order(uuid, uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.suggest_roll_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_item_to_active_roll(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_payment_status(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_close_roll(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_move_item_to_roll(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_roll_start_from_order(uuid, uuid, text) TO authenticated;
