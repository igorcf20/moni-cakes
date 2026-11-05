-- LOJA 3D (base própria no VPS): as Edge Functions são chamadas pela URL interna do gateway,
-- http://web:8080/functions/v1/<função> (rede Docker do projeto loja3d). Para outra URL, como
-- supabase_admin: ALTER DATABASE postgres SET app.functions_url = 'http://outro-host/functions/v1';
-- Rastreio CTT automático: de hora a hora, atualiza as encomendas enviadas com código de rastreio.
--
-- O segredo CRON_SECRET (gerado no VPS, em ~/loja3d/env) chega à função ctt-track pela variável
-- de ambiente e à base pelo Vault ('cron_secret'), que o deploy/migrate.sh atualiza a partir da
-- mesma variável. Sem segredo no Vault, a chamada segue sem x-cron-secret e a função recusa-a.
-- O segredo não fica escrito nesta migration nem no repositório. Seguro de repetir.

DO $$
DECLARE jid int;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'ctt-track-hourly';
  IF jid IS NOT NULL THEN PERFORM cron.unschedule(jid); END IF;
END $$;

SELECT cron.schedule(
  'ctt-track-hourly',
  '41 * * * *',
  $$
  SELECT net.http_post(
    url := coalesce(nullif(current_setting('app.functions_url', true), ''), 'http://web:8080/functions/v1') || '/ctt-track',
    headers := jsonb_strip_nulls(jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1)
    )),
    body := '{"all": true}'::jsonb
  );
  $$
);
