CREATE OR REPLACE FUNCTION public.get_storage_usage()
RETURNS TABLE(bucket_id text, bytes bigint, count bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, storage
AS $$
  SELECT bucket_id::text,
         COALESCE(SUM((metadata->>'size')::bigint), 0)::bigint AS bytes,
         COUNT(*)::bigint AS count
  FROM storage.objects
  GROUP BY bucket_id;
$$;

REVOKE ALL ON FUNCTION public.get_storage_usage() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_storage_usage() TO service_role;