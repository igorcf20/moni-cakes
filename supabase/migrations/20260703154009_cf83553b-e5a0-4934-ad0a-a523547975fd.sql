
-- Newsletter: standardize on has_role()
DROP POLICY IF EXISTS "Admins can delete newsletter subscriptions" ON public.newsletter_subscriptions;
DROP POLICY IF EXISTS "Admins can update newsletter subscriptions" ON public.newsletter_subscriptions;
DROP POLICY IF EXISTS "Admins can view all newsletter subscriptions" ON public.newsletter_subscriptions;

CREATE POLICY "Admins can delete newsletter subscriptions"
  ON public.newsletter_subscriptions FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update newsletter subscriptions"
  ON public.newsletter_subscriptions FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can view all newsletter subscriptions"
  ON public.newsletter_subscriptions FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- product_views: tighten anon insert validation
DROP POLICY IF EXISTS "Anyone can insert product views" ON public.product_views;
CREATE POLICY "Anyone can insert product views"
  ON public.product_views FOR INSERT
  WITH CHECK (
    product_id IS NOT NULL
    AND ((user_id IS NULL) OR (user_id = auth.uid()))
    AND (session_id IS NULL OR length(session_id) <= 128)
  );

-- search_history: tighten anon insert validation
DROP POLICY IF EXISTS "Anyone can insert search history" ON public.search_history;
CREATE POLICY "Anyone can insert search history"
  ON public.search_history FOR INSERT
  WITH CHECK (
    query IS NOT NULL
    AND length(query) BETWEEN 1 AND 200
    AND ((user_id IS NULL) OR (user_id = auth.uid()))
  );
