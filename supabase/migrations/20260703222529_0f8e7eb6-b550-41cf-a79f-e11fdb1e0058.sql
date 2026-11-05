
-- Add cost tracking + configurable min-charge meters to products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS cost_price numeric,
  ADD COLUMN IF NOT EXISTS cost_per_meter numeric,
  ADD COLUMN IF NOT EXISTS min_charge_meters numeric DEFAULT 0.5;

-- Default sensible min charge for existing DTF meter products
UPDATE public.products
   SET min_charge_meters = COALESCE(min_charge_meters, 0.5)
 WHERE unit_type = 'meter' AND min_charge_meters IS NULL;

-- Allow order_items rows without a real product (custom manual line items)
ALTER TABLE public.order_items
  DROP CONSTRAINT IF EXISTS order_items_product_id_fkey;

ALTER TABLE public.order_items
  ALTER COLUMN product_id DROP NOT NULL;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS custom_name text,
  ADD COLUMN IF NOT EXISTS custom_description text;

-- Re-add FK as nullable (custom items skip it)
ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;
