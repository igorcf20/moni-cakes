-- =============================================================================================
-- Campanhas de newsletter (recurso newsletter_campaigns em Admin > Recursos da loja, desligado por padrão).
--  1) newsletter_subscriptions (já existia; o rodapé e o cadastro gravam aqui): ganha idioma, chave para cancelar
--     a inscrição e data do cancelamento. Quem não é admin só cria inscrições ativas (o gatilho limpa o resto).
--  2) newsletter_campaigns: assunto, pré-visualização, texto (HTML do editor do Admin), produtos em destaque,
--     público (segmento e idioma) e estado: rascunho, na fila (send_at no futuro = agendada), enviando, enviada,
--     cancelada. Fora do rascunho o conteúdo fica fechado; o estado só muda pelas RPCs.
--  3) newsletter_deliveries: a lista de destinatários congelada ao pôr a campanha na fila (um por e-mail), com o
--     estado de cada envio. O envio em si espera pelo remetente de e-mail da loja (ainda desligado): até lá as
--     campanhas ficam na fila e nada sai.
--  4) newsletter_unsubscribe: a página /newsletter/cancelar?t=<chave> cancela a inscrição (sem conta, sempre ativa).
-- Regras em store_settings.newsletter: from_name, reply_to, footer_text.
-- =============================================================================================

-- ---------------------------------------------------------------------------------------------
-- Inscrições
-- ---------------------------------------------------------------------------------------------

ALTER TABLE public.newsletter_subscriptions ADD COLUMN IF NOT EXISTS locale text;
ALTER TABLE public.newsletter_subscriptions ADD COLUMN IF NOT EXISTS unsubscribe_token uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.newsletter_subscriptions ADD COLUMN IF NOT EXISTS unsubscribed_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS newsletter_subscriptions_token_key ON public.newsletter_subscriptions (unsubscribe_token);
CREATE INDEX IF NOT EXISTS newsletter_subscriptions_status_idx ON public.newsletter_subscriptions (status, created_at DESC);
COMMENT ON COLUMN public.newsletter_subscriptions.unsubscribe_token IS 'Chave do link "cancelar inscrição" dos e-mails (newsletter_unsubscribe).';

CREATE OR REPLACE FUNCTION public.newsletter_subscriptions_normalize()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  is_admin boolean := COALESCE(public.has_role(auth.uid(), 'admin'::app_role), false);
BEGIN
  NEW.email := lower(btrim(NEW.email));
  NEW.name := NULLIF(btrim(COALESCE(NEW.name, '')), '');
  IF NEW.locale IS NOT NULL AND NEW.locale NOT IN ('pt-BR', 'pt-PT', 'en', 'es') THEN NEW.locale := NULL; END IF;
  IF NEW.status NOT IN ('subscribed', 'unsubscribed') THEN NEW.status := 'subscribed'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NOT is_admin THEN
      NEW.status := 'subscribed';
      NEW.unsubscribe_token := gen_random_uuid();
      NEW.unsubscribed_at := NULL;
      NEW.source := CASE WHEN NEW.source IN ('newsletter', 'signup', 'popup', 'checkout') THEN NEW.source ELSE 'newsletter' END;
    END IF;
  ELSE
    NEW.unsubscribe_token := OLD.unsubscribe_token;
  END IF;
  IF NEW.status = 'unsubscribed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'unsubscribed') THEN NEW.unsubscribed_at := now(); END IF;
  IF NEW.status = 'subscribed' THEN NEW.unsubscribed_at := NULL; END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS newsletter_subscriptions_normalize ON public.newsletter_subscriptions;
CREATE TRIGGER newsletter_subscriptions_normalize BEFORE INSERT OR UPDATE ON public.newsletter_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.newsletter_subscriptions_normalize();

-- Admin também cria inscrições à mão (ex.: lista de uma feira).
DROP POLICY IF EXISTS "Admins add newsletter subscriptions" ON public.newsletter_subscriptions;
CREATE POLICY "Admins add newsletter subscriptions" ON public.newsletter_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- ---------------------------------------------------------------------------------------------
-- Campanhas e envios
-- ---------------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.newsletter_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  subject text NOT NULL DEFAULT '',
  preheader text,
  body text,
  product_ids text[] NOT NULL DEFAULT '{}',
  segment text NOT NULL DEFAULT 'all',
  locale text,
  status text NOT NULL DEFAULT 'draft',
  send_at timestamptz,
  queued_at timestamptz,
  sent_at timestamptz,
  cancelled_at timestamptz,
  recipients integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid DEFAULT auth.uid(),
  CONSTRAINT newsletter_campaigns_status CHECK (status IN ('draft', 'queued', 'sending', 'sent', 'cancelled')),
  CONSTRAINT newsletter_campaigns_segment CHECK (segment IN ('all', 'accounts', 'no_account', 'customers', 'no_orders')),
  CONSTRAINT newsletter_campaigns_locale CHECK (locale IS NULL OR locale IN ('pt-BR', 'pt-PT', 'en', 'es')),
  CONSTRAINT newsletter_campaigns_len CHECK (
    char_length(btrim(name)) BETWEEN 1 AND 200 AND char_length(subject) <= 200 AND (preheader IS NULL OR char_length(preheader) <= 200)
    AND (body IS NULL OR char_length(body) <= 200000) AND cardinality(product_ids) <= 6)
);
CREATE INDEX IF NOT EXISTS newsletter_campaigns_status_idx ON public.newsletter_campaigns (status, updated_at DESC);
COMMENT ON TABLE public.newsletter_campaigns IS 'Campanhas de newsletter (Admin > Newsletter). Fora do rascunho só mudam por newsletter_queue / newsletter_cancel.';

CREATE TABLE IF NOT EXISTS public.newsletter_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.newsletter_campaigns(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.newsletter_subscriptions(id) ON DELETE SET NULL,
  email text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT newsletter_deliveries_status CHECK (status IN ('queued', 'sent', 'failed', 'skipped'))
);
CREATE UNIQUE INDEX IF NOT EXISTS newsletter_deliveries_key ON public.newsletter_deliveries (campaign_id, email);
CREATE INDEX IF NOT EXISTS newsletter_deliveries_queue_idx ON public.newsletter_deliveries (status, created_at) WHERE status = 'queued';
COMMENT ON TABLE public.newsletter_deliveries IS 'Destinatários de cada campanha (congelados ao pôr na fila) e o estado de cada envio.';

ALTER TABLE public.newsletter_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletter_deliveries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage newsletter campaigns" ON public.newsletter_campaigns;
CREATE POLICY "Admins manage newsletter campaigns" ON public.newsletter_campaigns
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins read newsletter deliveries" ON public.newsletter_deliveries;
CREATE POLICY "Admins read newsletter deliveries" ON public.newsletter_deliveries
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

REVOKE ALL ON public.newsletter_campaigns, public.newsletter_deliveries FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.newsletter_campaigns TO authenticated;
GRANT SELECT ON public.newsletter_deliveries TO authenticated;
GRANT ALL ON public.newsletter_campaigns, public.newsletter_deliveries TO service_role;

-- Rascunho: o Admin edita à vontade. Fora dele: só as RPCs mudam (loja3d.newsletter_rpc = on).
CREATE OR REPLACE FUNCTION public.newsletter_campaigns_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('loja3d.newsletter_rpc', true) = 'on' THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status <> 'draft' THEN RAISE EXCEPTION 'locked'; END IF;
  NEW.name := btrim(NEW.name);
  NEW.subject := btrim(COALESCE(NEW.subject, ''));
  NEW.preheader := NULLIF(btrim(COALESCE(NEW.preheader, '')), '');
  NEW.product_ids := COALESCE((SELECT array_agg(x ORDER BY o) FROM (
    SELECT DISTINCT ON (x) x, o FROM unnest(COALESCE(NEW.product_ids, '{}')) WITH ORDINALITY u(x, o) WHERE x <> '' ORDER BY x, o) s), '{}');
  NEW.status := 'draft';
  NEW.queued_at := NULL;
  NEW.sent_at := NULL;
  NEW.cancelled_at := NULL;
  NEW.recipients := 0;
  NEW.updated_at := now();
  NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS newsletter_campaigns_guard ON public.newsletter_campaigns;
CREATE TRIGGER newsletter_campaigns_guard BEFORE INSERT OR UPDATE ON public.newsletter_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.newsletter_campaigns_guard();

-- Campanha na fila ou a sair não se apaga (cancele primeiro).
CREATE OR REPLACE FUNCTION public.newsletter_campaigns_no_delete_queued()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.status IN ('queued', 'sending') THEN RAISE EXCEPTION 'locked'; END IF;
  RETURN OLD;
END;
$function$;
DROP TRIGGER IF EXISTS newsletter_campaigns_no_delete_queued ON public.newsletter_campaigns;
CREATE TRIGGER newsletter_campaigns_no_delete_queued BEFORE DELETE ON public.newsletter_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.newsletter_campaigns_no_delete_queued();

DO $$
BEGIN
  IF to_regprocedure('public.admin_activity_capture()') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS zz_admin_activity ON public.newsletter_campaigns;
    CREATE TRIGGER zz_admin_activity AFTER INSERT OR UPDATE OR DELETE ON public.newsletter_campaigns
      FOR EACH ROW EXECUTE FUNCTION public.admin_activity_capture();
    DROP TRIGGER IF EXISTS zz_admin_activity ON public.newsletter_subscriptions;
    CREATE TRIGGER zz_admin_activity AFTER INSERT OR UPDATE OR DELETE ON public.newsletter_subscriptions
      FOR EACH ROW EXECUTE FUNCTION public.admin_activity_capture();
  END IF;
END $$;

INSERT INTO public.store_settings (key, value)
VALUES ('newsletter', '{"from_name": "", "reply_to": "", "footer_text": ""}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------------------------
-- Público de uma campanha
-- ---------------------------------------------------------------------------------------------

-- Inscritos ativos do segmento e do idioma (NULL = todos). Clientes = conta ou e-mail com pedido pago não cancelado.
CREATE OR REPLACE FUNCTION public._newsletter_audience(_segment text, _locale text)
RETURNS TABLE (subscription_id uuid, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH subs AS (
    SELECT s.id, lower(s.email) AS email,
      EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = lower(s.email)) AS has_account,
      EXISTS (SELECT 1 FROM public.orders o
               WHERE o.payment_status = 'paid' AND o.status <> 'cancelled'
                 AND (lower(o.guest_email) = lower(s.email)
                      OR o.user_id IN (SELECT u.id FROM auth.users u WHERE lower(u.email) = lower(s.email)))) AS bought
      FROM public.newsletter_subscriptions s
     WHERE s.status = 'subscribed' AND (_locale IS NULL OR s.locale = _locale)
  )
  SELECT id, email FROM subs
   WHERE CASE _segment
     WHEN 'accounts' THEN has_account
     WHEN 'no_account' THEN NOT has_account
     WHEN 'customers' THEN bought
     WHEN 'no_orders' THEN NOT bought
     ELSE true END;
$function$;
REVOKE ALL ON FUNCTION public._newsletter_audience(text, text) FROM PUBLIC, anon, authenticated;

-- Quantos recebem com este segmento e idioma (prévia no Admin).
CREATE OR REPLACE FUNCTION public.newsletter_audience_count(_segment text, _locale text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN (SELECT count(DISTINCT email) FROM public._newsletter_audience(_segment, _locale));
END;
$function$;
REVOKE ALL ON FUNCTION public.newsletter_audience_count(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.newsletter_audience_count(text, text) TO authenticated;

-- ---------------------------------------------------------------------------------------------
-- Pôr na fila e cancelar
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.newsletter_queue(_campaign uuid, _send_at timestamptz DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  c record;
  n integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF NOT public.feature_enabled('newsletter_campaigns', false) THEN RAISE EXCEPTION 'feature_off'; END IF;
  SELECT * INTO c FROM public.newsletter_campaigns WHERE id = _campaign FOR UPDATE;
  IF c.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF c.status <> 'draft' THEN RAISE EXCEPTION 'not_draft'; END IF;
  IF btrim(c.subject) = '' OR btrim(regexp_replace(COALESCE(c.body, ''), '<[^>]*>', '', 'g')) = '' THEN RAISE EXCEPTION 'empty'; END IF;
  INSERT INTO public.newsletter_deliveries (campaign_id, subscription_id, email)
  SELECT DISTINCT ON (a.email) _campaign, a.subscription_id, a.email FROM public._newsletter_audience(c.segment, c.locale) a
  ORDER BY a.email
  ON CONFLICT (campaign_id, email) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RAISE EXCEPTION 'no_recipients'; END IF;
  PERFORM set_config('loja3d.newsletter_rpc', 'on', true);
  UPDATE public.newsletter_campaigns
     SET status = 'queued', send_at = GREATEST(COALESCE(_send_at, now()), now()), queued_at = now(), recipients = n, updated_by = auth.uid()
   WHERE id = _campaign;
  PERFORM set_config('loja3d.newsletter_rpc', 'off', true);
  RETURN jsonb_build_object('recipients', n);
END;
$function$;
REVOKE ALL ON FUNCTION public.newsletter_queue(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.newsletter_queue(uuid, timestamptz) TO authenticated;

-- Cancela uma campanha na fila: o que ainda não saiu fica de fora. _to_draft = volta a rascunho (se nada saiu).
CREATE OR REPLACE FUNCTION public.newsletter_cancel(_campaign uuid, _to_draft boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  c record;
  sent integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO c FROM public.newsletter_campaigns WHERE id = _campaign FOR UPDATE;
  IF c.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF c.status NOT IN ('queued', 'sending') THEN RAISE EXCEPTION 'not_queued'; END IF;
  SELECT count(*) INTO sent FROM public.newsletter_deliveries WHERE campaign_id = _campaign AND status IN ('sent', 'failed');
  PERFORM set_config('loja3d.newsletter_rpc', 'on', true);
  IF _to_draft AND sent = 0 THEN
    DELETE FROM public.newsletter_deliveries WHERE campaign_id = _campaign;
    UPDATE public.newsletter_campaigns SET status = 'draft', queued_at = NULL, recipients = 0, updated_by = auth.uid() WHERE id = _campaign;
  ELSE
    UPDATE public.newsletter_deliveries SET status = 'skipped' WHERE campaign_id = _campaign AND status = 'queued';
    UPDATE public.newsletter_campaigns SET status = 'cancelled', cancelled_at = now(), updated_by = auth.uid() WHERE id = _campaign;
  END IF;
  PERFORM set_config('loja3d.newsletter_rpc', 'off', true);
END;
$function$;
REVOKE ALL ON FUNCTION public.newsletter_cancel(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.newsletter_cancel(uuid, boolean) TO authenticated;

-- Números de cada campanha: { <campanha>: { queued, sent, failed, skipped } }
CREATE OR REPLACE FUNCTION public.admin_newsletter_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN COALESCE((
    SELECT jsonb_object_agg(campaign_id, v) FROM (
      SELECT campaign_id, jsonb_build_object(
        'queued', count(*) FILTER (WHERE status = 'queued'), 'sent', count(*) FILTER (WHERE status = 'sent'),
        'failed', count(*) FILTER (WHERE status = 'failed'), 'skipped', count(*) FILTER (WHERE status = 'skipped')) AS v
        FROM public.newsletter_deliveries GROUP BY campaign_id) s), '{}'::jsonb);
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_newsletter_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_newsletter_stats() TO authenticated;

-- ---------------------------------------------------------------------------------------------
-- Site: cancelar a inscrição pelo link do e-mail (sem conta; vale com o recurso ligado ou não)
-- ---------------------------------------------------------------------------------------------

-- Devolve o e-mail mascarado (a***@dominio) e se já estava cancelado; chave desconhecida = not_found.
CREATE OR REPLACE FUNCTION public.newsletter_unsubscribe(_token uuid, _confirm boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  s record;
  masked text;
BEGIN
  SELECT id, email, status INTO s FROM public.newsletter_subscriptions WHERE unsubscribe_token = _token;
  IF s.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  masked := left(split_part(s.email, '@', 1), 1) || '***@' || split_part(s.email, '@', 2);
  IF _confirm AND s.status = 'subscribed' THEN
    UPDATE public.newsletter_subscriptions SET status = 'unsubscribed' WHERE id = s.id;
    UPDATE public.newsletter_deliveries SET status = 'skipped' WHERE subscription_id = s.id AND status = 'queued';
  END IF;
  RETURN jsonb_build_object('email', masked, 'was_subscribed', s.status = 'subscribed', 'unsubscribed', _confirm OR s.status <> 'subscribed');
END;
$function$;
REVOKE ALL ON FUNCTION public.newsletter_unsubscribe(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.newsletter_unsubscribe(uuid, boolean) TO anon, authenticated;
