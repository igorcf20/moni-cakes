
ALTER TABLE public.payment_config DROP CONSTRAINT IF EXISTS payment_config_type_check;
ALTER TABLE public.payment_config ADD CONSTRAINT payment_config_type_check
  CHECK (type IN ('multibanco','mbway','transfer','on_delivery','stripe','pix','viva'));

INSERT INTO public.payment_config (type, name, is_active, display_order, details)
VALUES ('viva', 'Cartão / MB WAY / Multibanco (Viva Wallet)', false, 0,
        '{"instrucoes":"Pagamento seguro via Viva Wallet — Cartão, MB WAY ou Multibanco."}'::jsonb)
ON CONFLICT DO NOTHING;
