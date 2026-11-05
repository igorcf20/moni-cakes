-- Frete para qualquer país e transportadora (modelo de loja).
--
-- Três tabelas, todas editadas no Admin > Frete e transportadoras:
--   shipping_regions        zonas de entrega: países (ou '*' = resto do mundo), estados/distritos e códigos postais;
--   shipping_services       formas de envio: uma transportadora + um serviço (Correios PAC, CTT Expresso, DHL Express...),
--                           com preço por tabela (zona e peso) ou cotação automática por uma conta da loja
--                           (Melhor Envio no Brasil, Sendcloud na Europa); sem conta, vale a tabela;
--   shipping_service_rates  a tabela de preços: forma de envio x zona x faixa de peso, em centavos da moeda da zona.
-- O cálculo é sempre no servidor (supabase/functions/_shared/shipping/). As formas de entrega antigas
-- (delivery_methods) continuam para a retirada na loja e enquanto não houver formas de envio ativas.
-- Produtos ganham uma classe de envio (ex.: refrigerado, bebida alcoólica, frágil) que a forma de envio pode
-- recusar; peso (weight) e medidas da embalagem (dimensions) já existiam e entram no peso volumétrico e nas cotações.

CREATE TABLE IF NOT EXISTS public.shipping_regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  name_i18n jsonb NOT NULL DEFAULT '{}'::jsonb,
  countries text[] NOT NULL DEFAULT '{}',        -- códigos ISO (BR, PT...) ou '*' = qualquer país
  regions text[] NOT NULL DEFAULT '{}',          -- estados / distritos / províncias (vazio = todos)
  postal_codes text[] NOT NULL DEFAULT '{}',     -- "9000..9399" (faixa) ou "SW1" (prefixo); vazio = todos
  currency text NOT NULL DEFAULT 'BRL' CHECK (currency ~ '^[A-Z]{3}$'),
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shipping_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier text NOT NULL DEFAULT 'custom',        -- correios, ctt, dhl, fedex... (src/lib/carriers.ts)
  name text NOT NULL,
  name_i18n jsonb NOT NULL DEFAULT '{}'::jsonb,
  description_i18n jsonb NOT NULL DEFAULT '{}'::jsonb,
  calc_mode text NOT NULL DEFAULT 'table' CHECK (calc_mode IN ('table', 'api')),
  api_provider text CHECK (api_provider IS NULL OR api_provider IN ('melhor_envio', 'sendcloud')),
  api_service_code text,                         -- id do serviço no Melhor Envio (ex.: 1 = PAC) ou código Sendcloud
  ships_from text CHECK (ships_from IS NULL OR ships_from ~ '^[A-Z]{2}$'), -- país de onde sai (cotação automática)
  handling_days integer NOT NULL DEFAULT 0 CHECK (handling_days >= 0),    -- dias de preparação somados ao prazo
  allow_free_shipping boolean NOT NULL DEFAULT true, -- entra no frete grátis do país (countries.free_shipping_from_cents)
  max_weight_kg numeric(10,3) CHECK (max_weight_kg IS NULL OR max_weight_kg > 0),
  volumetric_divisor integer CHECK (volumetric_divisor IS NULL OR volumetric_divisor > 0), -- 5000 (DHL, FedEx), 6000 (Correios)
  excluded_classes text[] NOT NULL DEFAULT '{}', -- classes de envio de produto que este serviço não leva
  tracking_url text,                             -- link de rastreio com {code}; vazio = o da transportadora
  is_active boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shipping_service_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES public.shipping_services(id) ON DELETE CASCADE,
  region_id uuid NOT NULL REFERENCES public.shipping_regions(id) ON DELETE CASCADE,
  min_weight_kg numeric(10,3) NOT NULL DEFAULT 0 CHECK (min_weight_kg >= 0),
  max_weight_kg numeric(10,3) CHECK (max_weight_kg IS NULL OR max_weight_kg >= min_weight_kg), -- vazio = sem limite
  price_cents bigint NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  extra_kg_cents bigint NOT NULL DEFAULT 0 CHECK (extra_kg_cents >= 0), -- por kg (ou fração) acima do peso mínimo
  days_min integer CHECK (days_min IS NULL OR days_min >= 0),
  days_max integer CHECK (days_max IS NULL OR days_max >= 0),
  free_from_cents bigint CHECK (free_from_cents IS NULL OR free_from_cents >= 0), -- grátis a partir deste subtotal
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shipping_service_rates_service_idx ON public.shipping_service_rates (service_id);
CREATE INDEX IF NOT EXISTS shipping_service_rates_region_idx ON public.shipping_service_rates (region_id);

-- updated_at
DROP TRIGGER IF EXISTS shipping_regions_touch ON public.shipping_regions;
CREATE TRIGGER shipping_regions_touch BEFORE UPDATE ON public.shipping_regions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS shipping_services_touch ON public.shipping_services;
CREATE TRIGGER shipping_services_touch BEFORE UPDATE ON public.shipping_services FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS shipping_service_rates_touch ON public.shipping_service_rates;
CREATE TRIGGER shipping_service_rates_touch BEFORE UPDATE ON public.shipping_service_rates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Leitura pública só do que está ativo (o checkout sabe se há formas de envio); escrita só do admin.
-- O preço é sempre calculado no servidor (função shipping-quote / create-order).
ALTER TABLE public.shipping_regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_service_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shipping_regions_public_read ON public.shipping_regions;
CREATE POLICY shipping_regions_public_read ON public.shipping_regions FOR SELECT TO anon, authenticated USING (is_active);
DROP POLICY IF EXISTS shipping_regions_admin_all ON public.shipping_regions;
CREATE POLICY shipping_regions_admin_all ON public.shipping_regions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS shipping_services_public_read ON public.shipping_services;
CREATE POLICY shipping_services_public_read ON public.shipping_services FOR SELECT TO anon, authenticated USING (is_active);
DROP POLICY IF EXISTS shipping_services_admin_all ON public.shipping_services;
CREATE POLICY shipping_services_admin_all ON public.shipping_services FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS shipping_service_rates_admin_all ON public.shipping_service_rates;
CREATE POLICY shipping_service_rates_admin_all ON public.shipping_service_rates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

GRANT SELECT ON public.shipping_regions, public.shipping_services TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shipping_regions, public.shipping_services, public.shipping_service_rates TO authenticated;
GRANT ALL ON public.shipping_regions, public.shipping_services, public.shipping_service_rates TO service_role;

-- Produtos: classe de envio (as medidas da embalagem já existem em products.dimensions, em cm, e o peso em weight).
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS shipping_class text;

-- Pedidos: forma de envio escolhida e o resumo da cotação (transportadora, serviço, prazo, origem do preço).
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_service_id uuid REFERENCES public.shipping_services(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_details jsonb;

-- Zonas de partida para os países base (Brasil, Portugal, Espanha) e o resto do mundo.
-- Só geografia: nenhuma forma de envio nem preço é criado (o dono da loja põe os seus no Admin).
INSERT INTO public.shipping_regions (name, name_i18n, countries, regions, postal_codes, currency, display_order)
SELECT v.name, v.name_i18n::jsonb, v.countries, v.regions, v.postal_codes, v.currency, v.display_order
  FROM (VALUES
    ('Brasil', '{"pt-PT":"Brasil","en":"Brazil","es":"Brasil"}', ARRAY['BR'], '{}'::text[], '{}'::text[], 'BRL', 0),
    ('Portugal Continental', '{"pt-PT":"Portugal Continental","en":"Mainland Portugal","es":"Portugal continental"}', ARRAY['PT'], '{}'::text[], '{}'::text[], 'EUR', 1),
    ('Madeira', '{"en":"Madeira","es":"Madeira"}', ARRAY['PT'], '{}'::text[], ARRAY['9000..9399'], 'EUR', 2),
    ('Açores', '{"en":"Azores","es":"Azores"}', ARRAY['PT'], '{}'::text[], ARRAY['9500..9999'], 'EUR', 3),
    ('Espanha Peninsular', '{"pt-PT":"Espanha Peninsular","en":"Mainland Spain","es":"España peninsular"}', ARRAY['ES'], '{}'::text[], '{}'::text[], 'EUR', 4),
    ('Ilhas Baleares', '{"en":"Balearic Islands","es":"Islas Baleares"}', ARRAY['ES'], '{}'::text[], ARRAY['07'], 'EUR', 5),
    ('Ilhas Canárias, Ceuta e Melilla', '{"en":"Canary Islands, Ceuta and Melilla","es":"Canarias, Ceuta y Melilla"}', ARRAY['ES'], '{}'::text[], ARRAY['35', '38', '51', '52'], 'EUR', 6),
    ('União Europeia', '{"en":"European Union","es":"Unión Europea"}',
      ARRAY['AT','BE','BG','CY','CZ','DE','DK','EE','FI','FR','GR','HR','HU','IE','IT','LT','LU','LV','MT','NL','PL','RO','SE','SI','SK'],
      '{}'::text[], '{}'::text[], 'EUR', 7),
    ('Resto do mundo', '{"pt-PT":"Resto do mundo","en":"Rest of the world","es":"Resto del mundo"}', ARRAY['*'], '{}'::text[], '{}'::text[], 'USD', 8)
  ) AS v(name, name_i18n, countries, regions, postal_codes, currency, display_order)
 WHERE NOT EXISTS (SELECT 1 FROM public.shipping_regions);

COMMENT ON TABLE public.shipping_regions IS 'Zonas de entrega (países, regiões, códigos postais). Admin > Frete e transportadoras.';
COMMENT ON TABLE public.shipping_services IS 'Formas de envio (transportadora + serviço), por tabela ou cotação automática.';
COMMENT ON TABLE public.shipping_service_rates IS 'Preços por forma de envio, zona e faixa de peso (centavos da moeda da zona).';
