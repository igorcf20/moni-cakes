-- =============================================================================================
-- Prazo de produção e data de entrega (recurso delivery_dates em Admin > Recursos da loja, desligado por padrão):
-- Admin > Configurações > Prazos e entrega (regras em store_settings.delivery_dates) e aba Envio do produto.
--  1) products.lead_time_min_days / lead_time_max_days  dias úteis para preparar ou produzir (vazio = padrão da loja).
--  2) orders.estimated_ship_by           enviar até (prazo máximo do carrinho em dias úteis, com hora de corte)
--     orders.estimated_delivery_from/_to chega entre (com os dias de transporte da forma de envio)
--     Gravados pelo create-order (contas em supabase/functions/_shared/deliveryDates.ts, cópia em src/lib) e só o
--     servidor ou o Admin os mudam (orders_lock_server_columns).
-- =============================================================================================

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS lead_time_min_days integer;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS lead_time_max_days integer;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_lead_time_range') THEN
    ALTER TABLE public.products ADD CONSTRAINT products_lead_time_range CHECK (
      (lead_time_min_days IS NULL OR lead_time_min_days BETWEEN 0 AND 120)
      AND (lead_time_max_days IS NULL OR lead_time_max_days BETWEEN 0 AND 120)
      AND (lead_time_min_days IS NULL OR lead_time_max_days IS NULL OR lead_time_min_days <= lead_time_max_days));
  END IF;
END $$;
COMMENT ON COLUMN public.products.lead_time_min_days IS 'Prazo de produção ou preparo, mínimo em dias úteis (vazio = padrão de Prazos e entrega).';
COMMENT ON COLUMN public.products.lead_time_max_days IS 'Prazo de produção ou preparo, máximo em dias úteis (vazio = padrão de Prazos e entrega).';

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS estimated_ship_by date;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS estimated_delivery_from date;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS estimated_delivery_to date;
COMMENT ON COLUMN public.orders.estimated_ship_by IS 'Enviar ou deixar pronto até (calculado no create-order; o Admin pode mudar).';
COMMENT ON COLUMN public.orders.estimated_delivery_from IS 'Previsão de chegada, primeiro dia.';
COMMENT ON COLUMN public.orders.estimated_delivery_to IS 'Previsão de chegada, último dia.';
CREATE INDEX IF NOT EXISTS orders_ship_by_idx ON public.orders (estimated_ship_by) WHERE estimated_ship_by IS NOT NULL;

-- Colunas que só o servidor (ou o Admin) grava: as anteriores e as datas previstas.
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
  NEW.payment_discount        := OLD.payment_discount;
  NEW.shipping_service_id     := OLD.shipping_service_id;
  NEW.shipping_details        := OLD.shipping_details;
  NEW.checkout_fields         := OLD.checkout_fields;
  NEW.extras_amount           := OLD.extras_amount;
  NEW.extras_vat              := OLD.extras_vat;
  NEW.estimated_ship_by       := OLD.estimated_ship_by;
  NEW.estimated_delivery_from := OLD.estimated_delivery_from;
  NEW.estimated_delivery_to   := OLD.estimated_delivery_to;
  RETURN NEW;
END;
$function$;
