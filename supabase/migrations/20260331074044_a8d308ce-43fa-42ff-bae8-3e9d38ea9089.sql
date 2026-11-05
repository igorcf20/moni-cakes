-- Insert new settings keys if they don't exist
INSERT INTO public.store_settings (key, value)
VALUES 
  ('social_links', '{"instagram": "", "whatsapp": "", "facebook": "", "tiktok": ""}'::jsonb),
  ('seo_settings', '{"meta_title": "ANYLUVIÉ", "meta_description": "", "keywords": "", "favicon_url": ""}'::jsonb),
  ('operational_settings', '{"maintenance_mode": false, "min_order_value": 0, "support_email": "", "support_phone": ""}'::jsonb)
ON CONFLICT (key) DO NOTHING;
