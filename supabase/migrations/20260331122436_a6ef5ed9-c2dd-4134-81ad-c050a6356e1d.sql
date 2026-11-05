-- Drop existing constraint
ALTER TABLE public.payment_config DROP CONSTRAINT payment_config_type_check;

-- Add updated constraint including 'stripe'
ALTER TABLE public.payment_config ADD CONSTRAINT payment_config_type_check 
CHECK (type = ANY (ARRAY['pix'::text, 'transfer'::text, 'on_delivery'::text, 'stripe'::text]));

-- Insert Stripe config (inactive)
INSERT INTO public.payment_config (name, type, is_active, details, display_order)
VALUES ('Cartão de Crédito', 'stripe', false, '{"instrucoes": "Pagamento via Cartão de Crédito (Stripe) - Configuração Pendente"}'::jsonb, 3);