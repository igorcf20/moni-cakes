ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS orders_archived_idx ON public.orders (archived);