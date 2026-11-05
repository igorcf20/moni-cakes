# Pré-visualização 3D dos produtos personalizáveis

## Estado atual — suspensa em 16/09/2026

A visualização 3D está desativada por padrão na loja e no painel. O arquivo privado
está em https://github.com/igorcf20/brindeml-3d-system, com o código anterior à
suspensão, dependências, SQL e instruções de retomada. O envio de artes por área,
dimensões, observações, técnica, preços, carrinho e encomendas continuam ativos.
O tamanho da arte é ajustado no formulário de envio, sem controles de posição 3D.

Nenhuma tabela, modelo, objeto do Storage ou configuração de produto foi apagado.
Não há SQL novo para executar nem alteração na VPS. A consulta pública de modelos
não é feita com o recurso desligado. O gate de versão está em
`src/lib/product3DFeature.ts`: somente `VITE_ENABLE_PRODUCT_3D_PREVIEW=true` no
ambiente de build reativa a capacidade, após recompilar e testar. Configurações
individuais continuam pertencendo ao painel; o gate não é um preço ou dado de catálogo.

### Teste desta suspensão

- Abrir t-shirt/caneca personalizável: não existe aba 3D nem rotação de modelo.
- Enviar arte: miniatura, largura/altura e observação por área permanecem disponíveis.
- Ajustar dimensões: respeitar limite/proporção e atualizar preço por cm² quando configurado.
- Confirmar: nome da área, dimensões, observação e adicional permanecem no payload.
- Admin: nomes, imagens, técnicas, adicionais e observação continuam editáveis;
  cartões/separadores 3D ficam ocultos sem apagar os dados existentes.

O restante deste documento descreve a implementação arquivada, não a interface
atual. Há problemas de projeção relatados na versão arquivada; rever o guia de
restauração antes de habilitar novamente.

### Verificação executada

Build de produção e TypeScript (`tsconfig.app.json` e `tsconfig.node.json`) aprovados.
No navegador, a t-shirt foi testada com envio de imagem, observação opcional e
alteração de 30 × 30 para 20 × 20 cm; o adicional de 4,50 € manteve o total de
17,00 €. Não houve canvas 3D nem overflow horizontal a 390 px. Não foi criada
encomenda real nem alterado um produto no painel durante o teste.
O projeto não possui script de testes automatizados. O aviso legado de
`react-helmet` em StrictMode e o bundle principal grande já existiam e não foram
corrigidos nesta suspensão.

O visualizador usa um modelo 3D leve por tipo de produto. A t-shirt usa o modelo GLB
volumétrico incluído no projeto; caneca, saco, mochila, autocolante e caixa/kit usam
modelos procedurais otimizados. Não exige Edge Functions nem SQL para estes modelos
padrão. É uma representação comercial aproximada, não um ficheiro de produção.

## Configuração no painel

1. Abra **Admin → Produto → Personalização** e confirme que o produto é personalizável.
2. Para um produto semelhante a outro já preparado, utilize **Configuração rápida**:
   pesquise o produto de origem e clique em **Copiar configuração**. Modelo, GLB,
   áreas, fotografias, preços, observações e posições são copiados. O novo produto
   fica independente; alterações posteriores não modificam a origem.
3. Sem produto de origem, escolha o **Tipo de modelo** correspondente e a cor base.
   Pode usar o modelo incluído ou carregar um GLB próprio. Confirme na
   pré-visualização e guarde.
4. Crie ou edite as áreas do próprio produto. No separador de posição, use os
   presets ou **Clicar no modelo** para definir o ponto; ajuste a caixa e guarde.
5. Defina separadamente o nome, imagem da área, observação obrigatória e acréscimo.
   Estas opções continuam independentes por produto.
6. Use **Mostrar no modelo 3D** somente para áreas que tenham uma posição visual
   concreta. Quando desligada, a área continua disponível para ficheiro,
   dimensões, observações, acréscimo e encomenda, mas não tenta projetar a arte.

Antes de publicar esta versão, execute manualmente no SQL Editor do Supabase a
migration `supabase/migrations/20260915133000_area_3d_visibility.sql`. Ela cria a
opção `preview_enabled` sem eliminar configurações antigas e desliga a visualização
3D apenas da área personalizada de exemplo da T-shirt. Depois disso, cada produto
é controlado individualmente pelo painel.

O checklist no topo indica se o modelo foi guardado, quantas áreas estão ativas e
quais ainda precisam de fotografia ou revisão manual da posição. A opção
**Substituir configuração atual** exige confirmação; desligada, a cópia adiciona
somente áreas ausentes e preserva o modelo e as áreas já configurados.

Sem linha em `product_3d_models`, o visualizador mostra uma caixa genérica em vez
de atribuir uma t-shirt erradamente. A escolha correta deve ser guardada no painel.
Posições antigas com todos os valores zero usam âncoras seguras do tipo escolhido;
posições configuradas pelo administrador continuam a ter prioridade. Na t-shirt,
as posições, normais e tangentes comprimidas do GLB são convertidas para `Float32`
antes de aplicar a transformação do modelo. Isso evita deformações ao carregar uma
arte e preserva a iluminação necessária para mostrar corretamente cores claras e
escuras. A projeção usa profundidade limitada, suficiente para tocar a
face escolhida sem atravessar o tecido nem aparecer na face oposta. O teste de
profundidade oculta a arte quando a respetiva face não está visível, e a textura
das áreas traseiras é orientada sem espelhar textos. A rotação manual mantém a
T-shirt na vertical e limita a aproximação para preservar o enquadramento inteiro.

Durante a personalização, somente a arte da área ativa aparece no modelo. Isto
evita sobreposições confusas e permite conferir cada posição isoladamente. A caixa
azul representa o limite configurado pelo administrador; tamanho, deslocamento e
rotação ficam abaixo do modelo 3D e todos os movimentos são limitados à caixa. Os
atalhos de peito e manga usam o lado de quem veste a peça. A arte das costas não
recebe inversão adicional, portanto texto e logótipos permanecem legíveis.

No momento da confirmação, cada ficheiro recebe um nome legível no formato
`Nome da área — largura×altura cm.ext`. O nome original também é preservado nos
dados. O painel administrativo e o histórico da encomenda apresentam miniatura,
dimensões, observações e ligação para descarregar a arte.

## Modelo próprio opcional

Se precisar de um modelo mais fiel, execute manualmente
`supabase/migrations/20260915090000_product_3d_public_models.sql` no SQL Editor
do Lovable. Depois carregue um único ficheiro **GLB autocontido** (até 20 MB) no
painel e clique em **Guardar configuração 3D**. O URL público fica em
`product_3d_models.model_url`; nenhum segredo ou URL assinado com prazo é necessário.
O painel aceita apenas GLB porque GLTF e OBJ frequentemente dependem de ficheiros
de textura separados. Idealmente otimize o GLB para menos de 2 MB antes de enviar.

O modelo carregado é opcional. Se falhar, o visualizador usa o modelo padrão do
tipo escolhido. Para voltar ao padrão, use **Usar modelo simples** e guarde. O
interruptor **Modelo 3D carregado ativo** não altera a propriedade
`products.customizable` nem desliga as áreas de personalização.

## Verificação manual

- T-shirt: escolha frente, costas, peito esquerdo/direito e zona inferior;
  carregue artes diferentes em mais de uma área e verifique que cada uma aparece
  apenas quando estiver ativa, sem textos espelhados nas costas.
- Em cada área com 3D, tente aumentar e deslocar a arte até aos extremos. A imagem
  deve permanecer integralmente dentro da linha azul; confirme também os botões
  de toque, os campos de largura/altura e os controlos horizontal/vertical.
- Numa área com **Mostrar no modelo 3D** desligado, confirme que não aparece
  modelo, que o ficheiro aceita observação e que ambos chegam ao detalhe do pedido.
- Rode a T-shirt na horizontal e tente arrastar para cima/baixo e aproximar; o
  produto deve continuar vertical e inteiramente enquadrado.
- Troque entre variações claras e escuras antes de abrir a modal. O modelo deve
  usar a cor escolhida; no modelo padrão de T-shirt, o mapa escuro original é
  removido apenas da cor base, preservando relevo e rugosidade do tecido.
- Ao clicar em **Personalizar**, a variação, cor, tamanho, quantidade e respetivos
  acréscimos são guardados na sessão da modal. O modelo 3D e o item enviado ao
  carrinho devem conservar exatamente essa seleção até a modal ser fechada.
- Caneca: alterne frente/verso; rode o modelo e confirme que a imagem não
  atravessa a cerâmica.
- Saco, mochila, autocolante e caixa: confirme o tipo guardado no painel,
  carregue uma arte e abra a pré-visualização.
- Mude a variação de cor na página do produto antes de abrir a modal; a cor
  mostrada deve corresponder à variação que será adicionada ao carrinho.
- Teste no telemóvel o separador **Pré-visualização 3D**. Sem suporte WebGL,
  aparece a imagem alternativa configurada ou uma mensagem, sem impedir a compra.
