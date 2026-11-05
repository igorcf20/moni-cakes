
CREATE OR REPLACE FUNCTION public.sync_order_files_pending()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  oid uuid;
  incomplete_count int;
  missing_key_count int;
BEGIN
  oid := COALESCE(NEW.order_id, OLD.order_id);
  IF oid IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT COUNT(*) INTO incomplete_count
  FROM public.order_designs
  WHERE order_id = oid
    AND deleted_at IS NULL
    AND COALESCE(upload_complete, false) = false;

  -- Count order_items with a cartItemKey that have zero non-deleted design rows.
  -- Without this check, an item whose file was never registered at all (e.g. the
  -- customer paid on a different device than where they configured the design)
  -- would leak through as "files_pending = false" and disappear from admin.
  SELECT COUNT(*) INTO missing_key_count
  FROM public.order_items oi
  WHERE oi.order_id = oid
    AND oi.design_data ? 'cartItemKey'
    AND NOT EXISTS (
      SELECT 1 FROM public.order_designs od
      WHERE od.order_id = oid
        AND od.cart_item_key = oi.design_data->>'cartItemKey'
        AND od.deleted_at IS NULL
    );

  IF incomplete_count > 0 OR missing_key_count > 0 THEN
    UPDATE public.orders SET files_pending = true
    WHERE id = oid AND files_pending = false;
  ELSE
    UPDATE public.orders SET files_pending = false
    WHERE id = oid AND files_pending = true;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;
