CREATE OR REPLACE FUNCTION public.list_orphan_dtf_objects(_limit int DEFAULT 500)
RETURNS TABLE(name text, size bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, storage
AS $$
  WITH linked AS (
    SELECT file_path AS p FROM public.order_designs WHERE deleted_at IS NULL AND file_path IS NOT NULL
    UNION
    SELECT preview_path FROM public.order_designs WHERE deleted_at IS NULL AND preview_path IS NOT NULL
    UNION
    SELECT pdf_path FROM public.order_designs WHERE deleted_at IS NULL AND pdf_path IS NOT NULL
  )
  SELECT o.name::text, COALESCE((o.metadata->>'size')::bigint, 0)
    FROM storage.objects o
    LEFT JOIN linked l ON l.p = o.name
   WHERE o.bucket_id = 'dtf-uploads'
     AND l.p IS NULL
   ORDER BY o.created_at
   LIMIT _limit;
$$;
REVOKE ALL ON FUNCTION public.list_orphan_dtf_objects(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_orphan_dtf_objects(int) TO service_role;