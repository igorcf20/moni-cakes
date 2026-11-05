-- Notas do pedido (Admin > Pedido > Notas e mensagens): histórico de notas com data e autor.
--   visible_to_customer = false  nota interna, só a equipe vê
--   visible_to_customer = true   mensagem para o cliente: aparece no pedido, na área do cliente (Meus pedidos)
-- Só administradores escrevem; o cliente lê apenas as mensagens visíveis dos pedidos da própria conta.

CREATE TABLE IF NOT EXISTS public.order_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  author_id uuid DEFAULT auth.uid(),
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 4000),
  visible_to_customer boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_notes_order_idx ON public.order_notes (order_id, created_at DESC);

ALTER TABLE public.order_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage order notes" ON public.order_notes;
CREATE POLICY "Admins manage order notes" ON public.order_notes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Customers read visible notes of own orders" ON public.order_notes;
CREATE POLICY "Customers read visible notes of own orders" ON public.order_notes
  FOR SELECT TO authenticated
  USING (visible_to_customer AND EXISTS (
    SELECT 1 FROM public.orders o WHERE o.id = order_notes.order_id AND o.user_id = auth.uid()
  ));

REVOKE ALL ON public.order_notes FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_notes TO authenticated;

-- O autor é sempre quem grava (não se escreve em nome de outro administrador).
CREATE OR REPLACE FUNCTION public.order_notes_set_author()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.author_id := coalesce(auth.uid(), NEW.author_id);
    NEW.created_at := now();
  ELSE
    NEW.author_id := OLD.author_id;
    NEW.created_at := OLD.created_at;
    NEW.order_id := OLD.order_id;
  END IF;
  NEW.body := btrim(NEW.body);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS order_notes_set_author ON public.order_notes;
CREATE TRIGGER order_notes_set_author BEFORE INSERT OR UPDATE ON public.order_notes
  FOR EACH ROW EXECUTE FUNCTION public.order_notes_set_author();

COMMENT ON TABLE public.order_notes IS 'Notas do pedido: internas ou visíveis ao cliente na área do cliente.';
