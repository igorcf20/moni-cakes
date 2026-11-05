-- Prevent anonymous public reads from evaluating the admin-only has_role() function.
-- Admin policies remain protected and are scoped to authenticated users only.

-- Admin ALL policies: restrict to authenticated so they are not considered for anon reads.
ALTER POLICY "Admins can manage banners" ON public.banners TO authenticated;
ALTER POLICY "Admins can manage categories" ON public.categories TO authenticated;
ALTER POLICY "Admins can manage frames" ON public.frame_options TO authenticated;
ALTER POLICY "Admins can manage kit items" ON public.kit_items TO authenticated;
ALTER POLICY "Admins can manage kits" ON public.kits TO authenticated;
ALTER POLICY "Admins can manage menu items" ON public.menu_items TO authenticated;
ALTER POLICY "Admins can manage product categories" ON public.product_categories TO authenticated;
ALTER POLICY "Admins can manage frame pricing" ON public.product_frame_pricing TO authenticated;
ALTER POLICY "Admins can manage product images" ON public.product_images TO authenticated;
ALTER POLICY "Admins can manage product sizes" ON public.product_sizes TO authenticated;
ALTER POLICY "Admins can manage variation sizes" ON public.product_variation_sizes TO authenticated;
ALTER POLICY "Admins can manage variations" ON public.product_variations TO authenticated;
ALTER POLICY "Admins can manage related products" ON public.related_products TO authenticated;
ALTER POLICY "Admins manage sales popup config" ON public.sales_popup_config TO authenticated;
ALTER POLICY "Admins can manage shipping rates" ON public.shipping_rates TO authenticated;
ALTER POLICY "Admins can manage shipping zones" ON public.shipping_zones TO authenticated;
ALTER POLICY "Admins manage FAQs" ON public.site_faqs TO authenticated;
ALTER POLICY "Admins can manage store settings" ON public.store_settings TO authenticated;

-- Admin-only granular policies: restrict to authenticated where they call has_role().
ALTER POLICY "Admins can delete coupons" ON public.coupons TO authenticated;
ALTER POLICY "Admins can insert coupons" ON public.coupons TO authenticated;
ALTER POLICY "Admins can update coupons" ON public.coupons TO authenticated;
ALTER POLICY "delivery_methods_admin_delete" ON public.delivery_methods TO authenticated;
ALTER POLICY "delivery_methods_admin_insert" ON public.delivery_methods TO authenticated;
ALTER POLICY "delivery_methods_admin_update" ON public.delivery_methods TO authenticated;
ALTER POLICY "Admins can delete newsletter subscriptions" ON public.newsletter_subscriptions TO authenticated;
ALTER POLICY "Admins can update newsletter subscriptions" ON public.newsletter_subscriptions TO authenticated;
ALTER POLICY "Admins can view all newsletter subscriptions" ON public.newsletter_subscriptions TO authenticated;
ALTER POLICY "Admins can view all order items" ON public.order_items TO authenticated;
ALTER POLICY "Admins can insert order history" ON public.order_status_history TO authenticated;
ALTER POLICY "Admins can view all order history" ON public.order_status_history TO authenticated;
ALTER POLICY "Admins can update orders" ON public.orders TO authenticated;
ALTER POLICY "Admins can view all orders" ON public.orders TO authenticated;
ALTER POLICY "payment_config_admin_delete" ON public.payment_config TO authenticated;
ALTER POLICY "payment_config_admin_insert" ON public.payment_config TO authenticated;
ALTER POLICY "payment_config_admin_update" ON public.payment_config TO authenticated;
ALTER POLICY "Admins can delete any review" ON public.product_reviews TO authenticated;
ALTER POLICY "Admins can view all product views" ON public.product_views TO authenticated;
ALTER POLICY "Admins can delete products" ON public.products TO authenticated;
ALTER POLICY "Admins can insert products" ON public.products TO authenticated;
ALTER POLICY "Admins can update products" ON public.products TO authenticated;
ALTER POLICY "Admins can view all search history" ON public.search_history TO authenticated;
ALTER POLICY "Admins can view all profiles" ON public.user_profiles TO authenticated;
ALTER POLICY "Admins can view all roles" ON public.user_roles TO authenticated;

-- Public read policies should not include has_role(), otherwise anonymous visitors need EXECUTE on has_role().
ALTER POLICY "Anyone can view active categories"
ON public.categories
USING (is_active = true);

ALTER POLICY "FAQs are publicly readable when active"
ON public.site_faqs
USING (is_active = true);

ALTER POLICY "Public read active faqs"
ON public.usage_guide_faqs
USING (is_active = true);

ALTER POLICY "Public read active sections"
ON public.usage_guide_sections
USING (is_active = true);

ALTER POLICY "Users can view their own reviews"
ON public.product_reviews
TO authenticated
USING ((auth.uid() = user_id) OR public.has_role(auth.uid(), 'admin'::public.app_role));