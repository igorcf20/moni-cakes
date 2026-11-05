-- Recursos da loja (Admin > Recursos da loja): interruptores para ligar ou desligar cada recurso opcional.
-- store_settings.features = { "<recurso>": true | false }. Recurso ausente = padrão do catálogo em src/lib/features.ts.
-- O site e o Admin leem o mesmo valor; regras do servidor usam public.feature_enabled(<recurso>, <padrão>).

CREATE OR REPLACE FUNCTION public.feature_enabled(_key text, _default boolean DEFAULT true)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    (SELECT CASE jsonb_typeof(value -> _key) WHEN 'boolean' THEN (value ->> _key)::boolean END
       FROM public.store_settings WHERE key = 'features'),
    _default);
$$;

REVOKE ALL ON FUNCTION public.feature_enabled(text, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.feature_enabled(text, boolean) TO anon, authenticated, service_role;

INSERT INTO public.store_settings (key, value)
VALUES ('features', '{}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Devoluções desligadas em Recursos da loja: o servidor recusa pedidos novos (o mesmo código de erro do site).
CREATE OR REPLACE FUNCTION public.return_requests_feature_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT public.feature_enabled('returns', true) THEN
    RAISE EXCEPTION 'returns_disabled' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS return_requests_feature_guard ON public.return_requests;
CREATE TRIGGER return_requests_feature_guard BEFORE INSERT ON public.return_requests
  FOR EACH ROW EXECUTE FUNCTION public.return_requests_feature_guard();

-- Mensagens da loja no pedido desligadas: o cliente deixa de ler as notas visíveis (o Admin continua a ver tudo).
DROP POLICY IF EXISTS "Customers read visible notes of own orders" ON public.order_notes;
CREATE POLICY "Customers read visible notes of own orders" ON public.order_notes
  FOR SELECT TO authenticated
  USING (visible_to_customer AND public.feature_enabled('order_messages', true) AND EXISTS (
    SELECT 1 FROM public.orders o WHERE o.id = order_notes.order_id AND o.user_id = auth.uid()
  ));

-- Páginas da loja desligadas: o site volta ao texto padrão (a versão publicada deixa de ser lida).
DROP POLICY IF EXISTS "Anyone reads published pages" ON public.site_pages;
CREATE POLICY "Anyone reads published pages" ON public.site_pages
  FOR SELECT TO anon, authenticated USING (published AND public.feature_enabled('site_pages', true));
