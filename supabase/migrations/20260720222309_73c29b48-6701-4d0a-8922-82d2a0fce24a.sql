
CREATE POLICY "Admins can view all addresses" ON public.user_addresses
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can insert any address" ON public.user_addresses
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update any address" ON public.user_addresses
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete any address" ON public.user_addresses
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
