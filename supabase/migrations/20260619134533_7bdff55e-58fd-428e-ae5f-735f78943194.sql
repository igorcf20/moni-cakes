
ALTER TABLE public.home_section_items
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS submitter_email text;

ALTER TABLE public.home_section_items
  DROP CONSTRAINT IF EXISTS home_section_items_status_check;
ALTER TABLE public.home_section_items
  ADD CONSTRAINT home_section_items_status_check
  CHECK (status IN ('approved','pending','rejected'));

-- Allow anonymous + authenticated users to submit a testimonial as pending only
GRANT INSERT ON public.home_section_items TO anon, authenticated;

DROP POLICY IF EXISTS "public submit testimonial pending" ON public.home_section_items;
CREATE POLICY "public submit testimonial pending"
ON public.home_section_items
FOR INSERT
TO anon, authenticated
WITH CHECK (
  kind = 'testimonial'
  AND section_key = 'testimonials'
  AND status = 'pending'
  AND is_active = false
);
