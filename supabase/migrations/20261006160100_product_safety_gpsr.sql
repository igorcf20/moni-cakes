-- Segurança do produto (GPSR, Regulamento UE 2023/988, em vigor desde 13/12/2024): na venda online para a UE, a página
-- do produto mostra quem fabrica (nome, morada, contacto), a pessoa responsável na UE quando o fabricante é de fora,
-- um identificador do produto e os avisos e instruções de segurança.
--   products.safety_info  dados próprios do produto (vazio = usa os padrões da loja):
--     { "manufacturer": { "name", "address", "contact" }, "responsible": { "name", "address", "contact" },
--       "warnings": "texto", "model": "tipo, lote ou modelo" }
-- Padrões da loja e onde mostrar (UE, sempre ou nunca): store_settings.product_compliance (Admin > Preços e segurança).

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS safety_info jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_safety_info_object;
ALTER TABLE public.products ADD CONSTRAINT products_safety_info_object CHECK (jsonb_typeof(safety_info) = 'object');

COMMENT ON COLUMN public.products.safety_info IS 'Segurança do produto (GPSR): fabricante, responsável na UE, modelo e avisos; vazio = padrões da loja.';
