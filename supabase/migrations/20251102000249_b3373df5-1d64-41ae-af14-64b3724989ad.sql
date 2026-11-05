-- Criar buckets de storage para imagens de produtos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('product-originals', 'product-originals', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg']),
  ('product-processed', 'product-processed', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg']);

-- Políticas para bucket product-originals (privado)
CREATE POLICY "Admins can upload original images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'product-originals' 
  AND has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins can view original images"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'product-originals' 
  AND has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins can delete original images"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'product-originals' 
  AND has_role(auth.uid(), 'admin'::app_role)
);

-- Políticas para bucket product-processed (público)
CREATE POLICY "Anyone can view processed images"
ON storage.objects FOR SELECT
USING (bucket_id = 'product-processed');

CREATE POLICY "Admins can upload processed images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'product-processed' 
  AND has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins can delete processed images"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'product-processed' 
  AND has_role(auth.uid(), 'admin'::app_role)
);