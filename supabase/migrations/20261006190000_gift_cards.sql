-- =============================================================================================
-- Vale-presente (Admin > Vales-presente; recurso gift_cards em Admin > Recursos da loja, desligado por padrão).
--   gift_cards                 código (só letras e números, maiúsculas), valor inicial, saldo, validade, destinatário
--   gift_card_transactions     histórico: emissão, uso num pedido, devolução (pedido cancelado) e ajuste do Admin
--   check_gift_card(code)      checkout: saldo do vale, com sessão e limite de tentativas
--   create_order_with_gift_card  create-order: desconta o vale e grava o pedido na mesma transação
-- O saldo só muda por estas funções (trigger gift_cards_guard). Pedido cancelado ou reembolsado devolve o valor ao vale.
-- O total do pedido já vem com o vale descontado (calculado no servidor, create-order); pedido que fica a 0 entra pago.
-- =============================================================================================

CREATE TABLE IF NOT EXISTS public.gift_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9]{6,32}$'),
  initial_amount numeric(12,2) NOT NULL CHECK (initial_amount > 0),
  balance numeric(12,2) NOT NULL CHECK (balance >= 0),
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  recipient_name text CHECK (recipient_name IS NULL OR char_length(recipient_name) <= 120),
  recipient_email text CHECK (recipient_email IS NULL OR char_length(recipient_email) <= 254),
  sender_name text CHECK (sender_name IS NULL OR char_length(sender_name) <= 120),
  message text CHECK (message IS NULL OR char_length(message) <= 500),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 1000),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gift_card_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gift_card_id uuid NOT NULL REFERENCES public.gift_cards(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL,
  kind text NOT NULL CHECK (kind IN ('issue', 'redeem', 'refund', 'adjust')),
  note text CHECK (note IS NULL OR char_length(note) <= 500),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gift_card_transactions_card_idx ON public.gift_card_transactions (gift_card_id, created_at DESC);
CREATE INDEX IF NOT EXISTS gift_card_transactions_order_idx ON public.gift_card_transactions (order_id);

CREATE TABLE IF NOT EXISTS public.gift_card_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL,
  success boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gift_card_attempts_user_time_idx ON public.gift_card_attempts (user_id, created_at DESC);
ALTER TABLE public.gift_card_attempts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.gift_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gift_card_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage gift cards" ON public.gift_cards;
CREATE POLICY "Admins manage gift cards" ON public.gift_cards
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins read gift card history" ON public.gift_card_transactions;
CREATE POLICY "Admins read gift card history" ON public.gift_card_transactions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Pedido: vale usado e valor descontado (gravados pelo servidor).
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS gift_card_code text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS gift_card_amount numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS gift_card_refunded boolean NOT NULL DEFAULT false;

-- Código: só letras e números, maiúsculas (o site mostra em grupos de 4 com hífen).
CREATE OR REPLACE FUNCTION public.gift_card_normalize(_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$ SELECT upper(regexp_replace(coalesce(_code, ''), '[^A-Za-z0-9]', '', 'g')) $$;

-- Guarda do saldo: novo vale começa com saldo = valor inicial; depois o saldo só muda pelas funções desta migration.
CREATE OR REPLACE FUNCTION public.gift_cards_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.code := public.gift_card_normalize(NEW.code);
  IF TG_OP = 'INSERT' THEN
    NEW.balance := NEW.initial_amount;
    NEW.created_by := coalesce(NEW.created_by, auth.uid());
  ELSE
    IF coalesce(current_setting('app.gift_card_tx', true), '') <> '1' THEN
      NEW.balance := OLD.balance;
      NEW.initial_amount := OLD.initial_amount;
    END IF;
    NEW.code := OLD.code;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS gift_cards_guard ON public.gift_cards;
CREATE TRIGGER gift_cards_guard BEFORE INSERT OR UPDATE ON public.gift_cards
  FOR EACH ROW EXECUTE FUNCTION public.gift_cards_guard();

-- Emissão fica no histórico.
CREATE OR REPLACE FUNCTION public.gift_cards_log_issue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.gift_card_transactions (gift_card_id, amount, kind, created_by)
  VALUES (NEW.id, NEW.initial_amount, 'issue', NEW.created_by);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS gift_cards_log_issue ON public.gift_cards;
CREATE TRIGGER gift_cards_log_issue AFTER INSERT ON public.gift_cards
  FOR EACH ROW EXECUTE FUNCTION public.gift_cards_log_issue();

-- Ajuste do Admin (somar ou tirar saldo), com nota no histórico. Saldo nunca fica negativo.
CREATE OR REPLACE FUNCTION public.admin_adjust_gift_card(_id uuid, _amount numeric, _note text DEFAULT NULL)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE g public.gift_cards;
BEGIN
  IF NOT coalesce(public.has_role(auth.uid(), 'admin'::app_role), false) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _amount IS NULL OR _amount = 0 OR abs(_amount) > 1000000 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  SELECT * INTO g FROM public.gift_cards WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF g.balance + round(_amount, 2) < 0 THEN RAISE EXCEPTION 'negative_balance'; END IF;
  PERFORM set_config('app.gift_card_tx', '1', true);
  UPDATE public.gift_cards SET balance = balance + round(_amount, 2) WHERE id = _id RETURNING * INTO g;
  PERFORM set_config('app.gift_card_tx', '', true);
  INSERT INTO public.gift_card_transactions (gift_card_id, amount, kind, note, created_by)
  VALUES (_id, round(_amount, 2), 'adjust', nullif(btrim(coalesce(_note, '')), ''), auth.uid());
  RETURN g.balance;
END $$;
REVOKE ALL ON FUNCTION public.admin_adjust_gift_card(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_adjust_gift_card(uuid, numeric, text) TO authenticated;

-- Checkout: saldo do vale (sessão obrigatória, 10 erros em 15 minutos bloqueiam). Erros com código estável.
CREATE OR REPLACE FUNCTION public.check_gift_card(_code text)
RETURNS TABLE (code text, balance numeric, expires_at timestamptz)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  failures integer;
  g public.gift_cards;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'gift_card_login'; END IF;
  IF NOT public.feature_enabled('gift_cards', false) THEN RAISE EXCEPTION 'gift_card_disabled'; END IF;
  SELECT count(*) INTO failures FROM public.gift_card_attempts a
   WHERE a.user_id = uid AND NOT a.success AND a.created_at > now() - interval '15 minutes';
  IF failures >= 10 THEN RAISE EXCEPTION 'gift_card_too_many'; END IF;

  SELECT * INTO g FROM public.gift_cards c WHERE c.code = public.gift_card_normalize(_code);
  IF NOT FOUND OR NOT g.is_active OR (g.expires_at IS NOT NULL AND g.expires_at < now()) OR g.balance <= 0 THEN
    INSERT INTO public.gift_card_attempts (user_id, success) VALUES (uid, false);
    -- Sem RAISE (desfaria a tentativa gravada): o site trata "sem linha" como vale inválido.
    RETURN;
  END IF;
  INSERT INTO public.gift_card_attempts (user_id, success) VALUES (uid, true);
  RETURN QUERY SELECT g.code, g.balance, g.expires_at;
END $$;
REVOKE ALL ON FUNCTION public.check_gift_card(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_gift_card(text) TO authenticated;

-- Servidor (create-order): desconta o vale e cria o pedido na mesma transação. _gift_amount já está no total.
CREATE OR REPLACE FUNCTION public.create_order_with_gift_card(_user_id uuid, _order jsonb, _items jsonb, _gift_code text, _gift_amount numeric)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g public.gift_cards;
  o public.orders;
  amt numeric := round(coalesce(_gift_amount, 0), 2);
BEGIN
  IF nullif(btrim(coalesce(_gift_code, '')), '') IS NULL OR amt <= 0 THEN
    RETURN public.create_order_server(_user_id, _order, _items);
  END IF;
  IF NOT public.feature_enabled('gift_cards', false) THEN
    RAISE EXCEPTION 'Vale-presente: indisponível nesta loja.';
  END IF;
  SELECT * INTO g FROM public.gift_cards c WHERE c.code = public.gift_card_normalize(_gift_code) FOR UPDATE;
  IF NOT FOUND OR NOT g.is_active OR (g.expires_at IS NOT NULL AND g.expires_at < now()) OR g.balance < amt THEN
    RAISE EXCEPTION 'Vale-presente: inválido, expirado ou sem saldo suficiente.';
  END IF;

  o := public.create_order_server(_user_id, _order, _items);

  -- Daqui em diante, de novo como servidor (create_order_server passou a sessão para o cliente).
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);

  PERFORM set_config('app.gift_card_tx', '1', true);
  UPDATE public.gift_cards SET balance = balance - amt WHERE id = g.id;
  INSERT INTO public.gift_card_transactions (gift_card_id, order_id, amount, kind, created_by)
  VALUES (g.id, o.id, -amt, 'redeem', _user_id);

  UPDATE public.orders
     SET gift_card_code = g.code,
         gift_card_amount = amt,
         status = CASE WHEN o.total <= 0 THEN 'paid' ELSE status END,
         payment_status = CASE WHEN o.total <= 0 THEN 'paid' ELSE payment_status END
   WHERE id = o.id
   RETURNING * INTO o;
  PERFORM set_config('app.gift_card_tx', '', true);
  RETURN o;
END $$;
REVOKE ALL ON FUNCTION public.create_order_with_gift_card(uuid, jsonb, jsonb, text, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_with_gift_card(uuid, jsonb, jsonb, text, numeric) TO service_role;

-- Pedido cancelado ou reembolsado: o valor volta ao vale (uma vez). Nome com zz_ para correr depois das outras
-- regras de BEFORE UPDATE do pedido.
CREATE OR REPLACE FUNCTION public.orders_gift_card_refund()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE gid uuid;
BEGIN
  -- O próprio servidor a gravar o vale no pedido (create_order_with_gift_card).
  IF coalesce(current_setting('app.gift_card_tx', true), '') = '1' THEN RETURN NEW; END IF;
  IF NEW.gift_card_amount > 0 AND NOT OLD.gift_card_refunded
     AND NEW.status IN ('cancelled', 'refunded') AND OLD.status NOT IN ('cancelled', 'refunded') THEN
    SELECT id INTO gid FROM public.gift_cards WHERE code = OLD.gift_card_code;
    IF gid IS NOT NULL THEN
      PERFORM set_config('app.gift_card_tx', '1', true);
      UPDATE public.gift_cards SET balance = balance + OLD.gift_card_amount WHERE id = gid;
      PERFORM set_config('app.gift_card_tx', '', true);
      INSERT INTO public.gift_card_transactions (gift_card_id, order_id, amount, kind, created_by)
      VALUES (gid, OLD.id, OLD.gift_card_amount, 'refund', auth.uid());
    END IF;
    NEW.gift_card_refunded := true;
  ELSE
    NEW.gift_card_refunded := OLD.gift_card_refunded;
  END IF;
  NEW.gift_card_code := OLD.gift_card_code;
  NEW.gift_card_amount := OLD.gift_card_amount;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS zz_orders_gift_card_refund ON public.orders;
CREATE TRIGGER zz_orders_gift_card_refund BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_gift_card_refund();

-- Editar itens do pedido no Admin: o total desconta também o vale-presente (igual à migration 20261006140000).
CREATE OR REPLACE FUNCTION public.admin_update_order_items(
  _order_id uuid,
  _items jsonb,
  _shipping_cost numeric,
  _discount numeric,
  _note text DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  o record;
  it jsonb;
  old_item record;
  keep_ids uuid[] := '{}';
  v_id uuid;
  v_qty integer;
  v_price numeric;
  v_rate numeric;
  v_items numeric := 0;
  v_vat numeric := 0;
  v_total numeric;
  v_ship numeric := round(GREATEST(COALESCE(_shipping_cost, 0), 0), 2);
  v_disc numeric := round(GREATEST(COALESCE(_discount, 0), 0), 2);
BEGIN
  IF NOT COALESCE(public.has_role(auth.uid(), 'admin'::app_role), false) THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF o.status IN ('shipped', 'delivered', 'cancelled', 'refunded')
     OR o.payment_status = 'refunded' OR o.resources_released_at IS NOT NULL THEN
    RAISE EXCEPTION 'order_locked';
  END IF;
  IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'items_required';
  END IF;

  -- Validação e ids que ficam.
  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_qty := (it ->> 'quantity')::integer;
    v_price := (it ->> 'price')::numeric;
    IF v_qty IS NULL OR v_qty <= 0 OR v_price IS NULL OR v_price < 0 THEN
      RAISE EXCEPTION 'invalid_item';
    END IF;
    IF NULLIF(it ->> 'product_id', '') IS NULL AND NULLIF(btrim(it ->> 'custom_name'), '') IS NULL THEN
      RAISE EXCEPTION 'invalid_item';
    END IF;
    v_id := NULLIF(it ->> 'id', '')::uuid;
    IF v_id IS NOT NULL THEN keep_ids := keep_ids || v_id; END IF;
  END LOOP;

  -- Itens retirados: devolve o estoque e apaga.
  FOR old_item IN
    SELECT id, product_id, quantity, design_data FROM public.order_items
     WHERE order_id = _order_id AND NOT (id = ANY (keep_ids))
  LOOP
    IF old_item.quantity > 0 THEN
      PERFORM public._adjust_order_item_stock(old_item.product_id, old_item.design_data, old_item.quantity, false);
    END IF;
    DELETE FROM public.order_items WHERE id = old_item.id;
  END LOOP;

  -- Alterados e novos.
  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_id := NULLIF(it ->> 'id', '')::uuid;
    v_qty := (it ->> 'quantity')::integer;
    v_price := round((it ->> 'price')::numeric, 2);
    v_rate := GREATEST(COALESCE((it ->> 'vat_rate')::numeric, 0), 0);
    v_items := v_items + round(v_price * v_qty, 2);
    v_vat := v_vat + round(v_price * v_qty * v_rate / 100, 2);

    IF v_id IS NOT NULL THEN
      SELECT id, product_id, quantity, design_data INTO old_item FROM public.order_items
       WHERE id = v_id AND order_id = _order_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'invalid_item'; END IF;
      IF v_qty <> old_item.quantity THEN
        PERFORM public._adjust_order_item_stock(old_item.product_id, old_item.design_data, old_item.quantity - v_qty, false);
      END IF;
      UPDATE public.order_items
         SET quantity = v_qty,
             price = v_price,
             vat_rate = v_rate,
             vat_amount = round(v_price * v_qty * v_rate / 100, 2),
             custom_name = CASE WHEN product_id IS NULL THEN COALESCE(NULLIF(btrim(it ->> 'custom_name'), ''), custom_name) ELSE custom_name END,
             custom_description = CASE WHEN product_id IS NULL THEN NULLIF(btrim(it ->> 'custom_description'), '') ELSE custom_description END
       WHERE id = v_id;
    ELSE
      INSERT INTO public.order_items (order_id, product_id, quantity, price, vat_rate, vat_amount, custom_name, custom_description, design_data)
      VALUES (
        _order_id,
        NULLIF(it ->> 'product_id', ''),
        v_qty,
        v_price,
        v_rate,
        round(v_price * v_qty * v_rate / 100, 2),
        CASE WHEN NULLIF(it ->> 'product_id', '') IS NULL THEN btrim(it ->> 'custom_name') END,
        CASE WHEN NULLIF(it ->> 'product_id', '') IS NULL THEN NULLIF(btrim(it ->> 'custom_description'), '') END,
        CASE WHEN NULLIF(it ->> 'product_id', '') IS NULL
          THEN jsonb_build_object('custom', true, 'name', btrim(it ->> 'custom_name'), 'description', COALESCE(btrim(it ->> 'custom_description'), ''))
        END
      );
    END IF;
  END LOOP;

  v_total := GREATEST(round(v_items + v_vat + v_ship - v_disc - COALESCE(o.payment_discount, 0) - COALESCE(o.gift_card_amount, 0), 2), 0);

  UPDATE public.orders
     SET subtotal_net = v_items,
         vat_total = v_vat,
         shipping_cost = v_ship,
         discount_amount = v_disc,
         total = v_total
   WHERE id = _order_id;

  INSERT INTO public.order_status_history (order_id, status, notes)
  VALUES (_order_id, o.status, NULLIF(btrim(COALESCE(_note, '')), ''));

  RETURN v_total;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_update_order_items(uuid, jsonb, numeric, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_order_items(uuid, jsonb, numeric, numeric, text) TO authenticated;

COMMENT ON FUNCTION public.admin_update_order_items(uuid, jsonb, numeric, numeric, text) IS
  'Admin: substitui os itens de um pedido ainda não enviado, acerta o estoque e recalcula os totais.';
