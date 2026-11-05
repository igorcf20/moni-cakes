# Histórico de mudanças

A loja PRINT3D (repositório `igorcf20/loja3d`) nasceu como cópia sem histórico do código da Brindes M&L,
loja portuguesa de brindes personalizados feita no Lovable com Supabase. O código copiado é o da Brindes M&L
em 2 de outubro de 2026 (as migrations mais recentes da cópia são as `20261002...`) e entrou neste
repositório no commit `84a87ac`, em 4 de outubro de 2026, sem `.git`, `.env` e `bun.lockb`. Desde então a
loja deixou de ser de brindes de Portugal e virou uma loja de impressão 3D multi-país, com o Brasil como
padrão. Começou como "Loja 3D Brasil" e no mesmo dia passou a multi-país. O visual passou por um primeiro
modelo creme e dourado (3D Store) até chegar à identidade PRINT3D (laranja e creme, fonte Inter, logo do
cubo com P). O site ganhou o Orçamento 3D (STL, OBJ e 3MF), o personalizador de chaveiro e placa de nome,
uma página de produto e listagens novas. Moeda, impostos, documento fiscal, endereço e textos legais passaram
a seguir o país escolhido, e o site ficou em 4 idiomas (pt-BR, pt-PT, inglês e espanhol). A prova social
inventada e a marca antiga saíram. O backend deixou a Supabase e o Lovable e passou a rodar num servidor
próprio (VPS) em Docker, com migrations automáticas, publicação a cada push no `main` e cópias de segurança
diárias. O que ainda vem da loja antiga (painel Admin só em português, Viva Wallet, frete do servidor só com
zonas de Portugal, e-mails desligados) está em "Pendências" no `CLAUDE.md`.

Como ler: datas como o git as registra, em UTC (no horário de Brasília são 3 horas a menos, então os commits
de 5 de outubro até as 03:00 UTC aconteceram na noite de 4 de outubro em Brasília). Dentro de cada dia, as
entradas estão por área e, dentro da área, da mais recente para a mais antiga. Um commit que mexeu em várias
áreas aparece em cada uma delas com o mesmo hash. Para ver os detalhes: `git show <hash>`.

## 5 de novembro de 2026

- Área do cliente renovada e configurável em Admin > Aparência da loja > Área do cliente (`store_settings.account_page`, `src/lib/accountPage.ts`, modelos Recomendado e Clássico): saudação compacta com o nome em Inter (sem título gigante em serifa) e "Cliente desde", menu curto com números (pedidos em andamento, favoritos, endereços), faixa de números no Resumo, aviso de conta pronta que some a 100%, blocos do Resumo ligáveis, itens do pedido em lista com nome, quantidade e preço, "Comprar tudo de novo" nos pedidos entregues, ordenar e filtrar favoritos em promoção, cartão "Precisa de ajuda?". Nomes nos cartões de produto em Inter. Teste `scripts/test-account-page.mjs`.

## 3 de novembro de 2026

- Protótipo Conbini: mais banners reais na página inicial (Sanrio, Model Kits, Descontos até 60%, Compra online e levanta em loja), ecrã de carregamento com o Bini do conbini.pt a pulsar dentro de um anel a rodar (`Loader.tsx`; o site deles não tem loader, só usa o Bini nas fotos em falta), banner em vídeo de portes grátis do site deles ao lado dos descontos, o Bini com o carrinho a saltar do cartão ao adicionar, secções que aparecem ao rolar e brilho nos banners ao passar o rato; tudo respeita "reduzir movimento".

- Página `/prototipos` com a lista dos protótipos de clientes (Conbini e Oculista Carioca): capa, ramo, local, resumo, o que se pode ver, botões Abrir protótipo e Copiar link. Página interna fora do `StoreShell`, sem ligação na loja, com `noindex` e `Disallow: /prototipo` no `robots.txt`. Dados num só ficheiro, `src/prototipos/lista.ts`; capas em `public/prototipos/capas/`.
- Protótipo Conbini (pedidos do dono): o banner do carrossel ocupa a largura toda, sem a faixa roxa que tapava a imagem, só com um degradê escuro suave atrás do título e do texto; categorias da página inicial com borda fina de 2px só em cima e dos lados e o nome numa faixa própria por baixo da foto.

## 2 de novembro de 2026

- Protótipo de apresentação da Conbini (cliente, loja de cultura japonesa em Lisboa) em `/prototipo/conbini`, refeito pela imagem de referência do dono: barra roxa de vantagens, cabeçalho escuro com o logótipo real, pesquisa, menu Categorias e Novidades, Pré-Reservas, Promoções, Mais Vendidos; carrossel com os banners reais, faixa de vantagens, 8 categorias, filas de Novidades em loja, Mais vendidos e Pré-reservas, blocos de Pré-reservas e Promoções, visita à loja com fotografias. Catálogo real de conbini.pt (52 produtos com foto, preço e disponibilidade da data de recolha, em `public/prototipos/conbini/`, gerado para `catalog.ts`). Filtros na URL, produto com levantamento ou entrega, carrinho com portes grátis acima de 90 €; nada é gravado. Notas em `docs/prototipos/conbini/README.md`.

## 28 de outubro de 2026

- Protótipo de apresentação da Oculista Carioca (cliente) em `/prototipo/oculista-carioca`: home editorial, catálogos de óculos de grau, de sol e lentes de contacto com filtros, pesquisa, páginas de produto com cor, lente, tamanho e embalagem, carrinho e marcação de consulta simulados. Área isolada da loja (tema, cabeçalho, rodapé e estado próprios; não lê nem grava na base). Briefing do cliente em `docs/prototipos/oculista-carioca/briefing/`.
- Oculista Carioca: as armações desenhadas em SVG foram trocadas por fotografias reais de óculos e de pessoas a usá-los (Unsplash, licença Unsplash; créditos em `public/prototipos/oculista-carioca/fotos/CREDITOS.md`). Uma foto por produto; ao escolher outra cor aparece o aviso de que a foto é de outra versão. Lentes de contacto mantêm a ilustração da caixa.

## 26 de outubro de 2026

- Catálogo e categorias v2: cabeçalho compacto (título em serifa moderada, contagem simples, descrição só no computador; na categoria, miniatura ao lado do título em vez do banner que ocupava a tela do celular), produtos já na primeira tela do celular, cartão novo "Foto e texto" (`ProductCardClean`: nome em Inter e preço abaixo da foto), 4 por linha no computador, sem o selo Destaque por padrão, rótulo Filtros discreto, estados vazios menores. Tudo em Admin > Aparência da loja > Página de catálogo (`store_settings.catalog_page`, `src/lib/catalogPage.ts`), com modelos Recomendado e Clássico (= como era), filtros em coluna ou botão, prévia e dicas.

- Carrinho e checkout mais curtos: no checkout, as etapas já preenchidas (contato, entrega, endereço, faturamento) viram uma linha com Alterar num só cartão e cada etapa aberta tem Continuar; barra fixa no celular com o total e um botão que leva ao que falta ou finaliza; topo curto no celular; títulos das etapas em Inter e títulos de página em serifa menor; cupom atrás de "Tem um cupom de desconto?"; CPF ou CNPJ dentro da etapa Faturamento sem cartão em maiúsculas; itens do carrinho mais baixos no celular. Tudo em Admin > Pagamentos e entrega > Carrinho e checkout (`store_settings.checkout_page`, `src/lib/checkoutPage.ts`, modelos Recomendado e Clássico). Teste `scripts/test-checkout-page.mjs`.

- Página do produto v2: quantidade ao lado de Adicionar ao carrinho, Favoritar e Comparar lado a lado, linha de disponibilidade (Em estoque, Últimas unidades, Feito sob encomenda), botão Compartilhar, ficha rápida sem cortes, garantias da compra em cartão (produção, envio, devolução pelo prazo de Devoluções, compra segura, meios de pagamento), descrição e ficha técnica lado a lado com avaliações numa seção própria, barra de compra fixa também no computador e foto na barra do celular. Tudo ligável em Admin > Aparência da loja > Página do produto (`store_settings.product_page`, modelos Recomendado e Clássico). Letras mais contidas: nome dos cartões de produto em Inter, títulos de seção em serifa menores e `font-size-adjust` 0,46.

- Cartões de produto premium: a foto ocupa o cartão todo (3:4 no celular, 4:5 no computador), nome em serifa, preço e carrinho por cima de um degradê escuro; selos Promoção (com o percentual), Novo e Destaque (`products.is_featured`, no máximo dois; a vitrine Destaques não repete o selo). Grelhas com espaçamento igual nas duas direções.

- Página inicial: seções separadas por faixas de fundo (categorias e PLA em grafite, garantias e Crie sua peça em terracota suave, história e avaliações em branco, inspirações em bege; vitrines alternam branco e creme). Categorias ganham título visível.

- Página inicial: fotos de ambiente geradas com IA (Canva) no hero, nas categorias e na história; as páginas de produto mantêm as fotos reais.

### Redesenho editorial, terceira rodada (página inicial mais premium)
- Página inicial: hero mais alto com título grande em caixa alta e foto até a borda; categorias em blocos verticais altos
  (3:4) quase de ponta a ponta, sem cantos; títulos de seção editoriais grandes com ponto terracota; blocos Crie sua peça,
  PLA e Como funciona refeitos sem caixas; tom quente comum nas fotos da página inicial (classe `photo-warm`).

### Redesenho editorial, segunda rodada (mais perto da imagem de referência)
- Logo, ícone da aba e ícones do app passam do laranja antigo para o terracota (mesmo desenho, só a cor).
- Página inicial: foto do topo nítida (luminária acesa, CC0) ocupando a direita até a borda, categorias de ponta a ponta com
  cantos discretos e "Mais categorias" em links, bloco História com fotos novas (dragões e aparador colmeia, CC0), vitrines em 4 colunas.
- Cartão de produto mais limpo (preço logo abaixo do nome, ícones menores, foto com cantos de 8px). Catálogo: banner em duas partes
  (texto em grafite e foto ao lado, sem esticar a foto), filtros sem caixa, 3 colunas (4 em telas muito largas).
  Carrinho: itens num só painel com divisórias; resumo e frete grátis sem sombra.

### Redesenho editorial (kit PRINT3D), fases 3 a 5
- Catálogo: banner da categoria com foto e título por cima (sem foto, divisão com a arte de camadas), chips neutros,
  ordenação em pílula, barra lateral de filtros sem caixa, grelha com mais ar; barras presas ao topo a 100px (cabeçalho de 76px).
- Página do produto: título em serifa maior, preço mais leve, especificações rápidas sem borda, vantagens numa lista de
  ícones em duas colunas, botões em pílula (comprar, favoritos, comparar). Carrinho e gaveta: linhas sem caixa, resumo
  sem borda, quantidade em pílula. Botões principais da loja em `rounded-full`, sem brilho (`--shadow-glow-orange: none`).
- Admin: barra lateral grafite presa ao topo (`.admin-sidebar`, `AdminNav tone="dark"`) com a marca da loja, menu em
  acordeão e botão para recolher só aos ícones (escolha em `admin-sidebar` neste navegador); barra do topo com a seção
  atual, busca de seções do painel e sino com o que espera o administrador (os mesmos contadores do menu); o corpo da
  página recebe `admin-ui` enquanto o Admin está aberto, para portais e o cartão Primeiros passos ficarem em Inter.

### Redesenho editorial (kit PRINT3D), fases 1 e 2
- Fundações: tema PRINT3D passa a terracota `#D2461E` (o `#D84A20` do kit, um pouco mais escuro para o texto branco dos
  botões passar no AA), creme, grafite e títulos h1/h2 da loja em Cormorant Garamond (`@fontsource-variable/cormorant-garamond`,
  fonte nova no Admin > Marca e visual); o laranja antigo fica como modelo "PRINT3D clássico". O Admin continua em Inter
  (classe `admin-ui` no `AdminShell` e no login). Peso e x-height da serifa por `--heading-weight` e `font-size-adjust`.
- Cabeçalho de uma linha (logo, Categorias com o mega menu, 3 ou 4 categorias, Ofertas, busca, país, conta, favoritos,
  carrinho); busca em campo estreito a partir de 1536px e por baixo do topo abaixo disso.
- Página inicial: topo editorial (frase pequena, título em maiúsculas com ponto na cor da marca, botão em pílula, três
  vantagens e frase vertical editáveis), foto encostada à borda direita; quatro categorias em fotos grandes (as outras
  em botões); seção nova História da marca (texto, botão para Sobre, duas fotos e cartão; editável no Admin, fotos
  `public/images/story-*.webp`); barra de garantias discreta; vitrines e banners com títulos em serifa.
- Cartões de produto sem caixa: foto com cantos de 14px e zoom leve, selos em pílula, botão do carrinho redondo de contorno.
- Capturas antes e depois em `/mnt/project-files/redesign/`.

## 25 de outubro de 2026

### Catálogo inicial com fotos reais e banners

- Página inicial mais limpa: as vitrines (Mais vendidos, Novidades, categoria em destaque) mostram primeiro o que ainda não apareceu, e Mais vendidos só aparece com vendas reais; selo "Novo" (antes "Novidades") em 5 produtos em vez de 13; o vaso de estúdio sai dos destaques; banners com véu mais escuro para o texto ler bem em qualquer foto; bloco Crie sua peça com uma prévia do chaveiro (cor e texto) no lugar da etiqueta solta.
- Topo da página inicial sem o vaso 3D genérico: foto real dos dragões articulados impressos (modelo CC0), com o Dragão Articulado no cartão Peça em destaque (o vaso de exemplo passa para o fim dos destaques). A seção de materiais (PLA) também ganhou foto real (torres de dados, CC0) em vez do vaso.
- 21 produtos populares de impressão 3D (luminárias, vasos, dragão e Flexi Rex articulados, torre de dados, suportes de celular, fone, controle e relógio, organizadores, porta-copos, saboneteira) com fotos reais das peças impressas e, em 18 deles, o modelo 3D para girar na galeria. Modelos e fotos da Printables com licença CC0, CC BY 4.0 ou CC BY-SA 4.0; crédito do autor e da licença no fim de cada descrição; lista e itens recusados em `docs/CREDITOS-CATALOGO.md`. Preços e estoque são ponto de partida para o dono ajustar (migration `20261025180000_catalogo_inicial.sql`).
- Página inicial: 3 banners de campanha (dragões, luminárias, mesa organizada) e fotos reais nos cartões de categoria e nas inspirações (`src/lib/media.ts`), só com fotos CC0.
- Banners em 4 idiomas: coluna `banners.texts_i18n` e, no Admin > Banners, a parte "Textos em outros idiomas" (campo vazio usa o texto principal).

## 8 de outubro de 2026

### Esgotado não entra no carrinho

- O carrinho confere o estoque antes de gravar (`useCart`, RPC `cart_stock_check` sem reservar): produto esgotado ou acima do que resta não entra, com aviso. Vale para cartões, página do produto, kits e sugestões.
- Cartões de produto: skeleton no botão até saber o estoque; esgotado mostra a etiqueta "Esgotado" e o botão leva à página do produto (`useCardStock`).
- Página do produto: botão de compra e barra fixa do celular em skeleton enquanto o estoque carrega (antes mostrava "Adicionar" e depois virava "Esgotado").
- Rodapé: o campo de e-mail da newsletter tinha encolhido no celular; agora tem 52 px de altura, como o botão.

### Financeiro no Admin

- Admin > Visão geral > Financeiro (recurso `finance`, ligado; `AdminFinance` + `admin/finance/*`, textos `adminFinance.ts` nos 4 idiomas): painel com faturamento, impostos, frete, taxas dos meios de pagamento, custo dos produtos, comissões, descontos, despesas lançadas, lucro líquido, margem e ticket médio, comparação com o período anterior ou o mesmo período do ano passado, gráfico de faturamento x custos x lucro, "para onde vai o dinheiro", divisão por meio de pagamento, país, categoria, despesas, melhores clientes e produtos, fluxo de caixa por mês, meta do mês e lista de pedidos, com filtros (período, situação, meio, país, produto, categoria, cliente) na URL e planilhas CSV.
- Lançamentos manuais de despesas e outras entradas (`finance_entries`, valor em centavos com moeda, convertido pela taxa de Moedas e câmbio; pago ou a pagar com vencimento; repetir todo mês), categorias (`finance_categories`, 14 padrão) e regras das contas (`finance_settings`, só Admin: data que conta, % do frete que é custo, imposto estimado, taxas por meio, comissões de afiliados, meta). Migration `20261008163000_finance.sql`; contas puras em `src/lib/finance.ts`, teste `scripts/test-finance.mjs`. Os pedidos e o estoque continuam a ser gravados como antes.

### Impressão de pedidos e etiqueta de envio

- Admin > Pedidos > Impressão de pedidos (recurso `order_printing`, ligado; `AdminOrderPrinting`, `src/lib/orderPrint.ts`, `src/hooks/useOrderPrint.ts`, textos `src/i18n/orderPrint.ts`): fila "para imprimir" (RPC `admin_print_queue`, migration `20261008143700_order_prints.sql`, tabela `order_prints`), impressão em lote, folha do pedido (A4, A5 ou bobina 80 mm, código de barras, caixas de conferência), etiqueta de envio estilo Correios (10 x 15, 10 x 10 ou 4 por A4, CEP, pedido e rastreio em código de barras, remetente) e declaração de conteúdo; o que aparece em cada um, remetente, regras da fila, passar para Em preparação e impressão automática configuráveis. Página do pedido (bloco Imprimir, `OrderPrintButtons`) e lista de pedidos (Imprimir nos selecionados). Saiu a etiqueta antiga (`ShippingLabel`). Código de barras em `src/lib/barcode.ts` (Code 128 e EAN-13). Testes `scripts/test-order-print.mjs` e `scripts/test-barcode.mjs`.

### Código de barras: entradas, conferência e etiquetas

- Entradas e conferência (recurso `barcode_stock`, Admin > Estoque > Entradas e conferência, `AdminStockEntries`): ler o código de barras com leitor USB, câmera do celular (BarcodeDetector) ou digitando SKU, GTIN, código interno ou nome; tipos entrada de mercadoria (soma), contagem (o estoque passa a ser o contado, com diferenças), perda ou avaria e outro ajuste; cada leitura soma na linha, fornecedor, documento e nota; grava tudo numa transação pela RPC `admin_stock_entry` (migration `20261008145000_barcode_stock.sql`: `stock_entries`, `stock_movements.entry_id`, `_admin_stock_apply`, `admin_stock_entries`, `admin_stock_entry_lines`). Lista e página de cada entrada; o Histórico de estoque mostra "Entrada nº N".
- Etiquetas de código de barras (recurso `barcode_labels`, Admin > Estoque > Etiquetas de código de barras, `AdminBarcodeLabels`): rolos 30x20 a 100x50 mm, folhas A4 e Carta ou medida própria; campos nome, cor e tamanho, preço, código, barras e loja; código GTIN (EAN-13), SKU ou interno (Code 128); cópias = estoque, pular posições da folha, prévia e impressão pelo navegador; padrão guardado em `store_settings.barcode_labels`. Atalhos a partir de uma entrada gravada e da página de números do produto. Regras `src/lib/productLabels.ts`, `src/lib/stockEntries.ts`, `src/lib/barcode.ts`. Testes `scripts/test-barcode.mjs` e `scripts/test-barcode-stock.mjs`.

### Página do produto: Pix, parcelas, códigos, frete e perguntas

- "Ver parcelas" refeito: cartão que abre com animação, resumo "até Nx de R$ ..." e lista alinhada (parcela, valor, selo "sem juros" em verde; com juros mostra o total). Texto `table_summary` nos 4 idiomas.
- Exibição de preços (recurso `price_display`, Admin > Pagamentos e entrega > Exibição de preços, `AdminPriceDisplay`): preço no Pix (ou outro meio com desconto) e parcelamento sem e com juros (máximo, sem juros até, juros ao mês, parcela mínima, países, tabela "Ver parcelas"), com o valor em destaque escolhido por lugar (cartões, página do produto, barra do celular, carrinho, checkout) e estilo completo ou discreto; modelos prontos e prévia. O desconto vem de `payment_config.discount_percent` do meio (o mesmo que o `create-order` cobra); sem o meio ativo no país, a linha some. Regras `src/lib/priceDisplay.ts`, peças `src/components/price/SmartPrice.tsx`. Teste `scripts/test-price-display.mjs`.
- Códigos do produto: `products.internal_code` (único na loja) e `products.mpn` (código da marca), migration `20261008110000_product_codes.sql`; Admin > Catálogo > Códigos do produto (`AdminProductCodes`) escolhe onde o cliente vê SKU, código interno, código da marca e GTIN (linha discreta, aba Especificações, os dois ou nenhum). O feed usa o código da marca como `mpn`.
- Calcular frete e prazo pelo CEP na página do produto (recurso `shipping_estimate`, `ShippingEstimate`, função `shipping-quote`), configurável em Frete e entrega > Calculadora no site.
- Perguntas e respostas no produto (recurso `product_questions`, migration `20261008120000_product_questions.sql`): cliente com conta pergunta pela RPC `ask_product_question`, o site lê `product_questions_public`; Admin > Clientes > Perguntas dos clientes (`AdminProductQuestions`) responde, publica, recusa e escolhe seção aberta ou discreta. Teste `scripts/test-product-questions.mjs`.
- Dados estruturados do produto: `mpn`, vendedor, `priceValidUntil` da promoção e política de devolução da loja.
### Pop-ups de captação montados no Admin

- Admin > Aparência da loja > Pop-ups de captação (recurso `lead_popups`, ligado; `AdminPopups`, `admin/popups/*`): vários pop-ups, cada um montado arrastando textos, imagens, formas, campos (e-mail, WhatsApp, nome, pergunta livre), caixa de aceite, botões e cupom sobre uma imagem de fundo, no tamanho que quiser; posições próprias no celular ("Arrumar sozinho", "Copiar do computador"), passo "Depois de enviar", desfazer e refazer, linhas de alinhamento, atalhos de teclado, textos nos 4 idiomas, "Ajustar à imagem" (afasta as peças que ficariam por cima), prévia "Ver na tela" e "Testar na loja" (`?popup_preview=`). Cinco modelos para começar; o Lista VIP reaproveita os textos e o cupom do antigo Modal VIP.
- Quando e onde aparece: centro, cantos, base ou topo (modo discreto ou em destaque), fundo escuro e desfoque, animação, botão lateral para reabrir, tempo, rolagem, intenção de sair, páginas (todas, início, produtos, catálogo, lista própria, nunca em), aparelhos, com ou sem conta, frequência, países, idiomas, datas e prioridade (`src/lib/leadPopups.ts`, `LeadPopups` na loja).
- Contatos recebidos com busca, filtro por pop-up, planilha e apagar; números de exibições, contatos e conversão. Banco: migration `20261008100000_lead_popups.sql` (`lead_popups`, `popup_leads`, RPCs `site_popups`, `popup_seen`, `submit_popup_lead` com conferência dos campos, limite de tentativas e cupom só depois de enviar; e-mail entra na newsletter só com aceite). Teste `scripts/test-lead-popups.mjs`.
- O antigo Modal VIP (Avisos e pop-up) nunca aparecia na loja: o `NewsletterPopup` não estava ligado em lugar nenhum e foi apagado; o cartão agora leva aos pop-ups novos. Avisos e pop-up também deixou de quebrar quando o registo gravado não tinha todos os blocos.

### Menu de categorias com destaques

- Todas as categorias (`MegaMenu`) ganhou uma linha "Em destaque" com banners das categorias (`CategoryBanner`: foto da categoria do Admin > Categorias com o nome por cima; sem foto, gradiente da marca com o ícone). No celular, faixa de banners que desliza acima da lista (`MobileMenu`).
- Admin > Categorias > Menu de categorias (`store_settings.mega_menu`, `src/lib/megaMenu.ts`, `admin/categories/MegaMenuSettings`): destaques automáticos (quantos), escolhidos à mão (até 4, com ordem) ou nenhum, texto no banner, faixa no celular, cartão de novidades e links rápidos, com prévia. Teste `scripts/test-mega-menu.mjs`.

### Kits e comparação configuráveis

- Admin > Kits > Onde oferecer (`store_settings.kits`, `KitOfferSettings`): liga e desliga o aviso na página do produto (e quantos kits), "Complete o kit" e "Leve o kit" no carrinho, os mesmos avisos no carrinho lateral e no checkout (desligados por padrão) e o link no rodapé; resumo no topo da lista de kits.
- Admin > Catálogo > Comparar produtos (`store_settings.compare`, `AdminCompare`): estilo Em destaque ou Discreto, botão no cartão (ícone abaixo do coração, ícone pequeno ao lado do coração, texto abaixo do preço ou nada), na página do produto (botão, link simples ou nada) e barra completa ou compacta, com prévia. Desligar de vez continua em Recursos da loja.
- Seção de kits da página inicial refeita (`HomeKits`): dentro da grelha da loja, kit em destaque com peças, preço e economia, outros kits ao lado; capa com a foto do kit ou montagem das peças (`KitCover`, também na lista `/kits`).

## 7 de outubro de 2026

### Kits completos e comparação de produtos

- Kits: página própria `/kit/<slug>` (galeria, destaques, o que vem no kit, cor e tamanho de cada peça, descrição completa, outros kits), aviso "Este produto faz parte de um kit" na página do produto, bloco Kits com desconto na página inicial (seção `kits`), "Complete o kit" e "Leve o kit" no carrinho, lista `/kits` com link para cada kit. Migration `20261008020000_kit_pages.sql`: endereço, textos por idioma, descrição longa, destaques, galeria, período de validade (também no servidor), SEO, nota e ordem das peças, `admin_kit_stats`.
- Admin > Kits refeito em páginas próprias: lista com números de venda (kits vendidos, receita, desconto dado) e estado (ativo, agendado, encerrado, indisponível), página de edição com básico, desconto com prévia, peças com nota e ordem, página do kit, traduções, SEO.
- Comparar produtos (recurso `compare`, Catálogo, ligado): botão no cartão e na página do produto, barra com os escolhidos (até 4) e página `/comparar` com preço, avaliação, disponibilidade, marca, categoria, cores, tamanhos e especificações, com "Mostrar só diferenças".

### Pedido de avaliação, ícones de pagamento, Admin traduzido e kits

- Conta do cliente: bloco "Você tem N pedidos entregues para avaliar" no Resumo e em Pedidos (`ReviewReminder`), com até 3 pedidos e o botão Avaliar. E-mail de avaliação preparado: cada pedido entregue entra em `review_requests` (trigger `orders_review_request`, prazo `review_settings.request_after_days`, padrão 3 dias); Admin > Avaliações liga ou desliga e mostra quantos esperam; o envio sai quando houver remetente (`review_requests_due`, `review_request_mark`, modelo `review-request`).
- Ícones dos meios de pagamento ativos e válidos para o país no rodapé e no checkout (`PaymentMethods`), agora desenhados na própria página (pacote `simple-icons`), sem pedidos a sites de terceiros.
- Admin: Kits, Tamanhos e Módulos extras em 4 idiomas, com explicação e dica em cada campo (`src/i18n/adminLegacy.ts`); erros dos tamanhos com códigos estáveis.
- Kits: recurso `kits` (Vendas, ligado) que também desliga o desconto no servidor; link Kits com desconto no rodapé; na página Kits, peça esgotada ou fora de venda mostra Esgotado e bloqueia o kit; carrinho mostra se o desconto do kit está ativo ou o que falta; a lista do Admin contava sempre 0 peças (corrigido).

### Avaliações e país de entrega

- Página `/avaliacoes` (recurso `store_reviews`, ligado, categoria Conteúdo): avaliações aprovadas da loja e dos produtos em duas abas, com nota média, barras por estrelas, nome abreviado do cliente, selo Compra verificada, resposta da loja, link para o produto, "Ver mais" e botão Avaliar a loja; link Avaliações no rodapé. Leitura pela função `store_reviews_public` (migration `20261008000000_store_reviews_page.sql`, só colunas seguras), porque os visitantes não liam a vista `home_section_items_public`. Teste `scripts/test-store-reviews.mjs`.
- Checkout: a etapa Endereço mostra a bandeira e o seletor do país de entrega (o mesmo do topo, só países ativos), e cada endereço de outro país ativo tem "Entregar neste endereço", que troca o país (moeda, impostos, frete e pagamento) e escolhe o endereço.

### Abas do produto no Admin

- As partes da página do produto ficam num só cartão em dois níveis: em cima os 4 grupos (Básico, Opções e estoque, Preço e venda, Entrega e mais), com ícone, número de partes e dica (2 x 2 no celular, lado a lado do tablet em diante); embaixo as partes do grupo aberto, como abas com sublinhado laranja (rodam para o lado no celular), cada uma com dica; no rodapé, a explicação da parte aberta e onde ela grava (Grava sozinha ou Grava com Gravar produto). Todo bloco tem o botão de dica (i), que abre ao passar o mouse, focar ou tocar. `ProductSectionNav`, `HelpTip`, textos `adminProductNav.ts` nos 4 idiomas. Teste `scripts/test-product-nav.mjs`.

### Pré-venda

- Recurso `preorders` (Vendas, ligado por padrão): aba Pré-venda na página do produto no Admin (ligar, data de lançamento, limite de unidades, mensagem por idioma) e Admin > Outras formas de vender > Pré-venda com os produtos, estado, vendidas e pedidos.
- Loja: selo Pré-venda nos cartões, bloco com a data prevista de envio e as unidades que restam e botão "Comprar na pré-venda" na página do produto, selo na linha do carrinho e dos pedidos (cliente e Admin) e aviso no checkout de que o pedido segue junto quando o item estiver disponível.
- Servidor: tabela `product_preorders`; o trigger `order_items_preorder_mark` marca a linha (`design_data.preorder`) pelo estado do produto, nunca pelo navegador; linhas de pré-venda não mexem no estoque (venda, cancelamento, edição); o limite é estrito na compra do cliente e conta as reservas no carrinho dos outros; na data de lançamento a pré-venda acaba sozinha. Migration `20261007230000_preorders.sql`. Teste `scripts/test-preorders.mjs`.

### Reserva no carrinho

- Recurso `cart_reservations` (Estoque, ligado por padrão): ao entrar no carrinho as unidades ficam reservadas por um tempo (5 minutos por padrão, de 1 a 240) e ninguém mais as compra; depois do prazo voltam ao estoque e, enquanto houver, o cliente ainda finaliza. Vale para visitante (token do aparelho, `loja3d-cart-holder`) e conta (a reserva do visitante passa para a conta ao entrar). Mudar a quantidade renova o prazo (configurável); abrir a página de novo não.
- Admin > Estoque > Reserva no carrinho (`AdminCartReservations`): tempo, aviso ao cliente ligado ou desligado, renovar ao mudar a quantidade e lista das reservas ativas com Liberar. Com o aviso ligado, carrinho, gaveta e checkout mostram "Seus itens estão reservados por m:ss" e o aviso quando a reserva acaba.
- Servidor: tabela `cart_reservations` (fechada), `cart_stock_check(_items, _holder_token, _reserve)` reserva e devolve o estoque de agora menos as reservas dos outros; `create-order` confere por `cart_stock_check_for`; o trigger do pedido barra o que os outros reservaram e apaga a reserva do comprador; limpeza de hora em hora (`cart-reservations-purge`). Migration `20261007220000_cart_reservations.sql`.

### Estoque conferido no checkout

- Correção: o pedido era aceito com um item que esgotou depois de entrar no carrinho quando o comprador tinha conta de administrador (o trigger `order_items_reserve_stock` só era estrito para quem não era de confiança e deixava o estoque em 0). Agora `create_order_server` marca a compra do cliente (`loja3d.customer_checkout`) e a baixa é sempre estrita nela; o Admin (novo pedido, editar itens) continua como antes. Migration `20261007210000_checkout_stock_check.sql`.
- `create-order` confere o estoque antes de gravar (RPC `cart_stock_check`, mesma procura do trigger) e responde 409 com o código estável `out_of_stock` e as linhas a ajustar.
- Carrinho, gaveta e checkout mostram o item que esgotou ("Este item esgotou", com Avise-me quando chegar) ou tem menos unidades ("Só restam N", com Ajustar para N) e não deixam finalizar até ajustar; no checkout, "Ajustar o carrinho" resolve tudo num toque. `useCartStock`, `src/lib/cartStock.ts` (cópia de `_shared/cartStock.ts`), `CartStockNotice`, textos em `cart.ts` nos 4 idiomas. Teste `scripts/test-cart-stock.mjs`.

### Menu do Admin em categorias

- Menu do Admin em acordeão: 13 categorias menores (Visão geral, Pedidos, Clientes, Catálogo, Estoque, Promoções e fidelidade, Outras formas de vender, Marketing, Aparência da loja, Conteúdo e comunidade, Pagamentos e entrega, Configurações, Segurança), uma aberta por vez, a da página atual abre sozinha, contadores somados na categoria fechada; no celular, botão Menu que abre o mesmo acordeão na página (`AdminNav.tsx`, `adminSections.ts`).

### PunchOut

- Recurso novo `punchout` (Admin > Recursos da loja, Vendas, desligado por padrão): empresas compram pelo próprio sistema de compras (SAP Ariba, Coupa, Jaggaer, SAP SRM). O sistema abre a loja, o comprador monta o carrinho com os preços da conta de cliente da empresa e o carrinho volta ao sistema de compras para aprovação.
- Protocolos cXML (PunchOutSetupRequest, PunchOutOrderMessage, OrderRequest vira pedido da loja com pagamento Pedido de compra e frete fixo da empresa) e OCI (USERNAME, PASSWORD e HOOK_URL; campos NEW_ITEM de volta). Função `punchout` sem JWT, leitura de XML segura (sem DTD interno, limites de tamanho e profundidade), senha guardada com bcrypt, acesso por código de uso único guardado só como hash, endereços de retorno permitidos por empresa, pedido de compra repetido recusado, item desconhecido recusado e registado, aviso quando o total do pedido de compra difere do da loja.
- Na loja: barra escura no topo com a empresa, a hora limite, Ver carrinho e enviar e Cancelar e voltar (com confirmação); o carrinho troca Finalizar compra por Enviar ao sistema de compras (Enviar carrinho no celular), sem cupom nem barra de frete grátis; o checkout fica fechado durante a compra da empresa. Rotas `/punchout/entrar` e `/punchout/teste`.
- Admin > Vendas > PunchOut: números, ajuda, abas Empresas (página de cada empresa com protocolo, login, gerar e copiar senha, conta de cliente, país, frete, UNSPSC, endereços de retorno, tempo de acesso, botão Testar como esta empresa), Acessos e carrinhos, Pedidos de compra (criado, recusado, totais diferentes) e Como ligar. O teste abre a loja numa aba nova e no fim mostra a mensagem que seria enviada, sem criar pedido.
- Regras no servidor (migration `20261007200000_punchout.sql`): tabelas só do Admin (sem acesso às colunas de senha e código), RPCs `admin_save_punchout_buyer`, `admin_punchout_test_session`, `admin_punchout_stats` e `punchout_authenticate` (só service_role). Teste: `scripts/test-punchout.mjs`.

### Fórum

- Recurso novo `forum` (Admin > Recursos da loja, Conteúdo, desligado por padrão): páginas `/forum`, `/forum/<seção>` e `/forum/topico/<id>`, com seções ao lado, fixados primeiro, busca, páginas e link Fórum no rodapé.
- Clientes com conta criam tópicos e respondem; corrigem o próprio texto dentro do prazo das regras e denunciam mensagens com o motivo. A loja responde com o selo Equipe da loja (também em tópico fechado). Mensagens em texto simples. JSON-LD `DiscussionForumPosting` e tópicos no mapa do site quando visitantes podem ler.
- Admin > Fórum: Tópicos (números, filtros, seção, busca e página de cada tópico com situação, mover de seção, fixar, fechar, editar, aprovar, esconder e apagar respostas, responder como a loja e denúncias), Revisar (à espera de aprovação e denúncias abertas, com contador no menu), Seções (criar, editar, idioma, ordem, ligar e desligar, apagar) e Regras (visitantes leem, aprovar tópicos, aprovar respostas, prazo para editar).
- Regras no servidor (migration `20261007190000_forum.sql`): tabelas só do Admin; o site lê e escreve pelas RPCs, que conferem conta, seção ativa, tópico fechado, tamanho do texto, limite de 5 tópicos e 20 respostas por hora e a aprovação; contadores do tópico por gatilho; uma denúncia por pessoa e mensagem. Teste: `scripts/test-forum.mjs`.

## 6 de outubro de 2026

### Campanhas de newsletter

- Recurso novo `newsletter_campaigns` (Admin > Recursos da loja, Marketing, desligado por padrão): Admin > Newsletter com as abas Campanhas, Inscritos e Regras.
- Campanha: nome interno, assunto, texto de pré-visualização, texto do e-mail e até 6 produtos (foto, nome e preço atual). Prévia do e-mail como os programas de e-mail o mostram, no computador e no celular. Público por grupo (todos, quem já comprou, quem ainda não comprou, com conta, sem conta) e idioma, com a contagem ao vivo. Enviar agora ou agendar; voltar para rascunho, cancelar e duplicar.
- Inscritos: lista com origem (rodapé, cadastro, Admin), idioma, data, cancelar ou reativar, apagar, adicionar à mão e CSV. O rodapé e o cadastro passam a gravar o idioma de quem se inscreve.
- Página `/newsletter/cancelar?t=<chave>` (sempre ativa): cancela a inscrição sem conta, com o e-mail mascarado.
- Regras no servidor (migration `20261007180000_newsletter_campaigns.sql`): quem não é admin só cria inscrições ativas com chave nova; a lista de quem recebe é calculada e congelada pela RPC `newsletter_queue` (`newsletter_deliveries`); fora do rascunho o conteúdo fica fechado. O envio espera na fila até a loja ter um remetente de e-mail (os e-mails seguem desligados). Teste: `scripts/test-newsletter.mjs`.

### Enquetes

- Recurso novo `polls` (Admin > Recursos da loja, Conteúdo, desligado por padrão): bloco "Sua opinião conta" na página inicial (até três enquetes abertas marcadas para lá) e página `/enquetes` com as abertas e as encerradas. Link Enquetes no rodapé só com o recurso ligado.
- Cada enquete tem pergunta, texto de apoio, até 20 respostas, idioma (ou todos), início e fim opcionais, quantas respostas cada pessoa marca, se visitantes sem conta votam e quando o resultado aparece (depois de votar, sempre, ao encerrar ou só no Admin). O resultado aparece em barras com a percentagem e a resposta na frente destacada.
- Regras no servidor (migration `20261007170000_polls.sql`): tabelas só do Admin; o site lê e vota pelas RPCs `site_polls` e `vote_poll`, que conferem estado, datas, respostas e o limite por pessoa, e só mandam o resultado quando a regra deixa. Um voto por conta ou por visitante (resumo de rede e navegador com o sal da enquete, sem guardar o IP nem nada no aparelho). Apagar uma resposta tira os votos dela.
- Admin > Aparência e conteúdo > Enquetes (`AdminPolls`, sem janelas): números (abertas, votos, rascunhos e agendadas, encerradas), filtros, busca e página de cada enquete com as respostas, o resultado ao vivo (contas e visitantes, último voto, zerar votos) e as regras ao lado. Alterações entram no registo de atividade. Textos em 4 idiomas. Teste `scripts/test-polls.mjs`.

### Blog

- Recurso novo `blog` (Admin > Recursos da loja, Conteúdo, desligado por padrão): página `/blog` com artigo em destaque, cartões, busca, assuntos e "Ver mais", e página `/blog/<endereço>` com capa, texto, tempo de leitura, assuntos, produtos ligados (cartões com preço do país), anterior e seguinte e comentários. Link Blog no rodapé, artigos no mapa do site e SEO com BlogPosting.
- Admin > Aparência e conteúdo > Blog (`AdminBlog`, sem janelas): números (publicados, agendados, rascunhos, leituras), filtros, busca e página de cada artigo com título, endereço, resumo, texto (editor), capa, produtos, prévia do Google, data (futuro = agendado), idioma (ou todos), autor, assuntos, destaque e comentários abertos. Aba Comentários (aprovar, recusar, responder como loja, apagar) com contador no menu; aba Regras (artigos por página, comentários, aprovar antes de aparecer).
- Servidor: migration `20261007160000_blog.sql` (`blog_posts`, `blog_comments`; o site só lê publicados com a data passada e o recurso ligado; comentários só pela RPC `add_blog_comment`, com conta, até 5 por hora; leitura por `blog_post_comments`; leituras contadas por `blog_count_view`). Teste `scripts/test-blog.mjs`. Capturas em `blog/`.

### Pedido de orçamento B2B

- Recurso novo `quotes` (Admin > Recursos da loja, Vendas, desligado por padrão): o cliente pede um orçamento na página do produto (Pedir orçamento para quantidade, com a quantidade, cor e tamanho escolhidos), no resumo do carrinho (com os itens do carrinho) ou na página `/pedido-de-orcamento`, com quantidades, preço desejado, observação por item e dados da empresa. Precisa de conta; no máximo 5 pedidos em aberto e mínimo de unidades configurável.
- Admin > Vendas > Orçamentos (`AdminQuotes`, sem janelas): números (novos, propostas enviadas, aceitas, vendido por orçamento), filtros, busca e página de cada pedido com preço por item, atalho de desconto sobre a tabela, usar o preço pedido, mudar quantidade, tirar item, validade, mensagem, enviar ou atualizar a proposta, recusar, nota interna, histórico e link para o pedido gerado. Aba Regras: validade padrão, botão no produto, convite no carrinho, mínimo de unidades. Contador de novos no menu.
- Conta: aba Orçamentos (`QuotesView`) com estado, itens, preço da proposta, economia, validade e mensagem da loja; aceitar põe os itens no carrinho com o preço e a quantidade da proposta (quantidade fixa no carrinho, selo Preço do orçamento); recusar a proposta ou cancelar o pedido em análise com confirmação na lista.
- Servidor: migration `20261007150000_quotes.sql` (`quote_requests`, `quote_items`, RPCs `request_quote`, `my_quotes`, `accept_quote`, `decline_quote`, `admin_quote_send`, `admin_quote_reject`; gravar o pedido marca o orçamento como usado e cancelar o pedido o libera de novo). `_shared/pricing.ts` (`quoteUnits`) só aceita o preço da proposta para o dono, dentro da validade, uma vez, e com produto, cor, tamanho e quantidade iguais. Teste `scripts/test-quotes.mjs`. Capturas em `orcamentos/`.

### Programa de afiliados

- Recurso novo `affiliates` (Admin > Recursos da loja, Marketing e divulgação, desligado por padrão): pessoas, blogs e canais divulgam a loja com um link próprio (`?ref=código`, vale para qualquer página) e ganham comissão sobre as vendas que trazem.
- Admin > Marketing > Afiliados com abas Afiliados (visitas, vendas indicadas, conversão, valor a pagar, filtros), Comissões, Cadastros (aprovar ou recusar com nota; contador no menu) e Regras (comissão padrão, dias que o link vale, mínimo para pagar, aceitar cadastros). Página de cada afiliado com link para copiar, dados, comissão, ativo ou pausado, conta ligada pelo e-mail, pagamentos e comissões.
- O pedido guarda o afiliado no servidor (`create-order` confere o código; ninguém ganha comissão com a própria compra; o cliente não consegue mudar). A comissão nasce quando o pedido fica pago: produtos menos o cupom, sem frete, com a percentagem do momento; cancelar ou reembolsar anula; fica liberada quando o pedido é entregue.
- Página `/afiliados` (como funciona e pedido de cadastro) e aba Afiliado na conta (link, gerador de link para qualquer página, visitas, pedidos, comissões, pagamentos e como receber).
- O código do link fica só na memória da visita; com o consentimento de cookies de Marketing, fica no aparelho pelos dias das regras (`loja3d-affiliate`, listado no aviso de cookies, que passa a oferecer Marketing quando o recurso está ligado).
- Teste `scripts/test-affiliates.mjs`. Capturas em `/mnt/project-files/afiliados/`.

### Marketplace (vários vendedores)

- Recurso novo `marketplace` (Admin > Recursos da loja, Vendas, desligado por padrão): outras lojas ou pessoas vendem os próprios produtos na loja. Admin > Vendas > Vendedores com abas Vendedores (vendas, comissão da loja, saldo a pagar), Vendas, Cadastros e Regras.
- Página de cada vendedor no Admin: dados, endereço da página, comissão, descrição por idioma, pausa, contas ligadas pelo e-mail, produtos, repasses (registrar e apagar) e vendas. Campo Vendedor na edição do produto.
- Cada item de vendedor entra no livro de vendas quando o pedido fica pago, com a comissão daquele momento; editar o pedido recalcula com a mesma comissão; cancelar ou reembolsar anula. Saldo = parte do vendedor menos os repasses.
- Na loja: "Vendido e enviado por" na página do produto (com regra para esconder), página pública `/vendedor/<endereço>` e página `/vender` com o pedido de cadastro (aprovar cria o vendedor e liga a conta). Na conta, aba Vendedor com pedidos e endereço de entrega, produtos com ajuste de estoque (entra no Histórico de estoque) e repasses.
- Servidor: migration `20261007130000_marketplace.sql` (`vendors`, `vendor_members`, `vendor_ledger`, `vendor_payouts`, `vendor_applications`, vista `vendors_public`, `my_vendor`, `vendor_orders`, `vendor_products`, `vendor_set_stock`, `admin_vendor_*`, `request_vendor_application`). Teste `scripts/test-marketplace.mjs`. Capturas em `/mnt/project-files/marketplace/`.

### Vários armazéns

- Recurso novo `warehouses` (Admin > Recursos da loja, Catálogo, desligado por padrão): Admin > Catálogo > Armazéns. Cada armazém tem nome, código, endereço, cidade, país, os países que atende primeiro, prioridade, um padrão e pausa.
- O estoque à venda continua no produto, cor, tamanho ou cor x tamanho; os armazéns dizem onde estão as unidades (a soma é o total). Um aviso põe de uma vez o estoque que já existe no armazém padrão.
- Cada pedido sai primeiro dos armazéns que atendem o país de entrega, depois pela prioridade; o pedido no Admin mostra de onde saiu cada item. Cancelamento e edição do pedido devolvem ao mesmo armazém. Entradas sem armazém (edição do produto, Histórico de estoque) vão para o padrão.
- Aba Estoque: unidades por armazém, ajuste num armazém com motivo (entra no Histórico de estoque) e transferência entre armazéns; aba Movimentos com ajustes, transferências e cargas. Armazém com unidades não se apaga.
- Servidor: migration `20261007120000_warehouses.sql` (trigger `warehouse_stock_sync` nas 4 tabelas de estoque, `admin_warehouse_set`, `_transfer`, `_load`, `_slots`, `_summary`, `_moves`, `admin_order_allocations`). Teste `scripts/test-warehouses.mjs`. Capturas em `/mnt/project-files/armazens/`.

### Produtos digitais

- Recurso novo `digital_products` (Admin > Recursos da loja, Vendas, desligado por padrão): arquivos para baixar (e-books, moldes, modelos 3D, músicas, programas) e chaves de licença. Liga-se na aba Digital da edição do produto: arquivos até 50 MB (bucket privado `digital-files`) ou links https, downloads por arquivo, dias de acesso, chaves de licença (uma por unidade vendida), instruções por idioma e se também tem entrega física.
- O acesso nasce quando o pedido fica pago e é encerrado se o pedido for cancelado ou reembolsado. O cliente baixa na conta (aba Downloads): cada download passa pelo servidor (dono, prazo, limite) e o ficheiro só abre nos 10 minutos seguintes. Chaves acrescentadas depois vão primeiro para quem está à espera.
- Produto digital sem entrega física não pesa nem paga frete (cotação e `create-order`), não usa estoque (nunca esgota) e o checkout troca a escolha de entrega pelo aviso de entrega digital.
- Admin > Vendas > Downloads: acessos ativos, downloads em 30 dias, à espera de chave, a vencer e encerrados, página de cada acesso (zerar downloads, encerrar ou reativar, prazo e limite) e a lista de produtos digitais com arquivos e chaves livres.
- Servidor: migration `20261007110000_digital_products.sql`; `_shared/digitalProducts.ts`. Teste `scripts/test-digital-products.mjs` (e caso novo em `test-shipping.mjs`). Capturas em `/mnt/project-files/produtos-digitais/`.

### Aluguel de produtos

- Recurso novo `rentals` (Admin > Recursos da loja, Vendas, desligado por padrão): um produto pode ser alugado por dia, semana ou mês em vez de vendido. Liga-se na aba Aluguel da edição do produto (preço por período = preço do produto, mínimo e máximo de períodos, unidades para alugar, caução paga fora da loja).
- Na página do produto o cliente escolhe início e fim; o site mostra os períodos, o total, se há unidades livres e a caução. Carrinho, checkout, conta e pedido no Admin mostram as datas.
- Servidor: migration `20261007100000_rentals.sql` (configuração por produto, reservas, `rental_free_units` com dias livres entre reservas, trigger que confere as unidades com bloqueio por produto e cria a reserva ou recusa o pedido, cancelamento do pedido libera as datas, `admin_rental_update`); linhas de aluguel não mexem no estoque. Preço (por período x períodos) e regras de datas conferidos em `_shared/pricing.ts` com `_shared/rentals.ts` (cópia de `src/lib/rentals.ts`).
- Admin > Vendas > Aluguéis: retiradas de hoje e da semana, com o cliente, devoluções de hoje e atrasadas, filtros, página de cada reserva (entregar, devolver, cancelar, mudar datas, notas) e as regras (antecedência, dias livres, até quando reservar).
- Teste `scripts/test-rentals.mjs`. Capturas em `/mnt/project-files/aluguel/`.

### Assinaturas

- Recurso novo `subscriptions` (Admin > Recursos da loja, Vendas, desligado por padrão): o cliente assina um produto para receber a cada tantas semanas ou meses, com desconto. Cada renovação é um pedido que ele faz pela conta e paga como qualquer pedido (sem cobrança automática).
- Planos por produto na aba Assinatura da edição do produto (intervalo, desconto até 90%, mínimo de pedidos, ativo). Na página do produto, "Compra única" ou "Assinar" com o preço de cada forma; carrinho e checkout mostram a assinatura.
- Servidor: migration `20261007090000_subscriptions.sql` (planos, assinaturas, pedidos por ciclo, gatilhos que criam ou renovam a assinatura pelo pedido e desfazem ao cancelar, funções `my_subscription_action` e `admin_subscription_update`); desconto conferido em `_shared/pricing.ts` com `_shared/subscriptions.ts` (cópia de `src/lib/subscriptions.ts`).
- Conta: aba Assinaturas com próxima data, renovação atrasada, Renovar agora (liberado alguns dias antes), pausar, retomar, pular e cancelar conforme as regras. Admin > Vendas > Assinaturas: números (ativas, pausadas, renovam em 7 dias, atrasadas, receita mensal estimada), filtros, página de cada assinatura com os pedidos e alteração de estado, data e quantidade, e as regras.
- Teste `scripts/test-subscriptions.mjs`. Capturas em `/mnt/project-files/assinaturas/`.

### Envios parciais

- Recurso `partial_shipments` (Admin > Recursos da loja, desligado por padrão): bloco Remessas na página do pedido no Admin
  (`OrderShipmentsPanel`) com barra de progresso, nova remessa num painel na página (unidades de cada item que faltam enviar,
  estado, transportadora do catálogo, código e link de rastreio, observação), editar, marcar como entregue e excluir com
  confirmação. O cliente vê cada remessa na conta (`OrderShipments`) com itens, estado, datas e link de rastreio.
- Servidor: `order_shipments` + `order_shipment_items` (leitura pela RLS; escrita só por `admin_save_shipment` e
  `admin_delete_shipment`, que conferem as quantidades); tudo enviado passa o pedido pago ou em preparação para Enviado, tudo
  entregue para Entregue, e o primeiro código vai para o rastreio do pedido (`_order_shipments_sync`). Item já enviado não pode ser
  removido nem reduzido na edição de itens (`order_items_shipped_guard`). Contas em `src/lib/shipments.ts`. Migration
  `20261007080000_order_shipments.sql`, teste `scripts/test-shipments.mjs`.

### Prazo de produção e data de entrega

- Admin > Configurações > Prazos e entrega (`AdminDeliveryDates`, recurso `delivery_dates`, desligado por padrão): prazo padrão
  em dias úteis, dias de trabalho, hora de corte, fuso, feriados, onde mostrar e exemplo ao vivo; lista "Pedidos para enviar"
  com atrasados, os que saem hoje e os dos próximos 7 dias.
- Prazo por produto (`products.lead_time_min_days` / `_max_days`, aba Envio do produto); sem ele vale a ficha antiga
  (`production_days`) ou o padrão da loja. No carrinho vale o produto mais demorado.
- Contas em `src/lib/deliveryDates.ts` (cópia em `_shared/deliveryDates.ts`): dias úteis com feriados, corte no fuso da loja ou do
  país, data de envio e de chegada com os dias da forma de envio. Página do produto mostra o prazo e "enviamos até"; checkout mostra
  "Chega entre" em cada forma de envio, a retirada e a revisão; o `create-order` grava `estimated_ship_by`,
  `estimated_delivery_from` e `estimated_delivery_to` (colunas protegidas). Pedido no Admin com "Enviar até", "Sai hoje" ou
  "Atrasado"; conta do cliente com a previsão. Migration `20261007070000_delivery_dates.sql`, teste `scripts/test-delivery-dates.mjs`.

### Campos extra no checkout

- Admin > Vendas > Campos do checkout (`AdminCheckoutFields`, `useCheckoutFields`, `src/lib/checkoutFields.ts` = cópia de
  `_shared/checkoutFields.ts`, textos `adminCheckoutFields.ts` e `checkoutFields.ts`): caixa para marcar, lista de opções,
  texto curto ou longo; texto e ajuda por idioma, preço (ou preço por opção), obrigatório, máximo de caracteres, países,
  ordem com setas, prévia de como o cliente vê e quatro modelos prontos (embrulho, mensagem no cartão, horário, número do
  pedido de compra). Números de 30 dias (pedidos com extras e valor).
- Checkout: passo novo Detalhes do pedido (`CheckoutExtraFields`), linha Extras do pedido no resumo e na revisão; o
  `create-order` confere obrigatórios e soma os preços com o imposto do país (`orders.checkout_fields`, `extras_amount`,
  `extras_vat`, protegidos por `orders_lock_server_columns`). Respostas na página do pedido no Admin, na conta e na
  confirmação (`OrderCheckoutFields`); editar itens no Admin mantém os extras no total.
- Confirmação do pedido passa a mostrar também pontos e vale-presente usados (antes o frete aparecia com o valor errado).
- Recurso `checkout_fields` (ligado; sem campos criados nada muda). Migration `20261007060000_checkout_fields.sql`.
  Teste `scripts/test-checkout-fields.mjs`.

### Verificação em dois passos no Admin e entrar com Google ou Facebook

- Admin > Configurações > Segurança da conta (`AdminAccountSecurity`, `useAdminSecurity`, `src/lib/adminSecurity.ts`,
  textos `adminSecurity.ts`): cada administrador ativa a verificação em dois passos (app autenticador, código QR e chave),
  a loja pode exigi-la de todos (só quem já a tem ativa liga a regra), lista de administradores com quem tem 2FA e
  "Tirar verificação" para quem perdeu o celular. Ao abrir o Admin sem o código, aparece o passo do código
  (`AdminMfaGate`) em vez do painel.
- Servidor (migration `20261007050000_admin_2fa.sql`): `has_role` do próprio admin exige o segundo passo (aal2) quando
  ele tem 2FA ou a loja exige; `admin_access_state`, `admin_security_overview`, `admin_reset_mfa` e o trigger que impede
  exigir 2FA sem ter o seu. As funções do servidor conferem o admin com o token dele (`requireAdmin` e as funções de contas,
  pedidos e espaço). Recurso `admin_2fa` (Segurança e acesso, ligado).
- Entrar com Google ou Facebook (recurso `social_login`, desligado): botões na entrada da loja (`SocialLoginButtons`) só
  para os provedores ligados no serviço de contas; chaves no env do servidor (`GOOGLE_*`, `FACEBOOK_*` em
  `deploy/compose.yaml` e `deploy/env.example`), passos em Segurança da conta e em `deploy/PASSO-A-PASSO.md`.
  Teste `scripts/test-admin-security.mjs`. Capturas em `/mnt/project-files/seguranca-da-conta/`.

### Registo de atividade do Admin

- Cada mudança feita no Admin fica registrada (`admin_activity_log`, migration `20261007040000_admin_activity_log.sql`):
  quem fez, quando, IP, navegador e o antes e o depois de cada campo. Trigger `admin_activity_capture` nas tabelas que o
  Admin gere, só para administradores; senhas, chaves e tokens ficam `***`. As funções que usam a chave de serviço em
  nome de um admin (contas de clientes, chaves de integrações) registam por `admin_activity_record`
  (`_shared/activityLog.ts`). Prazo de guarda em `store_settings.activity_log` e limpeza diária (cron `activity-log-purge`).
- Admin > Configurações > Registo de atividade (`AdminActivityLog`, `useActivityLog`, `src/lib/activityLog.ts`, textos
  `adminActivity.ts`): números do período, filtros por área, ação e administrador, busca, CSV, antes e depois na página,
  administradores e última ação, entradas na conta (do registo do serviço de contas) e prazo de guarda. Bloco
  "Alterações no Admin" nas páginas do produto e do pedido.
- Recurso `activity_log` na categoria nova Segurança e acesso (ligado por padrão; desligado deixa de gravar, mas ligar e
  desligar recursos fica sempre registrado). Teste `scripts/test-activity-log.mjs`. Capturas em
  `/mnt/project-files/registo-de-atividade/`.

### Histórico de estoque

- Cada mudança de estoque fica registrada no servidor (`stock_movements`, migration
  `20261007030000_stock_history.sql`): produto, cor, tamanho e cor x tamanho, com antes, depois, motivo, pedido,
  quem fez e nota. Triggers nas 4 tabelas de estoque; o motivo vem do contexto `loja3d.stock_ctx` posto pelas
  funções de pedido (venda, pedido cancelado, pedido editado) e pelo ajuste do Admin.
- Admin > Catálogo > Histórico de estoque (`AdminStockHistory`, `useStockHistory`, `src/lib/stockHistory.ts`,
  textos `adminStockHistory.ts`): entradas, saídas, vendidas e ajustes manuais por período, filtros por motivo,
  busca por produto, SKU ou pedido, CSV, e o painel Ajustar estoque (somar ou definir, motivo e nota) pela RPC
  `admin_adjust_stock`. Bloco com as últimas mudanças na página de números do produto.
- Recurso `stock_history` em Recursos da loja (ligado por padrão; desligado só esconde as telas, o registo continua).
  Teste `scripts/test-stock-history.mjs`. Capturas em `/mnt/project-files/historico-de-estoque/`.

### Moedas e câmbio (BCE)

- Admin > Configurações > Moedas e câmbio (`AdminCurrencies`, `useExchangeRates`, `src/lib/exchangeRates.ts`, textos
  `adminCurrencies.ts`): moeda base, margem de câmbio, maior variação aceita sozinha, taxa de cada moeda dos países
  ativos (com exemplo de conversão, aviso sem taxa, fixar à mão, acrescentar e tirar), atualização automática diária pelo
  Banco Central Europeu com "Atualizar agora", saltos grandes à espera com "Aplicar mesmo assim", e histórico das taxas.
  O cartão antigo em Configurações > Regional virou um atalho. Recurso `auto_exchange_rates`, desligado por padrão.
- Função `update-exchange-rates` reescrita: taxas do BCE (antes open.er-api.com e 5 moedas fixas), só as moedas da
  loja, moedas à mão ficam, saltos maiores que o limite só com confirmação, códigos estáveis. Migration
  `20261007020000_exchange_rates.sql`: `exchange_rate_history` (trigger em `store_settings`) e cron
  `exchange-rates-daily`. Teste `scripts/test-exchange-rates.mjs`.

### Feed de produtos (Google Shopping)

- Admin > Marketing > Feed de produtos (`AdminProductFeed`, `useProductFeed`, `src/lib/productFeed.ts`, textos
  `adminProductFeed.ts`): endereço do feed por país (copiar e abrir), regras (uma linha por cor e tamanho, esgotados,
  nome da loja como marca, condição, categoria do Google padrão), categoria do Google e entrada no feed por categoria da
  loja, produtos no feed, fora do feed ou com avisos (sem foto, sem preço, sem descrição, sem código de barras) com
  "Tirar do feed", e pré-visualização das linhas. Recurso `product_feed` em Recursos da loja (categoria nova Marketing e
  divulgação), desligado por padrão.
- Função `product-feed` (sem JWT, `GET /functions/v1/product-feed?pais=BR`): XML RSS 2.0 do Google (também lido pela Meta,
  TikTok e Pinterest) com preço como o site mostra no país (IVA, moeda com taxa de câmbio e margem), promoção em
  `sale_price`, variantes agrupadas, marca, GTIN ou MPN, fotos, peso e link com `?pais=` (e `cor`/`tamanho`).
- Loja: `?pais=XX` no endereço escolhe o país e o idioma (`CountrySync`); `?cor=<id>&tamanho=<id>` já escolhe a variante na
  página do produto. Teste `scripts/test-product-feed.mjs`.

### Marcas

- Admin > Catálogo > Marcas (`AdminBrands`, `useBrands`, `src/lib/brands.ts`, textos `adminBrands.ts`): marcas ou
  fabricantes com logo, site, descrição por idioma, ordem e visível/escondida; números (visíveis, produtos com marca,
  sem produtos, escondidas), página da marca com os produtos dela e apagar com confirmação. Campo Marca na aba Dados
  do produto (`BrandField`). Recurso `brands` em Recursos da loja, desligado por padrão.
- Loja: filtro Marca nas listagens (`?marca=slug`, contagem e chips), página da marca em `/produtos?marca=slug` com logo,
  descrição e link do site, página `/marcas` (só marcas com produtos) e `/marca/:slug`; nome da marca acima do título
  do produto e no JSON-LD. Migration `20261007010000_brands.sql` (`brands`, `products.brand_id`). Teste `scripts/test-brands.mjs`.

### Grupos de clientes e tabelas de preço

- Admin > Vendas > Grupos de clientes (`AdminCustomerGroups`, `useCustomerGroups`, `src/lib/customerGroups.ts`): grupos
  (ex.: Revenda, Atacado) com nome para o cliente por idioma, nota, desconto geral (0 a 90%) e ligado/desligado; clientes
  do grupo (pôr e tirar) e tabela de preço por produto a partir de uma quantidade. Bloco Grupo do cliente na página do
  cliente e campo "Só para grupos de clientes" na página do cupom.
- Servidor (migration `20261007000000_customer_groups.sql`): `customer_groups`, `customer_group_members` (um grupo por
  cliente), `customer_group_prices`, `coupons.customer_group_ids` (regra em `_coupon_allowed`), funções
  `customer_group_pricing_for` / `my_group_pricing` e `admin_set_group_prices`. `create-order` e a verificação antes do
  pagamento aceitam o preço do grupo só para quem está no grupo (`_shared/customerGroups.ts`, cópia do site).
- Loja: com sessão, a página do produto mostra "Preço <grupo>", o carrinho e o checkout cobram o preço do grupo com a
  etiqueta na linha. Nunca acima do preço do catálogo ou da promoção.
- Recurso `customer_groups` em Recursos da loja (desligado por padrão). Teste `scripts/test-customer-groups.mjs`.

### Venda cruzada

- Admin > Catálogo > Venda cruzada (`AdminCrossSell`, `useCrossSell`, `src/lib/crossSell.ts`): regras (quantos produtos
  sugerir no carrinho, completar com destaques, carrinho lateral, relacionados na página do produto), números e a lista
  de produtos com quantas ligações cada um tem. Aba Venda cruzada na página do produto (`ProductLinksEditor`): listas
  "Combina com" (carrinho) e "Relacionados" (página do produto) com busca, ordem e ligação nos dois sentidos.
- Servidor (migration `20261006230000_cross_sell.sql`): `related_products.kind` (`cross_sell` ou `related`), chaves
  para `products` com cascata, linhas órfãs e do próprio produto apagadas; RPC `admin_set_product_links` (só admin, até 50).
- Loja: o carrinho mostra primeiro os produtos ligados aos itens (os mais ligados primeiro), sem esgotados nem escondidos;
  carrinho lateral com até 3 sugestões e botão de adicionar; "Você também pode gostar" começa pelos relacionados escolhidos.
- Recurso `cross_sell` em Recursos da loja (ligado por padrão; desligado, o carrinho volta aos destaques). Teste
  `scripts/test-cross-sell.mjs`.

### Variantes com código, código de barras, estoque e foto

- Aba Variantes na página do produto no Admin (`ProductVariantsEditor`, `useProductVariants`, `src/lib/variants.ts`):
  todas as combinações de cor e tamanho numa lista, com código (SKU), código de barras (GTIN/EAN), estoque, à venda e
  foto própria; números no topo (variantes, estoque, esgotadas, pouco estoque, sem código), filtros, preencher códigos
  vazios e planilha CSV. Produto ganha código e código de barras na aba Dados; busca de produtos aceita o código.
- Servidor (migration `20261006220000_product_variants.sql`): colunas `sku`/`gtin` em produtos, tamanhos, cores e
  combinações, estoque por cor em produtos sem tamanhos, foto da combinação; código único na loja (`sku_taken`) e com
  formato validado; `order_items.sku` gravado pelo servidor ao criar a linha; estoque por cor no `_adjust_order_item_stock`.
- Loja: a foto da combinação abre primeiro na galeria, o código aparece ao escolher a variante e vai para o JSON-LD;
  cor esgotada quando o estoque próprio dela acaba. Pedido no Admin mostra cor, tamanho e código de cada linha.
- Recurso `variants` em Recursos da loja (ligado por padrão). Teste `scripts/test-variants.mjs`.

### Filtros por especificação

- Admin > Catálogo > Especificações (`AdminSpecs`, `useProductSpecs`, `src/lib/productSpecs.ts`): características dos
  produtos (ex.: Material, Cor, Tamanho) com valores, cor opcional, unidade, traduções, ordem e onde aparecem (filtros
  da loja, ficha do produto). Aba Especificações na página do produto (`ProductSpecsEditor`) para marcar os valores.
- Loja: cada característica vira um filtro na lista de produtos (`f_<característica>=valor` na URL, contagens que
  ignoram o próprio filtro, etiquetas de filtro ativo) e linhas na aba Especificações do produto.
- Recurso ligado por padrão em Admin > Recursos da loja (sem características criadas, nada muda). Migration
  `20261006210000_product_specs.sql`; teste `scripts/test-product-specs.mjs`.

### Programa de pontos

- Admin > Vendas > Pontos (`AdminRewardPoints`, `useRewardPoints`, `src/lib/rewardPoints.ts`): aba Clientes com números
  (clientes com saldo, pontos em aberto e quanto valem, ganhos e usados em 30 dias), filtros e página de cada cliente com
  saldo, a vencer, ajuste com motivo e extrato; aba Regras (pontos por unidade de moeda, valor do ponto, mínimo, parte
  máxima do pedido, quando entram, validade, bónus de boas-vindas) com exemplo ao vivo.
- Cliente: aba Pontos na conta (`RewardPointsView`), "Usar pontos" no checkout (`RewardPointsInput`) e "Ganhe X pontos"
  na página do produto. O desconto é calculado no servidor (`create-order` + `create_order_with_benefits`); pedido pago
  rende pontos, cancelado retira os ganhos e devolve os usados; os mais antigos vencem primeiro.
- Recurso desligado por padrão em Admin > Recursos da loja. Migration `20261006200000_reward_points.sql`; teste
  `scripts/test-reward-points.mjs`.

### Vale-presente

- Admin > Vendas > Vales-presente (`AdminGiftCards`, `useGiftCards`, `src/lib/giftCards.ts`): emitir vale com código
  gerado ou próprio, valor, validade, destinatário e mensagem; lista com números (saldo em aberto, usados, vencidos),
  página de cada vale com texto pronto para enviar, ajuste de saldo com confirmação e histórico ligado aos pedidos.
- Checkout: "Tem um vale-presente?" (`GiftCardInput`, só com sessão). O saldo é conferido por `check_gift_card` (limite
  de tentativas) e descontado no servidor (`create-order` + `create_order_with_gift_card`); pedido coberto pelo vale
  fica pago. Cancelar ou reembolsar devolve o saldo uma vez. O vale aparece no resumo do pedido, no Admin e na conta.
- Recurso desligado por padrão em Admin > Recursos da loja. Migration `20261006190000_gift_cards.sql`; teste
  `scripts/test-gift-cards.mjs`.

### Avise-me quando chegar e carrinhos abandonados

- Produto esgotado mostra "Avise-me quando chegar" (`StockAlertForm`): o cliente deixa o e-mail (com sessão já vem
  preenchido) e a função `request_stock_alert` valida e limita. Admin > Catálogo > Avisos de estoque
  (`AdminStockAlerts`): procura por produto, os que voltaram ao estoque primeiro e com contador no menu, página de
  cada produto com as pessoas à espera, marcar como avisado, copiar e-mails, CSV, cancelar e apagar.
- Admin > Vendas > Carrinhos abandonados (`AdminAbandonedCarts`): clientes com conta com carrinho parado (1 h a 3
  dias, últimos 7, 30 ou 90 dias), valor estimado, produtos, WhatsApp e e-mail com a mensagem pronta e o link do
  carrinho, marcar contato e recuperados (pedido depois do contato). `cart_items.updated_at` novo.
- Os dois são recursos em Admin > Recursos da loja (ligados por padrão) e avisam que o envio automático por e-mail
  depende do remetente da loja (hoje desligado). Migrations `20261006180000_stock_alerts.sql` e
  `20261006180100_abandoned_carts.sql`; teste `scripts/test-phase1.mjs`.

### Recursos da loja (ligar e desligar)

- Admin > Configurações > Recursos da loja (`AdminFeatures`, `src/lib/features.ts`, `useFeatures`): cada recurso opcional
  com interruptor, por categoria (vendas, catálogo, clientes, pedidos, conteúdo, ferramentas), busca, filtros e atalho
  Configurar. Primeiros recursos: devoluções, menor preço de 30 dias, segurança GPSR, favoritos, mensagens no pedido,
  páginas da loja, orçamento 3D e personalizador. Desligado some do site (botões, abas, links, rotas `FeatureRoute`)
  e a seção dele some do menu do Admin; os dados ficam guardados. Servidor: `public.feature_enabled` (migration
  `20261006170000_store_features.sql`) recusa devoluções novas e esconde notas visíveis e páginas publicadas.
  Base para o plano completo do nopCommerce (só o app móvel fica de fora, decisão do dono).

### Ideias do nopCommerce (itens 1 a 5)

- Menor preço dos últimos 30 dias nas promoções (Diretiva Omnibus): histórico de preços automático (`product_price_history`, função `product_lowest_prices`), linha abaixo do preço na página do produto e nos cartões; Admin > Preços e segurança escolhe onde mostrar (UE, todos os países, nunca).
- Dados de segurança do produto (GPSR): aba Segurança na página do produto com fabricante, responsável na UE, modelo e avisos; padrão da loja em Admin > Preços e segurança e dados próprios na aba Segurança do produto no Admin (`products.safety_info`).
- Devoluções e trocas: aba Devoluções na conta do cliente e botão Devolver ou trocar nos pedidos enviados (RPC `request_return` confere dono, estado, prazo e quantidades); Admin > Devoluções com números, filtros, página de cada pedido (estado, resposta ao cliente, notas internas) e Regras (ligar, prazo, opções); painel Devoluções na página do pedido.
- Notas no pedido: painel Notas e mensagens na página do pedido no Admin (internas ou visíveis ao cliente, `order_notes`); o cliente vê as mensagens nos detalhes do pedido.
- Páginas da loja editáveis: Admin > Páginas da loja com Sobre, Contato, Termos, Privacidade e Devoluções por idioma (texto rico, publicar, começar do texto padrão, voltar ao padrão); o site mostra a versão publicada do idioma do visitante (`site_pages`).

### Cabeçalho

- O título da lista de países passou de "Onde você quer receber?" para "Escolha seu país" (igual à seleção de país), nos 4 idiomas.
- País, idioma e moeda num só seletor com bandeiras (`CountryPicker` + `Flag`, SVG do pacote `country-flag-icons`): cada país mostra idioma e moeda, escolher o país define os dois; no fim da lista dá para trocar só o idioma. Busca quando houver mais de 6 países. O seletor de idioma separado saiu da loja (fica só no Admin).

### Frete

- Restrições e cálculo do frete (Admin > Frete e entrega > forma de envio): escolher os produtos que a forma de envio
  não leva (ex.: peça que os Correios não aceitam e a TNT Express sim) e as classes de envio numa lista; base do preço
  da tabela por peso, quantidade de itens, valor do pedido ou preço único por zona; taxa fixa, percentual sobre o
  pedido (seguro) e frete mínimo; TNT Express no catálogo; simulação com quantidade e produto. Migration
  `20261006150000_shipping_rules.sql`; regras no servidor (`rules.ts`: `blockedProduct`, `rateMeasure`, `ratePrice`,
  `withFees`) com testes em `scripts/test-shipping.mjs`.

### Admin

- Produto no celular: um só botão Gravar (a barra fixa do fundo, por cima do cartão Primeiros passos, enquanto houver alterações); o botão voltar ao topo da loja deixou de aparecer no Admin.

- Custo x Venda refeito no estilo do painel: período, receita dos itens vendidos, custo, lucro bruto e margem, aviso de produtos sem custo, tabela com busca, filtros (sem custo, com prejuízo), ordenação, paginação e exportar CSV, em 4 idiomas e na moeda da loja (sem IVA fixo de 23% nem custo por metro da loja antiga).
- Abas internas do produto (Tamanhos, Cores, Preço por quantidade, Perguntas, Áreas e paletas) em 4 idiomas, com valores na moeda da loja (`adminProductTabs.ts`, `adminProductAreas.ts`).
- Frete e entrega (formas de envio, zonas, entregas antigas) e Pagamentos confirmam a exclusão na própria página, sem
  janela do navegador; regras de frete e pagamento iguais (continuam no servidor).
- Pedido: botão Editar itens na página do pedido (quantidade, preço, tirar, juntar produto ou item avulso, frete,
  desconto, motivo no histórico) enquanto não foi enviado, cancelado nem reembolsado; a função
  `admin_update_order_items` (migration `20261006140000`) acerta o estoque e recalcula imposto e total; aviso de
  diferença a cobrar ou devolver quando já está pago. Blocos de cancelamento, reembolso, PDF fiscal e FIZ em 4 idiomas
  (`src/i18n/adminOrderBlocks.ts`), valores com `Intl` em vez de euro fixo. Banners, Perguntas frequentes, Kits,
  Módulos extras, Tamanhos, Conteúdo da página inicial e Marca e visual sem janelas: edição em painel na página e
  confirmações na página. Etiqueta de envio não quebra mais com item avulso.
- Estatísticas passa a ser a página inicial do Admin (período, receita contra o período anterior, pedidos pagos, ticket
  médio, compradores, visitas e conversão, pendentes, cancelados, descontos, gráfico, Precisa de você, produtos e
  categorias mais vendidos, por situação e país, melhores clientes, pedidos recentes). Primeiros passos virou um cartão
  pequeno no canto inferior direito (`AdminSetupHelper`: aberto, minimizado ou escondido, lembrado no navegador; abre
  sozinho só em Estatísticas no computador). Página de produto refeita (secções, painel lateral fixo com pré-visualização,
  visível / destaque / novo, Gravar, aviso de alterações por gravar, margem pelo custo, textos em 4 idiomas). Novo pedido
  refeito: cliente cadastrado ou sem cadastro, produtos da loja com preço por escalão e itens avulsos, envio / retirada /
  cliente escolhe depois, endereços do cliente, meio de pagamento, desconto, já pago, resumo fixo com total.

## 5 de outubro de 2026

### Avaliações

- Admin > Avaliações refeito em páginas próprias: números (nota média, para moderar, sem resposta, compra
  verificada), filtros (situação, nota, origem, produto, busca), aprovar ou ocultar na lista, página de cada avaliação
  para criar, editar, responder em nome da loja, publicar e apagar (confirmação na própria página). Avaliações
  trazidas de outros canais guardam a origem (WhatsApp, Instagram, Google...), que aparece no site. Separador
  Avaliações da loja para moderar as enviadas em `/deixar-avaliacao`. Na página do produto: selo Compra verificada,
  origem, foto e resposta da loja. Migration `20261006130000_reviews_admin.sql`: colunas `source`, `verified`,
  `admin_reply`; trigger que impede o cliente de se aprovar ou marcar compra verificada; corrige a vista
  `product_reviews_public`, que não mostrava nenhuma avaliação aos visitantes.
- Fotos dos clientes nas avaliações: interruptor no Admin > Avaliações (`store_settings.review_settings`, desligado
  por omissão); ligado, o formulário da página do produto aceita uma foto (bucket `review-photos`, pasta do cliente,
  5 MB) e o trigger só aceita esse caminho. Página do produto: clicar numa linha de estrelas mostra só essa nota e o
  botão Com fotos mostra só as avaliações com foto.

### Pagamentos e nome da loja

- Pagamentos por país para qualquer ramo. Admin > Pagamentos em páginas próprias (sem janelas): lista com ordem e
  liga/desliga, página de cada meio com países onde vale, desconto (ex.: 5% no Pix), valor mínimo e máximo, nome e
  instruções em 4 idiomas e a conta do provedor ali mesmo. Novos meios online: Mercado Pago (Brasil: Pix, cartão,
  boleto), Stripe (cartão, Apple Pay, Google Pay e meios locais) e PayPal, todos abertos e conferidos no servidor
  (`payment-start`, `payment-verify`, `payment-webhook`; tabela `payment_sessions`; valor, moeda e referência
  confirmados na API do provedor antes de dar como pago). Bizum (Espanha) manual. O `create-order` passa a validar o
  país e os limites do meio e aplica o desconto. Migration `20261006110000_payment_methods.sql`. Teste:
  `scripts/test-payments.mjs`.
- Admin > Frete e entrega também em páginas próprias (forma de envio, preços, zona), com endereço na URL.
- Nome da loja do Admin em tudo: e-mails (cabeçalho, rodapé, assunto, remetente) leem nome, frase e logótipo de
  `store_settings` (`_shared/storeBrand.ts`); domínio do remetente pelo `SITE_URL` (ou `EMAIL_FROM_DOMAIN`). Saíram
  os restos visíveis da Bom DTF (e-mails, exemplos e textos do Admin); os métodos dos preços por área vêm de
  Admin > Métodos. O código parado do DTF fica, desligado (decisão do dono).

### Frete e transportadoras

- Frete para qualquer país e transportadora (modelo de loja para qualquer ramo). Admin > Frete e entrega com
  zonas (países, estados ou distritos, faixas de código postal; partida com Brasil, Portugal Continental, Madeira,
  Açores, Espanha, Baleares, Canárias, União Europeia e resto do mundo), formas de envio (catálogo de transportadoras
  em `src/lib/carriers.ts`: Correios, Jadlog, Loggi, CTT, DPD, GLS, SEUR, MRW, Correos, DHL, FedEx, UPS e outras),
  preços por zona e faixa de peso, peso volumétrico, peso máximo, dias de preparação, frete grátis por faixa ou pelo
  país, classes de envio nos produtos e simulação. Cotação automática pelas contas Melhor Envio (Brasil) e Sendcloud
  (Europa), em Integrações; se a cotação falhar, vale a tabela. Cálculo no servidor (`_shared/shipping/`, função
  `shipping-quote`, `create-order` com `shipping_service_id`); o checkout mostra as opções para o endereço escolhido.
  Migration `20261006100000_shipping_carriers.sql`. Teste: `scripts/test-shipping.mjs`.

### Publicação

- Loja publicada em https://loja3d.kodemi.pt no VPS, com HTTPS, atualização automática a cada push no `main`
  e cópias diárias. O site da empresa em `kodemi.pt` ficou intacto.
- Testes de saúde do login e dos ficheiros (`deploy/compose.yaml`) passam a chamar 127.0.0.1: no VPS o `localhost`
  dentro do contentor resolvia para IPv6 (::1), o serviço de ficheiros só ouve em IPv4 e a primeira publicação parava.

### Modelo de loja e Admin

- Números por produto e por categoria (pedido do dono): página `/admin/produtos/<id>` (receita, unidades, pedidos,
  clientes, comparação com os 30 dias anteriores, estoque e quantos dias dura, visitas e conversão, avaliação,
  favoritos, lucro estimado pelo custo, pendentes e cancelados, gráfico por dia / semana / mês, vendas por variação,
  tamanho e país, clientes que mais compraram, pedidos recentes) e `/admin/categorias/<id>` (os mesmos números da
  categoria e subcategorias, parte da receita da loja, tabela de produtos ordenável, vendas por subcategoria). Criar e
  editar categoria passaram a ser páginas (`/admin/categorias/nova`, `/<id>/editar`), sem janela. Contas em
  `src/lib/salesStats.ts` (teste `scripts/test-sales-stats.mjs`), consultas em `src/hooks/useSalesStats.ts`.
- Cupons em página própria (pedido do dono, sem janelas): lista com números (cupons valendo, pedidos, desconto e
  vendas com cupom), busca, filtros por estado e liga/desliga; página `/admin/cupons/<id>` (e `/novo`) com código e gerar,
  nota interna, % ou valor fixo, desconto máximo, compra mínima, só na primeira compra, usos no total e por cliente,
  início e fim, resumo do que o cliente vê, uso do cupom, pedidos que o usaram e apagar. Regras novas no servidor:
  migration `20261006120000_coupon_rules.sql` (`coupon_quote` usada pelo trigger do pedido e pelo `create-order`;
  `check_coupon` devolve o teto).

- Números no topo de Admin > Pedidos (pedidos e pagos no período, faturado, ticket médio, para produzir e prontos
  para enviar; o cartão filtra os pagos), último pedido no cartão Total gasto do cliente e desconto do meio de
  pagamento nos totais da página do pedido.

- Admin sem janelas por cima (pedido do dono): cada pedido abre a sua página (`/admin/pedidos/<id>`: próximo passo,
  itens e totais, comprovante, cancelamento e reembolso, documento fiscal, histórico, atualizar estado, pagamento,
  rastreio e notas internas, cliente, entrega, etiqueta, ordem de produção, arquivar e apagar); novo pedido em
  `/admin/pedidos/novo`; cliente em `/admin/clientes/<id>` (números, pedidos, endereços editados na página,
  favoritos, apagar conta), editar e criar em `/admin/clientes/<id>/editar` e `/admin/clientes/novo`; a edição de
  produto passa para dentro da moldura do painel e os presets (tamanhos, cores, áreas, materiais, métodos) abrem como
  painel na página. Confirmações de apagar e substituir viram uma faixa na própria página (`ConfirmStrip`,
  `useInlineConfirm`) no lugar das janelas e do `confirm()` do navegador. Moldura comum `AdminShell` e menu em
  `src/components/admin/shell/adminSections.ts`. Notas internas do pedido deixam de ir no aviso ao cliente.
- Gestão no Admin mais profissional. Moldura: barra própria no topo (símbolo e nome da loja, idioma, Ver o site,
  Sair) no lugar do cabeçalho e rodapé da loja, menu lateral fixo e contadores do que espera pelo administrador
  (pedidos a confirmar, produzir ou cancelar, avaliações por aprovar, produtos sem estoque; `useAdminAttention`).
  Pedidos: botão de próximo passo em cada pedido (confirmar pagamento, iniciar produção, enviar com rastreio,
  entregue; `OrderNextStep`), filtro por período, busca também por e-mail, telefone, produto e rastreio, filtros
  rápidos por estado, itens e e-mail do cliente na lista, páginas de 20, tabela que cabe sem rolagem a partir de
  1024px, planilha CSV que abre certa no Excel. Produtos: lista em tabela (a grade continua como opção) com foto,
  preço com promoção, estoque editável, interruptor de visível no site e menu de ações; ações em vários produtos
  (mostrar, ocultar, destacar, exportar), ordenação, cartões de número que filtram (visíveis, estoque baixo, sem
  estoque; personalizáveis não contam estoque). Clientes: grupos (compraram, recorrentes, sem pedidos, novos),
  ordenação, último pedido, documento com nome e máscara do país (CPF, CNPJ, NIF), e-mail e WhatsApp, Ver pedidos
  do cliente, ticket médio certo (valor médio dos pedidos pagos), administradores fora dos números, planilha CSV.
  A ficha do cliente voltou a mostrar o histórico de pedidos (a consulta pedia colunas que não existem).
  Valores na moeda base da loja, não na do país escolhido no site. Textos novos nos 4 idiomas
  (`src/i18n/adminManage.ts`); peças comuns em `src/components/admin/AdminListKit.tsx`, `src/hooks/useAdminList.ts`
  e `src/lib/csv.ts`. Migration `20261005180000_admin_list_customers_details.sql` (a lista de clientes traz o país do
  documento, o último acesso e se a conta é de administrador).
- Saíram 26 fotos de uma loja de lingerie que vieram na cópia do código (`public/images/*.jpg`): nada as usava, mas
  ficavam públicas no site.
- Área do cliente renovada. As abas ficaram em dois grupos (Compras e Minha conta) e há uma aba nova, Faturas, com o
  comprovante de cada pedido para imprimir ou salvar em PDF e o documento fiscal enviado pela loja (Admin > Pedidos >
  Documento fiscal para o cliente; bucket privado `invoices`, migration `20261005150000_customer_invoices.sql`). Os pedidos
  ganharam filtros, busca, linha do andamento e Comprar de novo. O Resumo mostra os pedidos em andamento, favoritos em
  promoção, Compre de novo, Escolhidos para você e atalhos para personalizar, tudo com dados reais.
- Cookies e privacidade (LGPD e RGPD) refeitos. Aviso novo, com Recusar e Aceitar do mesmo tamanho e o X a recusar os
  opcionais. As preferências mostram o que cada categoria guarda (nome, quem guarda, para quê, duração) e o código e a
  data da escolha. Estatística e Marketing só aparecem quando a loja liga o Google Analytics 4 ou o Meta Pixel no novo
  Admin > Privacidade e cookies, e só carregam com consentimento. A escolha expira (6 ou 12 meses), respeita o sinal GPC,
  apaga o que guardou ao ser retirada e fica registada no servidor sem IP (migration `20261005140000_consent_records.sql`),
  com contagens e CSV no Admin. A política de privacidade lista as ferramentas ligadas, as buscas recentes só ficam com
  consentimento de Preferências e a área do cliente ganhou o botão Preferências de cookies.
- Admin > Perguntas frequentes e Banners passaram a mudar o site. Na página /faq dá para esconder grupos de perguntas padrão
  e acrescentar perguntas da loja por idioma (migration `20261005130000_site_faqs_locale.sql`). Os banners viraram banners de
  campanha na página inicial (até 3, com datas de início e fim). O convite da newsletter do rodapé é editável e pode ser
  escondido em Conteúdo da página inicial. Saíram `Hero`, `DynamicBanner` e `PromoBanner`, que ninguém usava.
- Página inicial editável no Admin > Conteúdo da página inicial: textos de cada seção nos 4 idiomas (vazio = padrão),
  fotos do destaque e dos banners, mostrar ou esconder seções e a categoria em destaque (antes fixa em Geek), com
  Publicar e Desfazer (`store_settings.home_page`). O editor antigo dessa seção (tabelas da loja anterior) saiu do menu.
- O menu de categorias do site (barra do topo, mega menu, menu do celular, busca, página inicial, listagens, 404 e
  página do produto) passou a vir do Admin > Categorias: ícone, nome em cada idioma, ordem com setas, "Mostrar no
  menu", subcategorias e link interno opcional (migration `20261005120000_categories_menu.sql`). Sem categorias no
  menu, o site usa o catálogo padrão em código; um botão copia esse catálogo para o banco. A seção antiga Menu
  principal (`menu_items`, não usada pelo site) saiu do painel e `?tab=menu` abre Categorias.
- A loja virou modelo para outras lojas: nome, logos, cores, fontes, ícone da aba e descrição vêm da configuração
  (`src/config/store.ts`) e do Admin > Marca e visual (chave `store_brand`), com 6 modelos de cores prontos,
  pré-visualização ao vivo e aviso de contraste. O visual PRINT3D ficou como tema padrão desta loja (igual ao de antes).
  Guia: `docs/NOVA-LOJA.md`.
- Painel Admin reorganizado (o mesmo painel, melhorado): começa em Primeiros passos, cada seção mostra o que faz,
  seções que o site novo ainda não usa têm aviso, moldura do painel nos 4 idiomas.

### Visual e marca

- Galeria do produto com modelo 3D girável (STL, OBJ ou 3MF, `products.model_url`) depois da primeira foto e vídeos
  MP4/WebM (`products.video_urls`) no fim, ambos opcionais e enviados no Admin > Produtos > Imagens (bucket
  `product-media`, migration `20261005200000_produto_modelo_3d_e_videos.sql`); Vaso Facetado com o modelo em
  `public/models/vaso-facetado.stl`. Vantagens da página do produto passam a seguir os dados (sem "PLA" nem "sob
  encomenda" fixos), porque a loja é um modelo para qualquer ramo.
- Página do produto: com o produto (mesma cor e tamanho) já no carrinho, a quantidade passa a editar o carrinho e o
  botão principal (e o da barra fixa do celular) vira Ir para o carrinho.
- Catálogo em primeiro lugar: produto base Vaso Facetado (migration `20261005190000_produto_base_vaso.sql`, fotos
  renderizadas do modelo 3D em `public/images/produtos`); página inicial com o produto em destaque sobre o topo,
  vitrines antes dos banners de personalização, vitrines que repetiriam os mesmos produtos escondidas e a primeira
  linha completada com ideias Em breve; foto do banner do material cai para o produto em destaque; banner da
  categoria mostra fotos dos produtos quando não tem foto própria; página do produto com ficha rápida (material,
  tamanho e acabamento) antes da quantidade.
- Página inicial com movimento: parallax suave no topo (o produto desce mais devagar e o texto esmaece), nos círculos e
  no cartão do banner Crie sua peça e na foto do banner do material; títulos e barra de confiança entram ao rolar;
  hover nos cartões Em breve, Como funciona, banner e botões. Tudo parado com "reduzir movimento".
- Página inicial: título do topo sem a palavra "dia" sozinha na última linha (tamanho ajustado de 1024 a 1279px),
  brilho suave da cor principal atrás do texto, quadro do produto com borda e selo do material. Com o catálogo vazio
  fica uma só vitrine "Em breve" (com frase nova nos 4 idiomas) em vez de quatro iguais, e Inspirações só aparece
  quando houver fotos em `src/lib/media.ts`.
- O formulário Visual do Admin passa a sugerir as cores e a fonte da PRINT3D (antes sugeria o dourado da loja antiga)
  e a barra de anúncio vem desligada. `0d147fa`
- Cabeçalho sem rolagem horizontal em telas de 1024 a 1279px: mostra 4 categorias e as outras ficam em
  Todas as categorias, sem o botão quebrar linha. `7f6c976`

### Páginas

- `robots.txt` com um só grupo para todos os robôs (os bloqueios de páginas privadas valem também para Google e Bing)
  e o endereço do sitemap de loja3d.kodemi.pt. `0d147fa`
- Sobre, Contato, FAQ, Ajuda, página 404, Kits e avaliações refeitas no visual PRINT3D, sem a marca antiga. `80ec59f`
- Privacidade, Termos e Devoluções com texto por país (LGPD e CDC no Brasil, RGPD em Portugal e na Espanha)
  e novo aviso de cookies. `80ec59f`
- Rodapé mostra o Livro de Reclamações quando o país é Portugal; telefone em formato internacional. `80ec59f`
- Rodapé com o link Cookies, que reabre as preferências de cookies, e botão do WhatsApp nos 4 idiomas. `8f98a56`

### Checkout e conta

- Carrinho e gaveta do carrinho refeitos: itens em cartões, resumo fixo, barra de frete grátis do país e
  opção de desfazer a remoção de um item. `80ec59f`
- Checkout com endereço do país (no Brasil o CEP preenche o endereço), frete e pagamento do país e sem textos
  fixos de Portugal. No Brasil, peças personalizadas não pedem renúncia ao direito de arrependimento
  (art. 49 do CDC). `80ec59f`
- Conta refeita: login e cadastro pedem o documento fiscal do país; painel, pedidos, endereços, favoritos e
  rastreio no visual novo. `80ec59f`

### Multi-país e i18n

- Últimos textos do site traduzidos para os 4 idiomas: cupom, meios de pagamento por país, comprovante de
  pagamento, pedidos, rastreio e pausa de produção. O rastreio aponta para a transportadora do país (CTT em
  Portugal, Correios para códigos do Brasil) e fica sem link quando não há; estados do pedido com rótulo por
  idioma (o Admin continua em pt-BR); datas da pausa de produção no formato do idioma. `1406727`
- Carrinho, checkout, conta, páginas institucionais e legais passam a existir em pt-BR, pt-PT, inglês e
  espanhol e a seguir o país escolhido. `80ec59f`

### Backend e publicação

- Cópias de segurança diárias da base e dos arquivos enviados (03:30 de Brasília, `deploy/backup.sh` e timer
  `loja3d-backup`), verificadas antes de contarem, 7 diárias e 4 semanais, com envio opcional para fora do
  VPS (`LOJA3D_BACKUP_REMOTE`). O `restore.sh --ficheiros` restaura também os arquivos enviados. `fe5c8d1`
- Backend próprio no VPS em Docker, sem conta Supabase nem Lovable: PostgreSQL, login (GoTrue), REST
  (PostgREST), arquivos (storage) e funções (edge-runtime), com o site e a API no mesmo domínio; só a porta
  127.0.0.1:8190 fica aberta. `607750c`
- Migrations aplicadas sozinhas em cada publicação (`deploy/migrate.sh`: uma transação por arquivo, pg_dump
  antes) e `deploy/restore.sh` para voltar atrás. A migration `20261005100000_print3d_self_hosted.sql` apaga
  os produtos, textos e dados de exemplo da loja antiga, cria os buckets `dtf-uploads` e `payment-proofs` e
  deixa `store_settings` com o nome PRINT3D e campos vazios para o Admin preencher. `607750c`
- Publicação automática (`deploy/sync.sh`): build, backend, migrations e troca do site só se a versão nova
  responder; se falhar, volta à anterior. Funções que dependiam da Lovable (e-mails) ficam desligadas (503). `607750c`
- Admin mostra as URLs completas do webhook e das credenciais pelo endereço público da loja. `7f6c976`
- Script `deploy/expose-domain.sh` liga o subdomínio ao site no nginx do servidor, com HTTPS, mexendo só no
  arquivo da loja. `39bbb11`

### Segurança

- Login do Admin não carrega mais uma textura de um site externo. `19699f8`
- Arquivos enviados pelos clientes servidos com CSP sandbox (sem risco de XSS no domínio da loja), senha da
  base fora dos logs, OpenAPI do REST desligado e segredos gerados no próprio VPS (`deploy/gen-secrets.sh`,
  chmod 600, nunca impressos). `607750c`

### Documentação

- Documentação permanente para conversas novas: histórico (`docs/CHANGELOG.md`), funcionalidades
  (`docs/FUNCIONALIDADES.md`), guia visual (`docs/GUIA-VISUAL.md`) e a skill do projeto `print3d-marca`. `0d147fa`
- `CLAUDE.md` ganha o índice da documentação em `docs/` e a regra de atualizar a documentação ao terminar cada
  tarefa. `db152f7`
- Memória do projeto (`docs/MEMORIA.md`), logo original e direção de UI/UX do dono em `docs/brand/`; os
  documentos da Brindes M&L foram para `docs/legado-brindes/` (não descrevem a PRINT3D). `24ba442`
- `deploy/PASSO-A-PASSO.md`: passo a passo para pôr a loja online em loja3d.kodemi.pt. `d9e76fe`
- `CLAUDE.md` e `README.md` descrevem o backend próprio no VPS. `19699f8`
- Remove a pasta `.lovable` (notas e plano da ferramenta antiga). A atualização do `CLAUDE.md` e do README
  anunciada na mensagem deste commit entrou no seguinte, `19699f8`. `32855b1`

## 4 de outubro de 2026

### Visual e marca

- Logo oficial PRINT3D (cubo com P) no cabeçalho, menu, rodapé, favicons (32, 192 e 512), ícone da Apple e
  imagem de compartilhamento 1200x630, com versão clara do nome para o rodapé escuro. E-mails e sitemap com a marca
  PRINT3D e o endereço do segredo `SITE_URL`, sem o endereço físico da loja antiga. `1d6d427`
- Admin e e-mails sem a marca antiga; links de e-mail e do Admin usam `VITE_SITE_URL` (`src/lib/siteUrl.ts`)
  em vez de um domínio fixo. `c1a5bad`
- `index.html`, favicon e logo com a identidade PRINT3D; `robots.txt` e `llms.txt` da loja nova. `0fa5009`
- Cabeçalho sticky em duas linhas: busca com produtos (miniatura e preço), categorias, histórico e setas do
  teclado; botão laranja Todas as categorias com mega menu; no celular, menu lateral com acordeão. `d67725d`
- Rodapé escuro (#171717) com newsletter e colunas Comprar, Ajuda e Sobre. `d67725d`
- Identidade PRINT3D: paleta laranja e creme, fonte Inter embutida (no lugar da Plus Jakarta Sans), raios e
  sombras suaves, grade `.shell` de 1320px e primeiro logo PRINT3D com camadas de impressão (trocado pelo
  logo oficial em `1d6d427`). Padrões do Admin sem a cor, a fonte e o WhatsApp da loja antiga. `4f22f3e`
- Cabeçalho, rodapé e logo (cubo isométrico, nome padrão 3D Store) no estilo do modelo creme e dourado
  (substituídos em `4f22f3e` e `d67725d`). `b3ed2b2`
- Primeiro visual novo: creme, dourado e preto com a fonte Plus Jakarta Sans embutida; os tokens de cor da
  Brindes M&L passam a apontar para a paleta nova (substituído pela identidade PRINT3D em `4f22f3e`). `0a1bce1`

### Páginas

- Saem as notificações de vendas inventadas (`SalesPopup` e `SocialProof`). `c1a5bad`
- Orçamento 3D aceita STL, OBJ e 3MF, lê o arquivo num Web Worker (com alternativa na thread principal) e ganha o
  visual PRINT3D; testes de OBJ e 3MF em `scripts/test-print3d.mjs`. `aa56c05`
- Personalizador no visual PRINT3D, com a seção Como funciona e atalho para enviar arquivo 3D no orçamento. `5a8995f`
- Página inicial PRINT3D: hero, barra de confiança, categorias, destaques, Crie sua peça, mais vendidos,
  novidades, PLA sustentável, geek, como funciona, avaliações reais e inspirações. `d67725d`
- Menu: Personalizar abre o personalizador e Orçamento 3D ganha entrada própria; o botão principal da página
  inicial leva ao personalizador. `33af784`
- Nova página `/personalizar`: chaveiro e placa de nome em 3D com texto, fonte moderna ou clássica, uma ou duas
  cores (+15%), tamanho P, M ou G, quantidade, preço estimado na hora e pedido pelo WhatsApp. `ecb68c3`
- Modelos 3D gerados em código (`src/lib/parametric.ts`: chaveiro e placa de nome) e visualizador de peças com
  várias cores (`PartsViewer`). `ebb8f58`
- Orçamento 3D no visual creme e dourado (substituído em `aa56c05`). `ae292b3`
- Página inicial no estilo do modelo creme e dourado, com peça 3D interativa (substituída em `d67725d`). `ae244de`
- Nova página `/orcamento-3d`: envio de STL, visualizador 3D, material, cor, escala, preenchimento, qualidade,
  suportes e quantidade, orçamento na moeda do país e pedido pelo WhatsApp; custos e margem visíveis só para
  administradores. `2d13a77`
- Cálculo do Orçamento 3D a partir de STL (volume, área, medidas, peso, tempo e preço) em `src/lib/print3d.ts`,
  com teste. `eee3e55`

### Catálogo e produto

- Página do produto PRINT3D: galeria 55% e compra 45%, zoom e tela cheia, cores e tamanhos com acréscimo,
  faixas de preço por quantidade, abas de descrição, especificações, avaliações e perguntas, produtos relacionados,
  barra de compra fixa no celular e SEO com JSON-LD. Sai a lógica da loja antiga (DTF, metro, áreas de
  estampagem). `331d8c4`
- Listagens `/produtos` e `/categoria`: busca, filtros de categoria, preço e ofertas, ordenação, chips de
  filtros ativos, estado na URL, grade de 2 a 5 colunas e carregar mais. `1081bd9`
- Cartão de produto `ProductCard3D` (favorito, avaliação real, promoção, carrinho com confirmação); com o
  catálogo vazio aparece Em breve, sem preço nem avaliação inventados. Seis categorias no mega menu
  (`src/lib/catalog.ts`) e fotos por chave (`src/lib/media.ts`). `d67725d`

### Checkout e conta

- Carrinho de visitante: adicionar pelo cartão do produto grava nome, foto e preço (antes o item aparecia como
  "Produto" com preço 0,00). `ab31f67`

### Multi-país e i18n

- Formatos de endereço por país: CEP e estados no Brasil, código postal e distritos em Portugal, províncias
  na Espanha e ZIP nos Estados Unidos. `eb7b316`
- Seletor Entregar em no cabeçalho: trocar o país troca moeda, impostos, custos do orçamento e idioma
  sugerido. `0f9b6dd`
- O servidor (`create-order`) calcula o imposto e valida o documento fiscal pela regra do país de entrega;
  país inativo ou inexistente é recusado. `3c2dc26`
- Documento fiscal por país (CPF, CNPJ alfanumérico, NIF de Portugal, NIF/NIE/CIF da Espanha), com a mesma
  validação no site e no servidor; cadastro, perfil e checkout pedem o documento do país. `8e0e279`
- Impostos pela regra do país, sem 23% fixo: Brasil e Estados Unidos com preço final, Portugal e Espanha
  somam o IVA do país. `9b94893`
- Tabela `countries` com moeda, idioma, imposto, documento fiscal, código postal, frete, pagamento e nota
  fiscal por país (Brasil padrão, Portugal ativo, Espanha e Estados Unidos cadastrados inativos); dinheiro em
  centavos com formatação pelo idioma. `b709811`
- Base multi-país: idiomas pt-BR (padrão), pt-PT, inglês e espanhol e lista provisória de países (trocada pela
  tabela `countries` em `b709811`). `57cac7b`

### Backend e publicação

- Remove o `bun.lock` desatualizado (o Dockerfile usa `npm ci`). `0fa5009`
- Repositório definitivo `igorcf20/loja3d`, com os scripts de publicação atualizados. `7d29bc8`
- Repositório renomeado para `igorcf20/loja3d-kode-mi` (nome provisório; antes era `igorcf20/loja3d-brasil`). `7c84c3a`
- Primeiro kit de publicação no VPS (Docker, nginx e sincronização com o `main`), ampliado depois em `607750c`. `f90fbbb`
- Cópia inicial do código da Brindes M&L, sem histórico; as referências ao projeto Supabase antigo foram
  trocadas pelo marcador `SEU-PROJETO`. `84a87ac`

### Segurança

- Avisos internos de pedidos não vão mais para o e-mail da loja antiga: sem e-mail de aviso configurado no
  Admin, não são enviados. `c1a5bad`
- nginx do site com os cabeçalhos de segurança repetidos em `/index.html` (o nginx não os herda ali). `f90fbbb`
- `.gitignore` passa a ignorar `.env` e `.env.*` (exceto `.env.example`). `84a87ac`

### Documentação

- `CLAUDE.md`: arquivos 3D, página do produto, listagens, endereço por país e `siteUrl`. `7d1de45`
- `CLAUDE.md`: regras do visual PRINT3D. `e780845`
- `CLAUDE.md`: personalizador (como acrescentar um modelo novo). `33af784`
- `CLAUDE.md`: FASE 2 (países, impostos e documento fiscal). `0f9b6dd`
- `CLAUDE.md`: regras do primeiro visual (creme e dourado). `ae292b3`
- `CLAUDE.md`: a loja passa a ser multi-país, com o Brasil como país padrão e não o único. `9d24ea4`
- `CLAUDE.md` próprio da loja (então "Loja 3D Brasil"): pt-BR, tratamento por você, push no `main`, separação
  total do Supabase da Brindes M&L e regras de segurança. `723e649`

## Como manter

- Cada commit relevante (algo que o dono da loja ou um assistente futuro precise saber) acrescenta uma linha
  no topo do histórico (no dia mais recente), no mesmo formato: frase curta, escrita para o dono da loja,
  terminando com o hash curto (7 caracteres) entre crases.
- A linha vai no dia do commit (data do `git log --date=short`, em UTC). Se o dia ainda não existe, crie o
  título `## <dia> de <mês> de <ano>` acima do dia mais recente.
- Dentro do dia, use só as áreas que tiverem entradas, sempre nesta ordem: Visual e marca, Páginas, Catálogo
  e produto, Checkout e conta, Multi-país e i18n, Backend e publicação, Segurança, Documentação. Dentro da
  área, a entrada mais recente fica em cima. Um commit que mexe em várias áreas pode ter uma linha em cada.
- O hash só existe depois do commit. Escreva a linha no commit seguinte (ou num commit curto só do
  changelog logo depois) ou, se preferir pôr a linha no próprio commit da mudança, use `0d147fa` no lugar do
  hash e troque pelo hash certo no commit seguinte. Commits que só mexem neste arquivo não ganham linha própria.
- Não apague entradas antigas. Quando uma mudança substituir outra, diga isso na entrada nova e, se ajudar,
  acrescente "(substituído em `hash`)" na antiga, antes do hash dela.
- Mesmas regras do resto da documentação: português do Brasil, sem emojis, sem travessões e nunca chaves,
  senhas, tokens ou o conteúdo de `~/loja3d/env`.
- Para achar commits que ainda não estão aqui (ignore os que só mexem neste arquivo) e linhas ainda com
  `0d147fa`, rode na raiz do repositório:

  ```bash
  git log --format='%h %ad %s' --date=short | while read -r h rest; do
    grep -q "${h:0:7}" docs/CHANGELOG.md || echo "$h $rest"
  done
  grep -n '`0d147fa`$' docs/CHANGELOG.md
  ```
