-- Moni Cakes: os dados iniciais herdados da loja-modelo ainda tinham o nome PRINT3D (título da aba, partilhas,
-- rodapé, selo do hero e modelos de e-mail). Troca só onde o texto ainda é o herdado: o que o dono já mudou no
-- Admin fica como está.

-- Nome da loja e título das páginas, só quando ainda são os do modelo.
UPDATE public.store_settings
   SET value = jsonb_set(value, '{name}', to_jsonb('Moni Cakes'::text)), updated_at = now()
 WHERE key = 'store_info' AND coalesce(value->>'name', '') IN ('', 'PRINT3D');

UPDATE public.store_settings
   SET value = jsonb_set(value, '{meta_title}', to_jsonb('Moni Cakes'::text)), updated_at = now()
 WHERE key = 'seo_settings' AND coalesce(value->>'meta_title', '') IN ('', 'PRINT3D');

-- Outros textos em store_settings que ainda citem o nome do modelo.
UPDATE public.store_settings
   SET value = replace(value::text, 'PRINT3D', 'Moni Cakes')::jsonb, updated_at = now()
 WHERE value::text LIKE '%PRINT3D%';

-- Modelos de e-mail.
UPDATE public.email_templates
   SET display_name = replace(display_name, 'PRINT3D', 'Moni Cakes'),
       subject      = replace(subject, 'PRINT3D', 'Moni Cakes'),
       intro        = replace(intro, 'PRINT3D', 'Moni Cakes'),
       from_name    = replace(from_name, 'PRINT3D', 'Moni Cakes')
 WHERE display_name LIKE '%PRINT3D%' OR subject LIKE '%PRINT3D%'
    OR intro LIKE '%PRINT3D%' OR from_name LIKE '%PRINT3D%';

-- E-mails de pedido: "produção" é de impressão 3D; numa confeitaria o pedido é preparado.
UPDATE public.email_templates
   SET intro = 'Estamos aguardando a confirmação do pagamento do seu pedido. Assim que ele for confirmado, começamos a preparar.'
 WHERE key = 'payment_pending'
   AND intro = 'Estamos aguardando a confirmação do pagamento do seu pedido. Assim que ele for confirmado, iniciamos a produção.';
