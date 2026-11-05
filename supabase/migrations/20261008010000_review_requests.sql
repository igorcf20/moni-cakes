-- Pedido de avaliação depois da entrega.
-- No site: a conta do cliente mostra os pedidos entregues com produtos por avaliar (lido pelo navegador, sem tabela nova).
-- Por e-mail: cada pedido que passa a entregue ganha uma linha em review_requests, com a data em que o e-mail deve sair
-- (store_settings.review_settings.request_after_days, padrão 3). Enquanto a loja não tiver remetente de e-mail as linhas
-- ficam em 'waiting'. O envio futuro tem um ponto único: review_requests_due() (só service_role) devolve as linhas
-- vencidas com o e-mail e o idioma, e review_request_mark(id, estado) grava o resultado.
-- Regras: review_settings.request_email (padrão true) liga ou desliga o e-mail; desligado, novas linhas nascem 'skipped'.

CREATE TABLE IF NOT EXISTS public.review_requests (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id uuid,
  delivered_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'sent', 'skipped', 'failed')),
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS review_requests_due_idx ON public.review_requests (status, due_at);

ALTER TABLE public.review_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.review_requests FROM anon, authenticated;
GRANT SELECT ON public.review_requests TO authenticated;
GRANT ALL ON public.review_requests TO service_role;
DROP POLICY IF EXISTS review_requests_admin_read ON public.review_requests;
CREATE POLICY review_requests_admin_read ON public.review_requests FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public._review_request_settings()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'request_email', coalesce((s.value->>'request_email')::boolean, true),
    'request_after_days', least(greatest(coalesce((s.value->>'request_after_days')::int, 3), 0), 60))
  FROM (SELECT (SELECT value FROM public.store_settings WHERE key = 'review_settings') AS value) s
$$;
REVOKE ALL ON FUNCTION public._review_request_settings() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.orders_review_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg jsonb := public._review_request_settings();
  dt timestamptz := coalesce(NEW.delivered_at, now());
BEGIN
  IF NEW.status IN ('delivered', 'completed') AND OLD.status IS DISTINCT FROM NEW.status
     AND OLD.status NOT IN ('delivered', 'completed') THEN
    INSERT INTO public.review_requests (order_id, user_id, delivered_at, due_at, status)
    VALUES (NEW.id, NEW.user_id, dt, dt + make_interval(days => (cfg->>'request_after_days')::int),
            CASE WHEN (cfg->>'request_email')::boolean AND (NEW.user_id IS NOT NULL OR coalesce(NEW.guest_email, '') <> '')
                 THEN 'waiting' ELSE 'skipped' END)
    ON CONFLICT (order_id) DO NOTHING;
  ELSIF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.review_requests SET status = 'skipped' WHERE order_id = NEW.id AND status = 'waiting';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_review_request ON public.orders;
CREATE TRIGGER orders_review_request AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_review_request();

-- Ponto único do envio futuro: linhas vencidas, com o pedido por avaliar ainda sem avaliação de todos os produtos.
CREATE OR REPLACE FUNCTION public.review_requests_due(_limit integer DEFAULT 50)
RETURNS TABLE (order_id uuid, user_id uuid, email text, locale text, due_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.order_id, r.user_id, coalesce(u.email, o.guest_email) AS email,
         coalesce(u.raw_user_meta_data->>'locale', 'pt-BR') AS locale, r.due_at
  FROM public.review_requests r
  JOIN public.orders o ON o.id = r.order_id AND o.status IN ('delivered', 'completed')
  LEFT JOIN auth.users u ON u.id = r.user_id
  WHERE r.status = 'waiting' AND r.due_at <= now()
    AND coalesce(u.email, o.guest_email, '') <> ''
    AND EXISTS (
      SELECT 1 FROM public.order_items i
      WHERE i.order_id = r.order_id AND i.product_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM public.product_reviews pr WHERE pr.user_id = r.user_id AND pr.product_id = i.product_id))
  ORDER BY r.due_at
  LIMIT least(greatest(coalesce(_limit, 50), 1), 500)
$$;
REVOKE ALL ON FUNCTION public.review_requests_due(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_requests_due(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.review_request_mark(_order_id uuid, _status text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.review_requests
  SET status = _status, sent_at = CASE WHEN _status = 'sent' THEN now() ELSE sent_at END
  WHERE order_id = _order_id AND _status IN ('sent', 'skipped', 'failed')
$$;
REVOKE ALL ON FUNCTION public.review_request_mark(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_request_mark(uuid, text) TO service_role;

-- Números para o Admin (Avaliações): quantos esperam o remetente, quantos já venceram, enviados e ignorados.
CREATE OR REPLACE FUNCTION public.admin_review_request_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN (
    SELECT jsonb_build_object(
      'waiting', count(*) FILTER (WHERE status = 'waiting'),
      'due', count(*) FILTER (WHERE status = 'waiting' AND due_at <= now()),
      'sent', count(*) FILTER (WHERE status = 'sent'),
      'skipped', count(*) FILTER (WHERE status = 'skipped'),
      'failed', count(*) FILTER (WHERE status = 'failed'))
    FROM public.review_requests);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_review_request_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_request_stats() TO authenticated;
