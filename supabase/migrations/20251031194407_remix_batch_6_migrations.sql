
-- Migration: 20251022192906
-- Create products table
CREATE TABLE public.products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL,
  image TEXT,
  category TEXT NOT NULL,
  customizable BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Products are viewable by everyone
CREATE POLICY "Products are viewable by everyone"
ON public.products
FOR SELECT
USING (true);

-- Create cart_items table
CREATE TABLE public.cart_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  product_id TEXT REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  design_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, product_id)
);

-- Enable RLS
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;

-- Users can view their own cart items
CREATE POLICY "Users can view their own cart items"
ON public.cart_items
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own cart items
CREATE POLICY "Users can insert their own cart items"
ON public.cart_items
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own cart items
CREATE POLICY "Users can update their own cart items"
ON public.cart_items
FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own cart items
CREATE POLICY "Users can delete their own cart items"
ON public.cart_items
FOR DELETE
USING (auth.uid() = user_id);

-- Create orders table
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  total DECIMAL(10, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  shipping_address JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Users can view their own orders
CREATE POLICY "Users can view their own orders"
ON public.orders
FOR SELECT
USING (auth.uid() = user_id);

-- Users can create their own orders
CREATE POLICY "Users can create their own orders"
ON public.orders
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Create order_items table
CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  product_id TEXT REFERENCES public.products(id) NOT NULL,
  quantity INTEGER NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  design_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- Users can view order items for their own orders
CREATE POLICY "Users can view their own order items"
ON public.order_items
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.orders
    WHERE orders.id = order_items.order_id
    AND orders.user_id = auth.uid()
  )
);

-- Users can create order items for their own orders
CREATE POLICY "Users can create their own order items"
ON public.order_items
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.orders
    WHERE orders.id = order_items.order_id
    AND orders.user_id = auth.uid()
  )
);

-- Migration: 20251022195535
-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create user_addresses table for saved shipping addresses
CREATE TABLE public.user_addresses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  street TEXT NOT NULL,
  number TEXT NOT NULL,
  complement TEXT,
  neighborhood TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  zip_code TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_addresses ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_addresses
CREATE POLICY "Users can view their own addresses"
ON public.user_addresses
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own addresses"
ON public.user_addresses
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own addresses"
ON public.user_addresses
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own addresses"
ON public.user_addresses
FOR DELETE
USING (auth.uid() = user_id);

-- Create wishlist table
CREATE TABLE public.wishlist (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  product_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, product_id)
);

-- Enable RLS
ALTER TABLE public.wishlist ENABLE ROW LEVEL SECURITY;

-- RLS Policies for wishlist
CREATE POLICY "Users can view their own wishlist"
ON public.wishlist
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can add to their wishlist"
ON public.wishlist
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove from their wishlist"
ON public.wishlist
FOR DELETE
USING (auth.uid() = user_id);

-- Create coupons table
CREATE TABLE public.coupons (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value NUMERIC NOT NULL,
  min_purchase NUMERIC DEFAULT 0,
  max_uses INTEGER,
  current_uses INTEGER DEFAULT 0,
  expires_at TIMESTAMP WITH TIME ZONE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

-- RLS Policies for coupons (public read for validation)
CREATE POLICY "Everyone can view active coupons"
ON public.coupons
FOR SELECT
USING (active = true);

-- Create saved_designs table
CREATE TABLE public.saved_designs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  product_id TEXT NOT NULL,
  design_name TEXT NOT NULL,
  design_data JSONB NOT NULL,
  thumbnail TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.saved_designs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for saved_designs
CREATE POLICY "Users can view their own designs"
ON public.saved_designs
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own designs"
ON public.saved_designs
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own designs"
ON public.saved_designs
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own designs"
ON public.saved_designs
FOR DELETE
USING (auth.uid() = user_id);

-- Create trigger for updated_at on user_addresses
CREATE TRIGGER update_user_addresses_updated_at
BEFORE UPDATE ON public.user_addresses
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add coupon_code to orders table
ALTER TABLE public.orders
ADD COLUMN coupon_code TEXT,
ADD COLUMN discount_amount NUMERIC DEFAULT 0;

-- Migration: 20251022195912
-- Create product_reviews table
CREATE TABLE public.product_reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  product_id TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title TEXT NOT NULL,
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;

-- RLS Policies for product_reviews
CREATE POLICY "Everyone can view reviews"
ON public.product_reviews
FOR SELECT
USING (true);

CREATE POLICY "Users can create their own reviews"
ON public.product_reviews
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own reviews"
ON public.product_reviews
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own reviews"
ON public.product_reviews
FOR DELETE
USING (auth.uid() = user_id);

-- Create trigger for updated_at on product_reviews
CREATE TRIGGER update_product_reviews_updated_at
BEFORE UPDATE ON public.product_reviews
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add unique constraint to prevent multiple reviews from same user for same product
ALTER TABLE public.product_reviews
ADD CONSTRAINT unique_user_product_review UNIQUE (user_id, product_id);

-- Migration: 20251022201103
-- Create enum for roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- RLS policies for user_roles
CREATE POLICY "Users can view their own roles"
  ON public.user_roles
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
  ON public.user_roles
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert roles"
  ON public.user_roles
  FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete roles"
  ON public.user_roles
  FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

-- Update products table policies for admin management
CREATE POLICY "Admins can insert products"
  ON public.products
  FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update products"
  ON public.products
  FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete products"
  ON public.products
  FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

-- Update coupons table policies for admin management
CREATE POLICY "Admins can insert coupons"
  ON public.coupons
  FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update coupons"
  ON public.coupons
  FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete coupons"
  ON public.coupons
  FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to view all orders
CREATE POLICY "Admins can view all orders"
  ON public.orders
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to view all order items
CREATE POLICY "Admins can view all order items"
  ON public.order_items
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to update orders (status)
CREATE POLICY "Admins can update orders"
  ON public.orders
  FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to delete reviews
CREATE POLICY "Admins can delete any review"
  ON public.product_reviews
  FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

-- Migration: 20251023130149
-- Adicionar novos campos à tabela products existente
ALTER TABLE products ADD COLUMN IF NOT EXISTS dimensions JSONB DEFAULT '{"width": 0, "height": 0, "depth": 0}'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS weight NUMERIC DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS material TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS specifications JSONB DEFAULT '{}'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_quantity INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS images TEXT[] DEFAULT '{}';

-- Criar tabela de imagens de produtos
CREATE TABLE IF NOT EXISTS product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id TEXT NOT NULL,
  image_url TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  alt_text TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(product_id, display_order)
);

-- Criar tabela de molduras em estoque
CREATE TABLE IF NOT EXISTS frame_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  material TEXT NOT NULL,
  color TEXT,
  style TEXT,
  image_url TEXT,
  base_price NUMERIC NOT NULL,
  stock_quantity INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  dimensions JSONB DEFAULT '{"width": 0, "height": 0}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Criar tabela de preços de molduras com quadros
CREATE TABLE IF NOT EXISTS product_frame_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id TEXT NOT NULL,
  frame_id UUID REFERENCES frame_options(id) ON DELETE CASCADE,
  combo_discount NUMERIC DEFAULT 0,
  final_combo_price NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(product_id, frame_id)
);

-- Criar tabela de produtos relacionados
CREATE TABLE IF NOT EXISTS related_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id TEXT NOT NULL,
  related_product_id TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(product_id, related_product_id)
);

-- Adicionar campos de moderação às avaliações
ALTER TABLE product_reviews ADD COLUMN IF NOT EXISTS approved BOOLEAN DEFAULT false;
ALTER TABLE product_reviews ADD COLUMN IF NOT EXISTS moderated_by UUID;
ALTER TABLE product_reviews ADD COLUMN IF NOT EXISTS moderation_date TIMESTAMP WITH TIME ZONE;

-- Criar tabela de perfis de usuários expandida
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  full_name TEXT,
  phone TEXT,
  document_type TEXT,
  document_number TEXT,
  date_of_birth DATE,
  tax_id TEXT,
  newsletter_subscription BOOLEAN DEFAULT false,
  billing_address JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Criar tabela de zonas de envio
CREATE TABLE IF NOT EXISTS shipping_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code TEXT NOT NULL UNIQUE,
  country_name TEXT NOT NULL,
  zone_name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Criar tabela de tarifas de envio
CREATE TABLE IF NOT EXISTS shipping_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id UUID REFERENCES shipping_zones(id) ON DELETE CASCADE,
  min_weight NUMERIC NOT NULL,
  max_weight NUMERIC NOT NULL,
  base_rate NUMERIC NOT NULL,
  per_kg_rate NUMERIC DEFAULT 0,
  estimated_days_min INTEGER,
  estimated_days_max INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Criar tabela de itens do menu
CREATE TABLE IF NOT EXISTS menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  url TEXT,
  parent_id UUID REFERENCES menu_items(id) ON DELETE CASCADE,
  image_url TEXT,
  description TEXT,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  is_mega_menu BOOLEAN DEFAULT false,
  style_config JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE frame_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_frame_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE related_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipping_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipping_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies para product_images
CREATE POLICY "Anyone can view product images" ON product_images FOR SELECT USING (true);
CREATE POLICY "Admins can manage product images" ON product_images FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies para frame_options
CREATE POLICY "Anyone can view active frames" ON frame_options FOR SELECT USING (is_active = true);
CREATE POLICY "Admins can manage frames" ON frame_options FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies para product_frame_pricing
CREATE POLICY "Anyone can view frame pricing" ON product_frame_pricing FOR SELECT USING (true);
CREATE POLICY "Admins can manage frame pricing" ON product_frame_pricing FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies para related_products
CREATE POLICY "Anyone can view related products" ON related_products FOR SELECT USING (true);
CREATE POLICY "Admins can manage related products" ON related_products FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies para user_profiles
CREATE POLICY "Users can view their own profile" ON user_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own profile" ON user_profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own profile" ON user_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can view all profiles" ON user_profiles FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies para shipping_zones
CREATE POLICY "Anyone can view active shipping zones" ON shipping_zones FOR SELECT USING (is_active = true);
CREATE POLICY "Admins can manage shipping zones" ON shipping_zones FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies para shipping_rates
CREATE POLICY "Anyone can view shipping rates" ON shipping_rates FOR SELECT USING (true);
CREATE POLICY "Admins can manage shipping rates" ON shipping_rates FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies para menu_items
CREATE POLICY "Anyone can view active menu items" ON menu_items FOR SELECT USING (is_active = true);
CREATE POLICY "Admins can manage menu items" ON menu_items FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Atualizar política de avaliações para mostrar apenas aprovadas
DROP POLICY IF EXISTS "Everyone can view reviews" ON product_reviews;
CREATE POLICY "Everyone can view approved reviews" ON product_reviews FOR SELECT USING (approved = true OR has_role(auth.uid(), 'admin'::app_role));

-- Trigger para atualizar updated_at em user_profiles
CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Inserir zonas de envio da Europa
INSERT INTO shipping_zones (country_code, country_name, zone_name) VALUES
  ('PT', 'Portugal', 'Nacional'),
  ('ES', 'Espanha', 'Europa Sul'),
  ('FR', 'França', 'Europa Oeste'),
  ('IT', 'Itália', 'Europa Sul'),
  ('DE', 'Alemanha', 'Europa Central'),
  ('BE', 'Bélgica', 'Europa Oeste'),
  ('NL', 'Holanda', 'Europa Oeste'),
  ('GB', 'Reino Unido', 'Europa Norte'),
  ('IE', 'Irlanda', 'Europa Norte'),
  ('AT', 'Áustria', 'Europa Central')
ON CONFLICT (country_code) DO NOTHING;

-- Migration: 20251030191530
-- Create categories table
CREATE TABLE public.categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  parent_id UUID REFERENCES public.categories(id) ON DELETE CASCADE,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  seo_title TEXT,
  seo_description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on categories
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- Policies for categories
CREATE POLICY "Anyone can view active categories"
  ON public.categories FOR SELECT
  USING (is_active = true OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage categories"
  ON public.categories FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Create product_categories junction table
CREATE TABLE public.product_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id TEXT NOT NULL,
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(product_id, category_id)
);

-- Enable RLS on product_categories
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;

-- Policies for product_categories
CREATE POLICY "Anyone can view product categories"
  ON public.product_categories FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage product categories"
  ON public.product_categories FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Create banners table
CREATE TABLE public.banners (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  image_url TEXT NOT NULL,
  link_url TEXT,
  position TEXT NOT NULL DEFAULT 'hero',
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  start_date TIMESTAMP WITH TIME ZONE,
  end_date TIMESTAMP WITH TIME ZONE,
  target_audience TEXT DEFAULT 'all',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on banners
ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;

-- Policies for banners
CREATE POLICY "Anyone can view active banners"
  ON public.banners FOR SELECT
  USING (
    is_active = true 
    AND (start_date IS NULL OR start_date <= now())
    AND (end_date IS NULL OR end_date >= now())
  );

CREATE POLICY "Admins can manage banners"
  ON public.banners FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Create product_views table for analytics
CREATE TABLE public.product_views (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id TEXT NOT NULL,
  user_id UUID,
  session_id TEXT,
  viewed_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on product_views
ALTER TABLE public.product_views ENABLE ROW LEVEL SECURITY;

-- Policies for product_views
CREATE POLICY "Anyone can insert product views"
  ON public.product_views FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins can view all product views"
  ON public.product_views FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Create search_history table
CREATE TABLE public.search_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  query TEXT NOT NULL,
  results_count INTEGER DEFAULT 0,
  searched_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on search_history
ALTER TABLE public.search_history ENABLE ROW LEVEL SECURITY;

-- Policies for search_history
CREATE POLICY "Anyone can insert search history"
  ON public.search_history FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can view their own search history"
  ON public.search_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all search history"
  ON public.search_history FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Add new fields to products table
ALTER TABLE public.products 
  ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sales_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS featured_until TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS color_palette JSONB DEFAULT '[]'::jsonb;

-- Create indexes for better performance
CREATE INDEX idx_categories_slug ON public.categories(slug);
CREATE INDEX idx_categories_parent_id ON public.categories(parent_id);
CREATE INDEX idx_product_categories_product_id ON public.product_categories(product_id);
CREATE INDEX idx_product_categories_category_id ON public.product_categories(category_id);
CREATE INDEX idx_banners_active ON public.banners(is_active, start_date, end_date);
CREATE INDEX idx_product_views_product_id ON public.product_views(product_id);
CREATE INDEX idx_products_featured ON public.products(is_featured, featured_until);
CREATE INDEX idx_products_sales_count ON public.products(sales_count DESC);

-- Create trigger for updating updated_at on categories
CREATE TRIGGER update_categories_updated_at
  BEFORE UPDATE ON public.categories
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create trigger for updating updated_at on banners
CREATE TRIGGER update_banners_updated_at
  BEFORE UPDATE ON public.banners
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage buckets
INSERT INTO storage.buckets (id, name, public) 
VALUES 
  ('banners', 'banners', true),
  ('product-images', 'product-images', true),
  ('customer-photos', 'customer-photos', true),
  ('gallery-walls', 'gallery-walls', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for banners bucket
CREATE POLICY "Anyone can view banner images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'banners');

CREATE POLICY "Admins can upload banner images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'banners' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update banner images"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'banners' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete banner images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'banners' AND has_role(auth.uid(), 'admin'::app_role));

-- Storage policies for product-images bucket
CREATE POLICY "Anyone can view product images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product-images');

CREATE POLICY "Admins can upload product images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'product-images' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update product images"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'product-images' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete product images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'product-images' AND has_role(auth.uid(), 'admin'::app_role));

-- Storage policies for customer-photos bucket
CREATE POLICY "Anyone can view customer photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'customer-photos');

CREATE POLICY "Users can upload their customer photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'customer-photos' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete their customer photos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'customer-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Storage policies for gallery-walls bucket
CREATE POLICY "Anyone can view gallery walls"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'gallery-walls');

CREATE POLICY "Users can upload their gallery walls"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'gallery-walls' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete their gallery walls"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'gallery-walls' AND auth.uid()::text = (storage.foldername(name))[1]);
