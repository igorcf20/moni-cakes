
ALTER TABLE public.payment_config DROP CONSTRAINT IF EXISTS payment_config_type_check;
ALTER TABLE public.payment_config
  ADD CONSTRAINT payment_config_type_check
  CHECK (type IN ('multibanco','mbway','transfer','on_delivery','stripe','pix'));
