-- LOJA 3D (PRINT3D) em base própria no VPS: acertos finais depois de todas as migrations herdadas.
--
-- 1. Buckets privados que o código usa mas que, na Supabase cloud, tinham sido criados à mão
--    no painel (nenhuma migration os criava): dtf-uploads (ficheiros de design das encomendas)
--    e payment-proofs (comprovativos de pagamento). As políticas já existem.
-- 2. Remove os dados de exemplo da loja antiga (Brindes M&L / Bom DTF): produtos, categorias,
--    banner, métodos de estampagem, tecidos, tamanhos de roupa, textos da página inicial,
--    depoimentos e números inventados, FAQ, guia de DTF e notificações de vendas falsas.
-- 3. store_settings com o nome PRINT3D e campos vazios (o Admin preenche); sai a marca antiga
--    (contacto +351, Cadaval, Instagram), o tema escuro por omissão e as taxas de câmbio de
--    exemplo (estavam invertidas: 1 BRL = 5,5 EUR). Sem taxa, o site mostra a moeda base (BRL)
--    até o Admin atualizar as taxas.
-- 4. Modelos de e-mail do Admin em português do Brasil, sem a marca antiga.
--
-- Não altera RLS, triggers nem regras de negócio. Seguro de repetir.

-- 1. Buckets ----------------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('dtf-uploads', 'dtf-uploads', false),
       ('payment-proofs', 'payment-proofs', false)
ON CONFLICT (id) DO NOTHING;

-- 2. Catálogo de exemplo da loja antiga -------------------------------------------------------
-- Linhas filhas primeiro (a maior parte já sai em cascata, mas assim fica explícito).
DELETE FROM public.product_print_area_technique_materials m
 USING public.product_print_area_techniques t, public.product_print_areas a
 WHERE m.area_technique_id = t.id AND t.print_area_id = a.id
   AND a.product_id IN ('dtf-textil', 'dtf-uv', 'bml-caneca-preta-350', 'bml-tshirt-navy',
                        'bml-tote-natural', 'bml-mochila-preta', 'bml-autocolantes-circulares',
                        'bml-kit-corporativo');

DELETE FROM public.product_print_area_techniques t
 USING public.product_print_areas a
 WHERE t.print_area_id = a.id
   AND a.product_id IN ('dtf-textil', 'dtf-uv', 'bml-caneca-preta-350', 'bml-tshirt-navy',
                        'bml-tote-natural', 'bml-mochila-preta', 'bml-autocolantes-circulares',
                        'bml-kit-corporativo');

DELETE FROM public.products
 WHERE id IN ('dtf-textil', 'dtf-uv', 'bml-caneca-preta-350', 'bml-tshirt-navy',
              'bml-tote-natural', 'bml-mochila-preta', 'bml-autocolantes-circulares',
              'bml-kit-corporativo');

DELETE FROM public.categories
 WHERE slug IN ('dtf-textil', 'dtf-uv', 'canecas', 't-shirts', 'sacos', 'mochilas',
                'autocolantes', 'corporativo');

-- Métodos de estampagem, tecidos e tamanhos de roupa (o Admin cria os da impressão 3D).
DELETE FROM public.print_methods
 WHERE key IN ('dtf', 'serigrafia', 'bordado', 'dtf_uv', 'sublimacao', 'gravacao_laser', 'vinil');

DELETE FROM public.material_tags
 WHERE slug IN ('algodao-100', 'algodao-155', 'algodao-165', 'algodao-180', 'poliester',
                'algodao-viscosa', 'canelado', 'felpa');

DELETE FROM public.size_presets
 WHERE name IN ('EU S-3XL', 'PP-GGG', 'Numeração 34-44', 'Numeração 36-46');

-- Banner, secções e textos da página inicial antiga.
DELETE FROM public.banners WHERE title = 'Brindes que representam a sua marca.';

DELETE FROM public.home_section_items
 WHERE section_key IN ('cta_production', 'features', 'testimonials', 'gallery');
DELETE FROM public.home_sections
 WHERE key IN ('cta_production', 'features', 'testimonials', 'gallery');

UPDATE public.home_product_sections
   SET subtitle = NULL
 WHERE key IN ('featured', 'ready_made', 'promo', 'bestsellers', 'low_stock');

-- Notificações de vendas inventadas (nomes e cidades de exemplo).
DELETE FROM public.sales_popup_config;

-- Guia de DTF e perguntas frequentes da loja antiga.
DELETE FROM public.usage_guide_faqs
 WHERE question IN ('Qual o DPI mínimo aceite?', 'Em que tecidos posso aplicar?',
                    'Posso reaproveitar transfers?', 'Qual o prazo de produção?');
DELETE FROM public.usage_guide_sections
 WHERE title IN ('Como funciona o DTF', 'Preparação do ficheiro', 'Aplicação do transfer');

DELETE FROM public.site_faqs
 WHERE question IN (
  'Como posso fazer uma encomenda na Brindes M&L?',
  'Existe quantidade mínima de encomenda?',
  'Posso alterar ou cancelar a minha encomenda?',
  'Que ficheiros posso enviar para personalizar os produtos?',
  'Como sei se a minha arte tem qualidade suficiente para imprimir?',
  'Posso personalizar várias áreas do mesmo produto?',
  'Que técnicas de personalização utilizam?',
  'Qual é o prazo de produção e envio?',
  'Fazem envios para as Ilhas e para o estrangeiro?',
  'Posso levantar a encomenda?',
  'Que métodos de pagamento aceitam?',
  'É seguro pagar no vosso site?',
  'Emitem fatura com NIF para empresas?',
  'Posso devolver um produto personalizado?',
  'O que fazer se o produto chegar com defeito?',
  'Fazem brindes corporativos e kits personalizados?',
  'Trabalham com revendedores e agências de publicidade?'
 );

-- Item de menu do guia de DTF (a rota /como-utilizar já redireciona para /faq).
DELETE FROM public.menu_items WHERE url = '/como-utilizar';

-- Horário de exemplo na retirada na loja (o Admin preenche o real).
UPDATE public.delivery_methods
   SET config = jsonb_set(config, '{opening_hours}', '""'::jsonb)
 WHERE type = 'pickup' AND config->>'opening_hours' = 'Seg-Sex 9h-18h, Sáb 9h-13h';

-- Textos visíveis sem travessão.
UPDATE public.payment_config
   SET details = jsonb_set(details, '{instrucoes}',
                           to_jsonb('Pagamento seguro via Viva Wallet: cartão, MB WAY ou Multibanco.'::text))
 WHERE type = 'viva' AND details->>'instrucoes' LIKE '%—%';

-- 3. store_settings ------------------------------------------------------------------------------
DELETE FROM public.store_settings
 WHERE key IN ('brand', 'shipping_dtf', 'theme_mode', 'benefits_config');

INSERT INTO public.store_settings (key, value) VALUES
  ('store_info', '{"name": "PRINT3D", "email": "", "phone": "", "nif": "", "address": "", "footer_text": ""}'::jsonb),
  ('seo_settings', '{"meta_title": "PRINT3D", "meta_description": "", "keywords": "", "favicon_url": ""}'::jsonb),
  ('currency_settings', '{"default": "BRL", "available": ["BRL", "EUR", "USD"], "rates": {}}'::jsonb),
  ('store_origin', '"BR"'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- 4. Modelos de e-mail (painel Admin) -------------------------------------------------------------
UPDATE public.email_templates AS t
   SET display_name = v.display_name, subject = v.subject, intro = v.intro
  FROM (VALUES
    ('order_new', 'Novo pedido', 'Recebemos seu pedido #{order_id}',
     'Recebemos seu pedido e já vamos começar a prepará-lo. Enviaremos novidades em breve.'),
    ('payment_pending', 'Pagamento pendente', 'Aguardando o pagamento do pedido #{order_id}',
     'Estamos aguardando a confirmação do pagamento do seu pedido. Assim que ele for confirmado, iniciamos a produção.'),
    ('payment_confirmed', 'Pagamento confirmado', 'Pagamento confirmado do pedido #{order_id}',
     'Recebemos seu pagamento. Vamos começar a preparar o seu pedido.'),
    ('order_shipped', 'Pedido enviado', 'Seu pedido #{order_id} está a caminho',
     'Seu pedido foi enviado. Você pode acompanhar a entrega com o código de rastreamento abaixo.'),
    ('account_created', 'Conta criada', 'Boas-vindas à PRINT3D',
     'Sua conta foi criada com sucesso. Você já pode acompanhar seus pedidos no painel.'),
    ('account_confirmation', 'Confirmação de e-mail', 'Confirme seu e-mail na PRINT3D',
     'Clique no botão para confirmar seu endereço de e-mail e ativar sua conta.')
  ) AS v(key, display_name, subject, intro)
 WHERE t.key = v.key;
