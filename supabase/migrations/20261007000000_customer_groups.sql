-- =============================================================================================
-- Grupos de clientes e tabelas de preço (recurso customer_groups em Admin > Recursos da loja, desligado por padrão).
--  1) customer_groups            grupo (ex.: Revenda, Atacado): nome interno, nome para o cliente por idioma, nota,
--                                desconto geral em % (0 a 90) e ligado/desligado.
--  2) customer_group_members     um grupo por cliente (user_id é a chave); só o Admin escreve.
--  3) customer_group_prices      tabela de preço do grupo: preço por produto a partir de uma quantidade mínima.
--  4) coupons.customer_group_ids cupom só para clientes destes grupos (vazio = todos); regra em _coupon_allowed,
--                                usada por coupon_quote (trigger do pedido e create-order) e check_coupon.
--  5) customer_group_pricing_for(_user, _product_ids)  grupo e preços do cliente (servidor, create-order);
--     my_group_pricing(_product_ids)                    o mesmo para o próprio cliente (site, só para mostrar).
-- A conta do preço da linha fica em supabase/functions/_shared/customerGroups.ts (cópia em src/lib/customerGroups.ts).
-- =============================================================================================

CREATE TABLE IF NOT EXISTS public.customer_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  name_i18n jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text,
  discount_percent numeric(5,2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_groups_name_len CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  CONSTRAINT customer_groups_discount_range CHECK (discount_percent >= 0 AND discount_percent <= 90),
  CONSTRAINT customer_groups_i18n_object CHECK (jsonb_typeof(name_i18n) = 'object')
);
CREATE UNIQUE INDEX IF NOT EXISTS customer_groups_name_unique ON public.customer_groups (lower(btrim(name)));

COMMENT ON TABLE public.customer_groups IS 'Grupos de clientes (Admin > Grupos de clientes): desconto geral e tabela de preço própria.';
COMMENT ON COLUMN public.customer_groups.name_i18n IS 'Nome mostrado ao cliente por idioma (ex.: {"en":"Reseller"}); vazio = name.';
COMMENT ON COLUMN public.customer_groups.discount_percent IS 'Desconto geral do grupo em % sobre os produtos sem preço próprio na tabela.';

CREATE TABLE IF NOT EXISTS public.customer_group_members (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.customer_groups(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_group_members_group_idx ON public.customer_group_members (group_id);

CREATE TABLE IF NOT EXISTS public.customer_group_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.customer_groups(id) ON DELETE CASCADE,
  product_id text NOT NULL REFERENCES public.products(id) ON DELETE CASCADE ON UPDATE CASCADE,
  min_quantity integer NOT NULL DEFAULT 1,
  price numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_group_prices_min_qty CHECK (min_quantity BETWEEN 1 AND 100000),
  CONSTRAINT customer_group_prices_price CHECK (price >= 0),
  CONSTRAINT customer_group_prices_unique UNIQUE (group_id, product_id, min_quantity)
);
CREATE INDEX IF NOT EXISTS customer_group_prices_product_idx ON public.customer_group_prices (product_id);

CREATE OR REPLACE FUNCTION public.customer_groups_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.name := btrim(NEW.name);
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS customer_groups_touch_biu ON public.customer_groups;
CREATE TRIGGER customer_groups_touch_biu
BEFORE INSERT OR UPDATE ON public.customer_groups
FOR EACH ROW EXECUTE FUNCTION public.customer_groups_touch();

-- ---------------------------------------------------------------------------------------------
-- Acesso: só o Admin lê e escreve as tabelas. O cliente vê o próprio grupo e preços por my_group_pricing.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE public.customer_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_group_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage customer groups" ON public.customer_groups;
CREATE POLICY "Admins manage customer groups" ON public.customer_groups
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins manage customer group members" ON public.customer_group_members;
CREATE POLICY "Admins manage customer group members" ON public.customer_group_members
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins manage customer group prices" ON public.customer_group_prices;
CREATE POLICY "Admins manage customer group prices" ON public.customer_group_prices
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

REVOKE ALL ON public.customer_groups, public.customer_group_members, public.customer_group_prices FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_groups, public.customer_group_members, public.customer_group_prices TO authenticated;
GRANT ALL ON public.customer_groups, public.customer_group_members, public.customer_group_prices TO service_role;

-- ---------------------------------------------------------------------------------------------
-- Grupo e preços de um cliente. Recurso desligado, grupo desligado ou cliente sem grupo = sem grupo.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.customer_group_pricing_for(_user uuid, _product_ids text[])
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  g record;
BEGIN
  IF _user IS NULL OR NOT public.feature_enabled('customer_groups', false) THEN
    RETURN jsonb_build_object('group', NULL, 'prices', '[]'::jsonb);
  END IF;
  SELECT cg.id, cg.name, cg.name_i18n, cg.discount_percent INTO g
    FROM public.customer_group_members m
    JOIN public.customer_groups cg ON cg.id = m.group_id
   WHERE m.user_id = _user AND cg.is_active;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('group', NULL, 'prices', '[]'::jsonb);
  END IF;
  RETURN jsonb_build_object(
    'group', jsonb_build_object('id', g.id, 'name', g.name, 'name_i18n', g.name_i18n, 'discount_percent', g.discount_percent),
    'prices', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('product_id', p.product_id, 'min_quantity', p.min_quantity, 'price', p.price)
                       ORDER BY p.product_id, p.min_quantity)
        FROM public.customer_group_prices p
       WHERE p.group_id = g.id AND p.product_id = ANY(COALESCE(_product_ids, ARRAY[]::text[]))
    ), '[]'::jsonb)
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.customer_group_pricing_for(uuid, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.customer_group_pricing_for(uuid, text[]) TO service_role;

CREATE OR REPLACE FUNCTION public.my_group_pricing(_product_ids text[] DEFAULT ARRAY[]::text[])
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.customer_group_pricing_for(auth.uid(), (SELECT array_agg(x) FROM (SELECT unnest(COALESCE(_product_ids, ARRAY[]::text[])) x LIMIT 500) s));
$function$;

REVOKE EXECUTE ON FUNCTION public.my_group_pricing(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_group_pricing(text[]) TO authenticated;

-- ---------------------------------------------------------------------------------------------
-- Cupom só para grupos. Grupo apagado sai das listas dos cupons.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS customer_group_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[];
COMMENT ON COLUMN public.coupons.customer_group_ids IS 'Cupom só para clientes destes grupos (vazio = todos os clientes).';

CREATE OR REPLACE FUNCTION public.customer_groups_after_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.coupons SET customer_group_ids = array_remove(customer_group_ids, OLD.id)
   WHERE OLD.id = ANY(customer_group_ids);
  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS customer_groups_after_delete_ad ON public.customer_groups;
CREATE TRIGGER customer_groups_after_delete_ad
AFTER DELETE ON public.customer_groups
FOR EACH ROW EXECUTE FUNCTION public.customer_groups_after_delete();

-- Igual à migration 20261006120000_coupon_rules.sql, mais a regra do grupo (vale com o recurso ligado ou não:
-- um cupom de grupo nunca passa a valer para todos só porque o recurso foi desligado).
CREATE OR REPLACE FUNCTION public._coupon_allowed(c public.coupons, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT c.active
     AND (c.starts_at IS NULL OR c.starts_at <= now())
     AND (c.expires_at IS NULL OR c.expires_at > now())
     AND (c.max_uses IS NULL OR COALESCE(c.current_uses, 0) < c.max_uses)
     AND (c.max_uses_per_customer IS NULL OR (_user IS NOT NULL AND (
           SELECT count(*) FROM public.orders o
            WHERE o.user_id = _user AND o.coupon_use_counted
              AND lower(o.coupon_code) = lower(c.code)
              AND o.status NOT IN ('cancelled', 'refunded')
         ) < c.max_uses_per_customer))
     AND (NOT c.first_order_only OR (_user IS NOT NULL AND NOT EXISTS (
           SELECT 1 FROM public.orders o
            WHERE o.user_id = _user AND o.status NOT IN ('cancelled', 'refunded')
         )))
     AND (COALESCE(cardinality(c.customer_group_ids), 0) = 0 OR (_user IS NOT NULL AND EXISTS (
           SELECT 1 FROM public.customer_group_members m
             JOIN public.customer_groups g ON g.id = m.group_id
            WHERE m.user_id = _user AND g.is_active AND m.group_id = ANY(c.customer_group_ids)
         )));
$function$;

REVOKE EXECUTE ON FUNCTION public._coupon_allowed(public.coupons, uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Admin: troca a tabela de preço do grupo numa só transação (lista [{product_id, min_quantity, price}]).
-- Erros: forbidden, group_not_found, too_many (mais de 5000 linhas), invalid_row.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_group_prices(_group_id uuid, _rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  n integer;
BEGIN
  IF NOT COALESCE(public.has_role(auth.uid(), 'admin'::app_role), false) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.customer_groups WHERE id = _group_id) THEN
    RAISE EXCEPTION 'group_not_found';
  END IF;
  IF jsonb_typeof(COALESCE(_rows, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'invalid_row';
  END IF;
  IF jsonb_array_length(COALESCE(_rows, '[]'::jsonb)) > 5000 THEN
    RAISE EXCEPTION 'too_many';
  END IF;

  DELETE FROM public.customer_group_prices WHERE group_id = _group_id;
  BEGIN
    INSERT INTO public.customer_group_prices (group_id, product_id, min_quantity, price)
    SELECT _group_id, r->>'product_id', COALESCE((r->>'min_quantity')::integer, 1), round((r->>'price')::numeric, 2)
      FROM jsonb_array_elements(COALESCE(_rows, '[]'::jsonb)) r;
  EXCEPTION WHEN check_violation OR foreign_key_violation OR unique_violation OR not_null_violation
                 OR invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'invalid_row';
  END;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_set_group_prices(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_group_prices(uuid, jsonb) TO authenticated;
