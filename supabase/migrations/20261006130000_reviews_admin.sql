-- Avaliações completas no Admin (Admin > Avaliações): a loja cria, edita, responde, aprova e apaga avaliações.
--   source         de onde veio a avaliação: 'site' (cliente no site) ou o canal de onde a loja a trouxe
--                  (whatsapp, instagram, facebook, google, email, marketplace, phone, in_person, other)
--   verified       compra verificada: calculado aqui (pedido pago com o produto), nunca pelo navegador
--   admin_reply    resposta pública da loja, com a data
-- Proteção: um cliente não pode aprovar a própria avaliação, marcar compra verificada, mudar a origem nem escrever a
-- resposta da loja; se editar a sua avaliação, ela volta a ficar pendente.
-- Fotos dos clientes: só com store_settings.review_settings.customer_photos ligado no Admin, enviadas para o bucket
-- review-photos na pasta do próprio cliente e gravadas como caminho relativo desse bucket (nunca um endereço de fora).

ALTER TABLE public.product_reviews
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'site',
  ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS admin_reply text,
  ADD COLUMN IF NOT EXISTS admin_reply_at timestamptz;

ALTER TABLE public.product_reviews DROP CONSTRAINT IF EXISTS product_reviews_source_check;
ALTER TABLE public.product_reviews ADD CONSTRAINT product_reviews_source_check
  CHECK (source IN ('site', 'whatsapp', 'instagram', 'facebook', 'google', 'email', 'marketplace', 'phone', 'in_person', 'other'));
ALTER TABLE public.product_reviews DROP CONSTRAINT IF EXISTS product_reviews_rating_range;
ALTER TABLE public.product_reviews ADD CONSTRAINT product_reviews_rating_range CHECK (rating BETWEEN 1 AND 5) NOT VALID;

UPDATE public.product_reviews SET source = 'other' WHERE created_by_admin AND source = 'site';

CREATE OR REPLACE FUNCTION public.product_review_bought(_user uuid, _product text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.orders o
    JOIN public.order_items oi ON oi.order_id = o.id
    WHERE o.user_id = _user AND oi.product_id = _product AND o.payment_status = 'paid'
  );
$$;
REVOKE ALL ON FUNCTION public.product_review_bought(uuid, text) FROM PUBLIC, anon, authenticated;

INSERT INTO public.store_settings (key, value) VALUES ('review_settings', '{"customer_photos": false}'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.review_customer_photos_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce((SELECT (value->>'customer_photos')::boolean FROM public.store_settings WHERE key = 'review_settings'), false);
$$;
GRANT EXECUTE ON FUNCTION public.review_customer_photos_enabled() TO anon, authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('review-photos', 'review-photos', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Public reads review photos') THEN
    CREATE POLICY "Public reads review photos" ON storage.objects
      FOR SELECT TO anon, authenticated
      USING (bucket_id = 'review-photos');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Customers upload own review photos') THEN
    CREATE POLICY "Customers upload own review photos" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'review-photos' AND (storage.foldername(name))[1] = auth.uid()::text
        AND public.review_customer_photos_enabled());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Admins delete review photos') THEN
    CREATE POLICY "Admins delete review photos" ON storage.objects
      FOR DELETE TO authenticated
      USING (bucket_id = 'review-photos' AND public.has_role(auth.uid(), 'admin'::app_role));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.product_reviews_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  privileged boolean := auth.uid() IS NULL
    OR coalesce(auth.role(), '') = 'service_role'
    OR public.has_role(auth.uid(), 'admin'::app_role);
  is_admin boolean := auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin'::app_role);
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT privileged THEN
      NEW.approved := false;
      NEW.created_by_admin := false;
      NEW.source := 'site';
      NEW.admin_reply := NULL;
      NEW.order_id := NULL;
      IF NOT (public.review_customer_photos_enabled() AND NEW.image_url IS NOT NULL
              AND NEW.image_url ~ ('^/storage/v1/object/public/review-photos/' || auth.uid()::text || '/[A-Za-z0-9._-]+$')) THEN
        NEW.image_url := NULL;
      END IF;
    END IF;
    IF is_admin AND NEW.user_id IS NULL THEN
      NEW.created_by_admin := true;
    END IF;
  ELSE
    IF NOT privileged THEN
      -- Cliente a editar a sua avaliação: campos da loja ficam como estavam e volta para moderação.
      NEW.approved := false;
      NEW.created_by_admin := OLD.created_by_admin;
      NEW.source := OLD.source;
      NEW.admin_reply := OLD.admin_reply;
      NEW.admin_reply_at := OLD.admin_reply_at;
      NEW.order_id := OLD.order_id;
      NEW.image_url := OLD.image_url;
      NEW.user_id := OLD.user_id;
      NEW.product_id := OLD.product_id;
      NEW.created_at := OLD.created_at;
    END IF;
  END IF;

  IF NEW.created_by_admin AND NEW.source = 'site' THEN
    NEW.source := 'other';
  END IF;
  NEW.verified := NOT NEW.created_by_admin
    AND (NEW.order_id IS NOT NULL OR public.product_review_bought(NEW.user_id, NEW.product_id));

  IF NEW.admin_reply IS NOT NULL AND btrim(NEW.admin_reply) = '' THEN
    NEW.admin_reply := NULL;
  END IF;
  IF NEW.admin_reply IS NULL THEN
    NEW.admin_reply_at := NULL;
  ELSIF TG_OP = 'INSERT' OR NEW.admin_reply IS DISTINCT FROM OLD.admin_reply THEN
    NEW.admin_reply_at := now();
  END IF;
  IF NEW.approved IS DISTINCT FROM (CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.approved END) AND is_admin THEN
    NEW.moderated_by := auth.uid();
    NEW.moderation_date := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS product_reviews_guard ON public.product_reviews;
CREATE TRIGGER product_reviews_guard
  BEFORE INSERT OR UPDATE ON public.product_reviews
  FOR EACH ROW EXECUTE FUNCTION public.product_reviews_guard();

-- Avaliações antigas: recalcula a compra verificada.
UPDATE public.product_reviews r
SET verified = NOT r.created_by_admin
  AND (r.order_id IS NOT NULL OR public.product_review_bought(r.user_id, r.product_id));

-- Vista pública: mais origem, compra verificada, foto e resposta da loja (continua sem user_id nem order_id).
-- Corrige também a visibilidade: com security_invoker a vista seguia as regras de product_reviews, que só deixam
-- cada cliente ver as suas, e os visitantes não viam nenhuma avaliação. Agora corre com o dono da vista e mostra só
-- as aprovadas e só as colunas seguras.
DROP VIEW IF EXISTS public.product_reviews_public;
CREATE VIEW public.product_reviews_public
WITH (security_invoker = false) AS
SELECT
  r.id,
  r.product_id,
  r.rating,
  r.title,
  r.comment,
  r.customer_name,
  r.created_at,
  r.approved,
  COALESCE(NULLIF(r.customer_name, ''), p.full_name) AS display_name,
  r.source,
  r.verified,
  r.image_url,
  r.admin_reply,
  r.admin_reply_at
FROM public.product_reviews r
LEFT JOIN public.user_profiles p ON p.user_id = r.user_id
WHERE r.approved = true;

GRANT SELECT ON public.product_reviews_public TO anon, authenticated;
