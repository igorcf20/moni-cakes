-- 1. Remove unused guest upload policy (guest checkout is disabled site-wide)
DROP POLICY IF EXISTS "dtf_uploads_guest_insert" ON storage.objects;

-- 2. Tighten testimonial submission: require authenticated user and matching email
DROP POLICY IF EXISTS "public submit testimonial pending" ON public.home_section_items;

CREATE POLICY "authenticated submit testimonial pending"
ON public.home_section_items
FOR INSERT
TO authenticated
WITH CHECK (
  kind = 'testimonial'
  AND section_key = 'testimonials'
  AND status = 'pending'
  AND is_active = false
  AND (
    submitter_email IS NULL
    OR lower(submitter_email) = lower((auth.jwt() ->> 'email'))
  )
);