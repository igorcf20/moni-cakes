
-- Create product_sizes table for customizable sizes per product
CREATE TABLE public.product_sizes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id TEXT NOT NULL,
  size_label TEXT NOT NULL,
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.product_sizes ENABLE ROW LEVEL SECURITY;

-- Anyone can view active sizes
CREATE POLICY "Anyone can view active product sizes"
ON public.product_sizes
FOR SELECT
USING (is_active = true);

-- Admins can manage sizes
CREATE POLICY "Admins can manage product sizes"
ON public.product_sizes
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));
