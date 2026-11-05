
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS subtotal_net numeric;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS vat_total numeric;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS vat_rate numeric;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS vat_amount numeric;

CREATE TABLE IF NOT EXISTS public.sales_popup_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enabled boolean NOT NULL DEFAULT true,
  min_interval_seconds integer NOT NULL DEFAULT 30,
  max_interval_seconds integer NOT NULL DEFAULT 90,
  display_duration_seconds integer NOT NULL DEFAULT 6,
  start_delay_seconds integer NOT NULL DEFAULT 10,
  names text[] NOT NULL DEFAULT '{}',
  cities text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.sales_popup_config TO anon, authenticated;
GRANT ALL ON public.sales_popup_config TO service_role;

ALTER TABLE public.sales_popup_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read sales popup config" ON public.sales_popup_config;
CREATE POLICY "Anyone can read sales popup config"
  ON public.sales_popup_config FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage sales popup config" ON public.sales_popup_config;
CREATE POLICY "Admins manage sales popup config"
  ON public.sales_popup_config FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS update_sales_popup_config_updated_at ON public.sales_popup_config;
CREATE TRIGGER update_sales_popup_config_updated_at
  BEFORE UPDATE ON public.sales_popup_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.sales_popup_config (enabled, min_interval_seconds, max_interval_seconds, display_duration_seconds, start_delay_seconds, names, cities)
SELECT true, 45, 120, 6, 15,
  ARRAY['João Silva','Maria Santos','Rui Pereira','Catarina Costa','Tiago Almeida','Inês Ferreira','Pedro Rodrigues','Mariana Sousa','Miguel Oliveira','Beatriz Carvalho','André Martins','Sofia Lopes','Bruno Marques','Carolina Ribeiro','Diogo Gomes','Margarida Pinto','Ricardo Fernandes','Joana Cardoso','Henrique Nunes','Matilde Teixeira','Gonçalo Moreira','Leonor Antunes','Francisco Castro','Madalena Correia','Vasco Mendes','Filipa Reis','Afonso Barbosa','Carlota Dias','Tomás Machado','Mafalda Pinheiro'],
  ARRAY['Lisboa','Porto','Braga','Coimbra','Aveiro','Faro','Setúbal','Évora','Funchal','Ponta Delgada','Viseu','Leiria','Cadaval','Caldas da Rainha','Torres Vedras','Santarém','Guimarães','Viana do Castelo','Vila Real','Bragança','Beja','Portalegre','Castelo Branco','Almada','Cascais','Sintra','Loures','Oeiras','Matosinhos','Gondomar','Maia','Vila Nova de Gaia','Barcelos','Famalicão','Tomar','Fátima','Mafra','Sesimbra','Peniche','Óbidos']
WHERE NOT EXISTS (SELECT 1 FROM public.sales_popup_config);
