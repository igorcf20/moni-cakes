-- =============================================================================================
-- Venda cruzada (recurso cross_sell em Admin > Recursos da loja, ligado por padrão).
-- A tabela related_products já existia (o carrinho lia-a, mas o Admin não tinha onde a editar). Passa a ter dois tipos:
--   cross_sell   "Combina com": aparece no carrinho (página e carrinho lateral) quando o produto está nele
--   related      "Relacionados": aparece primeiro em "Você também pode gostar" na página do produto
-- Regras em store_settings.cross_sell (src/lib/crossSell.ts). Leitura pública (dados do catálogo); só o Admin escreve,
-- pela RPC admin_set_product_links (troca a lista de uma vez e, se pedido, liga também no sentido contrário).
-- =============================================================================================

-- Linhas sem produto ou que apontam para o próprio produto não servem para nada.
DELETE FROM public.related_products r
 WHERE r.product_id = r.related_product_id
    OR NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = r.product_id)
    OR NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = r.related_product_id);

ALTER TABLE public.related_products ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'cross_sell';
ALTER TABLE public.related_products DROP CONSTRAINT IF EXISTS related_products_kind_check;
ALTER TABLE public.related_products ADD CONSTRAINT related_products_kind_check CHECK (kind IN ('cross_sell', 'related'));
ALTER TABLE public.related_products DROP CONSTRAINT IF EXISTS related_products_not_self;
ALTER TABLE public.related_products ADD CONSTRAINT related_products_not_self CHECK (product_id <> related_product_id);
ALTER TABLE public.related_products DROP CONSTRAINT IF EXISTS related_products_product_id_related_product_id_key;
ALTER TABLE public.related_products DROP CONSTRAINT IF EXISTS related_products_unique_kind;
ALTER TABLE public.related_products ADD CONSTRAINT related_products_unique_kind UNIQUE (product_id, related_product_id, kind);

ALTER TABLE public.related_products DROP CONSTRAINT IF EXISTS related_products_product_fk;
ALTER TABLE public.related_products ADD CONSTRAINT related_products_product_fk
  FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE public.related_products DROP CONSTRAINT IF EXISTS related_products_related_fk;
ALTER TABLE public.related_products ADD CONSTRAINT related_products_related_fk
  FOREIGN KEY (related_product_id) REFERENCES public.products(id) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS related_products_lookup_idx ON public.related_products (product_id, kind, display_order);
CREATE INDEX IF NOT EXISTS related_products_target_idx ON public.related_products (related_product_id);

GRANT SELECT ON public.related_products TO anon, authenticated;

-- Troca a lista de um tipo (cross_sell ou related) de um produto. _both: liga também cada produto escolhido de volta
-- a este (sem apagar as outras ligações dele). Devolve quantas ligações ficaram neste produto.
CREATE OR REPLACE FUNCTION public.admin_set_product_links(_product_id text, _kind text, _ids text[], _both boolean DEFAULT false)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
  clean text[];
BEGIN
  IF NOT coalesce(public.has_role(auth.uid(), 'admin'::app_role), false) THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
  END IF;
  IF _kind NOT IN ('cross_sell', 'related') THEN RAISE EXCEPTION 'invalid_kind'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = _product_id) THEN RAISE EXCEPTION 'product_not_found'; END IF;
  IF coalesce(array_length(_ids, 1), 0) > 50 THEN RAISE EXCEPTION 'too_many'; END IF;

  -- Ordem da lista = ordem de exibição; repetidos, o próprio produto e ids desconhecidos ficam de fora.
  SELECT coalesce(array_agg(x.id ORDER BY x.pos), '{}') INTO clean
    FROM (SELECT DISTINCT ON (u.id) u.id, u.pos
            FROM unnest(coalesce(_ids, '{}')) WITH ORDINALITY AS u(id, pos)
            JOIN public.products p ON p.id = u.id
           WHERE u.id <> _product_id
           ORDER BY u.id, u.pos) x;

  DELETE FROM public.related_products WHERE product_id = _product_id AND kind = _kind;
  INSERT INTO public.related_products (product_id, related_product_id, kind, display_order)
  SELECT _product_id, c.id, _kind, c.pos - 1
    FROM unnest(clean) WITH ORDINALITY AS c(id, pos);
  GET DIAGNOSTICS n = ROW_COUNT;

  IF _both THEN
    INSERT INTO public.related_products (product_id, related_product_id, kind, display_order)
    SELECT c.id, _product_id, _kind,
           coalesce((SELECT max(r.display_order) + 1 FROM public.related_products r WHERE r.product_id = c.id AND r.kind = _kind), 0)
      FROM unnest(clean) AS c(id)
    ON CONFLICT (product_id, related_product_id, kind) DO NOTHING;
  END IF;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.admin_set_product_links(text, text, text[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_product_links(text, text, text[], boolean) TO authenticated;
