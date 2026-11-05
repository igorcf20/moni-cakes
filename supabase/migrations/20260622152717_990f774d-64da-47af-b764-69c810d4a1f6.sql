
-- Anyone (including guests) can upload to payment-proofs bucket (no read access)
CREATE POLICY "Anyone can upload payment proof"
  ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'payment-proofs');

-- Authenticated users can read their own proofs (path starts with their user id) - optional
CREATE POLICY "Users can read own payment proof"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'payment-proofs' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Admins can read all
CREATE POLICY "Admins can read all payment proofs"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'payment-proofs' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete payment proofs"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'payment-proofs' AND public.has_role(auth.uid(), 'admin'));
