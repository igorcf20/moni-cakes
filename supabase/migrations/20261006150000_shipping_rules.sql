-- Frete: restrições por produto e forma de calcular o preço (Admin > Frete e entrega > forma de envio).
--   excluded_products  produtos que esta forma de envio não leva (ex.: peça grande que os Correios não aceitam,
--                      mas a TNT Express sim); junta-se às classes de envio (excluded_classes) que já existiam.
--   rate_basis         o que escolhe a linha da tabela de preços: 'weight' (peso cobrado, como antes), 'items'
--                      (quantidade de artigos), 'subtotal' (valor dos artigos, na moeda da zona) ou 'flat'
--                      (preço único por zona). min_weight_kg / max_weight_kg da tabela guardam esse valor.
--   fee_cents          taxa fixa somada a cada pedido (centavos da moeda base da loja, como os preços)
--   fee_percent        percentagem sobre o valor dos artigos (ex.: seguro / ad valorem)
--   min_price_cents    preço mínimo do frete (moeda base); o frete grátis continua a dar 0
-- O cálculo continua só no servidor (supabase/functions/_shared/shipping/).

ALTER TABLE public.shipping_services
  ADD COLUMN IF NOT EXISTS excluded_products text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS rate_basis text NOT NULL DEFAULT 'weight',
  ADD COLUMN IF NOT EXISTS fee_cents bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fee_percent numeric(6,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_price_cents bigint;

ALTER TABLE public.shipping_services DROP CONSTRAINT IF EXISTS shipping_services_rate_basis_check;
ALTER TABLE public.shipping_services ADD CONSTRAINT shipping_services_rate_basis_check
  CHECK (rate_basis IN ('weight', 'items', 'subtotal', 'flat'));
ALTER TABLE public.shipping_services DROP CONSTRAINT IF EXISTS shipping_services_fees_check;
ALTER TABLE public.shipping_services ADD CONSTRAINT shipping_services_fees_check
  CHECK (fee_cents >= 0 AND fee_percent >= 0 AND fee_percent <= 100 AND (min_price_cents IS NULL OR min_price_cents >= 0));

-- A tabela de preços passa a guardar valores (até 9 999 999,999) e não só quilos.
ALTER TABLE public.shipping_service_rates ALTER COLUMN min_weight_kg TYPE numeric(12,3);
ALTER TABLE public.shipping_service_rates ALTER COLUMN max_weight_kg TYPE numeric(12,3);
