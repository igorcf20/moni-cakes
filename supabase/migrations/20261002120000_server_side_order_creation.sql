-- Encomendas criadas só pelo servidor (Edge Function create-order).
--
-- A função create-order recalcula linhas, IVA, portes, cupão e total a partir da base de dados e grava a
-- encomenda através de create_order_server. Esta função corre como o cliente (auth.uid() = cliente,
-- papel "authenticated"), por isso os triggers aplicam as mesmas regras de sempre: estado "pending",
-- cupão consumido de forma atómica, stock reservado com verificação.
--
-- Depois disto os clientes deixam de poder gravar diretamente em orders e order_items.
-- Executar no SQL Editor DEPOIS de 20261002100100_order_coupon_stock_integrity.sql e DEPOIS de
-- implantar a Edge Function create-order (o checkout passa a depender dela). Seguro de repetir.

CREATE OR REPLACE FUNCTION public.create_order_server(_user_id uuid, _order jsonb, _items jsonb)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE o public.orders;
BEGIN
  IF _user_id IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = _user_id) THEN
    RAISE EXCEPTION 'Sessão expirada. Inicie sessão novamente.';
  END IF;

  -- Para o resto desta transação, a base de dados vê o pedido como vindo do próprio cliente.
  PERFORM set_config('request.jwt.claim.sub', _user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _user_id, 'role', 'authenticated')::text, true);

  o := public.create_order_checkout(_order, _items);
  RETURN o;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_order_server(uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_server(uuid, jsonb, jsonb) TO service_role;

-- O checkout já não chama create_order_checkout diretamente.
REVOKE EXECUTE ON FUNCTION public.create_order_checkout(jsonb, jsonb) FROM PUBLIC, anon, authenticated;

-- Remove as políticas que deixavam o cliente inserir encomendas e linhas (as de admin ficam).
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('orders', 'order_items')
       AND cmd = 'INSERT'
       AND COALESCE(with_check, '') NOT ILIKE '%has_role%'
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
    RAISE NOTICE 'Política removida: %.%', pol.tablename, pol.policyname;
  END LOOP;

  -- Políticas "ALL" de clientes também permitiriam inserir: não as apagamos (servem para ler), só avisamos.
  FOR pol IN
    SELECT tablename, policyname FROM pg_policies
     WHERE schemaname = 'public' AND tablename IN ('orders', 'order_items') AND cmd = 'ALL'
       AND COALESCE(with_check, '') NOT ILIKE '%has_role%' AND COALESCE(qual, '') NOT ILIKE '%has_role%'
  LOOP
    RAISE WARNING 'Rever a política % em % (ALL sem verificação de admin).', pol.policyname, pol.tablename;
  END LOOP;
END $$;
