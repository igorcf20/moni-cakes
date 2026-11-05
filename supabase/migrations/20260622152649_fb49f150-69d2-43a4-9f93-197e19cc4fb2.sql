
ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS payment_proof_url text,
  ADD COLUMN IF NOT EXISTS payment_proof_uploaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_proof_note text;

-- Allow guests to upload proof to their own order via guest_email check (handled via edge function later if needed).
-- For now, authenticated users can update their own order's proof fields while pending.
DO $$ BEGIN
  CREATE POLICY "Users update own pending order proof"
    ON public.orders
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id AND status = 'pending')
    WITH CHECK (auth.uid() = user_id AND status = 'pending');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
