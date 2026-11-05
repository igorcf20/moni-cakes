-- =============================================================================================
-- Registo de atividade do Admin (recurso activity_log em Admin > Recursos da loja, ligado por padrão):
-- Admin > Configurações > Registo de atividade e blocos nas páginas do produto e do pedido.
--  1) admin_activity_log   quem mudou o quê: criar, alterar ou apagar, em que tabela e registo, campo a campo
--                          (antes e depois), com IP e navegador. Escrito só pelo trigger; leitura do Admin.
--  2) trigger admin_activity_capture nas tabelas que o Admin gere (lista abaixo; tabela que não exista é ignorada).
--     Só regista quando quem faz a mudança é administrador (auth.uid() com papel admin): ações de clientes e do
--     servidor (service_role) não entram. Segredos nunca entram: campos com nome de senha, token, chave ou
--     credencial ficam "***", e integration_credentials só regista que campos mudaram.
--     Com o recurso desligado deixa de registar, mas ligar ou desligar recursos fica sempre registado.
--     Funções do servidor que usam a chave de serviço em nome de um admin chamam admin_activity_record.
--  3) admin_activity_list, admin_activity_summary, admin_activity_actors e admin_activity_logins (entradas na conta
--     dos administradores, de auth.audit_log_entries). Só admin.
--  4) store_settings.activity_log.retention_days (padrão 365; 0 = guardar tudo) e cron diário activity-log-purge.
-- =============================================================================================

CREATE TABLE IF NOT EXISTS public.admin_activity_log (
  id bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  actor uuid,
  actor_email text,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text,
  entity_label text,
  parent_id text,
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip text,
  user_agent text,
  CONSTRAINT admin_activity_log_action CHECK (action IN ('create', 'update', 'delete'))
);
CREATE INDEX IF NOT EXISTS admin_activity_log_recent_idx ON public.admin_activity_log (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS admin_activity_log_entity_idx ON public.admin_activity_log (entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_activity_log_parent_idx ON public.admin_activity_log (parent_id, created_at DESC) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS admin_activity_log_actor_idx ON public.admin_activity_log (actor, created_at DESC);

COMMENT ON TABLE public.admin_activity_log IS 'Registo de atividade do Admin. Escrito só pelo trigger admin_activity_capture.';

ALTER TABLE public.admin_activity_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read activity log" ON public.admin_activity_log;
CREATE POLICY "Admins read activity log" ON public.admin_activity_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
REVOKE ALL ON public.admin_activity_log FROM anon, authenticated;
GRANT SELECT ON public.admin_activity_log TO authenticated;
GRANT ALL ON public.admin_activity_log TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.admin_activity_log_id_seq TO service_role;

-- ---------------------------------------------------------------------------------------------
-- Diferença campo a campo. Objetos JSON (ex.: store_settings.value) descem um nível ("value.markup").
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._activity_sensitive(_field text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT _field ~* '(pass|secret|token|api_?key|private|credential|signature|access_?key)';
$$;

/** Valor para o registo: texto longo cortado, objetos e listas como texto curto. */
CREATE OR REPLACE FUNCTION public._activity_value(_v jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN _v IS NULL OR jsonb_typeof(_v) = 'null' THEN 'null'::jsonb
    WHEN jsonb_typeof(_v) = 'string' AND char_length(_v #>> '{}') > 300 THEN to_jsonb(left(_v #>> '{}', 300) || '...')
    WHEN jsonb_typeof(_v) IN ('object', 'array') AND char_length(_v::text) > 300 THEN to_jsonb(left(_v::text, 300) || '...')
    ELSE _v
  END;
$$;

CREATE OR REPLACE FUNCTION public._activity_diff(_old jsonb, _new jsonb, _hide_values boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $function$
DECLARE
  o jsonb := COALESCE(_old, '{}'::jsonb);
  n jsonb := COALESCE(_new, '{}'::jsonb);
  out jsonb := '{}'::jsonb;
  k text;
  sk text;
  ov jsonb;
  nv jsonb;
  cnt int := 0;
BEGIN
  FOR k IN SELECT DISTINCT x FROM (SELECT jsonb_object_keys(o) AS x UNION SELECT jsonb_object_keys(n)) s ORDER BY x LOOP
    CONTINUE WHEN k IN ('updated_at', 'created_at', 'added_at', 'search_vector', 'last_updated_by');
    ov := o -> k; nv := n -> k;
    CONTINUE WHEN ov IS NOT DISTINCT FROM nv;
    -- Num registo novo ou apagado, campos vazios não interessam.
    CONTINUE WHEN (_old IS NULL OR _new IS NULL) AND COALESCE(jsonb_typeof(COALESCE(ov, nv)), 'null') = 'null';
    EXIT WHEN cnt >= 60;
    IF _hide_values OR public._activity_sensitive(k) THEN
      out := out || jsonb_build_object(k, jsonb_build_object('o', CASE WHEN ov IS NULL OR jsonb_typeof(ov) = 'null' THEN 'null'::jsonb ELSE '"***"'::jsonb END,
                                                             'n', CASE WHEN nv IS NULL OR jsonb_typeof(nv) = 'null' THEN 'null'::jsonb ELSE '"***"'::jsonb END));
      cnt := cnt + 1;
    ELSIF _old IS NOT NULL AND _new IS NOT NULL AND jsonb_typeof(ov) = 'object' AND jsonb_typeof(nv) = 'object' THEN
      FOR sk IN SELECT DISTINCT x FROM (SELECT jsonb_object_keys(ov) AS x UNION SELECT jsonb_object_keys(nv)) s ORDER BY x LOOP
        CONTINUE WHEN (ov -> sk) IS NOT DISTINCT FROM (nv -> sk);
        EXIT WHEN cnt >= 60;
        IF public._activity_sensitive(sk) THEN
          out := out || jsonb_build_object(k || '.' || sk, jsonb_build_object('o', '"***"'::jsonb, 'n', '"***"'::jsonb));
        ELSE
          out := out || jsonb_build_object(k || '.' || sk, jsonb_build_object('o', public._activity_value(ov -> sk), 'n', public._activity_value(nv -> sk)));
        END IF;
        cnt := cnt + 1;
      END LOOP;
    ELSE
      out := out || jsonb_build_object(k, jsonb_build_object('o', public._activity_value(ov), 'n', public._activity_value(nv)));
      cnt := cnt + 1;
    END IF;
  END LOOP;
  RETURN out;
END;
$function$;

-- ---------------------------------------------------------------------------------------------
-- Trigger: um para todas as tabelas do Admin.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_activity_capture()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  o jsonb;
  n jsonb;
  r jsonb;
  ch jsonb;
  hdr jsonb;
  v_id text;
BEGIN
  IF uid IS NULL OR NOT COALESCE(public.has_role(uid, 'admin'::app_role), false) THEN RETURN NULL; END IF;
  IF TG_OP <> 'INSERT' THEN o := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN n := to_jsonb(NEW); END IF;
  r := COALESCE(n, o);
  IF NOT public.feature_enabled('activity_log', true) AND NOT (TG_TABLE_NAME = 'store_settings' AND r ->> 'key' = 'features') THEN
    RETURN NULL;
  END IF;

  ch := public._activity_diff(o, n, TG_TABLE_NAME = 'integration_credentials');
  IF TG_OP = 'UPDATE' AND ch = '{}'::jsonb THEN RETURN NULL; END IF;

  v_id := CASE WHEN TG_TABLE_NAME = 'store_settings' THEN r ->> 'key' ELSE r ->> 'id' END;
  IF v_id IS NULL THEN
    SELECT string_agg(value, ':' ORDER BY key) INTO v_id FROM jsonb_each_text(r) WHERE key LIKE '%\_id' ESCAPE '\';
  END IF;

  BEGIN
    hdr := NULLIF(current_setting('request.headers', true), '')::jsonb;
  EXCEPTION WHEN others THEN hdr := NULL;
  END;

  INSERT INTO public.admin_activity_log (actor, actor_email, action, entity, entity_id, entity_label, parent_id, changes, ip, user_agent)
  VALUES (
    uid,
    (SELECT email::text FROM auth.users WHERE id = uid),
    CASE TG_OP WHEN 'INSERT' THEN 'create' WHEN 'UPDATE' THEN 'update' ELSE 'delete' END,
    TG_TABLE_NAME,
    left(v_id, 200),
    left(COALESCE(r ->> 'name', r ->> 'title', r ->> 'code', r ->> 'label', r ->> 'size_label', r ->> 'full_name',
                  r ->> 'email', r ->> 'provider', r ->> 'type', CASE WHEN TG_TABLE_NAME = 'store_settings' THEN r ->> 'key' END), 200),
    COALESCE(r ->> 'product_id', r ->> 'order_id', r ->> 'user_id', r ->> 'group_id', r ->> 'variation_id', r ->> 'attribute_id'),
    ch,
    left(split_part(COALESCE(hdr ->> 'x-real-ip', hdr ->> 'x-forwarded-for', ''), ',', 1), 64),
    left(hdr ->> 'user-agent', 300)
  );
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_activity_capture() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'products', 'product_variations', 'product_sizes', 'product_variation_size_availability', 'product_images',
    'product_categories', 'product_volume_tiers', 'product_faqs', 'product_spec_options', 'related_products',
    'categories', 'brands', 'spec_attributes', 'spec_options', 'kits', 'kit_items', 'size_presets', 'variation_presets',
    'orders', 'order_items', 'order_notes', 'order_invoices', 'payment_refunds', 'return_requests',
    'coupons', 'gift_cards', 'customer_groups', 'customer_group_members', 'customer_group_prices',
    'user_profiles', 'user_addresses', 'user_roles', 'product_reviews', 'stock_alerts', 'abandoned_cart_contacts',
    'store_settings', 'countries', 'payment_config', 'integration_credentials', 'delivery_methods',
    'shipping_regions', 'shipping_services', 'shipping_service_rates', 'shipping_rates', 'shipping_zones',
    'banners', 'home_sections', 'home_section_items', 'home_product_sections', 'site_pages', 'site_faqs',
    'menu_items', 'email_templates'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS zz_admin_activity ON public.%I', t);
      EXECUTE format('CREATE TRIGGER zz_admin_activity AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.admin_activity_capture()', t);
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------------------------
-- Registo pedido pelas funções do servidor que agem em nome de um admin com a chave de serviço (contas de clientes,
-- chaves de integrações): só service_role. Os valores vêm já sem segredos (só os nomes dos campos alterados).
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_activity_record(
  _actor uuid, _action text, _entity text, _entity_id text DEFAULT NULL, _label text DEFAULT NULL, _changes jsonb DEFAULT '{}'::jsonb,
  _ip text DEFAULT NULL, _user_agent text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF _action NOT IN ('create', 'update', 'delete') OR NOT COALESCE(public.has_role(_actor, 'admin'::app_role), false) THEN RETURN; END IF;
  IF NOT public.feature_enabled('activity_log', true) THEN RETURN; END IF;
  INSERT INTO public.admin_activity_log (actor, actor_email, action, entity, entity_id, entity_label, parent_id, changes, ip, user_agent)
  VALUES (_actor, (SELECT email::text FROM auth.users WHERE id = _actor), _action, left(_entity, 60), left(_entity_id, 200), left(_label, 200),
          CASE WHEN _entity = 'auth_users' THEN left(_entity_id, 200) END,
          CASE WHEN jsonb_typeof(_changes) = 'object' THEN _changes ELSE '{}'::jsonb END, left(_ip, 64), left(_user_agent, 300));
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_activity_record(uuid, text, text, text, text, jsonb, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_activity_record(uuid, text, text, text, text, jsonb, text, text) TO service_role;

-- ---------------------------------------------------------------------------------------------
-- Leitura (só admin).
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_activity_list(
  _since timestamptz DEFAULT NULL, _entities text[] DEFAULT NULL, _actions text[] DEFAULT NULL, _actor uuid DEFAULT NULL,
  _q text DEFAULT NULL, _ref text DEFAULT NULL, _limit integer DEFAULT 50, _offset integer DEFAULT 0
)
RETURNS TABLE (
  id bigint, created_at timestamptz, actor uuid, actor_email text, action text, entity text, entity_id text, entity_label text,
  parent_id text, changes jsonb, ip text, user_agent text, total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE q text := NULLIF(lower(btrim(COALESCE(_q, ''))), '');
BEGIN
  IF NOT COALESCE(public.has_role(auth.uid(), 'admin'::app_role), false) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT a.id, a.created_at, a.actor, a.actor_email, a.action, a.entity, a.entity_id, a.entity_label, a.parent_id, a.changes,
         a.ip, a.user_agent, count(*) OVER ()
    FROM public.admin_activity_log a
   WHERE (_since IS NULL OR a.created_at >= _since)
     AND (_entities IS NULL OR cardinality(_entities) = 0 OR a.entity = ANY (_entities))
     AND (_actions IS NULL OR cardinality(_actions) = 0 OR a.action = ANY (_actions))
     AND (_actor IS NULL OR a.actor = _actor)
     AND (_ref IS NULL OR a.entity_id = _ref OR a.parent_id = _ref)
     AND (q IS NULL OR lower(COALESCE(a.entity_label, '')) LIKE '%' || q || '%' OR lower(COALESCE(a.entity_id, '')) LIKE q || '%'
          OR lower(COALESCE(a.actor_email, '')) LIKE '%' || q || '%' OR a.changes::text ILIKE '%' || q || '%')
   ORDER BY a.created_at DESC, a.id DESC
   LIMIT LEAST(GREATEST(COALESCE(_limit, 50), 1), 500) OFFSET GREATEST(COALESCE(_offset, 0), 0);
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_activity_list(timestamptz, text[], text[], uuid, text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_activity_list(timestamptz, text[], text[], uuid, text, text, integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_activity_summary(_since timestamptz DEFAULT NULL)
RETURNS TABLE (action text, entity text, changes bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT COALESCE(public.has_role(auth.uid(), 'admin'::app_role), false) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT a.action, a.entity, count(*)
    FROM public.admin_activity_log a
   WHERE _since IS NULL OR a.created_at >= _since
   GROUP BY a.action, a.entity;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_activity_summary(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_activity_summary(timestamptz) TO authenticated;

/** Administradores (atuais e antigos com registos), com a última ação. */
CREATE OR REPLACE FUNCTION public.admin_activity_actors()
RETURNS TABLE (actor uuid, email text, is_admin boolean, last_action timestamptz, actions bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT COALESCE(public.has_role(auth.uid(), 'admin'::app_role), false) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  WITH ids AS (
    SELECT ur.user_id AS uid FROM public.user_roles ur WHERE ur.role = 'admin'::app_role
    UNION SELECT DISTINCT a.actor FROM public.admin_activity_log a WHERE a.actor IS NOT NULL
  )
  SELECT ids.uid,
         COALESCE(u.email::text, (SELECT a.actor_email FROM public.admin_activity_log a WHERE a.actor = ids.uid ORDER BY a.id DESC LIMIT 1)),
         EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = ids.uid AND ur.role = 'admin'::app_role),
         (SELECT max(a.created_at) FROM public.admin_activity_log a WHERE a.actor = ids.uid),
         (SELECT count(*) FROM public.admin_activity_log a WHERE a.actor = ids.uid)
    FROM ids LEFT JOIN auth.users u ON u.id = ids.uid
   ORDER BY 4 DESC NULLS LAST;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_activity_actors() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_activity_actors() TO authenticated;

/** Entradas e saídas das contas de administrador (registo do serviço de contas). */
CREATE OR REPLACE FUNCTION public.admin_activity_logins(_since timestamptz DEFAULT NULL, _limit integer DEFAULT 50)
RETURNS TABLE (created_at timestamptz, actor uuid, email text, action text, ip text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT COALESCE(public.has_role(auth.uid(), 'admin'::app_role), false) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF to_regclass('auth.audit_log_entries') IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT e.created_at, ur.user_id, COALESCE(u.email::text, e.payload ->> 'actor_username'), e.payload ->> 'action', NULLIF(e.ip_address::text, '')
    FROM auth.audit_log_entries e
    JOIN public.user_roles ur ON ur.role = 'admin'::app_role AND ur.user_id::text = e.payload ->> 'actor_id'
    LEFT JOIN auth.users u ON u.id = ur.user_id
   WHERE e.payload ->> 'action' IN ('login', 'logout', 'user_recovery_requested', 'user_updated_password', 'user_modified')
     AND (_since IS NULL OR e.created_at >= _since)
   ORDER BY e.created_at DESC
   LIMIT LEAST(GREATEST(COALESCE(_limit, 50), 1), 200);
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_activity_logins(timestamptz, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_activity_logins(timestamptz, integer) TO authenticated;

-- ---------------------------------------------------------------------------------------------
-- Prazo de guarda: store_settings.activity_log.retention_days (padrão 365; 0 = guardar tudo; mínimo 30).
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_activity_purge()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  raw jsonb := (SELECT value -> 'retention_days' FROM public.store_settings WHERE key = 'activity_log');
  days int := 365;
  gone int := 0;
BEGIN
  IF raw IS NOT NULL AND jsonb_typeof(raw) = 'number' THEN days := floor((raw #>> '{}')::numeric)::int; END IF;
  IF days <= 0 THEN RETURN 0; END IF;
  days := GREATEST(days, 30);
  DELETE FROM public.admin_activity_log WHERE created_at < now() - make_interval(days => days);
  GET DIAGNOSTICS gone = ROW_COUNT;
  RETURN gone;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_activity_purge() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE jid int;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'activity-log-purge';
  IF jid IS NOT NULL THEN PERFORM cron.unschedule(jid); END IF;
END $$;

SELECT cron.schedule('activity-log-purge', '40 6 * * *', $$ SELECT public.admin_activity_purge(); $$);
