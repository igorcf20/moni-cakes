-- Refine newsletter insertion policy to be more specific (though it remains public)
DROP POLICY "Anyone can subscribe to the newsletter" ON public.newsletter_subscriptions;
CREATE POLICY "Anyone can subscribe to the newsletter" 
ON public.newsletter_subscriptions 
FOR INSERT 
WITH CHECK (email IS NOT NULL AND length(email) > 3);
