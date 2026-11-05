-- =============================================================================================
-- Impressão de pedidos (recurso order_printing, Admin > Pedidos > Impressão de pedidos; src/lib/orderPrint.ts).
--   order_prints        cada documento impresso de um pedido: sheet (folha do pedido), label (etiqueta de envio),
--                       declaration (declaração de conteúdo). Só administradores leem e escrevem.
--   admin_print_queue   a fila "para imprimir": pedidos nos estados escolhidos que ainda não têm impressos todos os
--                       documentos escolhidos (store_settings.order_print.queue, padrões iguais a DEFAULT_ORDER_PRINT).
-- =============================================================================================

CREATE TABLE IF NOT EXISTS public.order_prints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  kind text NOT NULL,
  printed_at timestamptz NOT NULL DEFAULT now(),
  printed_by uuid DEFAULT auth.uid(),
  CONSTRAINT order_prints_kind CHECK (kind IN ('sheet', 'label', 'declaration'))
);
CREATE INDEX IF NOT EXISTS order_prints_order_idx ON public.order_prints (order_id, kind);
COMMENT ON TABLE public.order_prints IS 'Documentos de pedido impressos no Admin (folha, etiqueta, declaração). Serve à fila de impressão.';

ALTER TABLE public.order_prints ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read order prints" ON public.order_prints;
CREATE POLICY "Admins read order prints" ON public.order_prints
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins write order prints" ON public.order_prints;
CREATE POLICY "Admins write order prints" ON public.order_prints
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins delete order prints" ON public.order_prints;
CREATE POLICY "Admins delete order prints" ON public.order_prints
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

REVOKE ALL ON public.order_prints FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.order_prints TO authenticated;
GRANT ALL ON public.order_prints TO service_role;

-- Quem imprimiu e quando: sempre o utilizador da sessão e a hora do servidor (o navegador não escolhe).
CREATE OR REPLACE FUNCTION public.order_prints_fill()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.printed_by := auth.uid();
  NEW.printed_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS order_prints_fill ON public.order_prints;
CREATE TRIGGER order_prints_fill BEFORE INSERT ON public.order_prints
  FOR EACH ROW EXECUTE FUNCTION public.order_prints_fill();

-- Fila de impressão. missing = documentos da fila que o pedido ainda não tem impressos.
CREATE OR REPLACE FUNCTION public.admin_print_queue(_limit integer DEFAULT 200)
RETURNS TABLE (order_id uuid, created_at timestamptz, status text, missing text[])
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg jsonb;
  st text[];
  docs text[];
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT public.feature_enabled('order_printing', true) THEN
    RETURN;
  END IF;
  SELECT s.value INTO cfg FROM public.store_settings s WHERE s.key = 'order_print';
  IF jsonb_typeof(cfg -> 'queue' -> 'statuses') = 'array' THEN
    SELECT coalesce(array_agg(x), '{}') INTO st FROM jsonb_array_elements_text(cfg -> 'queue' -> 'statuses') x;
  ELSE
    st := ARRAY['paid', 'preparing'];
  END IF;
  IF jsonb_typeof(cfg -> 'queue' -> 'docs') = 'array' THEN
    SELECT coalesce(array_agg(x), '{}') INTO docs FROM jsonb_array_elements_text(cfg -> 'queue' -> 'docs') x
     WHERE x IN ('sheet', 'label', 'declaration');
  ELSE
    docs := ARRAY['sheet', 'label'];
  END IF;
  IF coalesce(array_length(st, 1), 0) = 0 OR coalesce(array_length(docs, 1), 0) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT q.id, q.created_at, q.status, q.missing
    FROM (
      SELECT o.id, o.created_at, o.status::text AS status,
             ARRAY(SELECT d FROM unnest(docs) d
                    WHERE NOT EXISTS (SELECT 1 FROM public.order_prints p WHERE p.order_id = o.id AND p.kind = d)) AS missing
        FROM public.orders o
       WHERE coalesce(o.archived, false) = false
         AND o.status::text = ANY (st)
         AND coalesce(o.cancellation_status, '') <> 'requested'
    ) q
   WHERE cardinality(q.missing) > 0
   ORDER BY q.created_at
   LIMIT greatest(1, least(coalesce(_limit, 200), 500));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_print_queue(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_print_queue(integer) TO authenticated, service_role;
