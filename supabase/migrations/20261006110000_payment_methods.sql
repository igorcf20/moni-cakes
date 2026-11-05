-- Formas de pagamento para qualquer país (Admin > Pagamentos).
--
-- 1) payment_config ganha: países onde o meio vale (vazio = todos), nome e instruções por idioma,
--    desconto por meio (ex.: 5% no Pix), valor mínimo e máximo do pedido (moeda base da loja).
-- 2) Meios novos: Mercado Pago (Pix, cartão e boleto no Brasil), Stripe (cartão, carteiras e meios locais na
--    Europa e no mundo), PayPal e Bizum (Espanha, com número de telefone, como o MB WAY).
-- 3) payment_sessions: cada pagamento aberto num provedor (Mercado Pago, Stripe, PayPal), com o valor e a moeda
--    esperados. O pagamento só conta depois de confirmado na API do provedor (funções payment-*).
-- 4) orders.payment_discount: desconto do meio de pagamento, calculado no servidor (create-order).
-- 5) Colunas gravadas só pelo servidor (frete escolhido e desconto de pagamento) ficam protegidas contra
--    alterações do cliente enquanto o pedido está pendente.

-- 1) e 2) -----------------------------------------------------------------------------------------------
ALTER TABLE public.payment_config
  ADD COLUMN IF NOT EXISTS countries text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS name_i18n jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS instructions_i18n jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS discount_percent numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_total numeric(12,2),
  ADD COLUMN IF NOT EXISTS max_total numeric(12,2);

ALTER TABLE public.payment_config DROP CONSTRAINT IF EXISTS payment_config_discount_check;
ALTER TABLE public.payment_config ADD CONSTRAINT payment_config_discount_check CHECK (discount_percent >= 0 AND discount_percent <= 50);

ALTER TABLE public.payment_config DROP CONSTRAINT IF EXISTS payment_config_type_check;
ALTER TABLE public.payment_config ADD CONSTRAINT payment_config_type_check
  CHECK (type IN ('multibanco','mbway','transfer','on_delivery','stripe','pix','viva','mercado_pago','paypal','bizum'));

COMMENT ON COLUMN public.payment_config.countries IS 'Códigos ISO dos países onde o meio aparece no checkout; vazio = todos.';
COMMENT ON COLUMN public.payment_config.discount_percent IS 'Desconto (%) sobre os produtos quando o cliente paga com este meio. Calculado no servidor.';
COMMENT ON COLUMN public.payment_config.min_total IS 'Valor mínimo do pedido (moeda base da loja) para mostrar este meio.';

-- Meios que antes só existiam num país pelo código do checkout passam a ter o país gravado (editável no Admin).
UPDATE public.payment_config SET countries = '{PT}' WHERE type IN ('multibanco','mbway') AND countries = '{}';
UPDATE public.payment_config SET countries = '{BR}' WHERE type = 'pix' AND countries = '{}';
UPDATE public.payment_config SET countries = '{PT}' WHERE type = 'viva' AND countries = '{}';

-- O Stripe antigo era só um aviso "configuração pendente": passa a ser o pagamento real por cartão (Stripe Checkout).
UPDATE public.payment_config
   SET name = 'Cartão de crédito ou débito',
       details = details - 'instrucoes'
 WHERE type = 'stripe' AND details->>'instrucoes' ILIKE '%pendente%';

-- O checkout lê os meios ativos por esta função (a tabela só é visível ao admin).
DROP FUNCTION IF EXISTS public.get_active_payment_methods();
CREATE FUNCTION public.get_active_payment_methods()
RETURNS TABLE(id uuid, type text, name text, is_active boolean, details jsonb, display_order integer,
              countries text[], name_i18n jsonb, instructions_i18n jsonb, discount_percent numeric,
              min_total numeric, max_total numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, type, name, is_active, details, display_order,
         countries, name_i18n, instructions_i18n, discount_percent, min_total, max_total
    FROM public.payment_config
   WHERE is_active = true
   ORDER BY display_order;
$$;
REVOKE EXECUTE ON FUNCTION public.get_active_payment_methods() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_payment_methods() TO anon, authenticated;

-- 3) ----------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('mercado_pago','stripe','paypal')),
  provider_ref text NOT NULL,                 -- preferência (Mercado Pago), sessão (Stripe) ou ordem (PayPal)
  checkout_url text,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  currency text NOT NULL,
  status text NOT NULL DEFAULT 'created' CHECK (status IN ('created','paid','failed','expired','duplicate','held')),
  provider_payment_id text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_ref)
);
CREATE INDEX IF NOT EXISTS payment_sessions_order_idx ON public.payment_sessions (order_id, created_at DESC);
DROP TRIGGER IF EXISTS payment_sessions_touch ON public.payment_sessions;
CREATE TRIGGER payment_sessions_touch BEFORE UPDATE ON public.payment_sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.payment_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payment_sessions_admin_read" ON public.payment_sessions;
CREATE POLICY "payment_sessions_admin_read" ON public.payment_sessions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
REVOKE ALL ON public.payment_sessions FROM anon;
GRANT SELECT ON public.payment_sessions TO authenticated;
COMMENT ON TABLE public.payment_sessions IS 'Pagamentos abertos no Mercado Pago, Stripe ou PayPal; escritos só pelas funções do servidor.';

-- 4) ----------------------------------------------------------------------------------------------------
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_discount numeric(12,2) NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.orders.payment_discount IS 'Desconto do meio de pagamento (já descontado do total). Gravado pelo create-order.';

-- 5) ----------------------------------------------------------------------------------------------------
-- O cliente pode editar o próprio pedido pendente (ex.: notas); estas colunas são só do servidor e do admin.
CREATE OR REPLACE FUNCTION public.orders_lock_server_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE jwt_role text;
BEGIN
  BEGIN
    jwt_role := coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
                         (current_setting('request.jwt.claims', true)::jsonb ->> 'role'));
  EXCEPTION WHEN OTHERS THEN jwt_role := NULL; END;
  IF jwt_role IS NULL OR jwt_role = 'service_role' OR public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;
  NEW.payment_discount    := OLD.payment_discount;
  NEW.shipping_service_id := OLD.shipping_service_id;
  NEW.shipping_details    := OLD.shipping_details;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS orders_lock_server_columns ON public.orders;
CREATE TRIGGER orders_lock_server_columns BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_lock_server_columns();
