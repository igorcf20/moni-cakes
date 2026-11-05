-- LOJA 3D (base própria no VPS): as Edge Functions são chamadas pela URL interna do gateway,
-- http://web:8080/functions/v1/<função> (rede Docker do projeto loja3d). Para outra URL, como
-- supabase_admin: ALTER DATABASE postgres SET app.functions_url = 'http://outro-host/functions/v1';
-- Schedule automatic cleanup of design files past their delete_after timestamp.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove previous schedule if it exists (idempotent).
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
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);