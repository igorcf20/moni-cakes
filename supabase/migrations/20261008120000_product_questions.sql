-- =============================================================================================
-- Perguntas e respostas no produto (recurso product_questions).
--  product_questions: pergunta de um cliente com conta sobre um produto; a loja responde no Admin > Perguntas dos
--  clientes. Só aparece no site depois de respondida e publicada (status published). Rejeitada não aparece.
--  Clientes escrevem só pela RPC ask_product_question (limite por hora, produto ativo) e leem pela RPC
--  product_questions_public (publicadas, mais as próprias à espera; nome abreviado, nunca e-mail).
--  Regras em store_settings.product_questions: ask (clientes podem perguntar), per_page.
-- =============================================================================================

CREATE TABLE IF NOT EXISTS public.product_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id text NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name text,
  locale text,
  question text NOT NULL,
  answer text,
  status text NOT NULL DEFAULT 'pending',
  answered_at timestamptz,
  answered_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_questions_status CHECK (status IN ('pending', 'published', 'rejected')),
  CONSTRAINT product_questions_locale CHECK (locale IS NULL OR locale IN ('pt-BR', 'pt-PT', 'en', 'es')),
  CONSTRAINT product_questions_len CHECK (
    char_length(btrim(question)) BETWEEN 5 AND 1000
    AND (answer IS NULL OR char_length(answer) <= 3000)
    AND (author_name IS NULL OR char_length(author_name) <= 80)),
  CONSTRAINT product_questions_published_answer CHECK (status <> 'published' OR char_length(btrim(coalesce(answer, ''))) > 0)
);
CREATE INDEX IF NOT EXISTS product_questions_product_idx ON public.product_questions (product_id, status, answered_at DESC);
CREATE INDEX IF NOT EXISTS product_questions_status_idx ON public.product_questions (status, created_at DESC);
CREATE INDEX IF NOT EXISTS product_questions_user_idx ON public.product_questions (user_id, created_at DESC);
COMMENT ON TABLE public.product_questions IS 'Perguntas de clientes sobre produtos. Clientes escrevem por ask_product_question e leem por product_questions_public.';

ALTER TABLE public.product_questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage product questions" ON public.product_questions;
CREATE POLICY "Admins manage product questions" ON public.product_questions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

REVOKE ALL ON public.product_questions FROM anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON public.product_questions TO authenticated;
GRANT ALL ON public.product_questions TO service_role;

-- Resposta: data e autor da resposta pelo servidor; publicar sem resposta é recusado pela CHECK.
CREATE OR REPLACE FUNCTION public.product_questions_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.answer := nullif(btrim(coalesce(NEW.answer, '')), '');
  IF NEW.answer IS DISTINCT FROM OLD.answer AND NEW.answer IS NOT NULL THEN
    NEW.answered_at := now();
    NEW.answered_by := auth.uid();
  ELSIF NEW.answer IS NULL THEN
    NEW.answered_at := NULL;
    NEW.answered_by := NULL;
  END IF;
  -- O texto e o autor da pergunta não mudam depois de enviada.
  NEW.question := OLD.question;
  NEW.user_id := OLD.user_id;
  NEW.product_id := OLD.product_id;
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS product_questions_touch ON public.product_questions;
CREATE TRIGGER product_questions_touch BEFORE UPDATE ON public.product_questions
  FOR EACH ROW EXECUTE FUNCTION public.product_questions_touch();

-- Registo de atividade do Admin.
DO $$
BEGIN
  IF to_regprocedure('public.admin_activity_capture()') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS zz_admin_activity ON public.product_questions;
    CREATE TRIGGER zz_admin_activity AFTER INSERT OR UPDATE OR DELETE ON public.product_questions
      FOR EACH ROW EXECUTE FUNCTION public.admin_activity_capture();
  END IF;
END $$;

-- Cliente com conta pergunta sobre um produto ativo. Erros estáveis (o site traduz): feature_off, auth_required,
-- asking_off, not_found, invalid, too_many.
CREATE OR REPLACE FUNCTION public.ask_product_question(_product text, _question text, _locale text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  rules jsonb;
  who text;
  q text := btrim(regexp_replace(coalesce(_question, ''), '[[:cntrl:]]+', ' ', 'g'));
  new_id uuid;
BEGIN
  IF NOT public.feature_enabled('product_questions', true) THEN RAISE EXCEPTION 'feature_off'; END IF;
  IF uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  SELECT value INTO rules FROM public.store_settings WHERE key = 'product_questions';
  IF coalesce((rules->>'ask')::boolean, true) IS NOT TRUE THEN RAISE EXCEPTION 'asking_off'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = _product AND coalesce(is_active, true)) THEN RAISE EXCEPTION 'not_found'; END IF;
  IF char_length(q) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'invalid'; END IF;
  IF (SELECT count(*) FROM public.product_questions WHERE user_id = uid AND created_at > now() - interval '1 hour') >= 5 THEN
    RAISE EXCEPTION 'too_many';
  END IF;
  SELECT nullif(btrim(split_part(coalesce(full_name, ''), ' ', 1)), '') INTO who FROM public.user_profiles WHERE user_id = uid;
  INSERT INTO public.product_questions (product_id, user_id, author_name, locale, question)
  VALUES (_product, uid, left(who, 80), CASE WHEN _locale IN ('pt-BR', 'pt-PT', 'en', 'es') THEN _locale END, q)
  RETURNING id INTO new_id;
  RETURN jsonb_build_object('id', new_id, 'status', 'pending');
END;
$function$;
REVOKE ALL ON FUNCTION public.ask_product_question(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ask_product_question(text, text, text) TO authenticated;

-- Publicadas de um produto (mais as do próprio cliente à espera), com o total para paginar.
CREATE OR REPLACE FUNCTION public.product_questions_public(_product text, _limit integer DEFAULT 5, _offset integer DEFAULT 0)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH visible AS (
    SELECT q.* FROM public.product_questions q
     WHERE q.product_id = _product AND public.feature_enabled('product_questions', true)
       AND (q.status = 'published' OR (q.status = 'pending' AND auth.uid() IS NOT NULL AND q.user_id = auth.uid()))
  ), page AS (
    SELECT * FROM visible
     ORDER BY (status = 'pending' AND user_id = auth.uid()) DESC, coalesce(answered_at, created_at) DESC
     LIMIT least(greatest(coalesce(_limit, 5), 1), 50) OFFSET greatest(coalesce(_offset, 0), 0)
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM visible WHERE status = 'published'),
    'items', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'author_name', p.author_name, 'question', p.question, 'answer', CASE WHEN p.status = 'published' THEN p.answer END,
        'answered_at', CASE WHEN p.status = 'published' THEN p.answered_at END, 'created_at', p.created_at,
        'pending', p.status = 'pending', 'mine', p.user_id IS NOT DISTINCT FROM auth.uid() AND auth.uid() IS NOT NULL)
      ORDER BY (p.status = 'pending') DESC, coalesce(p.answered_at, p.created_at) DESC) FROM page p), '[]'::jsonb));
$function$;
REVOKE ALL ON FUNCTION public.product_questions_public(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.product_questions_public(text, integer, integer) TO anon, authenticated;
