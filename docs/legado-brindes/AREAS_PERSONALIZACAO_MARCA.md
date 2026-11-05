# Áreas de personalização e nova marca

## Publicação sem acesso ao Supabase

1. No projeto Supabase ligado ao Lovable, abrir **SQL Editor** e executar o conteúdo completo de [`supabase/migrations/20260914090000_product_area_previews_brand.sql`](../supabase/migrations/20260914090000_product_area_previews_brand.sql). Não é necessária uma Edge Function para as áreas.
2. Publicar o commit do frontend depois de executar o SQL. A aplicação consulta `preview_image_url` e `observation_required`; se o código for publicado antes da migração, as áreas antigas continuam a abrir, mas o painel não poderá guardar os dois campos novos.
3. Confirmar que o domínio configurado para a loja serve `/brand-logo.png`, `/favicon.png` e `/personalization-areas/*.png`. A migração guarda caminhos relativos, de modo que a mesma marca funcione em pré-visualização e no domínio final.
4. As funções de email existentes leem a logo configurada no painel; se o envio de emails usar `visual_settings.logo_url`, configurar no painel um URL público **absoluto** da logo (por exemplo, o domínio final + `/brand-logo.png`) antes de publicar as funções. Os templates de fallback alterados neste commit só entram em produção quando forem novamente publicados no Supabase/Lovable. A migração por si só não publica Edge Functions.

## Modelo e decisões

- `product_print_areas` já relaciona cada área com `product_id`; foram acrescentados `preview_image_url` e `observation_required`. Nome (`label`), texto de apoio (`description`), imagem, ordem e preço permanecem por produto no painel **Editar produto → Personalização**.
- O campo **Observações** acompanha cada área escolhida no `design_data.customization.areas` do carrinho e do item da encomenda. É obrigatório apenas quando `observation_required=true`.
- Os adicionais continuam a usar `pricing_mode`, `base_price`, `price_per_cm2` e `min_price` existentes. O carrinho mantém o preço confirmado de cada personalização em vez de o recalcular pelo preço público. Personalizações diferentes não são fundidas na mesma linha.
- As imagens iniciais para t-shirt e caneca são referências visuais, não gabaritos de produção. O administrador pode substituí-las por fotografias reais de cada produto sem alterar código. O upload usa o bucket público `product-images` já utilizado no painel.
- Os dados iniciais são inseridos apenas nos produtos de exemplo `bml-tshirt-navy` e `bml-caneca-preta-350` quando `customizable=true`, sem apagar áreas existentes nem substituir preços ou dimensões. A migração acrescenta imagens às áreas antigas que ainda não tenham imagem e ajusta o nome/obrigatoriedade dos valores de demonstração originais com condições específicas. Outros produtos são configurados individualmente no painel.
- A logo PNG anexada foi copiada sem alteração para o site. O favicon usa a mesma arte completa; para melhor legibilidade em separadores pequenos, a marca poderá fornecer futuramente uma versão simplificada aprovada.

## Verificação manual

1. Abrir os dois produtos de exemplo e confirmar que o botão de personalização mostra as áreas e fotografias distintas. Num produto com `customizable=false`, o botão não deve aparecer.
2. Em **Editar produto → Personalização**, alterar texto, fotografia e preço de uma área da caneca; confirmar que a t-shirt não mudou. Criar uma área adicional e testar a sua ativação, ordem e remoção.
3. Escolher só **Meio das costas** da t-shirt, carregar arte, escrever observação e adicionar ao carrinho. Repetir com outra área/observação: devem surgir duas linhas, com os respetivos adicionais.
4. Escolher **Área personalizada** sem observação: o botão de confirmação deve permanecer desativado. Com observação, confirmar o valor e avançar.
5. Testar como convidado e como utilizador autenticado. O carrinho, o resumo do checkout e o pedido no painel devem manter o preço e as observações por área. Verificar também quantidade maior que um.
6. Rever header, rodapé, login administrativo, login de cliente e favicon em computador e telemóvel. Se o painel já tiver uma logo personalizada, a migração passa a nova marca; depois o administrador pode substituí-la em **Identidade Visual**.

## Limites e cautelas

- Não foi possível executar o SQL nem testar encomendas reais sem acesso ao Supabase. A validação de preços no servidor da encomenda continua a depender da arquitetura existente; o valor no `design_data` é um snapshot enviado pelo cliente. Para impedir manipulação deliberada de preços, uma futura etapa deve recalcular/validar os itens no servidor antes de aceitar o pedido.
- O editor atual guarda a arte do cliente em `design_data` como data URL. Isto já existia e pode aumentar muito o tamanho da linha do carrinho/pedido para ficheiros grandes; não foi alterado nesta entrega.
- O repositório novo não contém as alterações do ramo anterior `codex/catalog-customer-pricing`. Elas não foram copiadas automaticamente para evitar conflitos de arquitetura.
