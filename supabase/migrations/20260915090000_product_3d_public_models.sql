-- Execute manualmente no SQL Editor do Lovable antes de carregar GLB no painel.
-- Os modelos simples por tipo de produto não dependem desta migração.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('product-3d-models', 'product-3d-models', true, 20971520, ARRAY['model/gltf-binary'])
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Public reads product 3d models') THEN
    CREATE POLICY "Public reads product 3d models" ON storage.objects
      FOR SELECT TO anon, authenticated
      USING (bucket_id = 'product-3d-models');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Admins upload product 3d models') THEN
    CREATE POLICY "Admins upload product 3d models" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'product-3d-models' AND public.has_role(auth.uid(), 'admin'::app_role));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Admins delete product 3d models') THEN
    CREATE POLICY "Admins delete product 3d models" ON storage.objects
      FOR DELETE TO authenticated
      USING (bucket_id = 'product-3d-models' AND public.has_role(auth.uid(), 'admin'::app_role));
  END IF;
END $$;
