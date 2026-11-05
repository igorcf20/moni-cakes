-- Faturas FIZ por encomenda (rascunho, emissão, número, erros). Escrita só pelo servidor.
-- Executar no SQL Editor. Seguro de repetir.

CREATE TABLE IF NOT EXISTS public.order_invoices (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'fiz',
  invoice_id text,
  status text,
  number text,
  remote_updated_at timestamptz,
  remote_total numeric(12,2),
  issue_key text,
  issued_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.order_invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read order invoices" ON public.order_invoices;
CREATE POLICY "Admins read order invoices" ON public.order_invoices FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.order_invoices_touch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS order_invoices_touch_bu ON public.order_invoices;
CREATE TRIGGER order_invoices_touch_bu BEFORE UPDATE ON public.order_invoices
  FOR EACH ROW EXECUTE FUNCTION public.order_invoices_touch();
