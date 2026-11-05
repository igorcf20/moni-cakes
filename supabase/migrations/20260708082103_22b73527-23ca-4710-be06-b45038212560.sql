-- LOJA 3D (base própria no VPS): as Edge Functions são chamadas pela URL interna do gateway,
-- http://web:8080/functions/v1/<função> (rede Docker do projeto loja3d). Para outra URL, como
-- supabase_admin: ALTER DATABASE postgres SET app.functions_url = 'http://outro-host/functions/v1';

-- Update the trigger so files are removed immediately (not after 5 days / 24h).
-- delivered/completed: full delete (row + files). shipped: keep preview only.

CREATE OR REPLACE FUNCTION public.schedule_design_cleanup_on_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- delivered/completed -> hard delete immediately
  IF NEW.status IN ('delivered','completed') AND COALESCE(OLD.status,'') NOT IN ('delivered','completed') THEN
    UPDATE public.order_designs
      SET delete_after = now() - interval '1 second',
          keep_preview_only = false
      WHERE order_id = NEW.id AND deleted_at IS NULL;
  ELSIF NEW.status NOT IN ('delivered','completed','shipped') AND COALESCE(OLD.status,'') IN ('delivered','completed') THEN
    UPDATE public.order_designs
      SET delete_after = NULL
      WHERE order_id = NEW.id AND deleted_at IS NULL;
  END IF;

  -- shipped -> keep preview only, remove print files immediately
  IF NEW.status = 'shipped' AND COALESCE(OLD.status,'') <> 'shipped' THEN
    UPDATE public.order_designs
      SET delete_after = now() - interval '1 second',
          keep_preview_only = true
      WHERE order_id = NEW.id AND deleted_at IS NULL;
  ELSIF COALESCE(OLD.status,'') = 'shipped' AND NEW.status NOT IN ('shipped','delivered','completed') THEN
    UPDATE public.order_designs
      SET delete_after = NULL,
          keep_preview_only = false
      WHERE order_id = NEW.id AND deleted_at IS NULL;
  END IF;

  -- Fire-and-forget: invoke cleanup edge function now (no wait, no auth needed —
  -- the function itself only deletes rows whose delete_after has already elapsed).
  IF NEW.status IN ('delivered','completed','shipped')
     AND COALESCE(OLD.status,'') IS DISTINCT FROM NEW.status THEN
    BEGIN
      PERFORM net.http_post(
        url := coalesce(nullif(current_setting('app.functions_url', true), ''), 'http://web:8080/functions/v1') || '/cleanup-design-files',
        headers := jsonb_build_object('Content-Type','application/json'),
        body := '{}'::jsonb
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'cleanup invocation failed: %', SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$function$;

-- Backfill: mark existing delivered/completed orders for immediate cleanup
UPDATE public.order_designs od
   SET delete_after = now() - interval '1 second',
       keep_preview_only = false
  FROM public.orders o
 WHERE o.id = od.order_id
   AND od.deleted_at IS NULL
   AND o.status IN ('delivered','completed');
