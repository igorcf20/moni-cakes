-- Reserva no carrinho (recurso cart_reservations, ligado por padrão; Admin > Estoque > Reserva no carrinho).
--
-- Ao entrar no carrinho, as unidades ficam reservadas para quem as pôs lá durante um tempo configurável
-- (store_settings.cart_reservations: minutes, notice, restart_on_change). Enquanto a reserva vale, os outros
-- compradores veem menos unidades (carrinho, checkout e create-order) e o pedido deles não as pode levar.
-- Passado o tempo, a reserva deixa de contar sozinha (todas as contas olham para expires_at > now()); a linha
-- fica para o cliente saber que venceu e é apagada pelo cron cart-reservations-purge um dia depois.
--
--   cart_reservations          uma linha por dono (conta ou carrinho de visitante) e por estoque (slot)
--   _cart_holder               dono: 'u:<conta>' com sessão, senão 'g:<sha256 do código do aparelho>'
--   _cart_reservation_rules    regras normalizadas
--   _cart_stock_lines          estoque por linha para um dono (com ou sem sincronizar a reserva)
--   cart_stock_check           site (carrinho, gaveta, checkout): substitui a versão de 20261007210000
--   cart_stock_check_for       create-order (service_role): o comprador não perde para a própria reserva
--   order_items_reserve_stock  na compra do cliente, as reservas de outros contam; a do comprador é consumida
--   admin_cart_reservations, admin_release_cart_reservation   Admin

-- ---------------------------------------------------------------------------------------------
-- Tabela (só pelas funções: sem acesso direto pelo REST).
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cart_reservations (
  holder text NOT NULL,
  slot text NOT NULL,
  product_id text NOT NULL,
  -- unidades seguras para este dono (0 quando não havia nenhuma livre)
  quantity integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  -- quantas o dono tem no carrinho: só uma mudança aqui renova a reserva
  requested integer NOT NULL DEFAULT 0 CHECK (requested >= 0),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (holder, slot)
);
CREATE INDEX IF NOT EXISTS cart_reservations_slot_idx ON public.cart_reservations (slot, expires_at);
ALTER TABLE public.cart_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cart_reservations FROM PUBLIC, anon, authenticated;

INSERT INTO public.store_settings (key, value)
VALUES ('cart_reservations', '{"minutes": 5, "notice": true, "restart_on_change": true}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------------------------
-- Regras e dono.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._cart_reservation_rules()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v jsonb; m integer;
BEGIN
  SELECT value INTO v FROM public.store_settings WHERE key = 'cart_reservations';
  IF v IS NULL OR jsonb_typeof(v) <> 'object' THEN v := '{}'::jsonb; END IF;
  m := CASE WHEN jsonb_typeof(v->'minutes') = 'number' THEN floor((v->>'minutes')::numeric)::integer ELSE 5 END;
  RETURN jsonb_build_object(
    'on', public.feature_enabled('cart_reservations', true),
    'minutes', LEAST(240, GREATEST(1, m)),
    'notice', COALESCE(CASE WHEN jsonb_typeof(v->'notice') = 'boolean' THEN (v->>'notice')::boolean END, true),
    'restart_on_change', COALESCE(CASE WHEN jsonb_typeof(v->'restart_on_change') = 'boolean' THEN (v->>'restart_on_change')::boolean END, true));
END;
$function$;
REVOKE ALL ON FUNCTION public._cart_reservation_rules() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._cart_holder(_token text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT CASE
    WHEN auth.uid() IS NOT NULL THEN 'u:' || auth.uid()::text
    WHEN _token IS NOT NULL AND _token ~ '^[A-Za-z0-9_-]{20,100}$' THEN 'g:' || encode(digest(_token, 'sha256'), 'hex')
  END;
$function$;
REVOKE ALL ON FUNCTION public._cart_holder(text) FROM PUBLIC, anon, authenticated;

/** Unidades do estoque seguras por outros donos, agora. */
CREATE OR REPLACE FUNCTION public._reserved_by_others(_slot text, _holder text)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(sum(quantity), 0)::integer FROM public.cart_reservations
   WHERE slot = _slot AND holder IS DISTINCT FROM _holder AND expires_at > now();
$function$;
REVOKE ALL ON FUNCTION public._reserved_by_others(text, text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Estoque por linha para um dono. _reserve = sincroniza a reserva do dono com o carrinho enviado:
--   estoque novo no carrinho -> reserva com prazo novo; quantidade mudou -> reserva ajustada (prazo novo com
--   restart_on_change ou se já tinha vencido); igual e ainda a valer -> só completa se entraram unidades;
--   igual e vencida -> fica vencida (o cliente não renova só por abrir a página); fora do carrinho -> apagada.
-- Resposta: { reservation: {on, notice, minutes}, lines: [{ slot, available, reserved, expires_at, expired }] }
--   available = estoque menos as reservas dos outros (o que este dono pode comprar).
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._cart_stock_lines(_items jsonb, _holder text, _reserve boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  rules jsonb := public._cart_reservation_rules();
  on_ boolean := (rules->>'on')::boolean;
  mins integer := (rules->>'minutes')::integer;
  restart boolean := (rules->>'restart_on_change')::boolean;
  it jsonb;
  r record;
  design jsonb;
  slots text[] := '{}';
  prods text[] := '{}';
  avails integer[] := '{}';
  wanted jsonb := '{}'::jsonb;
  s text;
  i integer;
  others integer;
  can integer;
  want integer;
  row_ public.cart_reservations;
  lines jsonb := '[]'::jsonb;
BEGIN
  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' THEN _items := '[]'::jsonb; END IF;
  IF jsonb_array_length(_items) > 200 THEN RAISE EXCEPTION 'too_many_items'; END IF;

  FOR it IN SELECT value FROM jsonb_array_elements(_items) LOOP
    design := CASE WHEN jsonb_typeof(it->'design_data') = 'object' THEN it->'design_data' ELSE NULL END;
    SELECT * INTO r FROM public._order_item_stock_slot(NULLIF(it->>'product_id', ''), design);
    slots := slots || r.slot;
    prods := prods || NULLIF(it->>'product_id', '');
    avails := avails || r.available;
    IF r.slot IS NOT NULL THEN
      wanted := jsonb_set(wanted, ARRAY[r.slot], to_jsonb(COALESCE((wanted->>r.slot)::integer, 0)
        + GREATEST(0, COALESCE(floor((it->>'quantity')::numeric)::integer, 0))));
    END IF;
  END LOOP;

  IF _reserve AND on_ AND _holder IS NOT NULL THEN
    -- Fora do carrinho: a reserva sai.
    DELETE FROM public.cart_reservations c WHERE c.holder = _holder AND NOT (wanted ? c.slot);
    FOR s IN SELECT key FROM jsonb_each(wanted) ORDER BY key LOOP
      -- Um de cada vez por estoque: duas reservas ao mesmo tempo não levam a mesma unidade.
      PERFORM pg_advisory_xact_lock(hashtext('loja3d.reserve:' || s));
      i := array_position(slots, s);
      others := public._reserved_by_others(s, _holder);
      can := GREATEST(0, COALESCE(avails[i], 0) - others);
      want := LEAST((wanted->>s)::integer, can);
      SELECT * INTO row_ FROM public.cart_reservations WHERE holder = _holder AND slot = s FOR UPDATE;
      IF NOT FOUND THEN
        IF (wanted->>s)::integer > 0 THEN
          INSERT INTO public.cart_reservations (holder, slot, product_id, quantity, requested, expires_at)
          VALUES (_holder, s, prods[i], want, (wanted->>s)::integer, now() + make_interval(mins => mins));
        END IF;
      ELSIF row_.requested <> (wanted->>s)::integer THEN
        UPDATE public.cart_reservations
           SET quantity = want, requested = (wanted->>s)::integer, updated_at = now(),
               expires_at = CASE WHEN restart OR row_.expires_at <= now() THEN now() + make_interval(mins => mins) ELSE row_.expires_at END
         WHERE holder = _holder AND slot = s;
      ELSIF row_.expires_at > now() AND row_.quantity <> want THEN
        UPDATE public.cart_reservations SET quantity = want, updated_at = now() WHERE holder = _holder AND slot = s;
      END IF;
    END LOOP;
  END IF;

  FOR i IN 1 .. COALESCE(array_length(slots, 1), 0) LOOP
    IF slots[i] IS NULL THEN
      lines := lines || jsonb_build_array(jsonb_build_object('slot', NULL, 'available', NULL));
      CONTINUE;
    END IF;
    others := CASE WHEN on_ THEN public._reserved_by_others(slots[i], _holder) ELSE 0 END;
    row_ := NULL;
    IF on_ AND _holder IS NOT NULL THEN
      SELECT * INTO row_ FROM public.cart_reservations WHERE holder = _holder AND slot = slots[i];
    END IF;
    lines := lines || jsonb_build_array(jsonb_build_object(
      'slot', slots[i],
      'available', GREATEST(0, COALESCE(avails[i], 0) - others),
      'reserved', CASE WHEN row_.expires_at > now() THEN row_.quantity ELSE 0 END,
      'expires_at', row_.expires_at,
      'expired', row_.expires_at IS NOT NULL AND row_.expires_at <= now()));
  END LOOP;

  RETURN jsonb_build_object('reservation', jsonb_build_object('on', on_, 'notice', on_ AND (rules->>'notice')::boolean, 'minutes', mins),
                            'lines', lines);
END;
$function$;
REVOKE ALL ON FUNCTION public._cart_stock_lines(jsonb, text, boolean) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Site: estoque do carrinho e reserva. _holder_token = código aleatório do aparelho (visitante); com sessão
-- vale a conta, e a reserva feita como visitante passa para ela.
-- ---------------------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.cart_stock_check(jsonb);
CREATE OR REPLACE FUNCTION public.cart_stock_check(_items jsonb, _holder_token text DEFAULT NULL, _reserve boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE h text := public._cart_holder(_holder_token); guest text;
BEGIN
  IF auth.uid() IS NOT NULL AND _holder_token ~ '^[A-Za-z0-9_-]{20,100}$' THEN
    guest := 'g:' || encode(digest(_holder_token, 'sha256'), 'hex');
    DELETE FROM public.cart_reservations g WHERE g.holder = guest
       AND EXISTS (SELECT 1 FROM public.cart_reservations u WHERE u.holder = h AND u.slot = g.slot);
    UPDATE public.cart_reservations SET holder = h, updated_at = now() WHERE cart_reservations.holder = guest;
  END IF;
  RETURN public._cart_stock_lines(_items, h, COALESCE(_reserve, false));
END;
$function$;
REVOKE ALL ON FUNCTION public.cart_stock_check(jsonb, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cart_stock_check(jsonb, text, boolean) TO anon, authenticated, service_role;

-- create-order: o estoque que este comprador pode levar (a reserva dele conta a favor).
CREATE OR REPLACE FUNCTION public.cart_stock_check_for(_items jsonb, _user_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public._cart_stock_lines(_items, 'u:' || _user_id::text, false);
$function$;
REVOKE ALL ON FUNCTION public.cart_stock_check_for(jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cart_stock_check_for(jsonb, uuid) TO service_role;

-- ---------------------------------------------------------------------------------------------
-- Baixa de estoque da linha (igual a 20261007210000 + reservas na compra do cliente).
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.order_items_reserve_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  prev text := COALESCE(current_setting('loja3d.stock_ctx', true), '');
  customer boolean := COALESCE(current_setting('loja3d.customer_checkout', true), '') = '1';
  buyer text := CASE WHEN auth.uid() IS NOT NULL THEN 'u:' || auth.uid()::text END;
  r record;
BEGIN
  IF NEW.quantity IS NULL OR NEW.quantity <= 0 THEN RETURN NEW; END IF;
  -- Compra do cliente com a reserva ligada: as unidades reservadas por outros não estão à venda.
  IF customer AND public.feature_enabled('cart_reservations', true) THEN
    SELECT * INTO r FROM public._order_item_stock_slot(NEW.product_id, NEW.design_data);
    IF r.slot IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(hashtext('loja3d.reserve:' || r.slot));
      IF r.available - public._reserved_by_others(r.slot, buyer) < NEW.quantity THEN
        RAISE EXCEPTION 'Stock insuficiente para um dos artigos. Reduza a quantidade ou remova o artigo do carrinho.';
      END IF;
      -- A reserva do comprador vira venda.
      DELETE FROM public.cart_reservations WHERE holder = buyer AND slot = r.slot;
    END IF;
  END IF;
  -- Dentro da edição de itens do Admin o motivo já é order_edit.
  IF prev = '' THEN
    PERFORM set_config('loja3d.stock_ctx', jsonb_build_object('reason', 'sale', 'order_id', NEW.order_id)::text, true);
  END IF;
  PERFORM public._adjust_order_item_stock(NEW.product_id, NEW.design_data, -NEW.quantity,
    customer OR NOT public._is_trusted_writer());
  PERFORM set_config('loja3d.stock_ctx', prev, true);
  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------------------------
-- Admin: reservas a valer (com produto e conta) e liberar uma.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_cart_reservations()
RETURNS TABLE (holder text, slot text, product_id text, product_name text, quantity integer, requested integer,
               expires_at timestamptz, created_at timestamptz, customer_email text, is_guest boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT c.holder, c.slot, c.product_id, p.name, c.quantity, c.requested, c.expires_at, c.created_at,
         u.email::text, c.holder LIKE 'g:%'
    FROM public.cart_reservations c
    LEFT JOIN public.products p ON p.id = c.product_id
    LEFT JOIN auth.users u ON c.holder LIKE 'u:%' AND u.id::text = substr(c.holder, 3)
   WHERE c.expires_at > now() AND c.quantity > 0
   ORDER BY c.expires_at;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_cart_reservations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_cart_reservations() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_release_cart_reservation(_holder text, _slot text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  -- Fica como vencida: o cliente vê que a reserva acabou.
  UPDATE public.cart_reservations SET expires_at = now(), updated_at = now() WHERE holder = _holder AND slot = _slot;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_release_cart_reservation(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_release_cart_reservation(text, text) TO authenticated;

-- ---------------------------------------------------------------------------------------------
-- Limpeza: reservas vencidas há mais de um dia (as vencidas já não contam desde o primeiro segundo).
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cart_reservations_purge()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE n integer;
BEGIN
  DELETE FROM public.cart_reservations WHERE expires_at < now() - interval '1 day';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$function$;
REVOKE ALL ON FUNCTION public.cart_reservations_purge() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE jid int;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'cart-reservations-purge';
  IF jid IS NOT NULL THEN PERFORM cron.unschedule(jid); END IF;
END $$;

SELECT cron.schedule('cart-reservations-purge', '17 * * * *', $$ SELECT public.cart_reservations_purge(); $$);
