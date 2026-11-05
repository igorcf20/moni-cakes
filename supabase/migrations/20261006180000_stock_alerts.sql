-- Avise-me quando chegar (Admin > Avisos de estoque): o cliente deixa o e-mail num produto esgotado.
-- O pedido entra só pela função request_stock_alert (valida produto, e-mail e limites); o Admin vê a procura,
-- marca como avisado e exporta. O envio automático por e-mail liga quando a loja tiver remetente (hoje desligado).
-- Recurso stock_alerts em Admin > Recursos da loja (public.feature_enabled).

CREATE TABLE IF NOT EXISTS public.stock_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id text NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254 AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  locale text CHECK (locale IS NULL OR char_length(locale) <= 10),
  country text CHECK (country IS NULL OR char_length(country) <= 2),
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'notified', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  notified_at timestamptz
);

-- Um pedido à espera por e-mail e produto.
CREATE UNIQUE INDEX IF NOT EXISTS stock_alerts_waiting_unique
  ON public.stock_alerts (product_id, lower(email)) WHERE status = 'waiting';
CREATE INDEX IF NOT EXISTS stock_alerts_product_idx ON public.stock_alerts (product_id, status);
CREATE INDEX IF NOT EXISTS stock_alerts_created_idx ON public.stock_alerts (created_at);

ALTER TABLE public.stock_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage stock alerts" ON public.stock_alerts;
CREATE POLICY "Admins manage stock alerts" ON public.stock_alerts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Customers read own stock alerts" ON public.stock_alerts;
CREATE POLICY "Customers read own stock alerts" ON public.stock_alerts
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Pedido de aviso (visitante ou cliente). Devolve um código estável: ok, already, disabled, invalid_email,
-- product_not_found, too_many.
CREATE OR REPLACE FUNCTION public.request_stock_alert(_product_id text, _email text, _locale text DEFAULT NULL, _country text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _mail text := lower(trim(coalesce(_email, '')));
BEGIN
  IF NOT public.feature_enabled('stock_alerts', true) THEN RETURN 'disabled'; END IF;
  IF _mail = '' AND _uid IS NOT NULL THEN
    SELECT lower(u.email) INTO _mail FROM auth.users u WHERE u.id = _uid;
  END IF;
  IF _mail IS NULL OR char_length(_mail) > 254 OR _mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RETURN 'invalid_email'; END IF;

  PERFORM 1 FROM public.products p WHERE p.id = _product_id AND p.is_active;
  IF NOT FOUND THEN RETURN 'product_not_found'; END IF;

  IF EXISTS (SELECT 1 FROM public.stock_alerts a WHERE a.product_id = _product_id AND lower(a.email) = _mail AND a.status = 'waiting') THEN
    RETURN 'already';
  END IF;
  -- Limites contra abuso: por e-mail e no total da última hora.
  IF (SELECT count(*) FROM public.stock_alerts a WHERE lower(a.email) = _mail AND a.status = 'waiting') >= 30
     OR (SELECT count(*) FROM public.stock_alerts a WHERE a.created_at > now() - interval '1 hour') >= 500 THEN
    RETURN 'too_many';
  END IF;

  INSERT INTO public.stock_alerts (product_id, user_id, email, locale, country)
  VALUES (_product_id, _uid, _mail, left(nullif(_locale, ''), 10), upper(left(nullif(_country, ''), 2)))
  ON CONFLICT DO NOTHING;
  RETURN 'ok';
END $$;

REVOKE ALL ON FUNCTION public.request_stock_alert(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_stock_alert(text, text, text, text) TO anon, authenticated;

-- Resumo por produto para o Admin: quantos esperam, estoque atual, último pedido.
CREATE OR REPLACE FUNCTION public.admin_stock_alert_summary()
RETURNS TABLE (product_id text, name text, image text, stock_quantity integer, is_active boolean,
               waiting bigint, notified bigint, last_request timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT coalesce(public.has_role(auth.uid(), 'admin'::app_role), false) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT p.id, p.name, coalesce(p.image, p.images[1]), p.stock_quantity, p.is_active,
           count(*) FILTER (WHERE a.status = 'waiting'),
           count(*) FILTER (WHERE a.status = 'notified'),
           max(a.created_at)
      FROM public.stock_alerts a JOIN public.products p ON p.id = a.product_id
     GROUP BY p.id;
END $$;
REVOKE ALL ON FUNCTION public.admin_stock_alert_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_stock_alert_summary() TO authenticated;
