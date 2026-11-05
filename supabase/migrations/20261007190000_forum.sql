-- =============================================================================================
-- Fórum (recurso forum em Admin > Recursos da loja, desligado por padrão).
--  1) forum_categories: seções do fórum (nome, descrição, idioma opcional, ordem, ativa).
--  2) forum_topics / forum_posts: tópicos e respostas em texto simples (sem HTML), de clientes com conta, pelas
--     RPCs forum_create_topic e forum_reply (limite por hora, tópico fechado, aprovação conforme as regras). A loja
--     responde como "Loja" (is_staff) pelas mesmas RPCs. Contadores do tópico mantidos por gatilho.
--  3) forum_reports: denúncias de clientes (forum_report), uma por pessoa e mensagem, resolvidas no Admin.
--  4) Leitura do site só pelas RPCs forum_categories_public, forum_topics_list e forum_topic: o que está visível e
--     as mensagens do próprio cliente à espera. Sem ler o fórum se as regras pedirem conta (guests_read).
-- Tabelas só do Admin (RLS). Regras em store_settings.forum: guests_read, moderate_topics, moderate_posts,
-- edit_minutes.
-- =============================================================================================

-- ---------------------------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.forum_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  locale text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT forum_categories_slug CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 80),
  CONSTRAINT forum_categories_len CHECK (char_length(btrim(name)) BETWEEN 1 AND 80 AND (description IS NULL OR char_length(description) <= 300)),
  CONSTRAINT forum_categories_locale CHECK (locale IS NULL OR locale IN ('pt-BR', 'pt-PT', 'en', 'es'))
);

CREATE TABLE IF NOT EXISTS public.forum_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.forum_categories(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name text,
  is_staff boolean NOT NULL DEFAULT false,
  title text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'visible',
  pinned boolean NOT NULL DEFAULT false,
  locked boolean NOT NULL DEFAULT false,
  reply_count integer NOT NULL DEFAULT 0,
  views integer NOT NULL DEFAULT 0,
  last_post_at timestamptz NOT NULL DEFAULT now(),
  last_post_name text,
  last_post_staff boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  CONSTRAINT forum_topics_status CHECK (status IN ('pending', 'visible', 'hidden')),
  CONSTRAINT forum_topics_len CHECK (char_length(btrim(title)) BETWEEN 3 AND 160 AND char_length(btrim(body)) BETWEEN 2 AND 10000)
);
CREATE INDEX IF NOT EXISTS forum_topics_category_idx ON public.forum_topics (category_id, pinned DESC, last_post_at DESC);
CREATE INDEX IF NOT EXISTS forum_topics_status_idx ON public.forum_topics (status, created_at DESC);
CREATE INDEX IF NOT EXISTS forum_topics_user_idx ON public.forum_topics (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.forum_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL REFERENCES public.forum_topics(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name text,
  is_staff boolean NOT NULL DEFAULT false,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'visible',
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  CONSTRAINT forum_posts_status CHECK (status IN ('pending', 'visible', 'hidden')),
  CONSTRAINT forum_posts_len CHECK (char_length(btrim(body)) BETWEEN 2 AND 10000)
);
CREATE INDEX IF NOT EXISTS forum_posts_topic_idx ON public.forum_posts (topic_id, created_at);
CREATE INDEX IF NOT EXISTS forum_posts_status_idx ON public.forum_posts (status, created_at DESC);
CREATE INDEX IF NOT EXISTS forum_posts_user_idx ON public.forum_posts (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.forum_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL REFERENCES public.forum_topics(id) ON DELETE CASCADE,
  post_id uuid REFERENCES public.forum_posts(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CONSTRAINT forum_reports_reason CHECK (char_length(btrim(reason)) BETWEEN 2 AND 500)
);
CREATE UNIQUE INDEX IF NOT EXISTS forum_reports_once ON public.forum_reports (user_id, topic_id, post_id) NULLS NOT DISTINCT;
CREATE INDEX IF NOT EXISTS forum_reports_open_idx ON public.forum_reports (resolved_at, created_at DESC);

COMMENT ON TABLE public.forum_topics IS 'Tópicos do fórum. Clientes escrevem por forum_create_topic e leem por forum_topics_list / forum_topic.';
COMMENT ON TABLE public.forum_posts IS 'Respostas do fórum. Clientes escrevem por forum_reply.';

-- ---------------------------------------------------------------------------------------------
-- Permissões: tabelas só do Admin; o site usa as RPCs
-- ---------------------------------------------------------------------------------------------

ALTER TABLE public.forum_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage forum categories" ON public.forum_categories;
CREATE POLICY "Admins manage forum categories" ON public.forum_categories FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins manage forum topics" ON public.forum_topics;
CREATE POLICY "Admins manage forum topics" ON public.forum_topics FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins manage forum posts" ON public.forum_posts;
CREATE POLICY "Admins manage forum posts" ON public.forum_posts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins manage forum reports" ON public.forum_reports;
CREATE POLICY "Admins manage forum reports" ON public.forum_reports FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

REVOKE ALL ON public.forum_categories, public.forum_topics, public.forum_posts, public.forum_reports FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.forum_categories, public.forum_topics, public.forum_posts TO authenticated;
GRANT SELECT, UPDATE, DELETE ON public.forum_reports TO authenticated;
GRANT ALL ON public.forum_categories, public.forum_topics, public.forum_posts, public.forum_reports TO service_role;

-- ---------------------------------------------------------------------------------------------
-- Gatilhos: textos limpos e contadores do tópico
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.forum_categories_normalize()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.slug := lower(btrim(NEW.slug));
  NEW.name := btrim(NEW.name);
  NEW.description := NULLIF(btrim(COALESCE(NEW.description, '')), '');
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS forum_categories_normalize ON public.forum_categories;
CREATE TRIGGER forum_categories_normalize BEFORE INSERT OR UPDATE ON public.forum_categories
  FOR EACH ROW EXECUTE FUNCTION public.forum_categories_normalize();

-- Contadores (respostas, última mensagem) só mudam por forum_refresh_topic; leituras só por forum_count_view.
CREATE OR REPLACE FUNCTION public.forum_topics_normalize()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('loja3d.forum_counters', true) = 'on' THEN RETURN NEW; END IF;
  NEW.title := btrim(NEW.title);
  NEW.body := btrim(NEW.body);
  NEW.author_name := NULLIF(btrim(COALESCE(NEW.author_name, '')), '');
  IF TG_OP = 'UPDATE' THEN
    NEW.reply_count := OLD.reply_count;
    NEW.views := OLD.views;
    NEW.last_post_at := OLD.last_post_at;
    NEW.last_post_name := OLD.last_post_name;
    NEW.last_post_staff := OLD.last_post_staff;
  ELSE
    NEW.reply_count := 0;
    NEW.views := 0;
    NEW.last_post_at := now();
    NEW.last_post_name := NEW.author_name;
    NEW.last_post_staff := NEW.is_staff;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS forum_topics_normalize ON public.forum_topics;
CREATE TRIGGER forum_topics_normalize BEFORE INSERT OR UPDATE ON public.forum_topics
  FOR EACH ROW EXECUTE FUNCTION public.forum_topics_normalize();

CREATE OR REPLACE FUNCTION public.forum_refresh_topic(_topic uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  n integer;
  last record;
BEGIN
  SELECT count(*) INTO n FROM public.forum_posts WHERE topic_id = _topic AND status = 'visible';
  SELECT created_at, author_name, is_staff INTO last FROM public.forum_posts
   WHERE topic_id = _topic AND status = 'visible' ORDER BY created_at DESC LIMIT 1;
  PERFORM set_config('loja3d.forum_counters', 'on', true);
  UPDATE public.forum_topics t SET
    reply_count = n,
    last_post_at = COALESCE(last.created_at, t.created_at),
    last_post_name = CASE WHEN last.created_at IS NULL THEN t.author_name ELSE last.author_name END,
    last_post_staff = CASE WHEN last.created_at IS NULL THEN t.is_staff ELSE last.is_staff END
  WHERE t.id = _topic;
  PERFORM set_config('loja3d.forum_counters', 'off', true);
END;
$function$;
REVOKE ALL ON FUNCTION public.forum_refresh_topic(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.forum_posts_after()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN PERFORM public.forum_refresh_topic(OLD.topic_id); END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND (TG_OP = 'INSERT' OR NEW.topic_id <> OLD.topic_id) THEN PERFORM public.forum_refresh_topic(NEW.topic_id); END IF;
  RETURN NULL;
END;
$function$;
DROP TRIGGER IF EXISTS forum_posts_after ON public.forum_posts;
CREATE TRIGGER forum_posts_after AFTER INSERT OR UPDATE OF status, topic_id OR DELETE ON public.forum_posts
  FOR EACH ROW EXECUTE FUNCTION public.forum_posts_after();

CREATE OR REPLACE FUNCTION public.forum_posts_normalize()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.body := btrim(NEW.body);
  NEW.author_name := NULLIF(btrim(COALESCE(NEW.author_name, '')), '');
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS forum_posts_normalize ON public.forum_posts;
CREATE TRIGGER forum_posts_normalize BEFORE INSERT OR UPDATE ON public.forum_posts
  FOR EACH ROW EXECUTE FUNCTION public.forum_posts_normalize();

DO $$
BEGIN
  IF to_regprocedure('public.admin_activity_capture()') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS zz_admin_activity ON public.forum_categories;
    CREATE TRIGGER zz_admin_activity AFTER INSERT OR UPDATE OR DELETE ON public.forum_categories
      FOR EACH ROW EXECUTE FUNCTION public.admin_activity_capture();
    DROP TRIGGER IF EXISTS zz_admin_activity ON public.forum_topics;
    CREATE TRIGGER zz_admin_activity AFTER UPDATE OF category_id, title, body, status, pinned, locked OR DELETE ON public.forum_topics
      FOR EACH ROW EXECUTE FUNCTION public.admin_activity_capture();
    DROP TRIGGER IF EXISTS zz_admin_activity ON public.forum_posts;
    CREATE TRIGGER zz_admin_activity AFTER UPDATE OF body, status OR DELETE ON public.forum_posts
      FOR EACH ROW EXECUTE FUNCTION public.admin_activity_capture();
  END IF;
END $$;

INSERT INTO public.store_settings (key, value)
VALUES ('forum', '{"guests_read": true, "moderate_topics": false, "moderate_posts": false, "edit_minutes": 30}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Primeiras seções (o Admin muda ou apaga).
INSERT INTO public.forum_categories (slug, name, description, sort_order)
VALUES
  ('geral', 'Conversa geral', 'Apresente-se, dê ideias e fale sobre a loja.', 1),
  ('duvidas', 'Dúvidas sobre produtos', 'Pergunte sobre tamanhos, materiais, cuidados e uso.', 2),
  ('mostre', 'Mostre o seu', 'Fotos e histórias de como você usa o que comprou.', 3)
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------------------------
-- Site: ler
-- ---------------------------------------------------------------------------------------------

-- Regras com padrões; falha com feature_off ou auth_required quando o visitante não pode ler.
CREATE OR REPLACE FUNCTION public._forum_rules(_reading boolean)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r jsonb;
BEGIN
  IF NOT public.feature_enabled('forum', false) THEN RAISE EXCEPTION 'feature_off'; END IF;
  SELECT value INTO r FROM public.store_settings WHERE key = 'forum';
  r := '{"guests_read": true, "moderate_topics": false, "moderate_posts": false, "edit_minutes": 30}'::jsonb || COALESCE(r, '{}'::jsonb);
  IF _reading AND auth.uid() IS NULL AND (r->>'guests_read')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'auth_required'; END IF;
  RETURN r;
END;
$function$;
REVOKE ALL ON FUNCTION public._forum_rules(boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.forum_categories_public(_locale text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  out jsonb;
BEGIN
  PERFORM public._forum_rules(true);
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', c.id, 'slug', c.slug, 'name', c.name, 'description', c.description,
      'topics', COALESCE(s.topics, 0), 'posts', COALESCE(s.posts, 0), 'last_post_at', s.last_post_at)
    ORDER BY c.sort_order, c.name), '[]'::jsonb)
  INTO out
  FROM public.forum_categories c
  LEFT JOIN LATERAL (
    SELECT count(*) AS topics, sum(t.reply_count) + count(*) AS posts, max(t.last_post_at) AS last_post_at
    FROM public.forum_topics t WHERE t.category_id = c.id AND t.status = 'visible'
  ) s ON true
  WHERE c.is_active AND (c.locale IS NULL OR _locale IS NULL OR c.locale = _locale);
  RETURN out;
END;
$function$;
REVOKE ALL ON FUNCTION public.forum_categories_public(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.forum_categories_public(text) TO anon, authenticated;

-- Lista de tópicos (uma seção ou todas), com busca; fixados primeiro, depois a última atividade.
CREATE OR REPLACE FUNCTION public.forum_topics_list(_category text DEFAULT NULL, _q text DEFAULT NULL, _locale text DEFAULT NULL,
  _limit integer DEFAULT 20, _offset integer DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  q text := NULLIF(btrim(COALESCE(_q, '')), '');
  lim integer := LEAST(GREATEST(COALESCE(_limit, 20), 1), 50);
  skip integer := GREATEST(COALESCE(_offset, 0), 0);
  total integer;
  page jsonb;
BEGIN
  PERFORM public._forum_rules(true);
  WITH base AS (
    SELECT t.*, c.slug AS c_slug, c.name AS c_name
    FROM public.forum_topics t
    JOIN public.forum_categories c ON c.id = t.category_id
    WHERE c.is_active AND (c.locale IS NULL OR _locale IS NULL OR c.locale = _locale)
      AND (_category IS NULL OR c.slug = _category)
      AND (t.status = 'visible' OR (t.status = 'pending' AND uid IS NOT NULL AND t.user_id = uid))
      AND (q IS NULL OR t.title ILIKE '%' || q || '%' OR t.body ILIKE '%' || q || '%')
  )
  SELECT (SELECT count(*) FROM base),
    COALESCE((SELECT jsonb_agg(x.j ORDER BY x.pinned DESC, x.last_post_at DESC) FROM (
      SELECT b.pinned, b.last_post_at, jsonb_build_object(
        'id', b.id, 'title', b.title, 'excerpt', left(regexp_replace(b.body, '\s+', ' ', 'g'), 180),
        'category_slug', b.c_slug, 'category_name', b.c_name,
        'author_name', b.author_name, 'is_staff', b.is_staff, 'pinned', b.pinned, 'locked', b.locked,
        'reply_count', b.reply_count, 'views', b.views, 'created_at', b.created_at,
        'last_post_at', b.last_post_at, 'last_post_name', b.last_post_name, 'last_post_staff', b.last_post_staff,
        'pending', b.status = 'pending', 'mine', uid IS NOT NULL AND b.user_id = uid) AS j
      FROM base b
      ORDER BY b.pinned DESC, b.last_post_at DESC
      LIMIT lim OFFSET skip) x), '[]'::jsonb)
  INTO total, page;
  RETURN jsonb_build_object('total', total, 'rows', page);
END;
$function$;
REVOKE ALL ON FUNCTION public.forum_topics_list(text, text, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.forum_topics_list(text, text, text, integer, integer) TO anon, authenticated;

-- Um tópico com as respostas visíveis e as do próprio cliente à espera. can_edit = dono, dentro do prazo.
CREATE OR REPLACE FUNCTION public.forum_topic(_topic uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  r jsonb;
  mins integer;
  t record;
  posts jsonb;
BEGIN
  r := public._forum_rules(true);
  mins := LEAST(GREATEST(COALESCE((r->>'edit_minutes')::integer, 30), 0), 1440);
  SELECT tp.*, c.slug AS c_slug, c.name AS c_name INTO t
  FROM public.forum_topics tp JOIN public.forum_categories c ON c.id = tp.category_id
  WHERE tp.id = _topic AND c.is_active
    AND (tp.status = 'visible' OR (tp.status = 'pending' AND uid IS NOT NULL AND tp.user_id = uid));
  IF t.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', p.id, 'author_name', p.author_name, 'is_staff', p.is_staff, 'body', p.body,
      'created_at', p.created_at, 'edited_at', p.edited_at, 'pending', p.status = 'pending',
      'mine', uid IS NOT NULL AND p.user_id = uid,
      'can_edit', uid IS NOT NULL AND p.user_id = uid AND NOT t.locked AND p.created_at > now() - make_interval(mins => mins))
    ORDER BY p.created_at), '[]'::jsonb)
  INTO posts
  FROM public.forum_posts p
  WHERE p.topic_id = t.id AND (p.status = 'visible' OR (p.status = 'pending' AND uid IS NOT NULL AND p.user_id = uid));
  RETURN jsonb_build_object(
    'id', t.id, 'title', t.title, 'body', t.body, 'category_slug', t.c_slug, 'category_name', t.c_name,
    'author_name', t.author_name, 'is_staff', t.is_staff, 'pinned', t.pinned, 'locked', t.locked,
    'reply_count', t.reply_count, 'views', t.views, 'created_at', t.created_at, 'edited_at', t.edited_at,
    'pending', t.status = 'pending', 'mine', uid IS NOT NULL AND t.user_id = uid,
    'can_edit', uid IS NOT NULL AND t.user_id = uid AND NOT t.locked AND t.created_at > now() - make_interval(mins => mins),
    'edit_minutes', mins, 'posts', posts);
END;
$function$;
REVOKE ALL ON FUNCTION public.forum_topic(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.forum_topic(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.forum_count_view(_topic uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.feature_enabled('forum', false) THEN RETURN; END IF;
  PERFORM set_config('loja3d.forum_counters', 'on', true);
  UPDATE public.forum_topics SET views = views + 1 WHERE id = _topic AND status = 'visible';
  PERFORM set_config('loja3d.forum_counters', 'off', true);
END;
$function$;
REVOKE ALL ON FUNCTION public.forum_count_view(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.forum_count_view(uuid) TO anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Site: escrever (clientes com conta; a loja escreve como "Loja")
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._forum_author()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT left(NULLIF(btrim(split_part(COALESCE(full_name, ''), ' ', 1)), ''), 80) FROM public.user_profiles WHERE user_id = auth.uid();
$function$;
REVOKE ALL ON FUNCTION public._forum_author() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.forum_create_topic(_category uuid, _title text, _body text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  staff boolean := COALESCE(public.has_role(auth.uid(), 'admin'::app_role), false);
  r jsonb;
  st text;
  new_id uuid;
BEGIN
  r := public._forum_rules(false);
  IF uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.forum_categories WHERE id = _category AND is_active) THEN RAISE EXCEPTION 'not_found'; END IF;
  IF char_length(btrim(COALESCE(_title, ''))) NOT BETWEEN 3 AND 160 OR char_length(btrim(COALESCE(_body, ''))) NOT BETWEEN 2 AND 10000 THEN
    RAISE EXCEPTION 'invalid';
  END IF;
  IF NOT staff AND (SELECT count(*) FROM public.forum_topics WHERE user_id = uid AND created_at > now() - interval '1 hour') >= 5 THEN
    RAISE EXCEPTION 'too_many';
  END IF;
  st := CASE WHEN NOT staff AND COALESCE((r->>'moderate_topics')::boolean, false) THEN 'pending' ELSE 'visible' END;
  INSERT INTO public.forum_topics (category_id, user_id, author_name, is_staff, title, body, status)
  VALUES (_category, uid, CASE WHEN staff THEN NULL ELSE public._forum_author() END, staff, _title, _body, st)
  RETURNING id INTO new_id;
  RETURN jsonb_build_object('id', new_id, 'status', st);
END;
$function$;
REVOKE ALL ON FUNCTION public.forum_create_topic(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.forum_create_topic(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.forum_reply(_topic uuid, _body text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  staff boolean := COALESCE(public.has_role(auth.uid(), 'admin'::app_role), false);
  r jsonb;
  t record;
  st text;
  new_id uuid;
BEGIN
  r := public._forum_rules(false);
  IF uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  SELECT tp.id, tp.locked, tp.status INTO t FROM public.forum_topics tp
   JOIN public.forum_categories c ON c.id = tp.category_id
   WHERE tp.id = _topic AND (staff OR (c.is_active AND tp.status = 'visible'));
  IF t.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF t.locked AND NOT staff THEN RAISE EXCEPTION 'locked'; END IF;
  IF char_length(btrim(COALESCE(_body, ''))) NOT BETWEEN 2 AND 10000 THEN RAISE EXCEPTION 'invalid'; END IF;
  IF NOT staff AND (SELECT count(*) FROM public.forum_posts WHERE user_id = uid AND created_at > now() - interval '1 hour') >= 20 THEN
    RAISE EXCEPTION 'too_many';
  END IF;
  st := CASE WHEN NOT staff AND COALESCE((r->>'moderate_posts')::boolean, false) THEN 'pending' ELSE 'visible' END;
  INSERT INTO public.forum_posts (topic_id, user_id, author_name, is_staff, body, status)
  VALUES (_topic, uid, CASE WHEN staff THEN NULL ELSE public._forum_author() END, staff, _body, st)
  RETURNING id INTO new_id;
  RETURN jsonb_build_object('id', new_id, 'status', st);
END;
$function$;
REVOKE ALL ON FUNCTION public.forum_reply(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.forum_reply(uuid, text) TO authenticated;

-- O autor corrige o próprio texto dentro do prazo das regras (tópico: título e texto; resposta: texto).
CREATE OR REPLACE FUNCTION public.forum_edit(_topic uuid, _post uuid, _title text, _body text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  r jsonb;
  mins integer;
  t record;
  p record;
BEGIN
  r := public._forum_rules(false);
  IF uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  mins := LEAST(GREATEST(COALESCE((r->>'edit_minutes')::integer, 30), 0), 1440);
  SELECT id, user_id, locked, status, created_at INTO t FROM public.forum_topics WHERE id = _topic;
  IF t.id IS NULL OR t.status = 'hidden' THEN RAISE EXCEPTION 'not_found'; END IF;
  IF t.locked THEN RAISE EXCEPTION 'locked'; END IF;
  IF char_length(btrim(COALESCE(_body, ''))) NOT BETWEEN 2 AND 10000 THEN RAISE EXCEPTION 'invalid'; END IF;
  IF _post IS NULL THEN
    IF t.user_id IS DISTINCT FROM uid THEN RAISE EXCEPTION 'not_found'; END IF;
    IF t.created_at <= now() - make_interval(mins => mins) THEN RAISE EXCEPTION 'edit_closed'; END IF;
    IF char_length(btrim(COALESCE(_title, ''))) NOT BETWEEN 3 AND 160 THEN RAISE EXCEPTION 'invalid'; END IF;
    UPDATE public.forum_topics SET title = _title, body = _body, edited_at = now() WHERE id = _topic;
  ELSE
    SELECT id, user_id, status, created_at INTO p FROM public.forum_posts WHERE id = _post AND topic_id = _topic;
    IF p.id IS NULL OR p.status = 'hidden' OR p.user_id IS DISTINCT FROM uid THEN RAISE EXCEPTION 'not_found'; END IF;
    IF p.created_at <= now() - make_interval(mins => mins) THEN RAISE EXCEPTION 'edit_closed'; END IF;
    UPDATE public.forum_posts SET body = _body, edited_at = now() WHERE id = _post;
  END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public.forum_edit(uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.forum_edit(uuid, uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.forum_report(_topic uuid, _post uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
BEGIN
  PERFORM public._forum_rules(false);
  IF uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.forum_topics WHERE id = _topic AND status = 'visible') THEN RAISE EXCEPTION 'not_found'; END IF;
  IF _post IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.forum_posts WHERE id = _post AND topic_id = _topic AND status = 'visible') THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  IF char_length(btrim(COALESCE(_reason, ''))) NOT BETWEEN 2 AND 500 THEN RAISE EXCEPTION 'invalid'; END IF;
  IF (SELECT count(*) FROM public.forum_reports WHERE user_id = uid AND created_at > now() - interval '1 hour') >= 10 THEN
    RAISE EXCEPTION 'too_many';
  END IF;
  INSERT INTO public.forum_reports (topic_id, post_id, user_id, reason) VALUES (_topic, _post, uid, btrim(_reason))
  ON CONFLICT (user_id, topic_id, post_id) DO NOTHING;
  IF NOT FOUND THEN RAISE EXCEPTION 'already_reported'; END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public.forum_report(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.forum_report(uuid, uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------------------------
-- Admin: números
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_forum_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN jsonb_build_object(
    'topics', (SELECT count(*) FROM public.forum_topics WHERE status = 'visible'),
    'posts', (SELECT count(*) FROM public.forum_posts WHERE status = 'visible'),
    'pending_topics', (SELECT count(*) FROM public.forum_topics WHERE status = 'pending'),
    'pending_posts', (SELECT count(*) FROM public.forum_posts WHERE status = 'pending'),
    'open_reports', (SELECT count(*) FROM public.forum_reports WHERE resolved_at IS NULL),
    'members', (SELECT count(DISTINCT u) FROM (
      SELECT user_id AS u FROM public.forum_topics WHERE user_id IS NOT NULL AND NOT is_staff
      UNION SELECT user_id FROM public.forum_posts WHERE user_id IS NOT NULL AND NOT is_staff) m),
    'topics_30d', (SELECT count(*) FROM public.forum_topics WHERE created_at > now() - interval '30 days'),
    'unanswered', (SELECT count(*) FROM public.forum_topics WHERE status = 'visible' AND reply_count = 0 AND NOT locked));
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_forum_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_forum_stats() TO authenticated;
