
ALTER TABLE public.product_images DROP CONSTRAINT product_images_product_id_display_order_key;
CREATE UNIQUE INDEX product_images_product_variation_order_key ON public.product_images (product_id, COALESCE(variation_id, '00000000-0000-0000-0000-000000000000'::uuid), display_order);
