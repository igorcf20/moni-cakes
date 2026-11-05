-- Reembolsos efetuados (pela Viva via API ou detetados no webhook).
-- Permite reembolsos parciais sem ultrapassar o valor pago e evita registar o mesmo reembolso duas vezes.
-- Executar no SQL Editor. Seguro de repetir.

CREATE TABLE IF NOT EXISTS public.payment_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  provider text NOT NULL DEFAULT 'viva',
  provider_transaction_id text UNIQUE,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payment_refunds_order_idx ON public.payment_refunds (order_id);

ALTER TABLE public.payment_refunds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read refunds" ON public.payment_refunds;
CREATE POLICY "Admins read refunds" ON public.payment_refunds FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
-- Escrita só pelo servidor (Edge Functions com service role).
