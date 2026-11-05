-- LOJA 3D, FASE 2, etapa 1: países onde a loja vende.
-- Cada país diz a moeda, o idioma sugerido, a regra de impostos, o documento fiscal, o formato do código postal,
-- e quais provedores de frete, pagamento e nota fiscal usar. Nada disto fica fixo no código.
-- Executar no SQL Editor do Supabase. Seguro de repetir (não apaga dados já editados no Admin).

CREATE TABLE IF NOT EXISTS public.countries (
  code text PRIMARY KEY CHECK (code ~ '^[A-Z]{2}$'),            -- ISO 3166-1 alfa-2
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),       -- ISO 4217
  default_locale text NOT NULL,                                  -- pt-BR, pt-PT, es, en
  phone_prefix text NOT NULL,                                    -- +55, +351...
  -- inclusive: o preço do produto já é o preço final (Brasil, EUA); vat: preço líquido + IVA destacado (UE)
  tax_mode text NOT NULL CHECK (tax_mode IN ('inclusive', 'vat')),
  default_tax_rate numeric(5,2) NOT NULL DEFAULT 0 CHECK (default_tax_rate >= 0 AND default_tax_rate < 100),
  shipping_tax_rate numeric(5,2) NOT NULL DEFAULT 0 CHECK (shipping_tax_rate >= 0 AND shipping_tax_rate < 100),
  tax_id_kind text NOT NULL CHECK (tax_id_kind IN ('br_cpf_cnpj', 'pt_nif', 'es_nif', 'none')),
  tax_id_required boolean NOT NULL DEFAULT false,
  postal_code_kind text NOT NULL CHECK (postal_code_kind IN ('br_cep', 'pt_cp', 'es_cp', 'us_zip', 'generic')),
  shipping_provider text,                                        -- melhor_envio, ctt, flat
  payment_providers text[] NOT NULL DEFAULT '{}',                -- mercado_pago, viva, manual...
  invoice_provider text,                                         -- nfe, fiz (vazio: sem emissão automática)
  free_shipping_from_cents bigint CHECK (free_shipping_from_cents IS NULL OR free_shipping_from_cents >= 0),
  print3d jsonb NOT NULL DEFAULT '{}'::jsonb,                    -- custos de partida do orçamento 3D
  is_active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Só um país padrão.
CREATE UNIQUE INDEX IF NOT EXISTS countries_one_default ON public.countries (is_default) WHERE is_default;

CREATE OR REPLACE FUNCTION public.countries_touch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS countries_touch ON public.countries;
CREATE TRIGGER countries_touch BEFORE UPDATE ON public.countries FOR EACH ROW EXECUTE FUNCTION public.countries_touch();

ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "countries_public_read" ON public.countries;
CREATE POLICY "countries_public_read" ON public.countries FOR SELECT TO anon, authenticated USING (is_active);
DROP POLICY IF EXISTS "countries_admin_all" ON public.countries;
CREATE POLICY "countries_admin_all" ON public.countries FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
GRANT SELECT ON public.countries TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.countries TO authenticated;

-- Países de partida (valores de exemplo, ajustáveis no Admin). Não sobrescreve linhas existentes.
INSERT INTO public.countries
  (code, currency, default_locale, phone_prefix, tax_mode, default_tax_rate, shipping_tax_rate, tax_id_kind, tax_id_required,
   postal_code_kind, shipping_provider, payment_providers, invoice_provider, free_shipping_from_cents, print3d, is_active, is_default, display_order)
VALUES
  ('BR', 'BRL', 'pt-BR', '+55',  'inclusive', 0,  0,  'br_cpf_cnpj', true,  'br_cep',  'melhor_envio', '{mercado_pago}', NULL, 29900,
   '{"filamentPerKg":110,"machinePerHour":4,"finishing":8,"fee":4}', true, true, 0),
  ('PT', 'EUR', 'pt-PT', '+351', 'vat',       23, 23, 'pt_nif',      true,  'pt_cp',   'ctt',          '{viva}',         'fiz', 5000,
   '{"filamentPerKg":20,"machinePerHour":0.8,"finishing":1.5,"fee":3}', true, false, 1),
  ('ES', 'EUR', 'es',    '+34',  'vat',       21, 21, 'es_nif',      false, 'es_cp',   'flat',         '{}',             NULL, NULL,
   '{"filamentPerKg":20,"machinePerHour":0.8,"finishing":1.5,"fee":3}', false, false, 2),
  ('US', 'USD', 'en',    '+1',   'inclusive', 0,  0,  'none',        false, 'us_zip',  'flat',         '{}',             NULL, NULL,
   '{"filamentPerKg":22,"machinePerHour":0.9,"finishing":1.75,"fee":3}', false, false, 3)
ON CONFLICT (code) DO NOTHING;

COMMENT ON TABLE public.countries IS 'Loja 3D: configuração por país (moeda, impostos, documento fiscal, frete, pagamento, nota fiscal).';
