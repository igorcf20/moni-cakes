CREATE TABLE public.product_faqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id text NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  question text NOT NULL,
  answer text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX product_faqs_product_id_idx ON public.product_faqs(product_id, display_order);
GRANT SELECT ON public.product_faqs TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_faqs TO authenticated;
GRANT ALL ON public.product_faqs TO service_role;
ALTER TABLE public.product_faqs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read active FAQs" ON public.product_faqs FOR SELECT USING (is_active = true);
CREATE POLICY "Admins manage FAQs" ON public.product_faqs FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER product_faqs_updated_at BEFORE UPDATE ON public.product_faqs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();