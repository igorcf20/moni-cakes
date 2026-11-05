-- =============================================================================================
-- Blog da loja (recurso blog em Admin > Recursos da loja, desligado por padrão).
--  1) blog_posts: artigos com título, resumo, texto (HTML do editor do Admin; o site limpa com DOMPurify), capa,
--     etiquetas, produtos ligados, idioma (NULL = todos), SEO e estado (rascunho ou publicado com data; data futura
--     = agendado). O site lê só publicados com a data passada e o recurso ligado.
--  2) blog_comments: comentários de clientes com conta, pela RPC add_blog_comment (limite por hora, artigo com
--     comentários abertos, aprovação conforme as regras). O site lê pela RPC blog_post_comments (aprovados e os
--     próprios à espera). O Admin aprova, responde e apaga.
--  3) blog_count_view: soma uma leitura ao artigo publicado.
-- Regras em store_settings.blog: posts_per_page, comments, moderate_comments.
-- =============================================================================================

CREATE TABLE IF NOT EXISTS public.blog_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  locale text,
  title text NOT NULL,
  excerpt text,
  body text,
  cover_url text,
  cover_alt text,
  author_name text,
  tags text[] NOT NULL DEFAULT '{}',
  product_ids text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft',
  published_at timestamptz,
  featured boolean NOT NULL DEFAULT false,
  allow_comments boolean NOT NULL DEFAULT true,
  seo_title text,
  seo_description text,
  views integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid DEFAULT auth.uid(),
  CONSTRAINT blog_posts_status CHECK (status IN ('draft', 'published')),
  CONSTRAINT blog_posts_locale CHECK (locale IS NULL OR locale IN ('pt-BR', 'pt-PT', 'en', 'es')),
  CONSTRAINT blog_posts_slug CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 120),
  CONSTRAINT blog_posts_len CHECK (
    char_length(btrim(title)) BETWEEN 1 AND 200 AND (excerpt IS NULL OR char_length(excerpt) <= 600)
    AND (body IS NULL OR char_length(body) <= 300000) AND (cover_url IS NULL OR char_length(cover_url) <= 1000)
    AND (cover_alt IS NULL OR char_length(cover_alt) <= 200) AND (author_name IS NULL OR char_length(author_name) <= 120)
    AND (seo_title IS NULL OR char_length(seo_title) <= 200) AND (seo_description IS NULL OR char_length(seo_description) <= 300)
    AND cardinality(tags) <= 20 AND cardinality(product_ids) <= 12)
);
CREATE UNIQUE INDEX IF NOT EXISTS blog_posts_slug_key ON public.blog_posts (slug);
CREATE INDEX IF NOT EXISTS blog_posts_published_idx ON public.blog_posts (published_at DESC) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS blog_posts_tags_idx ON public.blog_posts USING gin (tags);
COMMENT ON TABLE public.blog_posts IS 'Artigos do blog (Admin > Blog). O site lê só os publicados com a data passada.';

CREATE TABLE IF NOT EXISTS public.blog_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.blog_posts(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name text,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  admin_reply text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT blog_comments_status CHECK (status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT blog_comments_len CHECK (
    (author_name IS NULL OR char_length(btrim(author_name)) BETWEEN 1 AND 80) AND char_length(btrim(body)) BETWEEN 2 AND 2000
    AND (admin_reply IS NULL OR char_length(admin_reply) <= 2000))
);
CREATE INDEX IF NOT EXISTS blog_comments_post_idx ON public.blog_comments (post_id, created_at);
CREATE INDEX IF NOT EXISTS blog_comments_status_idx ON public.blog_comments (status, created_at DESC);
CREATE INDEX IF NOT EXISTS blog_comments_user_idx ON public.blog_comments (user_id, created_at DESC);
COMMENT ON TABLE public.blog_comments IS 'Comentários do blog. Clientes escrevem por add_blog_comment e leem por blog_post_comments.';

ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone reads published posts" ON public.blog_posts;
CREATE POLICY "Anyone reads published posts" ON public.blog_posts
  FOR SELECT TO anon, authenticated
  USING (status = 'published' AND published_at <= now() AND public.feature_enabled('blog', false));
DROP POLICY IF EXISTS "Admins manage posts" ON public.blog_posts;
CREATE POLICY "Admins manage posts" ON public.blog_posts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins manage comments" ON public.blog_comments;
CREATE POLICY "Admins manage comments" ON public.blog_comments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

REVOKE ALL ON public.blog_posts, public.blog_comments FROM anon, authenticated;
GRANT SELECT ON public.blog_posts TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.blog_posts TO authenticated;
GRANT SELECT, UPDATE, DELETE ON public.blog_comments TO authenticated;
GRANT ALL ON public.blog_posts, public.blog_comments TO service_role;

-- Normaliza o artigo: slug em minúsculas, etiquetas limpas sem repetir, data de publicação ao publicar.
CREATE OR REPLACE FUNCTION public.blog_posts_normalize()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  -- Leitura contada por blog_count_view: só views muda (sem mexer na data de edição).
  IF TG_OP = 'UPDATE' AND current_setting('loja3d.blog_view', true) = 'on' THEN RETURN NEW; END IF;
  NEW.slug := lower(btrim(NEW.slug));
  NEW.title := btrim(NEW.title);
  NEW.excerpt := NULLIF(btrim(COALESCE(NEW.excerpt, '')), '');
  NEW.cover_url := NULLIF(btrim(COALESCE(NEW.cover_url, '')), '');
  NEW.cover_alt := NULLIF(btrim(COALESCE(NEW.cover_alt, '')), '');
  NEW.author_name := NULLIF(btrim(COALESCE(NEW.author_name, '')), '');
  NEW.seo_title := NULLIF(btrim(COALESCE(NEW.seo_title, '')), '');
  NEW.seo_description := NULLIF(btrim(COALESCE(NEW.seo_description, '')), '');
  NEW.tags := COALESCE((SELECT array_agg(DISTINCT t ORDER BY t) FROM (
    SELECT lower(btrim(x)) AS t FROM unnest(COALESCE(NEW.tags, '{}')) x WHERE char_length(btrim(x)) BETWEEN 1 AND 40) s), '{}');
  NEW.product_ids := COALESCE((SELECT array_agg(x ORDER BY o) FROM (
    SELECT DISTINCT ON (x) x, o FROM unnest(COALESCE(NEW.product_ids, '{}')) WITH ORDINALITY u(x, o) WHERE x <> '' ORDER BY x, o) s), '{}');
  IF NEW.status = 'published' AND NEW.published_at IS NULL THEN NEW.published_at := now(); END IF;
  -- O número de leituras só muda por blog_count_view.
  IF TG_OP = 'UPDATE' THEN NEW.views := OLD.views; ELSE NEW.views := 0; END IF;
  NEW.updated_at := now();
  NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS blog_posts_normalize ON public.blog_posts;
CREATE TRIGGER blog_posts_normalize BEFORE INSERT OR UPDATE ON public.blog_posts
  FOR EACH ROW EXECUTE FUNCTION public.blog_posts_normalize();

DO $$
BEGIN
  IF to_regprocedure('public.admin_activity_capture()') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS zz_admin_activity ON public.blog_posts;
    CREATE TRIGGER zz_admin_activity AFTER INSERT OR UPDATE OF slug, locale, title, excerpt, body, cover_url, cover_alt, author_name,
      tags, product_ids, status, published_at, featured, allow_comments, seo_title, seo_description OR DELETE ON public.blog_posts
      FOR EACH ROW EXECUTE FUNCTION public.admin_activity_capture();
    DROP TRIGGER IF EXISTS zz_admin_activity ON public.blog_comments;
    CREATE TRIGGER zz_admin_activity AFTER UPDATE OR DELETE ON public.blog_comments
      FOR EACH ROW EXECUTE FUNCTION public.admin_activity_capture();
  END IF;
END $$;

INSERT INTO public.store_settings (key, value)
VALUES ('blog', '{"posts_per_page": 9, "comments": true, "moderate_comments": true}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------------------------
-- Site: comentários e leituras
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.add_blog_comment(_post uuid, _body text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  p record;
  rules jsonb;
  who text;
  st text;
  new_id uuid;
BEGIN
  IF NOT public.feature_enabled('blog', false) THEN RAISE EXCEPTION 'feature_off'; END IF;
  IF uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  SELECT id, allow_comments INTO p FROM public.blog_posts
   WHERE id = _post AND status = 'published' AND published_at <= now();
  IF p.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  SELECT value INTO rules FROM public.store_settings WHERE key = 'blog';
  IF COALESCE((rules->>'comments')::boolean, true) IS NOT TRUE OR p.allow_comments IS NOT TRUE THEN RAISE EXCEPTION 'comments_off'; END IF;
  IF char_length(btrim(COALESCE(_body, ''))) NOT BETWEEN 2 AND 2000 THEN RAISE EXCEPTION 'invalid'; END IF;
  IF (SELECT count(*) FROM public.blog_comments WHERE user_id = uid AND created_at > now() - interval '1 hour') >= 5 THEN
    RAISE EXCEPTION 'too_many';
  END IF;
  SELECT NULLIF(btrim(split_part(COALESCE(full_name, ''), ' ', 1)), '') INTO who FROM public.user_profiles WHERE user_id = uid;
  st := CASE WHEN COALESCE((rules->>'moderate_comments')::boolean, true) THEN 'pending' ELSE 'approved' END;
  INSERT INTO public.blog_comments (post_id, user_id, author_name, body, status)
  VALUES (_post, uid, left(who, 80), btrim(_body), st)
  RETURNING id INTO new_id;
  RETURN jsonb_build_object('id', new_id, 'status', st);
END;
$function$;
REVOKE ALL ON FUNCTION public.add_blog_comment(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_blog_comment(uuid, text) TO authenticated;

-- Aprovados de um artigo visível, mais os do próprio cliente à espera (marcados mine/pending).
CREATE OR REPLACE FUNCTION public.blog_post_comments(_post uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', c.id, 'author_name', c.author_name, 'body', c.body, 'admin_reply', c.admin_reply, 'created_at', c.created_at,
      'pending', c.status = 'pending', 'mine', c.user_id IS NOT DISTINCT FROM auth.uid() AND auth.uid() IS NOT NULL)
    ORDER BY c.created_at), '[]'::jsonb)
  FROM public.blog_comments c
  JOIN public.blog_posts p ON p.id = c.post_id
  WHERE c.post_id = _post AND p.status = 'published' AND p.published_at <= now() AND public.feature_enabled('blog', false)
    AND (c.status = 'approved' OR (c.status = 'pending' AND auth.uid() IS NOT NULL AND c.user_id = auth.uid()));
$function$;
REVOKE ALL ON FUNCTION public.blog_post_comments(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.blog_post_comments(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.blog_count_view(_post uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM set_config('loja3d.blog_view', 'on', true);
  UPDATE public.blog_posts SET views = views + 1
   WHERE id = _post AND status = 'published' AND published_at <= now() AND public.feature_enabled('blog', false);
  PERFORM set_config('loja3d.blog_view', 'off', true);
END;
$function$;
REVOKE ALL ON FUNCTION public.blog_count_view(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.blog_count_view(uuid) TO anon, authenticated;
