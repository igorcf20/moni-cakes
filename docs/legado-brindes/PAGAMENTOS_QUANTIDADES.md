# Pagamentos e quantidades por tamanho

## Arquitetura e compatibilidade

- Não há nova migration nem SQL a executar: são reutilizados `payment_config`, `product_sizes`, `product_variation_size_availability`, `cart_items` e `order_items`.
- A administração continua a consultar/escrever `payment_config` com a sessão do administrador e as políticas RLS existentes. O checkout mantém a consulta através de `get_active_payment_methods`; credenciais secretas continuam em `integration_credentials`.
- O painel permite criar os tipos que o schema e o checkout já suportam. Cada tipo é único no banco; tipos existentes deixam de aparecer no seletor. Novos métodos começam inativos e com dados vazios, sem sobrescrever configurações antigas.
- Viva Wallet não fica invisível: é apresentado um cartão que encaminha a configuração para Integrações. Esta alteração não implementa gateways novos nem certifica que uma integração financeira esteja pronta para receber pagamentos.
- Erros de leitura são apresentados com tentativa de recuperação. As gravações verificam a existência da linha devolvida para evitar sucesso falso em alterações rejeitadas. Ativar métodos manuais exige os campos básicos correspondentes.
- `SizeQuantitySelector` usa os tamanhos ativos reais e a matriz cor × tamanho. Ausência de linha na matriz mantém o fallback para stock e ajuste do tamanho do produto.
- Selecionar um tamanho cria quantidade 1; selecionar novamente ou usar Remover elimina somente esse tamanho. Trocar de produto/cor limpa a seleção para não transportar stock de outra combinação.
- Cada tamanho origina uma linha própria do carrinho. `prepareCartSelection` valida inteiros positivos seguros e preços finitos não negativos. `addSelectionAsync` faz uma única inserção SQL para utilizadores autenticados, ou uma única gravação local para visitantes; não há sucesso parcial silencioso.
- Produtos sem tamanhos mantêm quantidade única digitável. Produtos personalizáveis também recebem esse controlo. Produtos por metro e o configurador anterior permanecem fora desta adaptação.
- Em produtos não personalizados, `design_data.selectionPricing` regista base, acréscimo e proporção da promoção. O cálculo existente de escalões é mantido por linha/tamanho; os acréscimos são somados depois e não desaparecem no carrinho autenticado. Não se agregam escalões entre tamanhos diferentes.
- Na personalização, o total mostrado corresponde a todas as unidades: soma das bases por tamanho + adicional por unidade × quantidade total. Cada linha conserva o seu preço confirmado, como no fluxo anterior.
- As artes originais, SHA-256, bytes, pixels, centímetros, confirmação de ajuste/qualidade e observações opcionais são preservados integralmente em `design_data.customization.areas` de cada tamanho. O checkout já copia estes dados para os itens do pedido, apresentados pelo componente administrativo existente. Não há compressão nem alteração dos ficheiros.
- A pré-visualização 3D continua desativada.

## Como testar

1. Entrar como administrador e abrir Configurações de Pagamento. Mesmo sem registos deve aparecer Adicionar forma de pagamento.
2. Escolher um método ausente e adicionar. Confirmar que aparece inativo; preencher dados, ativar e guardar. Atualizar a página e confirmar persistência. O mesmo tipo não pode ser criado novamente.
3. Tentar ativar transferência sem IBAN/titular ou MB WAY sem número: deve aparecer erro útil. Confirmar que o checkout apresenta só métodos efetivamente guardados como ativos.
4. Abrir uma t-shirt, selecionar M e XL: surgem dois campos com 1 unidade. Alterar M para 3; XL deve continuar em 1. Remover/reselecionar XL e confirmar retorno a 1.
5. Confirmar os acréscimos específicos da cor/tamanho configurados no painel e tentar exceder o stock. A compra não deve avançar com seleção inválida ou consultas de stock ainda pendentes/com erro.
6. No produto não personalizável, adicionar tamanhos e verificar duas linhas, quantidades, preços e total no carrinho. Repetir pelo Ver rápido.
7. No produto personalizável, selecionar tamanhos, enviar arte, definir medidas e confirmar ajuste/qualidade. Incluir observações. Verificar as linhas separadas, os ficheiros originais e as medidas no carrinho; numa encomenda de teste autenticada, confirmar os mesmos dados no painel administrativo.
8. Num produto sem tamanhos, digitar a quantidade e confirmar persistência no carrinho.
9. Repetir em telemóvel e desktop, incluindo seleção e remoção por teclado.

## Verificação executada

- `node scripts/test-cart-selection.mjs`: quantidades/preços por tamanho, total, fidelidade de artes/observações e rejeição de valores inválidos.
- `node scripts/test-artwork-sizing.mjs`: regressão de medidas, proporção, densidade, qualidade e consentimento.
- TypeScript nas configurações app e node; build de produção.
- Navegador local: seleção M/XL com valores 1, edição independente, resumo de 4 unidades; interface sem overflow horizontal a 390 px. Pagamentos testados com banco simulado isolado em desktop e a 375 px: criação inativa e bloqueio de ativação sem dados. O ambiente simulado não é publicado.
- Não foi efetuada transação real, gravação de dados bancários reais nem encomenda autenticada real. RLS e passagem ao pedido foram revistas no código; o teste autenticado com a conta da loja continua necessário.

## Problemas anteriores identificados

- O painel só editava métodos existentes; tabela vazia ou registos Viva sem cartão resultavam em área vazia.
- Não havia quantidade para produtos personalizáveis, nem seleção independente de tamanhos.
- O carrinho autenticado de produtos comuns recalculava a base sem os acréscimos confirmados de tamanho/cor. O novo fluxo corrige isso para seleções novas; itens antigos sem `selectionPricing` mantêm o comportamento legado.
- Avisos já existentes de bundle grande, importação estática/dinâmica de `pdf-lib` e `react-helmet` em StrictMode não impedem o build.
- Artes muito grandes continuam sujeitas à capacidade de localStorage para visitantes. A falha não fecha a personalização nem comunica sucesso. Checkout de visitante continua desativado conforme a política existente.

## Ficheiros alterados

- `src/components/admin/AdminPaymentConfig.tsx`
- `src/components/SizeQuantitySelector.tsx`
- `src/components/QuantitySelector.tsx`
- `src/components/VariationSelector.tsx`
- `src/components/QuickViewModal.tsx`
- `src/components/customizer/MultiAreaCustomizer.tsx`
- `src/pages/ProductDetail.tsx`
- `src/hooks/useCart.tsx`
- `src/lib/cartSelection.ts`
- `scripts/test-cart-selection.mjs`
- este documento
