
-- Product variations (e.g. color variations with photos)
CREATE TABLE public.product_variations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id TEXT NOT NULL,
  name TEXT NOT NULL,
  color_hex TEXT,
  image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.product_variations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active variations" ON public.product_variations
  FOR SELECT USING (is_active = true);

CREATE POLICY "Admins can manage variations" ON public.product_variations
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Sizes per variation with individual stock
CREATE TABLE public.product_variation_sizes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  variation_id UUID NOT NULL REFERENCES public.product_variations(id) ON DELETE CASCADE,
  size_label TEXT NOT NULL,
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.product_variation_sizes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active variation sizes" ON public.product_variation_sizes
  FOR SELECT USING (is_active = true);

CREATE POLICY "Admins can manage variation sizes" ON public.product_variation_sizes
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_product_variations_product_id ON public.product_variations(product_id);
CREATE INDEX idx_variation_sizes_variation_id ON public.product_variation_sizes(variation_id);
