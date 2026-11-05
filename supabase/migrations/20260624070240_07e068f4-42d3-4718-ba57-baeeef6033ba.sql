ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS recommended_dtf_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

UPDATE public.products
SET recommended_dtf_ids = ARRAY[recommended_dtf_id::uuid]
WHERE recommended_dtf_id IS NOT NULL
  AND (array_length(recommended_dtf_ids, 1) IS NULL);