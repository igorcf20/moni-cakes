
-- 1) Orders: flag de pedido manual + dados de contacto manual
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS is_manual boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manual_customer_name text,
  ADD COLUMN IF NOT EXISTS manual_customer_contact text,
  ADD COLUMN IF NOT EXISTS pickup_acknowledged boolean NOT NULL DEFAULT false;

-- 2) Reviews: marca criadas pelo admin
ALTER TABLE public.product_reviews
  ADD COLUMN IF NOT EXISTS created_by_admin boolean NOT NULL DEFAULT false;

-- 3) Policy admin para criar reviews manualmente
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='product_reviews' AND policyname='Admins manage reviews'
  ) THEN
    CREATE POLICY "Admins manage reviews"
    ON public.product_reviews
    FOR ALL
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'))
    WITH CHECK (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

-- 4) Policy admin para criar/editar pedidos manuais
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='orders' AND policyname='Admins manage orders'
  ) THEN
    CREATE POLICY "Admins manage orders"
    ON public.orders
    FOR ALL
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'))
    WITH CHECK (public.has_role(auth.uid(), 'admin'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='order_items' AND policyname='Admins manage order_items'
  ) THEN
    CREATE POLICY "Admins manage order_items"
    ON public.order_items
    FOR ALL
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'))
    WITH CHECK (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;
