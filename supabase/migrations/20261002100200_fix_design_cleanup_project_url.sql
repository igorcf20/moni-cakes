-- LOJA 3D (base própria no VPS): as Edge Functions são chamadas pela URL interna do gateway,
-- http://web:8080/functions/v1/<função> (rede Docker do projeto loja3d). Para outra URL, como
-- supabase_admin: ALTER DATABASE postgres SET app.functions_url = 'http://outro-host/functions/v1';
-- Aponta a limpeza dos ficheiros de design (trigger e cron de hora a hora) para a função
-- cleanup-design-files da própria loja. Seguro de repetir.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

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

  -- Fire-and-forget: invoke cleanup edge function now (no wait; the function itself only
  -- deletes rows whose delete_after has already elapsed). LOJA 3D: envia a chave anon (pública,
  -- guardada no Vault como 'anon_key' pelo deploy/migrate.sh) para passar a verificação de JWT
  -- do router das Edge Functions; sem ela no Vault, o cabeçalho é omitido.
  IF NEW.status IN ('delivered','completed','shipped')
     AND COALESCE(OLD.status,'') IS DISTINCT FROM NEW.status THEN
    BEGIN
      PERFORM net.http_post(
        url := coalesce(nullif(current_setting('app.functions_url', true), ''), 'http://web:8080/functions/v1') || '/cleanup-design-files',
        headers := jsonb_strip_nulls(jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'anon_key' LIMIT 1)
        )),
        body := '{}'::jsonb
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'cleanup invocation failed: %', SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$function$;

DO $$
DECLARE jid int;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'cleanup-design-files-hourly';
  IF jid IS NOT NULL THEN PERFORM cron.unschedule(jid); END IF;
END $$;

SELECT cron.schedule(
  'cleanup-design-files-hourly',
  '17 * * * *',
  $$
  SELECT net.http_post(
    url := coalesce(nullif(current_setting('app.functions_url', true), ''), 'http://web:8080/functions/v1') || '/cleanup-design-files',
    headers := jsonb_strip_nulls(jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'anon_key' LIMIT 1)
    )),
    body := '{}'::jsonb
  );
  $$
);
