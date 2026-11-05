-- =============================================================================================
-- Pop-ups de captação (recurso lead_popups em Admin > Recursos da loja, ligado por padrão; sem pop-up ativo nada aparece).
--  1) lead_popups: cada pop-up desenhado no Admin (Aparência da loja > Pop-ups): nome, estado (rascunho, ativo,
--     pausado), desenho livre em content (tamanho no computador e no celular, fundo, elementos arrastados), regras de
--     quando aparece em rules, prioridade, início e fim, cupom mostrado depois de enviar e se o e-mail entra na lista
--     da newsletter. O formato de content e rules está em src/lib/leadPopups.ts (o site limpa tudo antes de usar).
--  2) popup_leads: os contatos recebidos (e-mail, telefone, nome, campos livres, aceite, idioma, país, página). Só o
--     Admin lê e apaga. Ficam mesmo que o pop-up seja apagado (popup_name guarda o nome).
-- O site só usa as RPCs site_popups (pop-ups ativos, sem cupom nem números), popup_seen (conta uma exibição) e
-- submit_popup_lead (confere os campos com o desenho do pop-up, limita tentativas e devolve o cupom).
-- Nada é enviado por e-mail: o envio espera pelo remetente da loja.
-- =============================================================================================

CREATE TABLE IF NOT EXISTS public.lead_popups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  priority integer NOT NULL DEFAULT 0,
  starts_at timestamptz,
  ends_at timestamptz,
  coupon_code text,
  save_newsletter boolean NOT NULL DEFAULT true,
  views integer NOT NULL DEFAULT 0,
  guest_salt uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid DEFAULT auth.uid(),
  CONSTRAINT lead_popups_status CHECK (status IN ('draft', 'active', 'paused')),
  CONSTRAINT lead_popups_json CHECK (jsonb_typeof(content) = 'object' AND jsonb_typeof(rules) = 'object'
    AND octet_length(content::text) <= 300000 AND octet_length(rules::text) <= 20000),
  CONSTRAINT lead_popups_dates CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at),
  CONSTRAINT lead_popups_len CHECK (char_length(btrim(name)) BETWEEN 1 AND 120 AND (coupon_code IS NULL OR char_length(coupon_code) <= 60)),
  CONSTRAINT lead_popups_priority CHECK (priority BETWEEN -1000 AND 1000)
);
CREATE INDEX IF NOT EXISTS lead_popups_status_idx ON public.lead_popups (status, priority, created_at DESC);
COMMENT ON TABLE public.lead_popups IS 'Pop-ups de captação desenhados no Admin. O site lê por site_popups e envia por submit_popup_lead.';
COMMENT ON COLUMN public.lead_popups.content IS 'Desenho do pop-up (src/lib/leadPopups.ts, PopupContent).';
COMMENT ON COLUMN public.lead_popups.rules IS 'Quando aparece (src/lib/leadPopups.ts, PopupRules).';
COMMENT ON COLUMN public.lead_popups.coupon_code IS 'Cupom mostrado só depois de enviar (devolvido por submit_popup_lead, nunca por site_popups).';
COMMENT ON COLUMN public.lead_popups.guest_salt IS 'Sal do resumo que limita as tentativas de cada visitante. Nunca sai do banco.';

CREATE TABLE IF NOT EXISTS public.popup_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  popup_id uuid REFERENCES public.lead_popups(id) ON DELETE SET NULL,
  popup_name text,
  email text,
  phone text,
  name text,
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  consent boolean NOT NULL DEFAULT false,
  newsletter boolean NOT NULL DEFAULT false,
  locale text,
  country text,
  path text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  visitor_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT popup_leads_len CHECK ((email IS NULL OR char_length(email) <= 300) AND (phone IS NULL OR char_length(phone) <= 40)
    AND (name IS NULL OR char_length(name) <= 300) AND (path IS NULL OR char_length(path) <= 300) AND octet_length(extra::text) <= 8000)
);
CREATE INDEX IF NOT EXISTS popup_leads_popup_idx ON public.popup_leads (popup_id, created_at DESC);
CREATE INDEX IF NOT EXISTS popup_leads_created_idx ON public.popup_leads (created_at DESC);
CREATE INDEX IF NOT EXISTS popup_leads_visitor_idx ON public.popup_leads (visitor_hash, created_at DESC);
COMMENT ON TABLE public.popup_leads IS 'Contatos recebidos pelos pop-ups (Admin > Pop-ups > Contatos). Escritos só por submit_popup_lead.';

ALTER TABLE public.lead_popups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.popup_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage lead popups" ON public.lead_popups;
CREATE POLICY "Admins manage lead popups" ON public.lead_popups
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins read and delete popup leads" ON public.popup_leads;
CREATE POLICY "Admins read and delete popup leads" ON public.popup_leads
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

REVOKE ALL ON public.lead_popups, public.popup_leads FROM anon, authenticated;
GRANT SELECT (id, name, status, content, rules, priority, starts_at, ends_at, coupon_code, save_newsletter, views,
  created_at, updated_at, updated_by) ON public.lead_popups TO authenticated;
GRANT INSERT (name, status, content, rules, priority, starts_at, ends_at, coupon_code, save_newsletter) ON public.lead_popups TO authenticated;
GRANT UPDATE (name, status, content, rules, priority, starts_at, ends_at, coupon_code, save_newsletter) ON public.lead_popups TO authenticated;
GRANT DELETE ON public.lead_popups TO authenticated;
GRANT SELECT (id, popup_id, popup_name, email, phone, name, extra, consent, newsletter, locale, country, path, user_id, created_at),
  DELETE ON public.popup_leads TO authenticated;
GRANT ALL ON public.lead_popups, public.popup_leads TO service_role;

CREATE OR REPLACE FUNCTION public.lead_popups_normalize()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.name := btrim(NEW.name);
  NEW.coupon_code := NULLIF(upper(btrim(COALESCE(NEW.coupon_code, ''))), '');
  IF TG_OP = 'UPDATE' THEN
    NEW.guest_salt := OLD.guest_salt;
    -- O contador só sobe por popup_seen; o Admin pode zerá-lo.
    IF NEW.views > OLD.views AND current_setting('loja3d.popup_seen', true) IS DISTINCT FROM '1' THEN NEW.views := OLD.views; END IF;
  END IF;
  NEW.updated_at := now();
  NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS lead_popups_normalize ON public.lead_popups;
CREATE TRIGGER lead_popups_normalize BEFORE INSERT OR UPDATE ON public.lead_popups
  FOR EACH ROW EXECUTE FUNCTION public.lead_popups_normalize();

DO $$
BEGIN
  IF to_regprocedure('public.admin_activity_capture()') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS zz_admin_activity ON public.lead_popups;
    CREATE TRIGGER zz_admin_activity AFTER INSERT OR UPDATE OR DELETE ON public.lead_popups
      FOR EACH ROW EXECUTE FUNCTION public.admin_activity_capture();
    DROP TRIGGER IF EXISTS zz_admin_activity ON public.popup_leads;
    CREATE TRIGGER zz_admin_activity AFTER INSERT OR UPDATE OR DELETE ON public.popup_leads
      FOR EACH ROW EXECUTE FUNCTION public.admin_activity_capture();
  END IF;
END $$;

-- ---------------------------------------------------------------------------------------------
-- Site
-- ---------------------------------------------------------------------------------------------

-- Pop-ups que o site pode mostrar agora (ativos e dentro das datas), sem cupom, sal nem números.
-- _preview: um administrador vê qualquer pop-up dele (rascunho incluído) para testar na loja.
CREATE OR REPLACE FUNCTION public.site_popups(_preview uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF _preview IS NOT NULL THEN
    IF NOT COALESCE(public.has_role(auth.uid(), 'admin'::app_role), false) THEN RETURN '[]'::jsonb; END IF;
    RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'priority', p.priority, 'content', p.content, 'rules', p.rules))
                       FROM public.lead_popups p WHERE p.id = _preview), '[]'::jsonb);
  END IF;
  IF NOT public.feature_enabled('lead_popups', true) THEN RETURN '[]'::jsonb; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', p.id, 'priority', p.priority, 'content', p.content, 'rules', p.rules)
                     ORDER BY p.priority, p.created_at)
      FROM (SELECT * FROM public.lead_popups
             WHERE status = 'active' AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at > now())
             ORDER BY priority, created_at LIMIT 20) p), '[]'::jsonb);
END;
$function$;
REVOKE ALL ON FUNCTION public.site_popups(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.site_popups(uuid) TO anon, authenticated;

-- Conta uma exibição (só de pop-up ativo).
CREATE OR REPLACE FUNCTION public.popup_seen(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.feature_enabled('lead_popups', true) THEN RETURN; END IF;
  PERFORM set_config('loja3d.popup_seen', '1', true);
  UPDATE public.lead_popups SET views = views + 1
   WHERE id = _id AND status = 'active' AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at > now());
  PERFORM set_config('loja3d.popup_seen', '', true);
END;
$function$;
REVOKE ALL ON FUNCTION public.popup_seen(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.popup_seen(uuid) TO anon, authenticated;

-- Resumo do visitante (rede + navegador + sal do pop-up): limita tentativas sem guardar o IP.
CREATE OR REPLACE FUNCTION public._popup_visitor_hash(_salt uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  hdr jsonb;
BEGIN
  BEGIN
    hdr := NULLIF(current_setting('request.headers', true), '')::jsonb;
  EXCEPTION WHEN others THEN hdr := NULL;
  END;
  RETURN md5(_salt::text || '|' || btrim(split_part(COALESCE(hdr ->> 'x-real-ip', hdr ->> 'x-forwarded-for', ''), ',', 1))
    || '|' || left(COALESCE(hdr ->> 'user-agent', ''), 300));
END;
$function$;
REVOKE ALL ON FUNCTION public._popup_visitor_hash(uuid) FROM PUBLIC, anon, authenticated;

-- Envio do formulário. Confere cada campo do desenho (obrigatório, e-mail, telefone), o aceite e as tentativas;
-- grava o contato, põe o e-mail na lista da newsletter quando o pop-up pede e o visitante aceitou, e devolve o cupom.
-- Erros estáveis: feature_off, not_found, invalid:<campo>:<motivo>, empty, consent, rate_limited.
-- Mesmas regras de leadErrors em src/lib/leadPopups.ts.
CREATE OR REPLACE FUNCTION public.submit_popup_lead(
  _popup uuid, _values jsonb, _consent boolean DEFAULT false, _locale text DEFAULT NULL, _country text DEFAULT NULL, _path text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  p record;
  f jsonb;
  vals jsonb := CASE WHEN jsonb_typeof(_values) = 'object' THEN _values ELSE '{}'::jsonb END;
  extra_in jsonb;
  extra_out jsonb := '{}'::jsonb;
  v text;
  kind text;
  fkey text;
  v_email text;
  v_phone text;
  v_name text;
  any_value boolean := false;
  has_consent_el boolean := false;
  consent_required boolean := false;
  h text;
  dup boolean := false;
  to_list boolean := false;
BEGIN
  IF NOT public.feature_enabled('lead_popups', true) THEN RAISE EXCEPTION 'feature_off'; END IF;
  SELECT * INTO p FROM public.lead_popups
   WHERE id = _popup AND status = 'active' AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at > now());
  IF p.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  extra_in := CASE WHEN jsonb_typeof(vals -> 'extra') = 'object' THEN vals -> 'extra' ELSE '{}'::jsonb END;

  FOR f IN SELECT e FROM jsonb_array_elements(COALESCE(p.content #> '{form,elements}', '[]'::jsonb)) e LOOP
    IF f ->> 'type' = 'consent' THEN
      has_consent_el := true;
      consent_required := consent_required OR COALESCE((f ->> 'required')::boolean, true);
      CONTINUE;
    END IF;
    CONTINUE WHEN f ->> 'type' IS DISTINCT FROM 'field';
    kind := COALESCE(f ->> 'field', 'email');
    fkey := CASE WHEN kind = 'custom' THEN COALESCE(f ->> 'key', '') ELSE kind END;
    v := btrim(COALESCE(CASE WHEN kind = 'custom' THEN extra_in ->> fkey ELSE vals ->> kind END, ''));
    IF char_length(v) > 300 THEN RAISE EXCEPTION 'invalid:%:too_long', fkey; END IF;
    IF v = '' THEN
      IF COALESCE((f ->> 'required')::boolean, false) THEN RAISE EXCEPTION 'invalid:%:required', fkey; END IF;
      CONTINUE;
    END IF;
    any_value := true;
    IF kind = 'email' THEN
      IF v !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' THEN RAISE EXCEPTION 'invalid:email:email'; END IF;
      v_email := lower(v);
    ELSIF kind = 'phone' THEN
      IF char_length(regexp_replace(v, '\D', '', 'g')) NOT BETWEEN 8 AND 15 THEN RAISE EXCEPTION 'invalid:phone:phone'; END IF;
      v_phone := left(v, 40);
    ELSIF kind = 'name' THEN
      v_name := v;
    ELSIF fkey ~ '^[a-z0-9_]{1,40}$' THEN
      extra_out := extra_out || jsonb_build_object(fkey, v);
    END IF;
  END LOOP;

  IF NOT any_value THEN RAISE EXCEPTION 'empty'; END IF;
  IF consent_required AND NOT COALESCE(_consent, false) THEN RAISE EXCEPTION 'consent'; END IF;

  h := public._popup_visitor_hash(p.guest_salt);
  IF (SELECT count(*) FROM public.popup_leads WHERE visitor_hash = h AND created_at > now() - interval '10 minutes') >= 5 THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;

  -- O mesmo contato no mesmo pop-up: não grava de novo, mas devolve o cupom.
  SELECT EXISTS (SELECT 1 FROM public.popup_leads l WHERE l.popup_id = p.id
                   AND ((v_email IS NOT NULL AND l.email = v_email) OR (v_phone IS NOT NULL AND l.phone = v_phone))) INTO dup;

  IF NOT dup THEN
    to_list := p.save_newsletter AND v_email IS NOT NULL AND has_consent_el AND COALESCE(_consent, false);
    INSERT INTO public.popup_leads (popup_id, popup_name, email, phone, name, extra, consent, newsletter, locale, country, path, user_id, visitor_hash)
    VALUES (p.id, p.name, v_email, v_phone, v_name, extra_out, COALESCE(_consent, false), to_list,
            CASE WHEN _locale IN ('pt-BR', 'pt-PT', 'en', 'es') THEN _locale END,
            CASE WHEN _country ~ '^[A-Z]{2}$' THEN _country END,
            left(NULLIF(btrim(COALESCE(_path, '')), ''), 300), auth.uid(), h);
    IF to_list THEN
      INSERT INTO public.newsletter_subscriptions (email, name, phone, source, locale)
      VALUES (v_email, v_name, v_phone, 'popup', CASE WHEN _locale IN ('pt-BR', 'pt-PT', 'en', 'es') THEN _locale END)
      ON CONFLICT (email) DO NOTHING;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'duplicate', dup, 'coupon', p.coupon_code);
END;
$function$;
REVOKE ALL ON FUNCTION public.submit_popup_lead(uuid, jsonb, boolean, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_popup_lead(uuid, jsonb, boolean, text, text, text) TO anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------------------------------------

-- { <pop-up>: { leads, last, today } }
CREATE OR REPLACE FUNCTION public.admin_popup_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN COALESCE((
    SELECT jsonb_object_agg(s.popup_id, jsonb_build_object('leads', s.n, 'last', s.last, 'week', s.week))
      FROM (SELECT popup_id, count(*) AS n, max(created_at) AS last,
                   count(*) FILTER (WHERE created_at > now() - interval '7 days') AS week
              FROM public.popup_leads WHERE popup_id IS NOT NULL GROUP BY popup_id) s), '{}'::jsonb);
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_popup_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_popup_stats() TO authenticated;

-- Zera o contador de exibições de um pop-up (os contatos ficam).
CREATE OR REPLACE FUNCTION public.admin_popup_reset_views(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.lead_popups SET views = 0 WHERE id = _id;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_popup_reset_views(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_popup_reset_views(uuid) TO authenticated;
