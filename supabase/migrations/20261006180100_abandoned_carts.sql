-- Carrinhos abandonados (Admin > Carrinhos abandonados): clientes com conta que deixaram produtos no carrinho
-- e não fecharam o pedido. O carrinho fica guardado na conta (cart_items), por isso o link de recuperação é só
-- o carrinho da loja. O Admin marca quem já contatou (abandoned_cart_contacts) e vê quantos voltaram a comprar.
-- Visitantes sem conta guardam o carrinho só no aparelho e não aparecem. O envio automático por e-mail liga
-- quando a loja tiver remetente (hoje desligado). Recurso abandoned_carts em Admin > Recursos da loja.

-- Última mexida no carrinho (adicionar ou mudar quantidade).
ALTER TABLE public.cart_items ADD COLUMN IF NOT EXISTS updated_at timestamptz;
UPDATE public.cart_items SET updated_at = coalesce(created_at, now()) WHERE updated_at IS NULL;
ALTER TABLE public.cart_items ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE public.cart_items ALTER COLUMN updated_at SET NOT NULL;
CREATE INDEX IF NOT EXISTS cart_items_updated_idx ON public.cart_items (updated_at);

CREATE OR REPLACE FUNCTION public.cart_items_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS cart_items_touch ON public.cart_items;
CREATE TRIGGER cart_items_touch BEFORE UPDATE ON public.cart_items
  FOR EACH ROW EXECUTE FUNCTION public.cart_items_touch();

-- Contatos feitos pela loja (um por cliente: o mais recente).
CREATE TABLE IF NOT EXISTS public.abandoned_cart_contacts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  contacted_at timestamptz NOT NULL DEFAULT now(),
  channel text NOT NULL DEFAULT 'other' CHECK (channel IN ('email', 'whatsapp', 'phone', 'other')),
  note text CHECK (note IS NULL OR char_length(note) <= 500),
  contacted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.abandoned_cart_contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage cart contacts" ON public.abandoned_cart_contacts;
CREATE POLICY "Admins manage cart contacts" ON public.abandoned_cart_contacts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Lista para o Admin: carrinhos parados há pelo menos _after_hours horas e mexidos nos últimos _days dias.
-- O valor é estimado pelo preço base de cada produto (o total real é calculado no checkout).
CREATE OR REPLACE FUNCTION public.admin_abandoned_carts(_after_hours integer DEFAULT 2, _days integer DEFAULT 30)
RETURNS TABLE (user_id uuid, email text, full_name text, phone text, items integer, units integer,
               value numeric, started_at timestamptz, last_activity timestamptz, products jsonb,
               contacted_at timestamptz, channel text, note text)
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
    WITH carts AS (
      SELECT c.user_id AS uid,
             count(*)::integer AS items,
             sum(c.quantity)::integer AS units,
             sum(coalesce(p.price, 0) * c.quantity) AS value,
             min(c.created_at) AS started_at,
             max(c.updated_at) AS last_activity,
             jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'image', coalesce(p.image, p.images[1]),
                                          'quantity', c.quantity, 'price', p.price) ORDER BY c.updated_at DESC) AS products
        FROM public.cart_items c JOIN public.products p ON p.id = c.product_id
       GROUP BY c.user_id
    )
    SELECT k.uid, u.email::text, up.full_name, up.phone, k.items, k.units, k.value, k.started_at, k.last_activity,
           k.products,
           CASE WHEN ac.contacted_at >= k.started_at THEN ac.contacted_at END,
           CASE WHEN ac.contacted_at >= k.started_at THEN ac.channel END,
           CASE WHEN ac.contacted_at >= k.started_at THEN ac.note END
      FROM carts k
      JOIN auth.users u ON u.id = k.uid
      LEFT JOIN public.user_profiles up ON up.user_id = k.uid
      LEFT JOIN public.abandoned_cart_contacts ac ON ac.user_id = k.uid
     WHERE k.last_activity <= now() - make_interval(hours => greatest(0, least(_after_hours, 720)))
       AND k.last_activity >= now() - make_interval(days => greatest(1, least(_days, 365)))
       AND NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.user_id = k.uid AND o.created_at >= k.last_activity)
     ORDER BY k.last_activity DESC;
END $$;
REVOKE ALL ON FUNCTION public.admin_abandoned_carts(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_abandoned_carts(integer, integer) TO authenticated;

-- Recuperados: clientes contatados que fizeram pedido depois do contato (nos últimos _days dias).
CREATE OR REPLACE FUNCTION public.admin_abandoned_cart_recovered(_days integer DEFAULT 30)
RETURNS TABLE (customers bigint, orders bigint, revenue numeric)
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
    SELECT count(DISTINCT o.user_id), count(o.id), coalesce(sum(o.total), 0)
      FROM public.abandoned_cart_contacts ac
      JOIN public.orders o ON o.user_id = ac.user_id AND o.created_at >= ac.contacted_at
     WHERE ac.contacted_at >= now() - make_interval(days => greatest(1, least(_days, 365)))
       AND o.status NOT IN ('cancelled', 'refunded');
END $$;
REVOKE ALL ON FUNCTION public.admin_abandoned_cart_recovered(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_abandoned_cart_recovered(integer) TO authenticated;
