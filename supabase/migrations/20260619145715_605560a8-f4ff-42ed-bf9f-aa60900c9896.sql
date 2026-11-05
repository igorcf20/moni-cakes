
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS manual_review_fee numeric NOT NULL DEFAULT 0;

ALTER TABLE public.order_designs
  ADD COLUMN IF NOT EXISTS manual_review_requested boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manual_review_fee numeric NOT NULL DEFAULT 0;

INSERT INTO public.store_settings (key, value)
VALUES
  ('manual_review_enabled', 'true'::jsonb),
  ('manual_review_price_per_m2', '1'::jsonb),
  ('manual_review_min_price', '1'::jsonb),
  ('manual_review_description', to_jsonb('O ficheiro pode mesmo assim ser recusado pela equipa após análise. Nesse caso será pedido um novo ficheiro e a taxa de análise não é reembolsada.'::text)),
  ('pdf_alpha_block_threshold', '0.99'::jsonb),
  ('pdf_alpha_warn_threshold', '0.92'::jsonb)
ON CONFLICT (key) DO NOTHING;
