-- =============================================================================================
-- Moedas e câmbio (Admin > Configurações > Moedas e câmbio; atualização automática = recurso auto_exchange_rates,
-- desligado por padrão). As taxas continuam em store_settings.currency_settings (o site converte os preços com elas).
--  1) exchange_rate_history  cada taxa que muda, com a origem (BCE ou à mão) e a data das taxas do BCE.
--                            Escrita só pelo trigger abaixo; leitura só do Admin.
--  2) trigger em store_settings (key currency_settings): grava no histórico as taxas novas ou alteradas.
--  3) cron diário exchange-rates-daily: chama a função update-exchange-rates (taxas do BCE), que não faz nada com o
--     recurso desligado. Segredo CRON_SECRET pelo Vault, como o ctt-track-hourly.
-- =============================================================================================

CREATE TABLE IF NOT EXISTS public.exchange_rate_history (
  id bigserial PRIMARY KEY,
  base text NOT NULL,
  currency text NOT NULL,
  rate numeric(20, 8) NOT NULL,
  previous_rate numeric(20, 8),
  source text NOT NULL DEFAULT 'manual',
  rate_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exchange_rate_history_codes CHECK (base ~ '^[A-Z]{3}$' AND currency ~ '^[A-Z]{3}$'),
  CONSTRAINT exchange_rate_history_source CHECK (source IN ('ecb', 'manual')),
  CONSTRAINT exchange_rate_history_rate CHECK (rate > 0)
);
CREATE INDEX IF NOT EXISTS exchange_rate_history_recent_idx ON public.exchange_rate_history (created_at DESC);
CREATE INDEX IF NOT EXISTS exchange_rate_history_currency_idx ON public.exchange_rate_history (currency, created_at DESC);

COMMENT ON TABLE public.exchange_rate_history IS 'Histórico das taxas de câmbio (Admin > Moedas e câmbio). Escrito pelo trigger de store_settings.';

ALTER TABLE public.exchange_rate_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read exchange rate history" ON public.exchange_rate_history;
CREATE POLICY "Admins read exchange rate history" ON public.exchange_rate_history
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
REVOKE ALL ON public.exchange_rate_history FROM anon, authenticated;
GRANT SELECT ON public.exchange_rate_history TO authenticated;
GRANT ALL ON public.exchange_rate_history TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.exchange_rate_history_id_seq TO service_role;

-- ---------------------------------------------------------------------------------------------
-- Histórico: só as moedas cuja taxa mudou (ou entrou). Origem = rates_source do valor gravado.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.currency_settings_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_rates jsonb := CASE WHEN jsonb_typeof(NEW.value -> 'rates') = 'object' THEN NEW.value -> 'rates' ELSE '{}'::jsonb END;
  old_rates jsonb := '{}'::jsonb;
  base text := COALESCE(NULLIF(NEW.value ->> 'default', ''), 'BRL');
  src text := CASE WHEN NEW.value ->> 'rates_source' = 'ecb' THEN 'ecb' ELSE 'manual' END;
  rdate date;
  r record;
  old_val numeric;
BEGIN
  IF NEW.key <> 'currency_settings' THEN RETURN NEW; END IF;
  IF base !~ '^[A-Z]{3}$' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND jsonb_typeof(OLD.value -> 'rates') = 'object' AND COALESCE(OLD.value ->> 'default', 'BRL') = base THEN
    old_rates := OLD.value -> 'rates';
  END IF;
  BEGIN
    rdate := CASE WHEN src = 'ecb' THEN (NEW.value ->> 'rate_date')::date END;
  EXCEPTION WHEN others THEN rdate := NULL;
  END;
  FOR r IN SELECT key, value FROM jsonb_each(new_rates) LOOP
    CONTINUE WHEN r.key !~ '^[A-Z]{3}$' OR r.key = base OR jsonb_typeof(r.value) <> 'number';
    CONTINUE WHEN (r.value #>> '{}')::numeric <= 0;
    old_val := CASE WHEN jsonb_typeof(old_rates -> r.key) = 'number' THEN (old_rates ->> r.key)::numeric END;
    CONTINUE WHEN old_val IS NOT NULL AND old_val = (r.value #>> '{}')::numeric;
    INSERT INTO public.exchange_rate_history (base, currency, rate, previous_rate, source, rate_date)
    VALUES (base, r.key, (r.value #>> '{}')::numeric, old_val, src, rdate);
  END LOOP;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS currency_settings_history_aiu ON public.store_settings;
CREATE TRIGGER currency_settings_history_aiu
AFTER INSERT OR UPDATE OF value ON public.store_settings
FOR EACH ROW EXECUTE FUNCTION public.currency_settings_history();

REVOKE ALL ON FUNCTION public.currency_settings_history() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Cron diário: o BCE publica por volta das 16h (hora da Europa Central). A função só busca as taxas com o
-- recurso auto_exchange_rates ligado.
-- ---------------------------------------------------------------------------------------------
DO $$
DECLARE jid int;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'exchange-rates-daily';
  IF jid IS NOT NULL THEN PERFORM cron.unschedule(jid); END IF;
END $$;

SELECT cron.schedule(
  'exchange-rates-daily',
  '20 16 * * *',
  $$
  SELECT net.http_post(
    url := coalesce(nullif(current_setting('app.functions_url', true), ''), 'http://web:8080/functions/v1') || '/update-exchange-rates',
    headers := jsonb_strip_nulls(jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1)
    )),
    body := '{"cron": true}'::jsonb
  );
  $$
);
