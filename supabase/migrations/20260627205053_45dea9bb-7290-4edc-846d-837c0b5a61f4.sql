
DROP POLICY IF EXISTS "Anyone can upload payment proof" ON storage.objects;

CREATE POLICY "Authenticated users upload own payment proof"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'payment-proofs'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = auth.uid()::text
);
