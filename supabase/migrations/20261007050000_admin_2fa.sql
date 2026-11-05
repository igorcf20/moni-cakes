-- =============================================================================================
-- Verificação em dois passos no Admin (recurso admin_2fa em Admin > Recursos da loja, ligado por padrão) e regras
-- de acesso: Admin > Configurações > Segurança da conta.
--  1) O código de 6 dígitos (TOTP, app autenticador) é do serviço de contas (GoTrue): o administrador ativa no Admin
--     e, depois disso, a sessão só vale como admin com o segundo passo feito (aal2 no token).
--  2) has_role(<o próprio utilizador>, 'admin') passa a exigir aal2 quando o admin tem 2FA ativo, ou quando a loja
--     exige 2FA de todos (store_settings.security.require_admin_2fa). Como todas as regras de acesso do Admin usam
--     has_role, a exigência vale no servidor inteiro. Consultas por outro utilizador e a chave de serviço não mudam.
--     Com o recurso desligado nada disto se aplica.
--  3) admin_access_state(): ok, mfa_required (falta o código), mfa_setup_required (a loja exige e falta ativar),
--     not_admin. O site usa para mostrar o passo certo em vez de negar o acesso.
--  4) Exigir de todos só é aceite de quem já tem 2FA ativo (ninguém se tranca fora).
--  5) admin_security_overview (admins e quem tem 2FA) e admin_reset_mfa (tira o 2FA de outro admin que perdeu o
--     telemóvel; fica no registo de atividade).
-- =============================================================================================

-- ---------------------------------------------------------------------------------------------
-- Regra do segundo passo
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._admin_has_mfa(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = _user_id AND f.status = 'verified');
$$;
REVOKE ALL ON FUNCTION public._admin_has_mfa(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._admin_mfa_required_by_store()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE((SELECT value -> 'require_admin_2fa' = 'true'::jsonb FROM public.store_settings WHERE key = 'security'), false);
$$;
REVOKE ALL ON FUNCTION public._admin_mfa_required_by_store() FROM PUBLIC, anon, authenticated;

/** A sessão atual cumpre o segundo passo exigido para este admin? */
CREATE OR REPLACE FUNCTION public._admin_mfa_ok(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(auth.jwt() ->> 'aal', '') = 'aal2'
      OR NOT public.feature_enabled('admin_2fa', true)
      OR (NOT public._admin_has_mfa(_user_id) AND NOT public._admin_mfa_required_by_store());
$$;
REVOKE ALL ON FUNCTION public._admin_mfa_ok(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
  -- Admin na própria sessão: com 2FA ativo (ou exigido pela loja), só com o segundo passo feito.
  AND (_role <> 'admin'::app_role OR _user_id IS DISTINCT FROM auth.uid() OR public._admin_mfa_ok(_user_id))
$function$;

CREATE OR REPLACE FUNCTION public.admin_access_state()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = uid AND role = 'admin'::app_role) THEN
    RETURN 'not_admin';
  END IF;
  IF public._admin_mfa_ok(uid) THEN RETURN 'ok'; END IF;
  IF public._admin_has_mfa(uid) THEN RETURN 'mfa_required'; END IF;
  RETURN 'mfa_setup_required';
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_access_state() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_access_state() TO authenticated;

-- ---------------------------------------------------------------------------------------------
-- Exigir de todos só com 2FA próprio ativo
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.store_settings_security_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.key = 'security' AND NEW.value -> 'require_admin_2fa' = 'true'::jsonb
     AND auth.uid() IS NOT NULL AND NOT public._admin_has_mfa(auth.uid()) THEN
    RAISE EXCEPTION 'mfa_needed_first' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.store_settings_security_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS store_settings_security_guard ON public.store_settings;
CREATE TRIGGER store_settings_security_guard BEFORE INSERT OR UPDATE OF value ON public.store_settings
  FOR EACH ROW EXECUTE FUNCTION public.store_settings_security_guard();

-- ---------------------------------------------------------------------------------------------
-- Visão geral e reposição (só admin)
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_security_overview()
RETURNS TABLE (user_id uuid, email text, has_2fa boolean, factors bigint, last_sign_in_at timestamptz, is_me boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT COALESCE(public.has_role(auth.uid(), 'admin'::app_role), false) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT ur.user_id, u.email::text, public._admin_has_mfa(ur.user_id),
         (SELECT count(*) FROM auth.mfa_factors f WHERE f.user_id = ur.user_id AND f.status = 'verified'),
         u.last_sign_in_at, ur.user_id = auth.uid()
    FROM public.user_roles ur
    JOIN auth.users u ON u.id = ur.user_id
   WHERE ur.role = 'admin'::app_role
   ORDER BY ur.user_id = auth.uid() DESC, u.email;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_security_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_security_overview() TO authenticated;

/** Tira o 2FA de outro administrador (perdeu o telemóvel). O próprio tira o seu no serviço de contas. */
CREATE OR REPLACE FUNCTION public.admin_reset_mfa(_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE uid uuid := auth.uid(); gone integer;
BEGIN
  IF NOT COALESCE(public.has_role(uid, 'admin'::app_role), false) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF _user_id IS NULL OR _user_id = uid THEN RAISE EXCEPTION 'not_self' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin'::app_role) THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;
  DELETE FROM auth.mfa_factors WHERE user_id = _user_id;
  GET DIAGNOSTICS gone = ROW_COUNT;
  IF gone > 0 AND to_regclass('public.admin_activity_log') IS NOT NULL AND public.feature_enabled('activity_log', true) THEN
    INSERT INTO public.admin_activity_log (actor, actor_email, action, entity, entity_id, entity_label, parent_id, changes)
    VALUES (uid, (SELECT email::text FROM auth.users WHERE id = uid), 'update', 'auth_users', _user_id::text,
            (SELECT email::text FROM auth.users WHERE id = _user_id), _user_id::text,
            jsonb_build_object('mfa', jsonb_build_object('o', '"***"'::jsonb, 'n', 'null'::jsonb)));
  END IF;
  RETURN gone;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_reset_mfa(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reset_mfa(uuid) TO authenticated;
