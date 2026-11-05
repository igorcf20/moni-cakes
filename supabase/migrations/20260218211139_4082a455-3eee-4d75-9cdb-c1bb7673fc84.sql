
-- =====================================================
-- Tabela: delivery_methods (métodos de entrega)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.delivery_methods (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('pickup', 'delivery')),
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  config JSONB NOT NULL DEFAULT '{}',
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.delivery_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "delivery_methods_public_read"
  ON public.delivery_methods FOR SELECT USING (true);

CREATE POLICY "delivery_methods_admin_insert"
  ON public.delivery_methods FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "delivery_methods_admin_update"
  ON public.delivery_methods FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "delivery_methods_admin_delete"
  ON public.delivery_methods FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

-- =====================================================
-- Tabela: payment_config (configurações de pagamento)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.payment_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL UNIQUE CHECK (type IN ('pix', 'transfer', 'on_delivery')),
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  details JSONB NOT NULL DEFAULT '{}',
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payment_config_public_read"
  ON public.payment_config FOR SELECT USING (true);

CREATE POLICY "payment_config_admin_insert"
  ON public.payment_config FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "payment_config_admin_update"
  ON public.payment_config FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "payment_config_admin_delete"
  ON public.payment_config FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

-- =====================================================
-- Seed inicial: métodos de entrega padrão
-- =====================================================
INSERT INTO public.delivery_methods (type, name, description, is_active, config, display_order)
VALUES
  ('pickup', 'Retirada na Loja', 'Retire seu pedido diretamente em nossa loja física', false,
   '{"address": "", "city": "", "state": "", "zip_code": "", "opening_hours": "Seg-Sex 9h-18h, Sáb 9h-13h", "pickup_deadline_days": 3, "city_only": true}'::jsonb, 0),
  ('delivery', 'Entrega em Domicílio', 'Receba o produto no conforto da sua casa', true,
   '{"extra_cost": 0}'::jsonb, 1)
ON CONFLICT DO NOTHING;

-- =====================================================
-- Seed inicial: configurações de pagamento
-- =====================================================
INSERT INTO public.payment_config (type, name, is_active, details, display_order)
VALUES
  ('pix', 'PIX', true,
   '{"chave_pix": "", "tipo_chave": "cpf", "nome_titular": "", "instrucoes": "Pague via QR Code ou copie a chave PIX. Seu pedido será confirmado em até 1 hora após o pagamento."}'::jsonb, 0),
  ('transfer', 'Transferência Bancária', true,
   '{"banco": "", "agencia": "", "conta": "", "tipo_conta": "corrente", "nome_titular": "", "cnpj": "", "instrucoes": "Realize a transferência e envie o comprovante via WhatsApp."}'::jsonb, 1),
  ('on_delivery', 'Pagamento na Entrega', false,
   '{"instrucoes": "Disponível apenas para pedidos de retirada na loja.", "accepts_card": false, "accepts_cash": true}'::jsonb, 2)
ON CONFLICT (type) DO NOTHING;

-- =====================================================
-- Triggers para updated_at
-- =====================================================
CREATE TRIGGER update_delivery_methods_updated_at
  BEFORE UPDATE ON public.delivery_methods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_payment_config_updated_at
  BEFORE UPDATE ON public.payment_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
