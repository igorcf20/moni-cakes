
-- Kits table: bundles of products with vendor-defined discount
CREATE TABLE public.kits (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text,
  image_url text,
  discount_type text NOT NULL DEFAULT 'percentage', -- 'percentage' or 'fixed'
  discount_value numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Kit items: products in a kit
CREATE TABLE public.kit_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kit_id uuid NOT NULL REFERENCES public.kits(id) ON DELETE CASCADE,
  product_id text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.kits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kit_items ENABLE ROW LEVEL SECURITY;

-- Kits policies
CREATE POLICY "Anyone can view active kits" ON public.kits FOR SELECT USING (is_active = true);
CREATE POLICY "Admins can manage kits" ON public.kits FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Kit items policies
CREATE POLICY "Anyone can view kit items" ON public.kit_items FOR SELECT USING (true);
CREATE POLICY "Admins can manage kit items" ON public.kit_items FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_kits_updated_at
  BEFORE UPDATE ON public.kits
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
