-- Limpar zonas de envio existentes (Europa)
DELETE FROM shipping_zones;

-- Inserir estados brasileiros por região
INSERT INTO shipping_zones (country_code, country_name, zone_name, is_active) VALUES
-- Sudeste
('BR-SP', 'São Paulo', 'Sudeste', true),
('BR-RJ', 'Rio de Janeiro', 'Sudeste', true),
('BR-MG', 'Minas Gerais', 'Sudeste', true),
('BR-ES', 'Espírito Santo', 'Sudeste', true),
-- Sul
('BR-PR', 'Paraná', 'Sul', true),
('BR-SC', 'Santa Catarina', 'Sul', true),
('BR-RS', 'Rio Grande do Sul', 'Sul', true),
-- Centro-Oeste
('BR-GO', 'Goiás', 'Centro-Oeste', true),
('BR-MT', 'Mato Grosso', 'Centro-Oeste', true),
('BR-MS', 'Mato Grosso do Sul', 'Centro-Oeste', true),
('BR-DF', 'Distrito Federal', 'Centro-Oeste', true),
-- Nordeste
('BR-BA', 'Bahia', 'Nordeste', true),
('BR-SE', 'Sergipe', 'Nordeste', true),
('BR-AL', 'Alagoas', 'Nordeste', true),
('BR-PE', 'Pernambuco', 'Nordeste', true),
('BR-PB', 'Paraíba', 'Nordeste', true),
('BR-RN', 'Rio Grande do Norte', 'Nordeste', true),
('BR-CE', 'Ceará', 'Nordeste', true),
('BR-PI', 'Piauí', 'Nordeste', true),
('BR-MA', 'Maranhão', 'Nordeste', true),
-- Norte
('BR-PA', 'Pará', 'Norte', true),
('BR-AM', 'Amazonas', 'Norte', true),
('BR-AP', 'Amapá', 'Norte', true),
('BR-RR', 'Roraima', 'Norte', true),
('BR-RO', 'Rondônia', 'Norte', true),
('BR-AC', 'Acre', 'Norte', true),
('BR-TO', 'Tocantins', 'Norte', true);

-- Limpar taxas existentes
DELETE FROM shipping_rates;

-- Inserir taxas de frete por região
-- Sudeste (mais barato, mais rápido)
INSERT INTO shipping_rates (zone_id, min_weight, max_weight, base_rate, per_kg_rate, estimated_days_min, estimated_days_max)
SELECT id, 0, 1, 15.00, 2.00, 3, 5 FROM shipping_zones WHERE zone_name = 'Sudeste'
UNION ALL
SELECT id, 1, 5, 20.00, 3.00, 3, 5 FROM shipping_zones WHERE zone_name = 'Sudeste'
UNION ALL
SELECT id, 5, 30, 30.00, 4.00, 4, 6 FROM shipping_zones WHERE zone_name = 'Sudeste';

-- Sul
INSERT INTO shipping_rates (zone_id, min_weight, max_weight, base_rate, per_kg_rate, estimated_days_min, estimated_days_max)
SELECT id, 0, 1, 18.00, 2.50, 4, 6 FROM shipping_zones WHERE zone_name = 'Sul'
UNION ALL
SELECT id, 1, 5, 25.00, 3.50, 4, 6 FROM shipping_zones WHERE zone_name = 'Sul'
UNION ALL
SELECT id, 5, 30, 35.00, 4.50, 5, 7 FROM shipping_zones WHERE zone_name = 'Sul';

-- Centro-Oeste
INSERT INTO shipping_rates (zone_id, min_weight, max_weight, base_rate, per_kg_rate, estimated_days_min, estimated_days_max)
SELECT id, 0, 1, 22.00, 3.00, 5, 8 FROM shipping_zones WHERE zone_name = 'Centro-Oeste'
UNION ALL
SELECT id, 1, 5, 28.00, 4.00, 5, 8 FROM shipping_zones WHERE zone_name = 'Centro-Oeste'
UNION ALL
SELECT id, 5, 30, 40.00, 5.00, 6, 9 FROM shipping_zones WHERE zone_name = 'Centro-Oeste';

-- Nordeste
INSERT INTO shipping_rates (zone_id, min_weight, max_weight, base_rate, per_kg_rate, estimated_days_min, estimated_days_max)
SELECT id, 0, 1, 25.00, 3.50, 6, 10 FROM shipping_zones WHERE zone_name = 'Nordeste'
UNION ALL
SELECT id, 1, 5, 32.00, 4.50, 6, 10 FROM shipping_zones WHERE zone_name = 'Nordeste'
UNION ALL
SELECT id, 5, 30, 45.00, 5.50, 7, 12 FROM shipping_zones WHERE zone_name = 'Nordeste';

-- Norte (mais caro, mais demorado)
INSERT INTO shipping_rates (zone_id, min_weight, max_weight, base_rate, per_kg_rate, estimated_days_min, estimated_days_max)
SELECT id, 0, 1, 30.00, 4.00, 8, 12 FROM shipping_zones WHERE zone_name = 'Norte'
UNION ALL
SELECT id, 1, 5, 38.00, 5.00, 8, 12 FROM shipping_zones WHERE zone_name = 'Norte'
UNION ALL
SELECT id, 5, 30, 50.00, 6.00, 10, 15 FROM shipping_zones WHERE zone_name = 'Norte';

-- Adicionar campos extras na tabela orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_number text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'pix';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'pending';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipped_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_cost numeric DEFAULT 0;

-- Criar tabela de histórico de status
CREATE TABLE IF NOT EXISTS order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
  status text NOT NULL,
  changed_by uuid,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para order_status_history
CREATE POLICY "Users can view their order history" ON order_status_history
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM orders WHERE orders.id = order_status_history.order_id AND orders.user_id = auth.uid())
  );

CREATE POLICY "Admins can view all order history" ON order_status_history
  FOR SELECT USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert order history" ON order_status_history
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'));

-- Criar tabela de configurações da loja
CREATE TABLE IF NOT EXISTS store_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE store_settings ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para store_settings
CREATE POLICY "Anyone can view store settings" ON store_settings
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage store settings" ON store_settings
  FOR ALL USING (has_role(auth.uid(), 'admin'));

-- Inserir configurações padrão
INSERT INTO store_settings (key, value) VALUES
  ('free_shipping_min', '{"sudeste": 200, "sul": 250, "centro_oeste": 300, "nordeste": 350, "norte": 400}'::jsonb),
  ('store_info', '{"name": "ANYLUVIÉ", "cnpj": "", "email": "", "phone": "", "address": ""}'::jsonb),
  ('payment_methods', '{"pix": true, "transfer": true, "on_delivery": false}'::jsonb)
ON CONFLICT (key) DO NOTHING;