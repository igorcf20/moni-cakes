ALTER TABLE public.order_designs ALTER COLUMN kind SET DEFAULT 'layout';
UPDATE public.order_designs SET kind = 'layout' WHERE kind IS NULL;
ALTER TABLE public.order_designs ALTER COLUMN kind SET NOT NULL;
DROP INDEX IF EXISTS public.order_designs_unique_plano;
CREATE UNIQUE INDEX order_designs_unique_plano ON public.order_designs (order_id, cart_item_key, plano_index, kind);