
INSERT INTO public.home_sections (key, eyebrow, title, subtitle, is_active)
VALUES ('gallery', 'Em produção', 'Cor a sair da máquina. Todos os dias.', NULL, true)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.home_section_items (section_key, kind, title, body, image_url, display_order, is_active)
SELECT 'gallery', 'gallery', 'Têxtil', 'Aplicação de DTF com prensa térmica em t-shirt preta', 'https://cdn.lovable.dev/placeholder-gallery-1', 1, true
WHERE NOT EXISTS (SELECT 1 FROM public.home_section_items WHERE section_key='gallery' AND kind='gallery');
