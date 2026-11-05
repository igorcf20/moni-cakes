
INSERT INTO public.categories (slug, name, description, image_url, display_order, is_active) VALUES
  ('canecas', 'Canecas', 'Canecas personalizadas para brindes corporativos e ofertas.', '/__l5e/assets-v1/6031c27c-4df5-4494-b1b2-1e66c3bb18b5/cat-canecas.jpg', 1, true),
  ('t-shirts', 'T-shirts', 'T-shirts personalizadas com DTF, serigrafia ou bordado.', '/__l5e/assets-v1/c58d3d22-d016-43b2-81d4-575515d8bd4e/cat-tshirts.jpg', 2, true),
  ('sacos', 'Sacos e Totes', 'Sacos de algodão e totes personalizados para eventos e marcas.', '/__l5e/assets-v1/4c7e02c7-c0bf-44fe-bac3-9c6544ea4d51/cat-sacos.jpg', 3, true),
  ('mochilas', 'Mochilas', 'Mochilas premium personalizáveis para empresas e escolas.', '/__l5e/assets-v1/a9d41ede-b566-4726-9a2b-bb90db076e0c/cat-mochilas.jpg', 4, true),
  ('autocolantes', 'Autocolantes', 'Autocolantes vinil de alta qualidade em qualquer forma e cor.', '/__l5e/assets-v1/9f6ca3b3-ee0a-4d66-b0da-5d500aa1e89a/cat-autocolantes.jpg', 5, true),
  ('corporativo', 'Brindes Corporativos', 'Kits e brindes premium para empresas, eventos e feiras.', '/__l5e/assets-v1/949bf519-3971-4ceb-bfaf-0c9a6975b337/cat-corporativo.jpg', 6, true)
ON CONFLICT (slug) DO UPDATE SET image_url = EXCLUDED.image_url, name = EXCLUDED.name, description = EXCLUDED.description, is_active = true, display_order = EXCLUDED.display_order;

INSERT INTO public.products (id, slug, name, short_description, description, price, image, category, unit_type, is_active, is_featured, customizable) VALUES
  ('bml-caneca-preta-350', 'caneca-preta-fosca-350ml', 'Caneca Preta Fosca 350ml', 'Cerâmica premium com toque suave, personalizada com a sua marca.', 'Caneca de cerâmica preta fosca de 350ml, ideal para brindes corporativos e ofertas. Personalização por sublimação ou UV.', 9.90, '/__l5e/assets-v1/6031c27c-4df5-4494-b1b2-1e66c3bb18b5/cat-canecas.jpg', 'canecas', 'unit', true, true, true),
  ('bml-tshirt-navy', 'tshirt-algodao-navy', 'T-shirt Algodão Premium Navy', 'T-shirt 100% algodão penteado, personalização em DTF ou bordado.', 'T-shirt unissexo em algodão penteado 180g/m². Personalização em DTF têxtil, serigrafia ou bordado.', 12.50, '/__l5e/assets-v1/c58d3d22-d016-43b2-81d4-575515d8bd4e/cat-tshirts.jpg', 't-shirts', 'unit', true, true, true),
  ('bml-tote-natural', 'tote-canvas-natural', 'Tote Bag Canvas Natural', 'Saco tote em canvas ecológico, resistente e personalizável.', 'Saco tote em algodão canvas 100%, com pega reforçada. Ideal para eventos, feiras e ofertas.', 6.90, '/__l5e/assets-v1/4c7e02c7-c0bf-44fe-bac3-9c6544ea4d51/cat-sacos.jpg', 'sacos', 'unit', true, true, true),
  ('bml-mochila-preta', 'mochila-premium-preta', 'Mochila Premium Preta', 'Mochila urbana premium com compartimento para portátil.', 'Mochila em poliéster reforçado, com compartimento acolchoado para portátil até 15,6". Personalizável por bordado ou DTF UV.', 34.90, '/__l5e/assets-v1/a9d41ede-b566-4726-9a2b-bb90db076e0c/cat-mochilas.jpg', 'mochilas', 'unit', true, true, true),
  ('bml-autocolantes-circulares', 'autocolantes-vinil-circulares', 'Autocolantes Vinil Circulares', 'Autocolantes em vinil recortado, resistentes à água.', 'Pack de autocolantes em vinil brilho ou mate, corte à medida. Resistentes à água e UV.', 14.90, '/__l5e/assets-v1/9f6ca3b3-ee0a-4d66-b0da-5d500aa1e89a/cat-autocolantes.jpg', 'autocolantes', 'unit', true, true, true),
  ('bml-kit-corporativo', 'kit-boas-vindas-corporativo', 'Kit Boas-Vindas Corporativo', 'Bloco A5, caneca preta, tote e caneta — tudo com a sua marca.', 'Kit premium para novos colaboradores ou clientes VIP: bloco de notas A5 navy, caneca preta fosca 350ml, tote canvas e caneta metálica. Personalização incluída.', 39.90, '/__l5e/assets-v1/949bf519-3971-4ceb-bfaf-0c9a6975b337/cat-corporativo.jpg', 'corporativo', 'unit', true, true, true)
ON CONFLICT (id) DO UPDATE SET
  image = EXCLUDED.image,
  name = EXCLUDED.name,
  short_description = EXCLUDED.short_description,
  description = EXCLUDED.description,
  price = EXCLUDED.price,
  category = EXCLUDED.category,
  is_active = true,
  is_featured = true;

INSERT INTO public.banners (title, subtitle, image_url, position, display_order, is_active, overlay_opacity, overlay_color, badge_text, cta_text, cta_url, secondary_cta_text, secondary_cta_url, show_primary_cta, show_secondary_cta, show_side_image, media_type, duration_seconds)
VALUES (
  'Brindes que representam a sua marca.',
  'Personalização profissional em DTF, sublimação, bordados e serigrafia. Produção rápida com qualidade premium.',
  '/__l5e/assets-v1/35e3cf2f-94ed-4a5f-8023-88253cc06f3e/hero-banner.jpg',
  'hero', 1, true, 55, '#001A33',
  'PERSONALIZAMOS IDEIAS · FORTALECEMOS MARCAS',
  'Ver produtos', '/produtos',
  'Pedir orçamento', '/contatos',
  true, true, false, 'image', 8
);
