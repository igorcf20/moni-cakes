
CREATE OR REPLACE VIEW public.home_section_items_public
WITH (security_invoker=on) AS
SELECT id, section_key, kind, display_order, is_active, title, subtitle, body,
       image_url, icon, stat_value, stat_label, author_name, author_role,
       author_location, rating, status, created_at, updated_at
FROM public.home_section_items;

GRANT SELECT ON public.home_section_items_public TO anon, authenticated;

DROP POLICY IF EXISTS "home_items public read" ON public.home_section_items;
CREATE POLICY "home_items admin read base"
ON public.home_section_items FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

REVOKE SELECT ON public.home_section_items FROM anon;

DROP POLICY IF EXISTS "Anyone can insert search history" ON public.search_history;
CREATE POLICY "Anyone can insert search history"
ON public.search_history FOR INSERT
TO anon, authenticated
WITH CHECK (
  query IS NOT NULL
  AND (user_id IS NULL OR user_id = auth.uid())
);
