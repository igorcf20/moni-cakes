-- Refine overly permissive RLS policies for tracking tables
DROP POLICY "Anyone can insert product views" ON public.product_views;
CREATE POLICY "Anyone can insert product views" 
ON public.product_views 
FOR INSERT 
WITH CHECK (product_id IS NOT NULL);

DROP POLICY "Anyone can insert search history" ON public.search_history;
CREATE POLICY "Anyone can insert search history" 
ON public.search_history 
FOR INSERT 
WITH CHECK (query IS NOT NULL);
