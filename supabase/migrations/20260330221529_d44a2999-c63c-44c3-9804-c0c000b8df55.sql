-- Add variation_id and size_label to cart_items
ALTER TABLE public.cart_items 
ADD COLUMN variation_id UUID REFERENCES public.product_variations(id) ON DELETE SET NULL,
ADD COLUMN size_label TEXT;

-- Drop the old unique constraint
ALTER TABLE public.cart_items 
DROP CONSTRAINT IF EXISTS cart_items_user_id_product_id_key;

-- Add a new unique constraint that includes variations and sizes
-- This allows same product in different variations to be separate items
ALTER TABLE public.cart_items 
ADD CONSTRAINT cart_items_user_variation_size_key 
UNIQUE (user_id, product_id, variation_id, size_label);

-- Create index for performance
CREATE INDEX idx_cart_items_variation ON public.cart_items(variation_id);
