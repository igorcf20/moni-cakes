-- Galeria do produto com visualizador 3D e vídeos (pedido do dono).
--   model_url   endereço de um ficheiro STL, OBJ ou 3MF (em mm); a galeria mostra um item "3D" para girar a peça
--   video_urls  endereços de vídeos (MP4 ou WebM), mostrados no fim da galeria
-- Editáveis no Admin > Produtos > Imagens (envio para o bucket product-media). O Vaso Facetado ganha o modelo do
-- mesmo vaso da página inicial.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS model_url text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS video_urls text[] NOT NULL DEFAULT '{}';

UPDATE public.products SET model_url = '/models/vaso-facetado.stl'
WHERE id = 'print3d-vaso-facetado' AND model_url IS NULL;

-- Ficheiros enviados no Admin: modelos 3D (enviados como octet-stream, porque o navegador não dá tipo a STL/OBJ/3MF)
-- e vídeos. Leitura pública; enviar e apagar só administradores.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('product-media', 'product-media', true, 52428800,
  ARRAY['application/octet-stream', 'model/stl', 'model/obj', 'model/3mf', 'video/mp4', 'video/webm'])
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Public reads product media') THEN
    CREATE POLICY "Public reads product media" ON storage.objects
      FOR SELECT TO anon, authenticated
      USING (bucket_id = 'product-media');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Admins upload product media') THEN
    CREATE POLICY "Admins upload product media" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'product-media' AND public.has_role(auth.uid(), 'admin'::app_role));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Admins delete product media') THEN
    CREATE POLICY "Admins delete product media" ON storage.objects
      FOR DELETE TO authenticated
      USING (bucket_id = 'product-media' AND public.has_role(auth.uid(), 'admin'::app_role));
  END IF;
END $$;
