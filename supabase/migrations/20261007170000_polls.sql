-- =============================================================================================
-- Enquetes (recurso polls em Admin > Recursos da loja, desligado por padrão).
--  1) polls: a pergunta (coluna title), texto de apoio, idioma (NULL = todos), estado (rascunho, aberta ou
--     encerrada), início e fim opcionais, quantas respostas cada pessoa marca, se visitantes sem conta votam,
--     quando o resultado aparece e se a enquete aparece na página inicial.
--  2) poll_options: as respostas, em ordem.
--  3) poll_ballots: um voto por pessoa e enquete (conta = user_id; visitante = resumo da rede e do navegador com o
--     sal da enquete, nada fica guardado no aparelho). Apagar uma resposta tira-a dos votos.
-- As tabelas são só do Admin. O site lê e vota pelas RPCs site_polls e vote_poll, que decidem o que pode ser
-- mostrado (resultados conforme a regra da enquete). Números do Admin: admin_poll_stats.
-- =============================================================================================

CREATE TABLE IF NOT EXISTS public.polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  locale text,
  status text NOT NULL DEFAULT 'draft',
  starts_at timestamptz,
  ends_at timestamptz,
  max_choices integer NOT NULL DEFAULT 1,
  guests boolean NOT NULL DEFAULT false,
  results text NOT NULL DEFAULT 'after_vote',
  show_on_home boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0,
  guest_salt uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid DEFAULT auth.uid(),
  CONSTRAINT polls_status CHECK (status IN ('draft', 'open', 'closed')),
  CONSTRAINT polls_results CHECK (results IN ('after_vote', 'always', 'after_close', 'hidden')),
  CONSTRAINT polls_locale CHECK (locale IS NULL OR locale IN ('pt-BR', 'pt-PT', 'en', 'es')),
  CONSTRAINT polls_choices CHECK (max_choices BETWEEN 1 AND 20),
  CONSTRAINT polls_dates CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at),
  CONSTRAINT polls_len CHECK (char_length(btrim(title)) BETWEEN 1 AND 300 AND (description IS NULL OR char_length(description) <= 1000))
);
CREATE INDEX IF NOT EXISTS polls_status_idx ON public.polls (status, position, created_at DESC);
COMMENT ON TABLE public.polls IS 'Enquetes (Admin > Enquetes). O site lê por site_polls e vota por vote_poll.';
COMMENT ON COLUMN public.polls.title IS 'A pergunta da enquete.';
COMMENT ON COLUMN public.polls.guest_salt IS 'Sal do resumo que identifica o voto de visitante sem conta. Nunca sai do banco.';

CREATE TABLE IF NOT EXISTS public.poll_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
  label text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT poll_options_len CHECK (char_length(btrim(label)) BETWEEN 1 AND 200)
);
CREATE INDEX IF NOT EXISTS poll_options_poll_idx ON public.poll_options (poll_id, position);

CREATE TABLE IF NOT EXISTS public.poll_ballots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  voter_hash text,
  option_ids uuid[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT poll_ballots_voter CHECK (user_id IS NOT NULL OR voter_hash IS NOT NULL),
  CONSTRAINT poll_ballots_choices CHECK (cardinality(option_ids) BETWEEN 1 AND 20)
);
CREATE UNIQUE INDEX IF NOT EXISTS poll_ballots_user_key ON public.poll_ballots (poll_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS poll_ballots_guest_key ON public.poll_ballots (poll_id, voter_hash) WHERE voter_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS poll_ballots_poll_idx ON public.poll_ballots (poll_id, created_at DESC);
COMMENT ON TABLE public.poll_ballots IS 'Votos das enquetes: um por conta ou por visitante (resumo com sal, sem guardar o IP).';

ALTER TABLE public.polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_ballots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage polls" ON public.polls;
CREATE POLICY "Admins manage polls" ON public.polls
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins manage poll options" ON public.poll_options;
CREATE POLICY "Admins manage poll options" ON public.poll_options
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins read and reset ballots" ON public.poll_ballots;
CREATE POLICY "Admins read and reset ballots" ON public.poll_ballots
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

REVOKE ALL ON public.polls, public.poll_options, public.poll_ballots FROM anon, authenticated;
GRANT SELECT (id, title, description, locale, status, starts_at, ends_at, max_choices, guests, results, show_on_home, position,
  created_at, updated_at, updated_by) ON public.polls TO authenticated;
GRANT INSERT (title, description, locale, status, starts_at, ends_at, max_choices, guests, results, show_on_home, position) ON public.polls TO authenticated;
GRANT UPDATE (title, description, locale, status, starts_at, ends_at, max_choices, guests, results, show_on_home, position) ON public.polls TO authenticated;
GRANT DELETE ON public.polls TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.poll_options TO authenticated;
GRANT SELECT (id, poll_id, option_ids, created_at), DELETE ON public.poll_ballots TO authenticated;
GRANT ALL ON public.polls, public.poll_options, public.poll_ballots TO service_role;

-- Normaliza a enquete (textos aparados, data de edição).
CREATE OR REPLACE FUNCTION public.polls_normalize()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.title := btrim(NEW.title);
  NEW.description := NULLIF(btrim(COALESCE(NEW.description, '')), '');
  IF TG_OP = 'UPDATE' THEN NEW.guest_salt := OLD.guest_salt; END IF;
  NEW.updated_at := now();
  NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS polls_normalize ON public.polls;
CREATE TRIGGER polls_normalize BEFORE INSERT OR UPDATE ON public.polls
  FOR EACH ROW EXECUTE FUNCTION public.polls_normalize();

CREATE OR REPLACE FUNCTION public.poll_options_normalize()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.label := btrim(NEW.label);
  -- Uma resposta não muda de enquete (os votos apontam para ela).
  IF TG_OP = 'UPDATE' THEN NEW.poll_id := OLD.poll_id; END IF;
  IF TG_OP = 'INSERT' AND (SELECT count(*) FROM public.poll_options WHERE poll_id = NEW.poll_id) >= 20 THEN
    RAISE EXCEPTION 'too_many_options';
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS poll_options_normalize ON public.poll_options;
CREATE TRIGGER poll_options_normalize BEFORE INSERT OR UPDATE ON public.poll_options
  FOR EACH ROW EXECUTE FUNCTION public.poll_options_normalize();

-- Resposta apagada: sai dos votos; voto que fica sem nenhuma resposta é apagado.
CREATE OR REPLACE FUNCTION public.poll_options_drop_votes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.poll_ballots SET option_ids = array_remove(option_ids, OLD.id)
   WHERE poll_id = OLD.poll_id AND OLD.id = ANY(option_ids) AND cardinality(option_ids) > 1;
  DELETE FROM public.poll_ballots WHERE poll_id = OLD.poll_id AND option_ids = ARRAY[OLD.id];
  RETURN OLD;
END;
$function$;
DROP TRIGGER IF EXISTS poll_options_drop_votes ON public.poll_options;
CREATE TRIGGER poll_options_drop_votes AFTER DELETE ON public.poll_options
  FOR EACH ROW EXECUTE FUNCTION public.poll_options_drop_votes();

DO $$
BEGIN
  IF to_regprocedure('public.admin_activity_capture()') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS zz_admin_activity ON public.polls;
    CREATE TRIGGER zz_admin_activity AFTER INSERT OR UPDATE OR DELETE ON public.polls
      FOR EACH ROW EXECUTE FUNCTION public.admin_activity_capture();
    DROP TRIGGER IF EXISTS zz_admin_activity ON public.poll_options;
    CREATE TRIGGER zz_admin_activity AFTER INSERT OR UPDATE OR DELETE ON public.poll_options
      FOR EACH ROW EXECUTE FUNCTION public.admin_activity_capture();
  END IF;
END $$;

-- ---------------------------------------------------------------------------------------------
-- Site: ler e votar
-- ---------------------------------------------------------------------------------------------

-- Resumo do visitante sem conta: sal da enquete + rede + navegador (nada fica guardado no aparelho).
CREATE OR REPLACE FUNCTION public._poll_guest_hash(_salt uuid)
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
REVOKE ALL ON FUNCTION public._poll_guest_hash(uuid) FROM PUBLIC, anon, authenticated;

-- Uma enquete como o site a vê: aberta ou não, o voto de quem pergunta e o resultado só se a regra deixar.
CREATE OR REPLACE FUNCTION public._poll_public(_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  p record;
  uid uuid := auth.uid();
  mine uuid[];
  is_open boolean;
  show boolean;
  total integer;
BEGIN
  SELECT * INTO p FROM public.polls WHERE id = _id AND status IN ('open', 'closed') AND (starts_at IS NULL OR starts_at <= now());
  IF p.id IS NULL THEN RETURN NULL; END IF;
  is_open := p.status = 'open' AND (p.ends_at IS NULL OR p.ends_at > now());
  IF uid IS NOT NULL THEN
    SELECT option_ids INTO mine FROM public.poll_ballots WHERE poll_id = p.id AND user_id = uid;
  ELSIF p.guests THEN
    SELECT option_ids INTO mine FROM public.poll_ballots WHERE poll_id = p.id AND voter_hash = public._poll_guest_hash(p.guest_salt);
  END IF;
  show := CASE p.results WHEN 'always' THEN true WHEN 'after_vote' THEN mine IS NOT NULL OR NOT is_open
    WHEN 'after_close' THEN NOT is_open ELSE false END;
  SELECT count(*) INTO total FROM public.poll_ballots WHERE poll_id = p.id;
  RETURN jsonb_build_object(
    'id', p.id, 'title', p.title, 'description', p.description, 'locale', p.locale, 'max_choices', p.max_choices,
    'guests', p.guests, 'results', p.results, 'show_on_home', p.show_on_home, 'ends_at', p.ends_at, 'open', is_open,
    'options', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label) ORDER BY o.position, o.created_at)
                          FROM public.poll_options o WHERE o.poll_id = p.id), '[]'::jsonb),
    'voted', mine IS NOT NULL,
    'mine', COALESCE(to_jsonb(mine), '[]'::jsonb),
    'total', CASE WHEN show THEN total END,
    'counts', CASE WHEN show THEN COALESCE((
      SELECT jsonb_object_agg(o.id, (SELECT count(*) FROM public.poll_ballots b WHERE b.poll_id = p.id AND o.id = ANY(b.option_ids)))
        FROM public.poll_options o WHERE o.poll_id = p.id), '{}'::jsonb) END
  );
END;
$function$;
REVOKE ALL ON FUNCTION public._poll_public(uuid) FROM PUBLIC, anon, authenticated;

-- Enquetes visíveis no site (_scope 'home' = só as abertas marcadas para a página inicial). Com o recurso desligado: [].
CREATE OR REPLACE FUNCTION public.site_polls(_scope text DEFAULT 'all')
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  out jsonb := '[]'::jsonb;
  r record;
  one jsonb;
BEGIN
  IF NOT public.feature_enabled('polls', false) THEN RETURN out; END IF;
  FOR r IN
    SELECT id FROM public.polls
     WHERE status IN ('open', 'closed') AND (starts_at IS NULL OR starts_at <= now())
       AND (_scope IS DISTINCT FROM 'home' OR (show_on_home AND status = 'open' AND (ends_at IS NULL OR ends_at > now())))
     ORDER BY (status = 'open' AND (ends_at IS NULL OR ends_at > now())) DESC, position, created_at DESC
     LIMIT 100
  LOOP
    one := public._poll_public(r.id);
    IF one IS NOT NULL THEN out := out || jsonb_build_array(one); END IF;
  END LOOP;
  RETURN out;
END;
$function$;
REVOKE ALL ON FUNCTION public.site_polls(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.site_polls(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.vote_poll(_poll uuid, _options uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  p record;
  uid uuid := auth.uid();
  picked uuid[];
  h text;
BEGIN
  IF NOT public.feature_enabled('polls', false) THEN RAISE EXCEPTION 'feature_off'; END IF;
  SELECT * INTO p FROM public.polls WHERE id = _poll AND status IN ('open', 'closed') AND (starts_at IS NULL OR starts_at <= now());
  IF p.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF p.status <> 'open' OR (p.ends_at IS NOT NULL AND p.ends_at <= now()) THEN RAISE EXCEPTION 'closed'; END IF;
  IF uid IS NULL AND NOT p.guests THEN RAISE EXCEPTION 'auth_required'; END IF;
  SELECT array_agg(DISTINCT x) INTO picked FROM unnest(COALESCE(_options, '{}')) x;
  IF picked IS NULL OR cardinality(picked) > p.max_choices
     OR EXISTS (SELECT 1 FROM unnest(picked) x WHERE NOT EXISTS (SELECT 1 FROM public.poll_options o WHERE o.id = x AND o.poll_id = p.id)) THEN
    RAISE EXCEPTION 'invalid';
  END IF;
  IF uid IS NULL THEN h := public._poll_guest_hash(p.guest_salt); END IF;
  BEGIN
    INSERT INTO public.poll_ballots (poll_id, user_id, voter_hash, option_ids) VALUES (p.id, uid, h, picked);
  EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'already_voted';
  END;
  RETURN public._poll_public(p.id);
END;
$function$;
REVOKE ALL ON FUNCTION public.vote_poll(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vote_poll(uuid, uuid[]) TO anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Admin: números de cada enquete
-- ---------------------------------------------------------------------------------------------

-- { <enquete>: { total, accounts, guests, last, counts: { <resposta>: n } } }
CREATE OR REPLACE FUNCTION public.admin_poll_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN COALESCE((
    SELECT jsonb_object_agg(p.id, jsonb_build_object(
      'total', (SELECT count(*) FROM public.poll_ballots b WHERE b.poll_id = p.id),
      'accounts', (SELECT count(*) FROM public.poll_ballots b WHERE b.poll_id = p.id AND b.user_id IS NOT NULL),
      'guests', (SELECT count(*) FROM public.poll_ballots b WHERE b.poll_id = p.id AND b.user_id IS NULL),
      'last', (SELECT max(b.created_at) FROM public.poll_ballots b WHERE b.poll_id = p.id),
      'counts', COALESCE((SELECT jsonb_object_agg(o.id, (SELECT count(*) FROM public.poll_ballots b WHERE b.poll_id = p.id AND o.id = ANY(b.option_ids)))
                          FROM public.poll_options o WHERE o.poll_id = p.id), '{}'::jsonb)))
    FROM public.polls p), '{}'::jsonb);
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_poll_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_poll_stats() TO authenticated;
