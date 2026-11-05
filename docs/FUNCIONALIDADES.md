# Funcionalidades da PRINT3D

> Moni Cakes: tudo o que está abaixo veio da loja-modelo PRINT3D e vale igual aqui. Diferenças: a página inicial é a
> experiência cinematográfica da Moni Cakes (`src/pages/Index.tsx`, `docs/GUIA-VISUAL.md`); não há produtos nem banners
> de exemplo de impressão 3D; os protótipos de clientes foram retirados. Orçamento 3D e personalizador 3D continuam no
> código (recursos que o Admin pode desligar).

Inventário do que a loja faz hoje, com o estado de cada parte e onde ela está no código. Conferido no código e no
Git em 5/10/2026 (commit `db152f7`). Regras de trabalho e arquitetura: `CLAUDE.md`. Decisões do dono:
`docs/MEMORIA.md`. Visual: `docs/GUIA-VISUAL.md`. Histórico: `docs/CHANGELOG.md`.

Estados usados:

- **Pronto**: funciona hoje como deve.
- **Parcial**: funciona, mas com um limite conhecido (falta configuração, vale só para um país, depende de algo
  desligado). O limite está escrito ao lado.
- **Pendente**: ainda não existe, ou só existe como aviso "em breve".

"Resto da Brindes" é código herdado da Brindes M&L (loja de brindes e impressão DTF em Portugal, de onde este
repositório foi copiado) que a PRINT3D não usa ou usa só em parte. Os documentos dessa loja estão em
`docs/legado-brindes/` e não descrevem a PRINT3D.

## Resumo rápido

- Site público em 4 idiomas (pt-BR padrão, pt-PT, en, es), multi-país (Brasil padrão e Portugal ativos; Espanha e
  Estados Unidos cadastrados mas inativos), no visual PRINT3D.
- Catálogo, página de produto, carrinho, checkout com conta obrigatória, pedido calculado no servidor, cupom,
  avaliações, área do cliente e rastreio: prontos.
- Orçamento 3D e personalizador: calculam no navegador e fecham o pedido por WhatsApp (ou página de contato). Não
  entram no carrinho.
- Pagamento online: Mercado Pago, Stripe, PayPal e Viva Wallet prontos no código, à espera das contas do dono
  (Admin > Pagamentos); meios manuais (Pix por chave, transferência, Multibanco, MB WAY, Bizum) por país.
- E-mails automáticos desligados (sem SMTP nem função de envio própria).
- Backend próprio em Docker no VPS, com publicação automática e cópias diárias. O site ainda não está no ar: falta o
  dono seguir `deploy/PASSO-A-PASSO.md`.
- Painel Admin herdado da Brindes, reorganizado: abre em Estatísticas, Primeiros passos num cartão no canto, explicação por seção, marca editável (ver seção 6).
  Os ecrãs internos das seções antigas continuam só em português; quatro seções ainda não mudam nada no site.

## 1. Site

### 1.1 Peças comuns a todas as páginas

Cabeçalho e rodapé entram em cada página (importados nela ou via `PageShell` e `CatalogLayout`); as outras peças são
montadas uma vez em `src/App.tsx`, fora das rotas.

| Peça | Onde | O que faz | Estado |
|---|---|---|---|
| Cabeçalho | `src/components/Header.tsx`, `src/components/header/*` (`SearchBox`, `MegaMenu`, `MobileMenu`), `src/components/CountryPicker.tsx`, `src/components/Flag.tsx` | Duas linhas fixas no topo; busca com sugestões, categorias, histórico e miniaturas; botão Todas as categorias com mega menu e categorias em destaque com banner (foto da categoria ou gradiente; faixa deslizante no celular), configurável em Admin > Categorias > Menu de categorias (`store_settings.mega_menu`, `src/lib/megaMenu.ts`, teste `scripts/test-mega-menu.mjs`); seletor de país com bandeiras ("Escolha seu país"): o país escolhido define idioma e moeda (lista mostra os dois), com opção de trocar só o idioma no fim; favoritos, conta, carrinho; ícone do Admin só para administradores; menu lateral com acordeão no celular. Categorias do Admin > Categorias (`useCatalogMenu`, `src/lib/catalogMenu.ts`); sem nenhuma no menu, o catálogo padrão de `src/lib/catalog.ts` (6 categorias com subcategorias). i18n: `layoutMessages` (`src/i18n/layout.ts`) | Pronto |
| Rodapé | `src/components/Footer.tsx` | Links, newsletter (grava em `newsletter_subscriptions`), link Cookies que reabre as preferências, crédito KodeMI | Pronto |
| Barra do celular | `src/components/MobileTabBar.tsx` | Início, Produtos, Carrinho (com contador), Ajuda, Conta. i18n: `shellMessages` (`src/i18n/pagesShell.ts`) | Pronto |
| Gaveta do carrinho | `src/components/CartSheet.tsx` | Mesmo carrinho da página `/carrinho`. Está montada, mas hoje nada a abre: o ícone do cabeçalho leva a `/carrinho`, adicionar mostra um toast e só o `QuickViewModal` herdado (sem uso) chamava `useCartDrawer`. i18n: `cartMessages` | Parcial: sem gatilho |
| Aviso de cookies | `src/components/CookieConsent.tsx`, `src/lib/consent.ts`, `src/lib/privacy.ts`, `src/components/privacy/ConsentScripts.tsx` | Barra com Recusar e Aceitar do mesmo peso (X recusa os opcionais) e Personalizar; preferências com o que cada categoria guarda (`COOKIE_REGISTRY`), código e data da escolha; cita LGPD no Brasil e RGPD no EEE. Estatística e Marketing só aparecem com Google Analytics 4 ou Meta Pixel ligados no Admin (`store_settings.privacy_settings`) e só carregam com consentimento; retirar apaga os cookies. Escolha com validade (6 ou 12 meses), sinal GPC respeitado, registo sem IP em `consent_records`. i18n: `cookieMessages` (`src/i18n/legal.ts`). Teste: `scripts/test-privacy.mjs` | Pronto |
| Botão do WhatsApp | `src/components/WhatsAppButton.tsx` | Só aparece com número em Admin, Plugins & Módulos | Pronto |
| Voltar ao topo | `src/components/FloatingActions.tsx` | Aparece depois de 400 px de rolagem | Pronto |
| País e moeda | `CountrySync` (`src/lib/countries.ts`), `CurrencyLoader` (`src/App.tsx`, `src/hooks/use-currency.ts`) | País guardado no navegador; preços mostrados na moeda do país só se a loja tiver taxa de câmbio para ela, senão na moeda base | Parcial: as taxas estão vazias até o Admin atualizar (ver 5.2) |
| Marca e tema | `src/theme/*`, `src/config/store.ts`, `src/hooks/useBrand.ts`, `src/components/brand/BrandManager.tsx`, `Logo.tsx` | Nome, logos, cores, fontes, ícone da aba e descrição vindos de Admin > Marca e visual (sobre os valores-base de `src/config/store.ts`); aplicados antes do primeiro desenho (`bootTheme`) | Pronto (ver `docs/NOVA-LOJA.md`) |
| Volta depois do login | `src/components/PostAuthRedirect.tsx` | Leva o cliente de volta ao `?redirect=` (ex.: checkout) depois de entrar ou confirmar o e-mail | Pronto |

SEO: cada página define título e descrição com `react-helmet`. `/sitemap.xml` é gerado pela função `sitemap`
(rotas fixas, produtos e categorias ativos). `public/robots.txt` tem um só grupo `User-agent: *` que bloqueia Admin, checkout, carrinho, conta, favoritos e
pedidos, e aponta o sitemap de `https://loja3d.kodemi.pt` (mudar se o domínio mudar).
`public/llms.txt` descreve a loja para assistentes de IA.

### 1.2 Rotas

Todas em `src/App.tsx` (carregadas sob demanda, menos a página inicial). Páginas em `src/pages/`.

| Rota | Página | O que faz | Componentes e i18n principais | Estado |
|---|---|---|---|---|
| `/` | `Index.tsx` | Página inicial: topo editorial com foto real encostada à direita (sem foto, vaso 3D girável `StlViewer` + `src/lib/showcaseModels.ts`), quatro categorias do menu em fotos grandes (as outras em botões), História da marca (texto, duas fotos e cartão), barra de confiança, Destaques, banner Crie sua peça, Mais vendidos (só com vendas reais), Novidades, banner PLA, categoria em destaque (Geek por padrão), Como funciona, avaliações reais (nota 4 ou 5 de `product_reviews_public`; some se não houver), Inspirações (link do Instagram se cadastrado). As vitrines mostram primeiro o que as anteriores ainda não mostraram e somem se não trouxerem nada novo | `useHomeCatalog`, `useHomePage` (textos, fotos e seções do Admin), `ProductCard3D`, `ProductCardSoon`, `MediaImage`; `layoutMessages` | Pronto. Sem produtos, mostra cartões "em breve" sem preço. Fotos reais de modelos CC0 em `src/lib/media.ts` (`AVAILABLE`); chave fora da lista = reserva `LayerArt` |
| `/produtos` | `Products.tsx` | Listagem com busca no servidor (`?q=`), filtros e ordenação no navegador (até 500 produtos), estado na URL (`q`, `ordem`, `promo`, `cat`, `sub`, `preco`, `moeda`) | `src/components/catalog/*`, `useCatalogProducts`; `catalogMessages`; formato em Admin > Aparência da loja > Página de catálogo (`AdminCatalogPage`, `store_settings.catalog_page`: cabeçalho compacto ou banner, cartão Foto e texto ou Foto inteira, 3 ou 4 por linha, selo Destaque, filtros em coluna ou botão) | Pronto |
| `/categoria/:slug` | `Category.tsx` | Mesma listagem limitada à categoria; `?sub=` mapeado por `product_categories`, nome da categoria ou termos da subcategoria | `src/components/catalog/*`; `catalogMessages` | Pronto |
| `/produto/:id` | `ProductDetail.tsx` | Galeria 55% e compra 45%; cores, tamanhos, escalões por quantidade, promoção com contagem regressiva, estoque (só produtos não personalizáveis), abas Descrição, Especificações e Avaliações, perguntas do produto (`product_faqs`), relacionados, barra fixa no celular; preço no Pix e parcelas com destaque configurável (`SmartPrice`, Admin > Exibição de preços), códigos do produto onde a loja escolher (`ProductCodesLine`), calcular frete pelo CEP (`ShippingEstimate`), perguntas e respostas de clientes (`ProductQuestions`, Admin > Perguntas dos clientes); registra visita em `product_views` | `src/hooks/useProductPage.ts`, `src/components/product/*` (`ProductGallery`, `ProductOptions`, `AddToCartButton`, `MobileBuyBar`, `ProductDetailsTabs`, `ProductReviewsPanel`, `RelatedProducts3D`); `productMessages` | Pronto. Botão Personalizar oculto enquanto `/customizar/:id` for "em breve". Moni Cakes: cabeçalho da marca, foto em estúdio, Como encomendar e convite para bolo personalizado (`MoniCakeOrder`) |
| `/personalizar` | `Personalizar.tsx` | Personalizador 3D (ver seção 4) | `src/lib/parametric.ts`, `PartsViewer`; `customizerMessages` | Parcial: pedido por WhatsApp/contato |
| `/orcamento-3d` | `Orcamento3D.tsx` | Orçamento a partir de arquivo 3D (ver seção 4) | `src/lib/print3d.ts`, `StlViewer`; `print3dMessages` | Parcial: pedido por WhatsApp/contato |
| `/customizar/:id` | `Customizer.tsx` | Só mostra "A personalização para este produto estará disponível em breve" | Texto fixo em português, sem i18n | Pendente |
| `/kits` | `Kits.tsx` | Kits ativos com desconto; adiciona o kit inteiro ao carrinho (`src/lib/kitPricing.ts`); peça esgotada ou fora de venda bloqueia o kit; recurso `kits` (link no rodapé) | `kitsMessages` (`src/i18n/pages.ts`) | Pronto (precisa de kits criados no Admin) |
| `/kit/:slug` | `KitDetail.tsx` | Página do kit: galeria, destaques, peças com cor e tamanho à escolha, preços, descrição completa, outros kits; aviso no produto (`ProductKitOffer`), bloco na página inicial (`HomeKits`, capa `KitCover`), Complete o kit no carrinho, carrinho lateral e checkout (`CartKitHints`); onde aparecem em Admin > Kits > Onde oferecer (`store_settings.kits`) | `useKits`, `useKitSettings`, `src/lib/kits.ts`, `kitPageMessages` | Pronto |
| `/comparar` | `Compare.tsx` | Comparar até 4 produtos lado a lado (recurso `compare`): preço, avaliação, disponibilidade, marca, categoria, cores, tamanhos, especificações, só diferenças; botão `CompareToggle` e barra `CompareBar` no formato de Admin > Comparar produtos (em destaque ou discreto, `store_settings.compare`) | `src/lib/compare.ts`, `useCompareSettings`, `useCompareProducts`, `src/i18n/compare.ts` | Pronto |
| `/carrinho` | `Cart.tsx` | Etapas da compra, itens, cupom, resumo, barra de frete grátis, recomendações quando vazio | `CartSummary`, `CheckoutSteps`, `CartPromoMeta`, `CouponInput`; `cartMessages` | Pronto (ver seção 2 sobre frete grátis) |
| `/checkout` | `Checkout.tsx` | Contato, entrega, documento fiscal, pagamento e confirmação; exige conta; país de entrega com seletor na etapa Endereço e Entregar neste endereço para endereços de outro país ativo | `AddressForm`, `BillingTaxIdCard`, `VivaCardEmbed`, `CouponInput`; `checkoutMessages`, `addressMessages` | Parcial (ver seção 2) |
| `/avaliacoes` | `StoreReviews.tsx` | Avaliações aprovadas da loja e dos produtos (abas), nota média, barras por estrelas, Ver mais, Avaliar a loja; recurso `store_reviews` | RPC `store_reviews_public`, `storeReviewsMessages`; pronto |
| `/pedido/:orderId/sucesso` | `OrderSuccess.tsx` | Confirmação do pedido; instruções do meio de pagamento (Pix, transferência, Multibanco, MB WAY, pagamento na entrega, Viva); envio de comprovante; pagar com Viva de novo se pendente | `PaymentProofUploader`, `VivaCardEmbed`; `checkoutMessages` | Pronto |
| `/pagamento/viva/retorno` | `VivaReturn.tsx` | Volta da página da Viva: confirma o pagamento com `viva-verify-payment` e leva ao pedido | `checkoutMessages` | Parcial: Viva sem credenciais e só PT |
| `/pedido/:orderId/configurar` | `OrderConfigure.tsx` | Cliente escolhe entrega, endereço e pagamento de um pedido criado pelo Admin (`finalize-manual-order`) | Textos fixos em pt-PT, sem i18n; endereço com Freguesia e Distrito e `country: "PT"` fixo | Parcial: resto da Brindes |
| `/rastrear` | `OrderTracking.tsx` | Busca pelo código do pedido (com sessão; e-mail só para pedidos antigos sem conta); etapas, eventos de rastreio (`tracking_events`), endereço de entrega | `OrderPaymentDetails`, `OrderHelp`; `accountMessages` | Pronto (eventos só chegam por CTT) |
| `/minhas-compras` | `MyOrders.tsx` | Lista de pedidos do cliente | `OrderHistory`; `accountMessages` | Pronto |
| `/dashboard` | `Dashboard.tsx` | Área do cliente (ver seção 3) | `src/components/dashboard/*`; `accountMessages` | Pronto |
| `/favoritos` | `Wishlist.tsx` | Favoritos do cliente (tabela `wishlist`) | `FavoritesGrid`; `accountMessages` | Pronto |
| `/auth` | `Auth.tsx` | Entrar, criar conta, esqueci a senha, nova senha (`?mode=recovery`), aviso de confirmar e-mail | `PhoneInputWithDDI`, `useTaxIdRules`; `accountMessages` | Parcial: recuperação de senha e confirmação de e-mail precisam de SMTP |
| `/avaliar/:orderId/:productId` | `ReviewProduct.tsx` | Avaliação de um produto de um pedido entregue (`submit-product-review`) | `reviewMessages` | Pronto |
| `/avaliar/pedido/:orderId` | `ReviewOrder.tsx` | Lista os produtos do pedido para avaliar | `reviewMessages` | Pronto |
| `/deixar-avaliacao` | `LeaveReview.tsx` | Depoimento sobre a loja, gravado como pendente em `home_section_items` | `reviewMessages` | Parcial: a página inicial nova não mostra esses depoimentos |
| `/contatos` | `Contact.tsx` | Formulário de contato (grava em `contact_messages`) e canais da loja | `contactMessages` | Parcial: o aviso por e-mail ao Admin falha (função de e-mail desligada) e o Admin não tem tela para ler as mensagens |
| `/sobre` | `About.tsx` | Página institucional | `src/components/institutional/*`; `aboutMessages` | Pronto |
| `/faq` | `Faq.tsx` | Perguntas frequentes do i18n, adaptadas ao país (documento fiscal, países atendidos), menos os grupos escondidos no Admin, mais as perguntas da loja (`site_faqs`, por idioma) | `faqMessages`, `useSiteFaqs` | Pronto |
| `/como-utilizar` | (redireciona) | Vai para `/faq` | | Pronto |
| `/ajuda` | `HelpAndTerms.tsx` | Central de ajuda com atalhos e preferências de cookies | `helpMessages` | Pronto |
| `/politica-privacidade`, `/termos`, `/devolucoes` | `PrivacyPolicy.tsx`, `TermsOfService.tsx`, `ReturnsPolicy.tsx` | Textos legais da jurisdição do país atual: `src/legal/br.ts` (LGPD, CDC), `pt.ts` (RGPD, lei portuguesa), `es.ts`, `intl.ts` (inglês, demais países). Sem o endereço da loja | `src/legal/LegalPage.tsx`; `legalMessages` | Pronto |
| `/unsubscribe` | `Unsubscribe.tsx` | Cancela e-mails promocionais por token (`handle-email-unsubscribe`) | `unsubscribeMessages` | Parcial: sem e-mails enviados, não há tokens |
| `/shop-kodeadmin` | `AdminLogin.tsx` | Login do Admin (confere `has_role`) | Sem i18n | Pronto |
| `/admin` | `Admin.tsx` | Painel Admin (ver seção 6) | Sem i18n | Parcial |
| `/admin/produto/:id` | `AdminProductEdit.tsx` | Criar (`novo`) e editar produto, dentro da moldura do painel (ver seção 6) | 4 idiomas (abas incluídas) | Pronto |
| `/admin/pedidos/:id` | `admin/AdminOrderPage.tsx` | Página do pedido no Admin (ver seção 6) | `adminPagesMessages`; blocos herdados em português | Pronto |
| `/admin/pedidos/novo` | `admin/AdminOrderNewPage.tsx` | Pedido manual (`orders/ManualOrderForm`) | Formulário herdado em português | Parcial |
| `/admin/clientes/:id` | `admin/AdminCustomerPage.tsx` | Página do cliente no Admin | `adminPagesMessages` | Pronto |
| `/admin/clientes/novo`, `/admin/clientes/:id/editar` | `admin/AdminCustomerFormPage.tsx` | Criar e editar cliente | `adminPagesMessages` | Pronto |
| `*` | `NotFound.tsx` | Página 404 com atalhos para categorias | `notFoundMessages` | Pronto |

`src/pages/Configurator.tsx` (configurador de DTF da Brindes) existe mas não tem rota nem é importado.

## 2. Carrinho e checkout

### 2.1 Fluxo

1. O cliente adiciona pelo cartão (`ProductCard3D` com `useQuickAdd`; produto com opções leva à página do produto),
   pela página do produto (`AddToCartButton`) ou pela página de kits.
2. Carrinho (`src/hooks/useCart.tsx`): visitante no navegador (`localStorage` `guest_cart`); com sessão, tabela
   `cart_items` (somada aos itens do navegador). Página `/carrinho` (a gaveta `CartSheet` existe, mas nada a abre hoje).
3. `/checkout` exige conta: sem sessão vai para `/auth?redirect=/checkout`. Antes de finalizar exige perfil completo
   (nome, telefone e documento fiscal válido do país), endereço no formato do país, forma de entrega, meio de
   pagamento disponível no país e, quando há itens personalizados, aceitar os termos de personalizados. Com a pausa
   de produção ligada (Admin, Plugins & Módulos), pede também a confirmação do cliente e grava uma nota no pedido.
4. O pedido é criado pela Edge Function `create-order`; depois vai para `/pedido/:id/sucesso` ou, com Viva, abre o
   pagamento (`VivaCardEmbed`).

Apresentação (Admin > Pagamentos e entrega > Carrinho e checkout, `AdminCheckoutPage`, `store_settings.checkout_page`,
`src/lib/checkoutPage.ts`, `useCheckoutPage`): etapas preenchidas recolhidas numa linha com Alterar e botão Continuar em
cada etapa aberta (as pendências do checkout dizem a que etapa pertencem), barra fixa no celular com o total e o botão
para a próxima pendência ou Finalizar, topo curto, cupom atrás de um link (`CouponReveal`), selos de compra segura e
linhas compactas do carrinho no celular. Modelo Clássico = como antes. Só muda o visual; o servidor confere tudo igual.

Estado: **Parcial**. O fluxo funciona, mas o frete e o pagamento dependem do país e da configuração (2.4 e 2.5).

### 2.2 Cálculo no servidor

- `supabase/functions/create-order/index.ts` recalcula tudo a partir da base: linhas (`priceItems` em
  `supabase/functions/_shared/pricing.ts`: escalão por quantidade ou promoção, acréscimos de cor e tamanho, áreas de
  personalização e materiais, desconto de kit só com o kit completo), imposto pela regra do país
  (`_shared/countries.ts`: `lineTaxRate`, `shippingTaxRate`), frete (`shippingFor`), cupom (`couponDiscount`) e total.
  Os dados do cliente e o documento fiscal vêm do perfil, nunca do pedido enviado pelo navegador.
- O preço de cada linha enviado pelo navegador é aceito se não for menor que o de tabela (pode ser maior, nunca
  menor); o total usa esse preço.
- Grava pela RPC `create_order_server` (só `service_role`), que aplica os gatilhos da base: `orders_secure_amounts`
  (desconto do cupom a partir de `subtotal_net` e contagem de usos), `order_items_reserve_stock` (baixa o estoque de
  produtos não personalizáveis) e `orders_release_resources` (devolve estoque e cupom ao cancelar ou reembolsar).
- Estoque: antes de gravar, `create-order` confere o estoque de agora de cada linha (RPC `cart_stock_check`, a mesma
  procura do trigger; `_shared/cartStock.ts` reparte as linhas do mesmo estoque) e responde 409 `out_of_stock` com as
  linhas a ajustar. Na compra do cliente a baixa é sempre estrita, mesmo para quem tem conta de admin
  (`loja3d.customer_checkout`). Carrinho, gaveta e checkout (`useCartStock`, `CartStockNotice`) mostram o que esgotou
  ou tem menos unidades e só deixam finalizar depois de ajustar.
  Antes disso, nada esgotado entra no carrinho: `useCart` confere o carrinho mais a linha nova pela mesma RPC antes de
  gravar (`CartStockError`, aviso "Este produto esgotou" ou "Só restam N"), para todos os botões (cartões, página do
  produto, kits, carrinho). Os cartões de compra direta (`ProductCard3D`, `useCardStock`, uma chamada por tela) mostram
  um skeleton até saber o estoque e, esgotados, a etiqueta "Esgotado" e o botão que leva à página do produto. Na página
  do produto o botão de compra (e a barra fixa do celular) fica em skeleton até as opções e o estoque carregarem.
- Reserva no carrinho (recurso `cart_reservations`, ligado): a mesma chamada reserva as unidades por um tempo
  configurável (`cart_reservations`, regras em `store_settings.cart_reservations`); o estoque que os outros veem é o de
  agora menos as reservas ativas dos outros. Visitante pelo token do aparelho, conta pelo utilizador. Aviso com o tempo
  restante opcional. Admin > Estoque > Reserva no carrinho.
- Os clientes não têm INSERT em `orders` nem `order_items` (migration `20261002120000_server_side_order_creation.sql`).
  Os caminhos antigos que ainda estão no `Checkout.tsx` (RPC `create_order_checkout`, gravação direta e
  `guest-order` para visitante) não funcionam mais: a RPC foi revogada e `guest-order` responde 410.
- Teste: `node scripts/test-order-pricing.cjs`.

Estado: **Pronto**.

### 2.3 Cupom

- `src/hooks/useCoupon.tsx` + `src/components/CouponInput.tsx`. Usa a RPC `check_coupon` (exige sessão; bloqueia 15
  minutos depois de 10 códigos errados; migration `20261002120100_coupon_check_rate_limit.sql`), com recurso a
  `validate_coupon` se a RPC nova não existir.
- O servidor valida de novo ao criar o pedido (ativo, validade, usos, compra mínima) e o gatilho conta o uso.
- Cupons gerenciados em Admin, Cupons (página própria de cada cupom). Regras (ligado, início e fim, usos no total e por
  cliente, só na primeira compra, compra mínima, desconto máximo) em `public.coupon_quote` (migration
  `20261006120000_coupon_rules.sql`), usada pelo trigger `orders_secure_amounts` e por `couponDiscount`; `check_coupon`
  segue as mesmas regras e devolve `max_discount` para o carrinho mostrar o teto.

Estado: **Pronto**.

### 2.4 Frete por país

Frete por transportadora (novo, Admin > Frete e entrega): com pelo menos uma forma de envio ligada, o checkout pede
as opções à função `shipping-quote` para o endereço escolhido e o `create-order` recalcula a opção escolhida
(`shipping_service_id`, grava `orders.shipping_details`). Regras em `supabase/functions/_shared/shipping/`:
o endereço cai na zona mais específica (`shipping_regions`: países ou `*`, regiões, códigos postais `9000..9399` ou
prefixo); o preço vem da faixa de peso (`shipping_service_rates`, centavos da moeda da zona) ou da cotação automática
(Melhor Envio, Sendcloud; credenciais em `integration_credentials`), convertido para a moeda base da loja com as taxas
de `currency_settings`; peso cobrado com peso volumétrico (`products.dimensions` / divisor do serviço); frete grátis
por faixa ou por `countries.free_shipping_from_cents`; produtos recusados (`shipping_services.excluded_products`); base da tabela
(`rate_basis`: peso, itens, valor ou único) com taxa fixa, percentual e mínimo (`fee_cents`, `fee_percent`, `min_price_cents`, moeda base);
classes de envio do produto (`products.shipping_class`)
recusadas por serviço. Estado: **Pronto** (cotações automáticas sem teste com conta real). Sem formas de envio
ligadas, valem as regras antigas abaixo.

| Situação | Regra no servidor (`shippingFor`) | Estado |
|---|---|---|
| Retirada na loja (`delivery_methods.type = pickup`) | Frete 0 | Pronto |
| Método com `config.shipping_mode = 'flat_rate'` | `flat_rate + extra_cost`, em qualquer país | Pronto |
| Portugal, método "calculado" | Zonas por distrito (Continente; Madeira e Açores só por orçamento); grátis no Continente a partir de 50 de subtotal líquido (valor fixo no código); senão tabelas `shipping_zones`/`shipping_rates` ou valores de reserva no código | Parcial: só Portugal |
| Outros países sem método `flat_rate` | O checkout explica e bloqueia | Parcial |
| Frete por CEP (Brasil) e por código postal | Pelas formas de envio (acima) | Pronto |
| Frete grátis por país (`countries.free_shipping_from_cents`) | Aplicado nas formas de envio (acima) | Pronto |

Atenção: a barra de frete grátis do carrinho (`src/components/CartPromoMeta.tsx`) usa `free_shipping_from_cents` do
país, mas o servidor não aplica esse valor. O método de entrega que vem das migrations ("Entrega em Domicílio") não
tem `shipping_mode`; fora de Portugal o checkout fica bloqueado até o Admin configurar um método de tarifa fixa.

### 2.5 Pagamentos

Meios em Admin > Pagamentos (`AdminPaymentConfig.tsx`, páginas `?tab=payments&ver=meio&id=`; tabela
`payment_config`, lidos pela RPC `get_active_payment_methods`). Cada meio tem países (vazio = todos), desconto em %
(até 50%, sobre os produtos), valor mínimo e máximo, nome e instruções por idioma. Catálogo dos meios em
`src/lib/paymentMethods.ts`; regras iguais no servidor (`_shared/payments/methods.ts`, `methodBlock`,
`paymentDiscount`). O `create-order` recusa um meio fora do país ou dos limites e grava `orders.payment_discount`.

| Meio | País | Como funciona | Estado |
|---|---|---|---|
| Pix (`pix`) | BR | Manual: chave Pix para copiar, comprovante enviado pelo cliente, Admin confirma o pagamento | Pronto (Pix automático pelo Mercado Pago) |
| Transferência (`transfer`) | Todos | Manual: dados bancários, comprovante, confirmação no Admin | Pronto |
| Pagamento na entrega (`on_delivery`) | Todos | Para retirada na loja | Pronto |
| Multibanco, MB WAY (`multibanco`, `mbway`) | PT | Manual: dados para pagar, comprovante | Pronto |
| Bizum (`bizum`) | ES | Manual: número Bizum, comprovante | Pronto |
| Mercado Pago (`mercado_pago`) | BR | Checkout Pro (Pix, cartão, boleto) aberto pelo servidor; cobra em BRL | Parcial: sem conta real testada |
| Stripe (`stripe`) | Todos | Checkout Session (cartão, Apple Pay, Google Pay, meios locais) | Parcial: sem conta real testada |
| PayPal (`paypal`) | Todos | Orders v2; o servidor captura ao voltar | Parcial: sem conta real testada |
| Viva Wallet (`viva`) | Países com `viva` em `countries.payment_providers` (hoje PT) | Smart Checkout: `viva-create-order` (até 6 sessões por hora por pedido; confere o preço de novo com `checkOrderPricing`), `viva-webhook` e `viva-verify-payment` confirmam na API da Viva (estado, código, EUR, valor) via `_shared/viva.ts` (`settlePayment` idempotente); reembolso total ou parcial pelo Admin (`viva-refund`, tabela `payment_refunds`); teste de ligação `viva-test-connection` | Parcial: sem credenciais; cobra em euros (ver Pendências) |

Mercado Pago, Stripe e PayPal: `payment-start` abre o pagamento (sessão em `payment_sessions` com valor e moeda
esperados), o cliente volta para `/pedido/<id>/sucesso?pagamento=retorno` e `payment-verify` (ou o aviso do provedor em
`payment-webhook?provider=`) confere estado, referência, moeda e valor na API do provedor antes de marcar pago
(`_shared/payments/`). Contas e chaves em Admin > Pagamentos (ou Integrações).

Comprovante: `src/components/PaymentProofUploader.tsx` chama `submit-payment-proof` (bucket privado
`payment-proofs`). O Admin vê e também pode enviar o comprovante (`AdminPaymentProof`, `AdminPaymentProofUpload`) e
muda o estado do pagamento com a RPC `admin_set_payment_status`.

`src/components/PaymentMethods.tsx` (ícones dos meios ativos para o país, filtrados como no checkout, SVG do pacote `simple-icons` sem pedidos a terceiros) aparece no rodapé e no checkout.

### 2.6 Faturação

- Portugal: FIZ (fatura certificada). `_shared/fiz.ts` + função `fiz-invoice` (Admin: `company`, `draft`, `issue`,
  `pdf`), tabela `order_invoices`. Com `auto_mode` (rascunho ou emitir) em Admin, Integrações, a fatura sai ao
  confirmar um pagamento Viva (`autoInvoiceOnPaid`, nunca bloqueia o pagamento). Emitir é fiscal e irreversível.
  Estado: **Parcial** (sem chave; não consulta `countries.invoice_provider`).
- Brasil: NF-e. Estado: **Pendente**.

### 2.7 Avisos por e-mail do pedido

`src/lib/notifyOrderEmail.ts` chama `send-transactional-email` ao criar o pedido; a função está desligada (503) e o
pedido segue sem bloquear. Estado: **Pendente** (ver seção 10, E-mails).
Os modelos (`_shared/email-templates/`, `_shared/transactional-email-templates/`) usam o nome, a frase e o logótipo
gravados no Admin (`_shared/storeBrand.ts`), também no assunto e no remetente.

## 3. Conta do cliente

| Funcionalidade | Onde | Estado |
|---|---|---|
| Criar conta: nome, e-mail, telefone com DDI, documento fiscal do país (quando exigido), senha com regras, termos, opção de marketing (grava em `newsletter_subscriptions`); perfil em `user_profiles` (`tax_id` + `tax_id_country`) | `src/pages/Auth.tsx`, `src/hooks/useTaxIdRules.ts` | Pronto. Sem SMTP a conta fica ativa na hora (GoTrue com autoconfirm) |
| Entrar, voltar para onde ia (`?redirect=`) | `Auth.tsx`, `PostAuthRedirect` | Pronto |
| Esqueci a senha e nova senha (`/auth?mode=recovery`) | `Auth.tsx` | Parcial: o e-mail de recuperação precisa de SMTP |
| Limite de tentativas de login | `auth-rate-limit` (chamado pelo navegador; falha em aberto) e limites por IP do GoTrue (`deploy/compose.yaml`) | Parcial |
| Área do cliente `/dashboard?tab=resumo\|pedidos\|faturas\|favoritos\|perfil\|moradas\|seguranca\|privacidade` (aceita também os nomes antigos em inglês), abas em dois grupos: Compras e Minha conta | `src/pages/Dashboard.tsx` | Pronto |
| Lembrete de avaliação: pedidos entregues com produtos por avaliar no Resumo e em Pedidos (`ReviewReminder`); e-mail preparado em `review_requests` (sai quando houver remetente; Admin > Avaliações liga e define os dias) | `src/components/dashboard/ReviewReminder.tsx`, migration `20261008010000_review_requests.sql` | Pronto (e-mail espera o remetente) |
| Resumo: estado da conta, pedidos em andamento com a linha do andamento, aviso de favoritos em promoção, Compre de novo (produtos já pedidos), Escolhidos para você (mais vendidos ainda não comprados), atalhos para personalizar e orçamento 3D | `src/components/dashboard/AccountForYou.tsx`, `OrderProgress.tsx`, `src/hooks/useProductCards.ts` | Pronto |
| Faturas: dados para o documento fiscal, comprovante de cada pedido para imprimir ou salvar em PDF, documento fiscal (número, data e PDF enviado pelo Admin no pedido; bucket privado `invoices`, função `my_invoices()`) | `src/components/dashboard/InvoicesView.tsx`, migration `20261005150000_customer_invoices.sql` | Pronto |
| Pedidos: filtros (todos, em andamento, concluídos, cancelados) e busca, andamento em etapas, Comprar de novo, estado, detalhes de pagamento, pedir cancelamento (RPC `request_order_cancellation`), avaliar, avisos de pedido manual a configurar e de arquivos pendentes | `src/components/dashboard/OrderHistory.tsx`, `OrderPaymentDetails.tsx` | Pronto |
| Endereços no formato de cada país (CEP e estados, código postal e distritos, províncias, ZIP); preenchimento pelo CEP via ViaCEP no Brasil | `src/components/dashboard/AddressManager.tsx`, `AddressForm.tsx`, `src/lib/addressFormats.ts`, `src/hooks/useAddresses.tsx` | Pronto |
| Favoritos: ordenar (mais recentes, menor e maior preço) e filtro Em promoção | `src/components/dashboard/WishlistView.tsx`, `src/hooks/useWishlist.tsx` | Pronto |
| Formato da área do cliente (Admin > Aparência da loja > Área do cliente): saudação compacta ou grande, números e explicações no menu, números do Resumo em faixa, cartões ou nada, aviso de conta pronta, cada bloco do Resumo, itens do pedido em lista ou fotos, Comprar tudo de novo, ordenar favoritos, cartão de ajuda; modelos Recomendado e Clássico | `src/lib/accountPage.ts`, `src/hooks/useAccountPage.ts`, `src/components/admin/AdminAccountPage.tsx`, textos `accountPage.ts` e `adminAccountPage.ts`, teste `scripts/test-account-page.mjs` | Pronto |
| Perfil (nome, telefone, documento fiscal) | `src/components/dashboard/ProfileView.tsx` | Pronto |
| Segurança (trocar e-mail e senha) | `SecuritySection` em `ProfileView.tsx` | Parcial: a troca de e-mail pede confirmação por e-mail (precisa de SMTP); a de senha está pronta |
| Privacidade: exportar dados (`export-my-data`), preferências de cookies e apagar a conta (`delete-my-account`, anonimiza os pedidos) | `src/components/dashboard/DangerZone.tsx` | Pronto |
| Devoluções e trocas (`?tab=devolucoes`): botão Devolver ou trocar nos pedidos enviados dentro do prazo, formulário com itens e quantidades, motivo, troca ou reembolso (opções da loja) e comentário; lista com estado e resposta da loja. O servidor confere tudo (RPC `request_return`, códigos de erro estáveis traduzidos no site) | `src/components/dashboard/ReturnsView.tsx`, `src/hooks/useReturns.ts`, `src/lib/returns.ts`, textos `src/i18n/returns.ts` | Pronto |
| Mensagens da loja no pedido (notas que o Admin marcou como visíveis) | `src/components/dashboard/OrderMessages.tsx`, `useCustomerOrderMessages` | Pronto |
| Rastreio | `/rastrear` (seção 1.2) | Pronto |
| Avaliações de produto (só pedido entregue, sem duplicados); selo Compra verificada, origem, foto e resposta da loja na página do produto | `submit-product-review`, `product_reviews`, vista pública `product_reviews_public`, `ProductReviewsPanel` | Pronto |

## 4. Orçamento 3D e personalizador

### 4.1 Orçamento 3D (`/orcamento-3d`)

- Aceita STL, OBJ (assumido em mm) e 3MF (zip lido com `fflate`, com unidade e transformações). `parseModel` em
  `src/lib/print3d.ts`; leitura num Web Worker, com recurso à thread principal. O arquivo é lido só no navegador e
  não é enviado à loja.
- Mostra a peça em 3D (`src/components/print3d/StlViewer.tsx`), medidas, volume e se cabe na mesa (220 x 220 x 250 mm
  por padrão).
- Opções: material (PLA, PETG, ABS, TPU), qualidade (camada 0,12 / 0,20 / 0,28 mm), preenchimento, suportes,
  escala, quantidade (até 500) e país. Os custos de partida vêm de `countries.print3d` do país escolhido.
- Fórmula em `estimate()` (material + máquina + acabamento, com margem e taxa de pagamento).
- Administrador logado vê o detalhe de custos e pode mudar os parâmetros na própria página (só no navegador).
- Pedido: botão que abre o WhatsApp com a mensagem pronta (número de Admin, Plugins & Módulos) ou, sem número, a
  página de contato.
- i18n: `print3dMessages` (`src/i18n/print3d.ts`). Teste: `node --experimental-strip-types scripts/test-print3d.mjs`.

Estado: **Parcial**. Pronto como orçamento; falta enviar o arquivo, pôr no carrinho e recalcular o preço no servidor.

### 4.2 Personalizador (`/personalizar`)

- Modelos gerados em código em `src/lib/parametric.ts`: chaveiro (até 14 caracteres) e placa de nome (até 22).
  Fontes Droid Sans e Droid Serif Bold do three.js (com acentos), carregadas só nesta página. Tamanhos pequeno, médio e grande (`S`, `M`, `L` no código).
- 9 cores; base e detalhe em duas cores (acréscimo de 15%) ou uma cor. Visualizador de várias peças
  `src/components/print3d/PartsViewer.tsx`.
- Preço estimado no navegador com `measureStl` e `estimate` (custos do país atual).
- Pedido e pedido de orçamento por WhatsApp (ou página de contato); atalho para o Orçamento 3D com arquivo próprio.
- Novo modelo: entrada em `TEMPLATES` + ramo em `buildModel` + textos em `src/i18n/customizer.ts`.

Estado: **Parcial**. Falta carrinho e preço no servidor.

### 4.3 Personalização de produtos do catálogo (`/customizar/:id`)

Só aviso "em breve". O fluxo de arte por áreas da Brindes (`QuickUploadModal`, `MultiAreaCustomizer`,
`src/utils/pendingDesigns.ts`, funções `register-order-design`, `confirm-order-design`, `verify-order-files`,
`delete-order-design`, `cleanup-design-files`, bucket `dtf-uploads`) continua no código e o carrinho, o checkout e
`OrderSuccess.tsx` ainda o tratam, mas nenhuma página da PRINT3D chega a ele. Estado: **Pendente**.

## 5. Multi-país

### 5.1 Países

- Tabela `countries` (migration `20261004100000_countries.sql`): moeda, idioma sugerido, telefone, regra de impostos,
  documento fiscal, formato do código postal, provedores de frete, pagamento e nota fiscal, frete grátis, custos do
  orçamento 3D, ativo e padrão.
- Linhas iniciais: BR (BRL, padrão, ativo), PT (EUR, ativo), ES (EUR, inativo), US (USD, inativo).
- Site: `src/lib/countries.ts` (`useCountries`, `useCountry`, `getCountry`, `CountrySync`, `countryName`), seletor
  `CountryPicker` no cabeçalho; sem a tabela, vale a lista de reserva BR/PT. Na primeira visita sugere o país pela
  região do navegador.
- Servidor: `supabase/functions/_shared/countries.ts` (`loadCountry`, reserva BR).
- Não há tela no Admin para países: hoje só por SQL. A aba Regional & Moeda tem uma lista antiga de países de envio
  internacional que o site não usa.

Estado: **Parcial** (falta tela no Admin).

### 5.2 Moedas

- Dinheiro: `src/lib/money.ts` (centavos, `formatMoney`, `formatCents`; usado no orçamento 3D, no personalizador e em partes do Admin).
  Os preços do catálogo, carrinho e pedidos ainda usam `formatPrice` (`src/utils/currency.ts`) e a conversão de
  `src/hooks/use-currency.ts`.
- Preços na base estão na moeda base da loja (`store_settings.currency_settings.default`, BRL desde a migration
  `20261005100000_print3d_self_hosted.sql`). As taxas de câmbio ficaram vazias; o Admin preenche em Config Gerais,
  Regional & Moeda, pelo botão que chama `update-exchange-rates` (open.er-api.com). Não há agendamento automático.
- Pedidos gravam valores decimais, sem coluna de moeda.

Estado: **Parcial**.

### 5.3 Idiomas

- `src/i18n/index.ts`: pt-BR (padrão), pt-PT, en, es; idioma guardado no navegador, sugerido pelo navegador, seletor
  no cabeçalho. Cada dicionário define o pt-BR e o TypeScript obriga os outros idiomas a terem as mesmas chaves.
- Dicionários: `layout` (cabeçalho, rodapé, início), `catalog`, `product`, `cart`, `checkout`, `payments`, `account`,
  `orders`, `address`, `taxId`, `pages` (sobre, contato, FAQ, ajuda, 404, kits, avaliações, unsubscribe),
  `pagesShell`, `legal` (+ cookies), `print3d`, `customizer`.
- Sem i18n: painel Admin, `AdminLogin`, `Customizer.tsx` ("em breve"), `OrderConfigure.tsx` e as mensagens de erro das
  Edge Functions (em pt-PT).

Estado: **Parcial** (site completo; Admin e erros do servidor não).

### 5.4 Impostos

- `countries.tax_mode`: `inclusive` (BR, US: preço já final, imposto 0) ou `vat` (PT, ES: soma `default_tax_rate`; o
  frete soma `shipping_tax_rate`).
- Site: `src/utils/pricing.ts` (`getVatRate`, `withVat`, `showsTaxSeparately`). Servidor: `lineTaxRate` e
  `shippingTaxRate`. O `vat_rate` de cada produto (padrão 23, herdado) não é usado no site nem no `create-order`.

Estado: **Pronto** no site e no `create-order`; **Parcial** no caminho da Viva (ver Pendências).

### 5.5 Documento fiscal

- CPF, CNPJ (inclusive alfanumérico), NIF de Portugal, NIF/NIE/CIF de Espanha, ou nenhum.
- `src/lib/taxId.ts` é cópia de `supabase/functions/_shared/taxId.ts`; `useTaxIdRules()` dá rótulo, máscara e
  validação do país. Perfil guarda `tax_id` + `tax_id_country` (migration `20261004100100_profile_tax_id_country.sql`).
- No pedido, `billing_address` leva `tax_id`, `tax_id_type`, `tax_id_country` e, em Portugal, também `nif` (lido pela
  FIZ).
- Teste: `node --experimental-strip-types scripts/test-tax-id.mjs` (confere também que as duas cópias são iguais).

Estado: **Pronto**.

### 5.6 Endereço

- `src/lib/addressFormats.ts` (`addressFormat(country.postalCodeKind)`: máscara e validação do código postal; estados,
  distritos ou províncias; bairro ou freguesia; `lookupPostal` via ViaCEP no Brasil) + rótulos em
  `src/i18n/address.ts`. Campos gravados iguais em todos os países; `country` guarda o código ISO (endereços antigos
  lidos com `addressCountryCode`), região em `district`.
- Exceção: `OrderConfigure.tsx` ainda usa os campos de Portugal.

Estado: **Pronto** (fora a exceção).

### 5.7 Textos legais por país

`src/legal/` escolhe o pacote pela jurisdição do país (BR, PT, ES ou internacional em inglês), com os provedores
configurados no país (pagamento, transportadora, faturação). Estado: **Pronto**.

Páginas da loja editáveis (Admin > Páginas da loja, tabela `site_pages`, `src/lib/sitePages.ts`, `useSitePage`):
Sobre, Contato, Termos, Privacidade e Devoluções podem ter texto próprio por idioma (pt-BR, pt-PT, en, es). Com uma
versão publicada no idioma do visitante (ou na outra variante do português), o site mostra o texto da loja, limpo com
DOMPurify (`SiteHtml`); sem ela, o texto padrão de sempre. Estado: **Pronto**.

### 5.8 Regras da União Europeia na página do produto

- Menor preço dos últimos 30 dias antes da promoção (Omnibus): o trigger `products_price_history_log` guarda cada
  mudança de preço ou promoção em `product_price_history`; `product_lowest_prices(ids)` devolve o menor preço efetivo
  nos 30 dias antes do início da promoção. Linha na página do produto e nos cartões (`useLowestPrice`, carregamento em lote).
- Segurança do produto (GPSR): aba Segurança com fabricante, responsável na UE, modelo e avisos (padrão da loja +
  `products.safety_info`, regras em `src/lib/productCompliance.ts`).
- Onde mostrar cada um (UE, todos, nunca) em `store_settings.product_compliance`. Estado: **Pronto**.

### 5.9 Preço no Pix, parcelas, códigos, frete e perguntas na página do produto

- Exibição de preços (recurso `price_display`, ligado): preço com desconto do meio escolhido (Pix por padrão; o
  percentual é o `discount_percent` do meio em Pagamentos, igual ao que o pedido cobra, e respeita países e limites do
  meio) e parcelas no cartão (sem juros até N, juros ao mês pela tabela Price, parcela mínima, países). Em cada lugar
  (cartões, página do produto, barra do celular, carrinho, checkout): ligado ou não, destaque (preço normal, preço no
  Pix ou parcela) e estilo completo ou discreto. As parcelas são só informação: o provedor cobra os juros.
  `store_settings.price_display`, `src/lib/priceDisplay.ts`, `src/components/price/SmartPrice.tsx`. Estado: **Pronto**.
- Códigos do produto: SKU, código interno (`internal_code`, único), código da marca (`mpn`) e GTIN na aba Dados do
  produto; onde o cliente vê cada um em `store_settings.product_codes` (`src/lib/productCodes.ts`). Estado: **Pronto**.
- Calcular frete (recurso `shipping_estimate`, ligado; só com formas de envio ativas): CEP ou código postal (região
  fora do Brasil), opções e prazos pela função `shipping-quote`; caixa, link discreto ou desligado
  (`store_settings.shipping_estimate`). Estado: **Pronto**.
- Perguntas e respostas (recurso `product_questions`, ligado): só clientes com conta perguntam (5 por hora); aparece
  no site depois de respondida e publicada; seção aberta ou discreta e quantas por vez em `store_settings.product_questions`.
  Admin > Clientes > Perguntas dos clientes, contador no menu. Sem e-mail ao cliente até haver remetente. Estado: **Pronto**.
- Organização da página (Admin > Aparência da loja > Página do produto, `store_settings.product_page`, `src/lib/productPage.ts`,
  `AdminProductPage`): Favoritos e Comparar compactos ou largos, quantidade ao lado do botão, linha de disponibilidade,
  ficha rápida, Compartilhar, garantias da compra (cartão ou lista; devolução e meios de pagamento opcionais; só dados reais),
  descrição em seções ou abas, barra de compra fixa no computador e foto na barra do celular. Modelos Recomendado e Clássico
  (a página de antes). Teste `scripts/test-product-page.mjs`. Estado: **Pronto**.

## 6. Painel Admin

Acesso: `/shop-kodeadmin` (login) e `/admin?tab=<seção>`; só para `user_roles.role = 'admin'`. Abre em **Primeiros
passos**. Moldura própria: barra do topo (`AdminTopBar`: símbolo e nome da loja, idioma, Ver o site, quem está ligado,
Sair), sem o cabeçalho e o rodapé da loja; menu lateral fixo em acordeão (`AdminNav`: categorias de `ADMIN_GROUPS`, uma aberta por vez, a da seção atual abre
sozinha; no celular, botão Menu que abre o mesmo acordeão na página) com contadores do que espera pelo administrador
(`useAdminAttention`: pedidos com cancelamento pedido, comprovante por confirmar ou pagos à espera de produção;
avaliações por aprovar; produtos ativos sem estoque). A moldura, Primeiros passos, Marca e visual e as listas de
Pedidos, Produtos e Clientes estão nos 4 idiomas (`src/i18n/admin.ts`, `adminBrand.ts`, `adminManage.ts`); o resto
dos ecrãs internos herdados continua em português. Lista de seções em `src/components/admin/shell/adminSections.ts` e conteúdo em `src/pages/Admin.tsx` (seção nova = uma linha em cada +
nome e explicação no dicionário); componentes em `src/components/admin/`. Listas usam as peças comuns de
`AdminListKit.tsx` (cartão de número, filtros rápidos, paginação), `src/hooks/useAdminList.ts` (moeda base da loja,
datas, paginação) e `src/lib/csv.ts` (planilha com ";" e acentos para o Excel). Seções marcadas `notOnSite` mostram o
aviso "Ainda não aparece no site novo".

**Sem janelas por cima (decisão do dono):** ver, criar e editar pedido, cliente e produto abrem em páginas próprias
dentro da mesma moldura (`AdminShell`, menu em `src/components/admin/shell/adminSections.ts`, endereços em
`adminHref`); painéis que abrem na página (`InlinePanel`) e confirmações na página (`ConfirmStrip`, `InlineConfirm`,
`useInlineConfirm`) em `src/components/admin/shell/`, textos em `src/i18n/adminPages.ts`. Registos únicos:
`useAdminOrder`, `useAdminCustomer` (`src/hooks/useAdminRecords.ts`, mesma cache das listas).

| Grupo | Seção (`tab`) | Componente | O que faz | Uso na PRINT3D |
|---|---|---|---|---|
| Visão geral | Estatísticas (`stats`, página inicial do Admin) | `AdminStats` (`useStoreOrders`, `useProductViewCount`, peças de `stats/StatsParts`, textos `src/i18n/adminDashboard.ts`) | Período (7 / 30 / 90 dias, ano, tudo), linha de Hoje, receita com variação contra o período anterior, pedidos pagos, ticket médio, compradores e novos, visitas e conversão, aguardando pagamento, cancelados, descontos, gráfico, Precisa de você, produtos e categorias mais vendidos (com link para os números), pedidos por situação e país, melhores clientes, pedidos recentes | Pronto |
| (cartão no canto) | Primeiros passos (`?tab=start` reabre) | `AdminSetupHelper` | Cartão pequeno no canto inferior direito com o que falta (dados da loja, marca, categorias, produto, entrega, pagamento, redes), conferido no banco; minimizar, esconder, reabrir em Estatísticas; abre sozinho só em Estatísticas no computador | Serve |
| Visão geral | Custo x Venda (`profit`) | `AdminProfitReport` (textos `adminProfit.ts`) | Por período: receita dos itens vendidos, custo, lucro bruto e margem; produtos sem custo; tabela com busca, filtros (sem custo, com prejuízo), ordenação, paginação e CSV; vendido = pago e não cancelado, sem frete | Pronto |
| Visão geral | Financeiro (`finance`, recurso `finance`) | `AdminFinance` + `admin/finance/*` (textos `adminFinance.ts`), contas em `src/lib/finance.ts`, dados em `useFinance.ts` | Painel com faturamento, impostos, frete, taxas, custo dos produtos, comissões, despesas, lucro líquido e margem, comparação de períodos, gráficos, divisões (meio de pagamento, país, categoria, despesas, clientes, produtos), fluxo de caixa, meta do mês, filtros e CSV; lançamentos de despesas e outras entradas (pago ou a pagar, repetir todo mês, outras moedas), categorias e regras das contas (`finance_entries`, `finance_categories`, `finance_settings`, só Admin) | Pronto |
| Vendas | Pedidos (`orders`) | `AdminOrdersEnhanced` (lista) + página `admin/AdminOrderPage` com `orders/OrderNextStep`, `orders/OrderBlocks`, `OrderDesignsList`, `orderPrint/OrderPrintButtons`, `PrintWorkOrder`, `AdminPaymentProof*`; novo pedido `orders/ManualOrderForm` (textos `src/i18n/adminOrderForm.ts`) | Números no topo (pedidos e pagos no período, faturado, ticket médio, para produzir); clicar num pedido abre a página dele; botão de próximo passo (confirmar pagamento, iniciar produção, enviar com rastreio, entregue); busca por número, cliente, e-mail, telefone, produto ou rastreio (`?q=` vindo de Clientes); período; filtros rápidos por estado; 20 por página; planilha CSV; estado do pedido e do pagamento, editar itens, frete e desconto antes do envio (`orders/OrderItemsEditor`, função `admin_update_order_items`, acerta estoque e total), cancelamentos pedidos pelo cliente, comprovantes, código de rastreio e sincronização CTT, fatura FIZ, reembolso Viva, etiqueta, ordem de produção, novo pedido (cliente cadastrado ou sem cadastro, produtos com preço por escalão e itens avulsos, envio com endereços do cliente, retirada ou cliente escolhe depois, meio de pagamento, desconto, já pago, resumo com imposto quando o país o mostra à parte), apagar pedido (`delete-order`) | Serve. CTT, FIZ e Viva só para Portugal; arquivos de arte e ordem de produção pensados para DTF |
| Vendas | Clientes (`customers`) | `AdminCustomers` (lista) + páginas `admin/AdminCustomerPage` e `admin/AdminCustomerFormPage` | Lista (`admin_list_customers`: e-mail, país do documento, último acesso, administrador) com números (clientes, já compraram, recorrentes, ticket médio dos pedidos pagos), grupos (compraram, recorrentes, sem pedidos, novos), ordenação, último pedido, documento com máscara do país, e-mail e WhatsApp, Ver pedidos, planilha CSV; página do cliente com números, pedidos, endereços (criar, editar, escolher o de entrega, remover) e favoritos; criar, editar e apagar em páginas (`admin-create-user`, `admin-update-user`, `admin-delete-user`) | Serve |
| Vendas | Cupons (`coupons`) | `AdminCoupons` (lista) + página `admin/AdminCouponPage` (`/admin/cupons/<id>`, `/admin/cupons/novo`), `useAdminCoupons` | Números do topo, busca, filtros por estado, liga/desliga; na página: % ou valor fixo, desconto máximo, compra mínima, só na primeira compra, usos no total e por cliente, início e fim, nota interna, resumo, uso e pedidos com o cupom, apagar. Regras no servidor em `coupon_quote` | Pronto |
| Vendas | Grupos de clientes (`customer-groups`, recurso `customer_groups`) | `AdminCustomerGroups`, `groups/CustomerGroupPanel`, `groups/CouponGroupsField`, `useCustomerGroups`, `src/lib/customerGroups.ts` (cópia em `_shared/customerGroups.ts`), `GroupPriceHint`, `useCart`, textos `customerGroups.ts` | Grupos com desconto geral e nome por idioma, um grupo por cliente, tabela de preço por produto e quantidade (`admin_set_group_prices`), cupom só para grupos; preço do grupo no produto, carrinho e checkout, conferido no `create-order` (`customer_group_pricing_for`). Desligado por padrão | Pronto |
| Vendas | Vales-presente (`gift-cards`) | `AdminGiftCards`, `useGiftCards`, `GiftCardInput`, `src/lib/giftCards.ts`, textos `adminGiftCards.ts` e `giftCards.ts` | Emitir vale (código, valor, validade, destinatário, mensagem), saldo e histórico (`gift_cards`, `gift_card_transactions`), ajuste de saldo, texto pronto para enviar; no checkout com sessão o vale desconta no servidor (`create_order_with_gift_card`), pedido coberto fica pago, cancelar ou reembolsar devolve o saldo. Desligado por padrão em Recursos da loja. Venda de vale como produto ainda não existe | Pronto |
| Vendas | Campos do checkout (`checkout-fields`, recurso `checkout_fields`) | `AdminCheckoutFields`, `CheckoutExtraFields` (checkout), `OrderCheckoutFields` (pedido no Admin, conta e confirmação), `useCheckoutFields`, `src/lib/checkoutFields.ts` (cópia em `_shared/checkoutFields.ts`), textos `adminCheckoutFields.ts` e `checkoutFields.ts` | Perguntas e opções a mais no checkout (caixa, lista, texto curto ou longo) com texto por idioma, preço, obrigatório, países, ordem, prévia e modelos prontos; preço e obrigatórios conferidos no `create-order` com o imposto do país; respostas e valor no pedido (`orders.checkout_fields`, `extras_amount`, `extras_vat`) | Pronto |
| Pedidos e entrega | Prazos e entrega (`delivery-dates`, recurso `delivery_dates`, desligado por padrão) | `AdminDeliveryDates`, `useDeliveryDates`, `src/lib/deliveryDates.ts` (cópia em `_shared/deliveryDates.ts`), textos `adminDeliveryDates.ts` e `deliveryDates.ts`; produto, checkout, pedido no Admin e conta | Prazo de produção por produto ou padrão, dias de trabalho, feriados, hora de corte e fuso; o site mostra até quando o pedido sai e quando chega; o `create-order` grava as datas no pedido (`estimated_ship_by`, `estimated_delivery_from`, `estimated_delivery_to`); lista de pedidos para enviar com atrasados | Pronto |
| Pedidos e entrega | Impressão de pedidos (`order-printing`, recurso `order_printing`) | `AdminOrderPrinting`, `orderPrint/PrintPage`, `orderPrint/PrintFrame`, `orderPrint/OrderPrintButtons` (página do pedido), `useOrderPrint`, `src/lib/orderPrint.ts`, `src/lib/barcode.ts`, textos `orderPrint.ts` | Fila de pedidos para imprimir (`admin_print_queue`: estados e documentos escolhidos, sem registo em `order_prints`), seleção e impressão em lote; folha do pedido (A4, A5, bobina 80 mm), etiqueta de envio (10 x 15, 10 x 10, 4 por A4; CEP, pedido e rastreio em código de barras) e declaração de conteúdo, impressas pelo navegador num iframe; o que aparece em cada um, cópias, rodapé, remetente (vazio = dados da loja), marcar como impresso, passar para Em preparação e impressão automática em `store_settings.order_print` | Pronto; sem integração com a API dos Correios (etiqueta própria da loja) |
| Pedidos e entrega | Envios parciais (recurso `partial_shipments`, desligado por padrão) | `OrderShipmentsPanel` (pedido no Admin), `OrderShipments` (conta), `useShipments`, `src/lib/shipments.ts`, textos `adminShipments.ts` e `shipments.ts` | Um pedido em várias remessas, cada uma com itens e quantidades, estado, transportadora, rastreio e observação; quantidades conferidas no servidor (`admin_save_shipment`); pedido passa a Enviado e Entregue quando tudo sai e chega; item enviado não sai na edição de itens | Pronto |
| Vendas | Programa de pontos (`reward-points`) | `AdminRewardPoints`, `useRewardPoints`, `RewardPointsInput`, `RewardPointsView`, `ProductPointsHint`, `src/lib/rewardPoints.ts` (cópia em `_shared/rewardPoints.ts`), textos `adminRewardPoints.ts` e `rewardPoints.ts` | Extrato `reward_point_entries` (ganhou, bónus, usou, devolvido, retirado, ajuste, venceu); regras em `store_settings.reward_points`; ganhar ao pagar ou entregar, usar no checkout com mínimo e teto do pedido (servidor, `create_order_with_benefits`), validade com os mais antigos primeiro, bónus de cadastro, ajuste manual, aba Pontos na conta e aviso no produto. Desligado por padrão em Recursos da loja | Pronto |
| Catálogo | Especificações e filtros (`specs`) | `AdminSpecs`, `ProductSpecsEditor`, `useProductSpecs`, `src/lib/productSpecs.ts`, filtros em `CatalogFilters` e `useListing`, ficha em `ProductDetailsTabs`, textos `adminSpecs.ts` | Características (`spec_attributes`) com valores (`spec_options`, cor opcional), unidade, traduções, ordem, mostrar nos filtros e/ou na ficha; valores por produto (`product_spec_options`, `admin_set_product_specs`); filtros na listagem (`f_<slug>`, E entre características, OU entre valores, contagens) e etiquetas ativas | Pronto |
| Catálogo | Variantes (aba Variantes do produto, recurso `variants`) | `ProductVariantsEditor`, `useProductVariants`, `src/lib/variants.ts`, textos `adminVariants.ts`; loja em `useProductPage`/`ProductDetail` | Cada combinação cor x tamanho (ou cor, ou tamanho) com código (SKU único na loja), código de barras, estoque, à venda e foto; números, filtros, preencher códigos e CSV; estoque por cor sem tamanhos; código gravado em `order_items.sku` e mostrado no pedido do Admin; foto e código mudam na página do produto | Pronto |
| Catálogo | Venda cruzada (`cross-sell`, recurso `cross_sell`) | `AdminCrossSell`, aba do produto `ProductLinksEditor`, `useCrossSell`, `src/lib/crossSell.ts`, `Cart.tsx`, `cart/CartSheetCrossSell`, `RelatedProducts3D`, textos `crossSell.ts` | Ligações "Combina com" (sugeridas no carrinho e no carrinho lateral) e "Relacionados" (primeiro em Você também pode gostar), com ordem e sentido contrário (`admin_set_product_links`); regras em `store_settings.cross_sell` (limite, completar com destaques, carrinho lateral, relacionados); sem esgotados nem escondidos | Pronto |
| Catálogo | Marcas (`brands`, recurso `brands`) | `AdminBrands`, `BrandField`, `useBrands`, `src/lib/brands.ts`, `pages/Brands.tsx`, `CatalogFilters`, `useListing`, `ProductDetail`, textos `adminBrands.ts` e `catalog.ts` | Marcas com logo, site, descrição por idioma, ordem e visível; marca do produto na aba Dados; filtro Marca e página da marca (`/produtos?marca=slug`), página `/marcas`, nome acima do título do produto e no JSON-LD. Desligado por padrão | Pronto |
| Marketing | Feed de produtos (`product-feed`, recurso `product_feed`) | `AdminProductFeed`, `useProductFeed`, `src/lib/productFeed.ts` (cópia em `_shared/productFeed.ts`), função `product-feed`, `CountrySync` (`?pais=`), `ProductDetail` (`?cor=`, `?tamanho=`), textos `adminProductFeed.ts` | Feed XML por país para Google Merchant Center, Meta, TikTok e Pinterest: preço e moeda como o site, promoção, variantes, marca, GTIN, fotos e estoque; regras, categoria do Google por categoria, produtos tirados do feed, avisos e pré-visualização no Admin. Desligado por padrão | Pronto |
| Configurações | Moedas e câmbio (`currencies`, recurso `auto_exchange_rates`) | `AdminCurrencies`, `useExchangeRates`, `src/lib/exchangeRates.ts` (cópia em `_shared/exchangeRates.ts`), função `update-exchange-rates`, cron `exchange-rates-daily`, `exchange_rate_history`, textos `adminCurrencies.ts` | Moeda base, margem, taxa por moeda dos países ativos (fixar à mão), atualização diária pelo BCE com limite de variação e confirmação, histórico de cada mudança. Atualização automática desligada por padrão | Pronto |
| Configurações | Registo de atividade (`activity-log`, recurso `activity_log`) | `AdminActivityLog` (+ `EntityActivity` nas páginas do produto e do pedido), `useActivityLog`, `src/lib/activityLog.ts`, textos `adminActivity.ts`; servidor `admin_activity_log` (trigger `admin_activity_capture`), `admin_activity_list`, `_summary`, `_actors`, `_logins`, `admin_activity_record` (funções com chave de serviço, `_shared/activityLog.ts`), cron `activity-log-purge` | Quem mudou o quê no Admin, campo a campo, com IP e navegador; filtros, busca, CSV; administradores, entradas na conta e prazo de guarda. Ações de clientes e tarefas automáticas não entram | Pronto |
| Configurações | Segurança da conta (`account-security`, recursos `admin_2fa` e `social_login`) | `AdminAccountSecurity` (+ `AdminMfaGate` no `AdminShell`), `SocialLoginButtons` em `/auth`, `useAdminSecurity`, `src/lib/adminSecurity.ts`, textos `adminSecurity.ts`; servidor `has_role` com aal2, `admin_access_state`, `admin_security_overview`, `admin_reset_mfa`; serviço de contas (TOTP, Google, Facebook) | Verificação em dois passos do Admin (ativar, exigir de todos, tirar de quem perdeu o celular), passo do código ao abrir o Admin; entrar com Google ou Facebook quando as chaves estão no servidor | Pronto (Google e Facebook sem teste com conta real) |
| Vendas | Carrinhos abandonados (`abandoned-carts`) | `AdminAbandonedCarts`, `useAbandonedCarts`, `src/lib/cartRecovery.ts`, textos `adminAbandonedCarts.ts` | Clientes com conta e carrinho parado (`admin_abandoned_carts`): tempo parado e período, valor estimado pelo preço base, produtos, WhatsApp e e-mail com mensagem pronta e link do carrinho, copiar mensagem, marcar ou desfazer contato (`abandoned_cart_contacts`), recuperados (`admin_abandoned_cart_recovered`). Visitantes sem conta não aparecem; lembrete automático por e-mail depende do remetente | Pronto |
| Vendas | Devoluções (`returns`) | `AdminReturns`, `returns/ReturnPage` (`?tab=returns&ver=devolucao&id=<id>`), `orders/OrderReturnsPanel` na página do pedido, textos `adminReturns.ts` | Números (novos, em andamento, concluídos, recusados), filtros e busca; página de cada pedido de devolução com estado, resposta ao cliente e notas internas (função `admin_return_notes`), apagar com confirmação; aba Regras (ligar, prazo em dias, opções troca, reembolso, reparo, crédito) | Serve |
| Vendas | Notas do pedido (na página do pedido) | `orders/OrderNotesPanel`, `useOrderNotes`, textos `orderNotes.ts` | Histórico de notas com data e autor, internas ou visíveis ao cliente, mostrar ou ocultar, apagar | Serve |
| Vendas | Assinaturas (recurso `subscriptions`, desligado por padrão) | `AdminSubscriptions`, `ProductSubscriptionPlans` (aba do produto), `SubscribeOption` (produto), `SubscriptionsView` (conta), `useSubscriptions`, `src/lib/subscriptions.ts`, textos `subscriptions.ts` e `adminSubscriptions.ts` | Planos por produto (semanas ou meses, desconto, mínimo de pedidos); o cliente assina na página do produto e renova pela conta, pagando cada pedido; pausar, pular e cancelar conforme as regras; desconto conferido no servidor; Admin com números, atrasadas, receita mensal estimada e alteração de estado, data e quantidade | Pronto |
| Vendas | Pré-venda (`preorders`, recurso `preorders`, ligado) | `AdminPreorders`, `ProductPreorderEditor` (aba do produto), `PreorderPanel` e `PreorderChip` (loja), `usePreorders`, `src/lib/preorders.ts`, textos `preorders.ts` e `adminPreorders.ts` | Produto vendido antes de chegar: data de lançamento (a pré-venda acaba sozinha nesse dia), limite de unidades opcional, mensagem por idioma; selo nos cartões, bloco e botão Comprar na pré-venda no produto, selo no carrinho e nos pedidos, aviso no checkout; as vendas não mexem no estoque e o limite é conferido no banco (com a reserva no carrinho) | Pronto |
| Vendas | Aluguel (recurso `rentals`, desligado por padrão) | `AdminRentals`, `ProductRentalEditor` (aba do produto), `RentalPicker` e `RentalChip` (loja), `useRentals`, `src/lib/rentals.ts`, textos `rentals.ts` e `adminRentals.ts` | Produto alugado por dia, semana ou mês com unidades e caução; o cliente escolhe as datas e vê se há unidades livres; o pedido só entra com unidades livres (conferido no banco); preço calculado no servidor; Admin com retiradas, devoluções, atrasos e regras | Pronto |
| Vendas | Produtos digitais (recurso `digital_products`, desligado por padrão) | `AdminDigital`, `ProductDigitalEditor` (aba do produto), `DigitalNote` (loja), `DownloadsView` (conta), `useDigitalProducts`, `src/lib/digitalProducts.ts`, `_shared/digitalProducts.ts`, textos `digitalProducts.ts` e `adminDigital.ts` | Arquivos ou links para baixar e chaves de licença; acesso liberado quando o pedido é pago, com limite de downloads e prazo; sem frete nem estoque quando não há entrega física; Admin com acessos, downloads, chaves à espera e ações por acesso | Pronto |
| Catálogo | Vários armazéns (recurso `warehouses`, desligado por padrão) | `AdminWarehouses`, `orders/OrderWarehousesPanel`, `useWarehouses`, `src/lib/warehouses.ts`, textos `adminWarehouses.ts` | Armazéns com países atendidos, prioridade e padrão; unidades por armazém (a soma é o estoque à venda), carga inicial, ajuste com motivo, transferências e movimentos; cada pedido sai do armazém que atende o país de entrega e volta ao mesmo ao cancelar; bloco Armazéns no pedido | Pronto |
| Vendas | Marketplace com vendedores (recurso `marketplace`, desligado por padrão) | `AdminVendors`, `VendorField`, `dashboard/VendorPanelView`, `pages/VendorPage`, `pages/SellWithUs`, `marketplace/VendorLine`, `useMarketplace`, `src/lib/marketplace.ts`, textos `marketplace.ts` e `adminMarketplace.ts` | Vendedores com comissão, página pública e contas ligadas; produto com vendedor; livro de vendas com a comissão do momento do pagamento, anulado ao cancelar; repasses e saldo; pedidos de cadastro em `/vender`; aba Vendedor na conta (pedidos com endereço, estoque, repasses) | Pronto |
| Marketing | Programa de afiliados (recurso `affiliates`, desligado por padrão) | `AdminAffiliates`, `pages/AffiliateProgram`, `dashboard/AffiliatePanelView`, `AffiliateCapture`, `useAffiliates`, `src/lib/affiliates.ts`, `src/lib/affiliateTracking.ts`, textos `affiliates.ts` e `adminAffiliates.ts` | Link `?ref=código` para qualquer página, visitas contadas, pedido ligado ao afiliado no servidor (sem autoindicação), comissão do momento do pagamento sobre produtos menos cupom, anulada ao cancelar e liberada na entrega; pagamentos e saldo; cadastros em `/afiliados`; aba Afiliado na conta; código no aparelho só com consentimento de Marketing | Pronto |
| Vendas | Pedido de orçamento B2B (recurso `quotes`, desligado por padrão) | `AdminQuotes`, `pages/QuoteRequest`, `dashboard/QuotesView`, `quotes/QuoteCartBits`, `useQuotes`, `src/lib/quotes.ts`, `_shared/pricing.ts` (`quoteUnits`), textos `quotes.ts` e `adminQuotes.ts` | Pedido pela página do produto, carrinho ou `/pedido-de-orcamento`; proposta com preço por item, validade e mensagem no Admin; cliente aceita na conta e compra no checkout normal com o preço conferido no servidor (dono, validade, uso único, itens iguais); cancelar o pedido libera a proposta | Pronto |
| Vendas | PunchOut, compras B2B pelo sistema da empresa (recurso `punchout`, desligado por padrão) | `AdminPunchout`, `pages/PunchoutStart`, `pages/PunchoutTest`, `components/punchout/PunchoutBar`, `usePunchout`, `src/lib/punchout.ts`, função `punchout`, `_shared/punchout.ts`, textos `punchout.ts` e `adminPunchout.ts` | cXML (abrir a loja, devolver o carrinho, pedido de compra vira pedido da loja) e OCI (devolver o carrinho); empresas com login e senha cifrada, conta de cliente (preços do grupo), país, frete fixo, UNSPSC, endereços de retorno e tempo de acesso; barra da empresa na loja, carrinho com Enviar ao sistema de compras, checkout fechado; Admin com Empresas, Acessos e carrinhos, Pedidos de compra, Como ligar e teste sem criar pedido. Falta testar com um sistema de compras real | Pronto |
| Conteúdo | Fórum (recurso `forum`, desligado por padrão) | `AdminForum`, `pages/Forum`, `pages/ForumTopic`, `components/forum/ForumParts`, `useForum`, `src/lib/forum.ts`, textos `forum.ts` e `adminForum.ts` | Seções, tópicos e respostas de clientes com conta (texto simples), fixar e fechar, resposta da loja com selo, editar dentro do prazo, denúncias, aprovação opcional de tópicos e respostas, leitura só com conta opcional, busca e páginas; Admin com Tópicos, Revisar, Seções e Regras; mapa do site | Pronto |
| Marketing | Campanhas de newsletter (recurso `newsletter_campaigns`, desligado por padrão) | `AdminNewsletter`, `pages/NewsletterUnsubscribe`, `useNewsletter`, `src/lib/newsletter.ts`, textos `newsletter.ts` e `adminNewsletter.ts` | Campanhas com assunto, texto e até 6 produtos, prévia no computador e no celular, público por grupo (todos, compradores, sem compra, com ou sem conta) e idioma, enviar ou agendar, voltar para rascunho e cancelar; inscritos com origem, idioma, CSV e cadastro à mão; regras do remetente e rodapé; página `/newsletter/cancelar` | Parcial: o envio espera na fila até a loja ter um remetente de e-mail |
| Conteúdo | Enquetes (recurso `polls`, desligado por padrão) | `AdminPolls`, `pages/Polls`, `components/polls/PollCard`, `components/home/HomePolls`, `usePolls`, `src/lib/polls.ts`, textos `polls.ts` e `adminPolls.ts` | Pergunta com até 20 respostas, idioma, início e fim, respostas por pessoa, voto só com conta ou também de visitantes (um por pessoa, conferido no servidor), resultado depois de votar, sempre, ao encerrar ou só no Admin; bloco na página inicial, página Enquetes e link no rodapé; Admin com resultado ao vivo e zerar votos | Pronto |
| Conteúdo | Blog (recurso `blog`, desligado por padrão) | `AdminBlog`, `pages/Blog`, `pages/BlogPost`, `useBlog`, `src/lib/blog.ts`, função `sitemap`, textos `blog.ts` e `adminBlog.ts` | Artigos por idioma com capa, texto, assuntos, produtos ligados, destaque, rascunho, publicação agendada e SEO; lista com busca e assuntos; comentários de clientes com conta (aprovação opcional, resposta da loja, limite por hora); link no rodapé e mapa do site | Pronto |
| Vendas | Avaliações (`reviews`) | `AdminReviews`, `reviews/ReviewPage`, `reviews/StoreReviewPage` | Avaliações dos produtos (números, filtros, criar, editar, responder, aprovar, apagar em páginas próprias), interruptor Clientes podem enviar foto (`useReviewSettings`) e avaliações da loja de `/deixar-avaliacao`. Na página do produto: filtro por nota (clicar na linha de estrelas) e Com fotos | Pronto |
| Catálogo | Produtos (`products`) | `AdminProducts` + página `/admin/produto/:id` (`AdminProductEdit.tsx`; partes em 4 grupos com explicação e dicas, `ProductSectionNav`, `HelpTip`) + números `/admin/produtos/:id` (`AdminProductStatsPage.tsx`) | Clicar no produto abre os números (receita, unidades, pedidos, clientes, estoque e dias de cobertura, visitas e conversão, avaliação, favoritos, lucro estimado, pendentes, cancelados, gráfico, por variação / tamanho / país, melhores clientes, pedidos recentes). Lista em tabela (padrão, lembrada no navegador) ou grade: foto, preço com promoção, estoque editável (personalizáveis = sob encomenda), visível no site, vendidos; ações em vários (mostrar, ocultar, destacar, exportar CSV); ordenação (ordem da loja, recentes, nome, preço, estoque, vendidos); cartões que filtram (visíveis, estoque baixo, sem estoque); duplicar, mover na ordem da loja; edição (textos `src/i18n/adminProduct.ts`) com painel lateral fixo (pré-visualização, visível, destaque, novo, exige personalização, Gravar, aviso de alterações por gravar, barra de gravar no celular), margem calculada pelo custo e abas Produto, Fotografias, Tamanhos, Cores, Áreas, Quantidade (escalões), Promoções, Perguntas, Recomendações | Serve com ajustes: áreas, métodos de estampagem e materiais (`SimpleProductAreas`, `AreaTechniques`, `PrintMethodsManager`, `TechniquePricingManager`) são da Brindes |
| Catálogo | Categorias (`categories`) | `AdminCategories` + páginas `/admin/categorias/:id` (`AdminCategoryPage.tsx`), `/nova` e `/:id/editar` (`AdminCategoryFormPage.tsx`) | Números da categoria (com subcategorias): receita, unidades, pedidos, clientes, produtos, parte da receita da loja, gráfico, tabela de produtos ordenável, vendas por subcategoria e país, melhores clientes, pedidos recentes. Categorias e subcategorias em árvore = menu do site (ícone, nomes por idioma, ordem, Mostrar no menu, link interno), botão Copiar categorias padrão, ligação produto x categoria (`product_categories`) | Serve |
| Catálogo | Histórico de estoque (`stock-history`, recurso `stock_history`) | `AdminStockHistory` (+ `ProductStockHistory` na página de números do produto), `useStockHistory`, `src/lib/stockHistory.ts`, textos `adminStockHistory.ts`; servidor `stock_movements` (triggers), `admin_adjust_stock`, `admin_stock_movements`, `admin_stock_summary` | Cada mudança de estoque (produto, cor, tamanho, cor x tamanho) com antes, depois, motivo, pedido, quem e nota; entradas, saídas, vendidas e ajustes por período; filtros, busca, CSV; Ajustar estoque com motivo e nota | Pronto |
| Catálogo | Entradas e conferência (`stock-entries`, recurso `barcode_stock`) | `AdminStockEntries`, `stock/ScanField`, `useBarcodeStock`, `src/lib/stockEntries.ts`, textos `adminBarcodeStock.ts`; servidor `stock_entries`, `admin_stock_entry`, `admin_stock_entries`, `admin_stock_entry_lines` | Leitura por leitor USB, câmera ou digitação (SKU, GTIN, código interno, nome); entrada de mercadoria, contagem com diferenças, perda ou avaria, outro ajuste; fornecedor, documento, nota; tudo gravado de uma vez e no Histórico com o número da entrada; lista e página de cada entrada | Pronto |
| Catálogo | Etiquetas de código de barras (`barcode-labels`, recurso `barcode_labels`) | `AdminBarcodeLabels`, `src/lib/productLabels.ts`, `src/lib/barcode.ts`, `src/lib/printWindow.ts` | Etiquetas de produto em rolo ou folha (A4, Carta, medida própria), campos escolhidos, EAN-13 ou Code 128, cópias = estoque, pular posições, prévia e impressão no navegador, padrão guardado | Pronto |
| Catálogo | Reserva no carrinho (`cart-reservations`, recurso `cart_reservations`) | `AdminCartReservations`, `useCartReservations`, `src/lib/cartReservations.ts`, textos `adminCartReservations.ts`; no site `cart/CartReservation` (`CartReservationSync`, `CartReservationTimer`), `useCartStock` | Tempo da reserva, aviso ao cliente, renovar ao mudar a quantidade, reservas ativas com Liberar; estoque reservado não pode ser comprado por outro cliente (`cart_stock_check`, trigger do pedido) | Pronto |
| Catálogo | Avisos de estoque (`stock-alerts`) | `AdminStockAlerts`, `useStockAlerts`, `src/lib/stockAlerts.ts`, textos `adminStockAlerts.ts`; no site `product/StockAlertForm` (textos `stockAlerts.ts`) | Avise-me quando chegar no produto esgotado (`request_stock_alert`); procura por produto (`admin_stock_alert_summary`), voltaram ao estoque com contador no menu, pessoas à espera, marcar como avisado, copiar e-mails, CSV, cancelar, apagar. Aviso automático por e-mail depende do remetente | Pronto |
| Catálogo | Preços e segurança (`compliance`) | `AdminProductCompliance` + aba Segurança do produto (`ProductSafetyEditor`), textos `adminCompliance.ts` | Onde mostrar o menor preço de 30 dias e a aba Segurança; fabricante, responsável na UE e avisos padrão | Serve |
| Catálogo | Tamanhos (`sizes`) | `AdminSizes` | Presets de tamanhos (`size_presets`); 4 idiomas com dicas (`adminLegacy.ts`) | Serve com ajustes (os presets de roupa foram apagados) |
| Catálogo | Kits (`kits`, recurso `kits`) | `AdminKits` + `admin/kits/*` | Lista com números de venda e estado; página de edição (básico, período, desconto com prévia, peças com nota e ordem, página do kit, traduções, SEO); Onde oferecer (`KitOfferSettings`); 4 idiomas com dicas | Pronto |
| Catálogo | Comparar produtos (`compare`, recurso `compare`) | `AdminCompare` | Estilo em destaque ou discreto, botão no cartão, na página do produto e barra, com prévia | Pronto |
| Aparência e conteúdo | Marca e visual (`brand`) | `src/components/admin/brand/` (`BrandEditor`, `BrandPreview`, `fields`) | Nome, frase, logos, ícone da aba, imagem de partilha, modelos de cores, cores e ajustes finos, fontes, descrição; pré-visualização; Publicar / Desfazer / Voltar ao padrão (`store_settings.store_brand` + `store_info.name`) | Serve |
| Aparência e conteúdo | Avisos e pop-up (`visual`) | `AdminVisualSettings` | Barra de aviso, categorias ocultas (o Modal VIP passou para Pop-ups de captação), estilos da home (`store_settings.visual_settings`) | Serve em parte |
| Aparência e conteúdo | Pop-ups de captação (`popups`, recurso `lead_popups`, ligado) | `AdminPopups`, `admin/popups/*` (`PopupEditor`, `PopupBuilder`, `PopupInspector`, `PopupDisplay`, `PopupLeadsList`), `components/popups/LeadPopups` e `PopupCanvas`, `useLeadPopups`, `src/lib/leadPopups.ts`, textos `popups.ts` e `adminPopups.ts` | Vários pop-ups montados arrastando textos, imagens, formas, campos, aceite, botões e cupom sobre imagem de fundo, tamanho livre e posições próprias no celular, passo depois de enviar, 5 modelos; quando aparece (tempo, rolagem, sair), páginas, aparelhos, público, frequência, países, idiomas, datas, prioridade, modo discreto com botão para reabrir; contatos com planilha; cupom só depois de enviar | Pronto (sem e-mail: os contatos ficam no Admin) |
| Aparência e conteúdo | Módulos extras (`plugins`) | `AdminPlugins` | WhatsApp, barra de frete grátis, busca inteligente, selos de confiança, pausa de produção | Serve em parte: WhatsApp, ligar/desligar a barra de frete grátis (o valor vem do país) e pausa de produção são usados; busca inteligente e selos não |
| Aparência e conteúdo | Banners (`banners`) | `AdminBanners` | Banners de campanha da página inicial (foto, título, texto, botão, datas, ordem, textos noutros idiomas em `texts_i18n`); o site mostra os 3 primeiros ativos no idioma do visitante (`CampaignBanners`) | Serve |
| Aparência e conteúdo | Conteúdo da página inicial (`home-content`) | `HomeEditor` (`src/components/admin/home/`) | Textos de cada seção por idioma, fotos do destaque e dos banners, mostrar ou esconder seções, categoria em destaque (`store_settings.home_page`); Publicar e Desfazer | Serve |
| Aparência e conteúdo | Páginas da loja (`pages`) | `AdminSitePages`, textos `adminSitePages.ts` | Sobre, Contato, Termos, Privacidade e Devoluções por idioma: título, abertura, texto rico, descrição para o Google, publicar, começar do texto padrão, voltar ao padrão | Serve |
| Aparência e conteúdo | Perguntas frequentes (`faq`) | `AdminSiteFaqs` | Grupos de perguntas padrão (esconder, `store_settings.faq_settings`) e perguntas da loja (`site_faqs`, com idioma) | Serve |
| Configurações | Recursos da loja (`features`) | `AdminFeatures`, catálogo `src/lib/features.ts`, `useFeatures` / `useFeature` / `useHrefOn`, textos `adminFeatures.ts` | Liga e desliga cada recurso opcional (`store_settings.features`), por categoria, com explicação, busca, filtros e atalho Configurar. Desligado: some do site (`FeatureRoute`, `FeatureLink`), a seção some do menu do Admin e o servidor respeita (`public.feature_enabled`); os dados ficam | Pronto |
| Configurações | Configurações gerais (`settings`) | `AdminSettings` | Abas Empresa (`store_info`), Operação, SEO & Social (redes; o SEO passou para Marca e visual), Regional & Moeda, Armazenamento (`storage-usage`), Configurador, Entrega & Impressão | Serve em parte: Operação não é usada pelo site; Configurador e Entrega & Impressão são do DTF |
| Configurações | Pagamento (`payment`) | `AdminPaymentConfig` | Pix, transferência, pagamento na entrega, Multibanco, MB WAY, Viva, Stripe | Serve (Stripe sem integração) |
| Configurações | Frete e entrega (`delivery`) | `AdminShipping` (+ `AdminDeliveryMethods` na aba Retirada) | Formas de envio por transportadora (inclusive outra transportadora com nome próprio), zonas, tabela de preços por peso, itens, valor do pedido ou preço único, taxa fixa, percentual e frete mínimo, produtos e classes que cada forma não leva, simulação com produto; retirada na loja e entregas antigas | Serve |
| Configurações | Integrações (`integrations`) | `AdminIntegrations` | Credenciais (função `admin-credentials`, tabela `integration_credentials`, só mascaradas na tela) de Viva, CTT, Resend, FIZ, Melhor Envio e Sendcloud; testes de ligação | Viva, CTT e FIZ servem para Portugal; Resend é resto (nenhum código usa) |
| Configurações | Privacidade e cookies (`privacy`) | `AdminPrivacy` | IDs do Google Analytics 4 e do Meta Pixel, validade da escolha (6 ou 12 meses) em `store_settings.privacy_settings`; registos de consentimento dos últimos 30 dias (contagens, procura por código, CSV) | Serve |
| Configurações | Modelos de e-mail (`emails`) | `AdminEmailTemplates` | Textos dos e-mails (`email_templates`) e e-mail de avisos do Admin | Parcial: os e-mails estão desligados |

Componentes do Admin que existem mas não estão no menu: `AdminShipping` (zonas e tarifas por peso de Portugal),
`AdminHomeContent` (tabelas `home_sections` da loja antiga; os depoimentos de
`/deixar-avaliacao` agora são moderados em Admin > Avaliações), `AdminUsageGuide`, `AdminFrames`, `ProductCustomizationManager`. Por isso, hoje não há
tela para mensagens de contato (`contact_messages`) nem países.

Primeiro administrador: por SQL no contêiner `db` (comando em `CLAUDE.md`, seção Backend e publicação).

## 7. Backend

### 7.1 Serviços (`deploy/compose.yaml`, projeto Compose `loja3d`)

| Serviço | Imagem | Papel | Memória |
|---|---|---|---|
| `db` | `supabase/postgres:17.6.1.136` | PostgreSQL com pg_cron, pg_net, Vault; scripts da primeira inicialização em `deploy/db/` | 512 MB |
| `auth` | `supabase/gotrue:v2.196.0` | Login; cadastro aberto; autoconfirm sem SMTP; senha mínima de 8; limites por IP | 64 MB |
| `rest` | `postgrest/postgrest:v14.17` | API REST e RPC; OpenAPI desligado | 96 MB |
| `storage` | `supabase/storage-api:v1.74.0` | Arquivos no volume `loja3d_storage-data`; até 50 MB por arquivo | 256 MB |
| `functions` | `supabase/edge-runtime:v1.76.2` | Edge Functions com o router `deploy/functions/main/index.ts` (JWT por função, `enabled = false`, até 18 funções ativas) | 512 MB |
| `web` | `loja3d-web` (build do `Dockerfile`: Vite + nginx) | Site e gateway `/rest/v1`, `/auth/v1`, `/storage/v1`, `/functions/v1` e `/sitemap.xml` no mesmo domínio (`deploy/nginx.conf`, com CSP sandbox nas respostas da API). Única porta publicada: `127.0.0.1:8190` | 64 MB |
| `migrate` | `supabase/postgres:17.6.1.136` (perfil `tools`) | Uso único: cópia de segurança + migrations pendentes (`deploy/migrate.sh`) + segredos dos cron jobs no Vault | 256 MB |

Volumes: `db-data`, `db-config` (chave do Vault, acompanha a base), `storage-data`, `deno-cache`.

### 7.2 Edge Functions (`supabase/functions/`, 35 funções)

`verify_jwt` vem de `supabase/config.toml`; por padrão o router exige JWT (chave anon ou sessão). Muitas funções
conferem também a sessão do usuário ou o papel de admin por dentro.

| Função | `verify_jwt` | Quem chama | O que faz | Estado |
|---|---|---|---|---|
| `create-order` | sim | Checkout | Cria o pedido com tudo recalculado (2.2) | Pronto |
| `guest-order` | sim | Checkout (caminho de visitante, morto) | Responde 410 | Resto da Brindes |
| `finalize-manual-order` | sim | `/pedido/:id/configurar` | Completa pedido manual (entrega, endereço, pagamento) | Parcial |
| `submit-payment-proof` | sim | `PaymentProofUploader` | Guarda o comprovante | Pronto |
| `viva-create-order` | sim | `VivaCardEmbed` | Abre sessão de pagamento Viva | Parcial |
| `viva-verify-payment` | sim | `VivaReturn`, `OrderSuccess` | Confirma o pagamento na API da Viva | Parcial |
| `viva-webhook` | **não** | Viva | Eventos de pagamento e reembolso, sempre reconfirmados na API | Parcial |
| `viva-refund` | sim | Admin, Pedidos | Reembolso total ou parcial | Parcial |
| `viva-test-connection` | sim | Admin, Integrações | Testa as credenciais | Parcial |
| `fiz-invoice` | sim | Admin, Pedidos e Integrações | Fatura FIZ (`company`, `draft`, `issue`, `pdf`) | Parcial |
| `ctt-track` | **não** | Admin, Pedidos; cron de hora em hora | Eventos de rastreio CTT em `tracking_events`; marca entregue. Aceita admin ou `x-cron-secret` | Parcial (só CTT) |
| `sitemap` | **não** | `/sitemap.xml` | Sitemap dinâmico | Pronto |
| `update-exchange-rates` | **não** | Admin, Config Gerais | Taxas de câmbio de open.er-api.com (admin ou `Bearer CRON_SECRET`) | Pronto (sem agendamento) |
| `submit-product-review` | sim | `ReviewProduct` | Avaliação de produto de pedido entregue | Pronto |
| `export-my-data` | sim | `DangerZone` | Exporta os dados do cliente | Pronto |
| `delete-my-account` | sim | `DangerZone` | Apaga a conta e anonimiza pedidos | Pronto |
| `auth-rate-limit` | sim | `Auth.tsx` | Limite de tentativas de login (falha em aberto) | Parcial |
| `admin-credentials` | sim | Admin, Integrações | Lê (mascaradas) e grava credenciais | Pronto |
| `admin-create-user`, `admin-update-user`, `admin-delete-user` | sim | Admin, Clientes | Gestão de contas | Pronto |
| `delete-order` | sim | Admin, Pedidos | Apaga pedidos e os seus arquivos | Pronto |
| `storage-usage` | sim | Admin, Config Gerais | Uso do armazenamento | Pronto |
| `register-order-design`, `confirm-order-design`, `verify-order-files`, `delete-order-design` | sim | `OrderSuccess`, Admin | Arquivos de arte por pedido (DTF) | Resto da Brindes |
| `cleanup-design-files` | sim | cron de hora em hora (com a chave anon) | Apaga arquivos de arte vencidos | Resto da Brindes |
| `handle-email-unsubscribe` | sim | `/unsubscribe` | Cancela e-mails promocionais por token | Parcial |
| `send-transactional-email` | desligada (503) | `notifyOrderEmail`, Contato | Envio de e-mails (feita para a Lovable) | Pendente |
| `process-email-queue` | desligada (503) | | Fila de e-mails (Lovable) | Pendente |
| `auth-email-hook` | desligada (503) | | E-mails de autenticação (Lovable) | Pendente |
| `handle-email-suppression` | desligada (503) | | Bounces e reclamações (Lovable) | Pendente |
| `preview-transactional-email` | desligada (503) | | Pré-visualização (Lovable) | Pendente |
| `process-image` | desligada (503) | | Tratamento de imagem com IA da Lovable | Resto da Brindes |

Módulos comuns em `supabase/functions/_shared/`: `pricing.ts`, `countries.ts`, `taxId.ts`, `viva.ts`, `fiz.ts`,
`admin.ts` (`supabaseAdmin`, `requireAdmin`, máscara de segredos), `cors.ts`, modelos de e-mail.

### 7.3 RPCs usadas

| RPC | Chamada por | Para quê |
|---|---|---|
| `create_order_server` | `create-order` (só `service_role`) | Grava pedido e linhas numa transação |
| `create_order_checkout` | `Checkout.tsx` (recurso antigo) | Revogada para clientes; sem uso real |
| `check_coupon`, `validate_coupon` | `useCoupon` | Validar cupom (a segunda é o recurso antigo) |
| `get_active_payment_methods` | Checkout, `OrderSuccess`, `OrderConfigure`, `OrderPaymentDetails`, `PaymentMethods`, `ManualOrderDialog` | Meios de pagamento ativos com as instruções públicas (as credenciais ficam em `integration_credentials`) |
| `has_role` | `useRole`, `AdminLogin`, funções (`_shared/admin.ts` e outras) | Papel de admin |
| `request_order_cancellation` | `OrderHistory` | Cliente pede cancelamento |
| `admin_list_customers` | `AdminCustomers`, `ManualOrderDialog`, `PrintWorkOrder` | Lista de clientes |
| `admin_set_payment_status` | `AdminOrdersEnhanced` | Muda o estado do pagamento |
| `get_storage_usage` | `storage-usage` | Uso do armazenamento |
| `list_orphan_dtf_objects` | `cleanup-design-files` | Arquivos de arte sem pedido |
| `enqueue_email`, `read_email_batch`, `delete_email`, `move_to_dlq` | funções de e-mail desligadas | Fila de e-mails (pgmq) |

Gatilhos importantes: `orders_secure_amounts`, `order_items_reserve_stock`, `orders_release_resources` (2.2).

### 7.4 Buckets do storage

| Bucket | Público | Uso |
|---|---|---|
| `product-images` | sim | Fotos dos produtos (Admin) |
| `banners` | sim | Banners (Admin, resto da Brindes) |
| `product-3d-models` | sim | Modelos 3D de produto (pré-visualização herdada, desligada por `VITE_ENABLE_PRODUCT_3D_PREVIEW=false`) |
| `payment-proofs` | não | Comprovantes de pagamento |
| `dtf-uploads` | não | Arquivos de arte dos pedidos (resto da Brindes) |
| `customer-photos`, `product-originals`, `product-processed` | sim, não, sim | Criados por migrations herdadas; nenhum código usa |

`dtf-uploads` e `payment-proofs` são criados pela migration `20261005100000_print3d_self_hosted.sql`.

### 7.5 Cron jobs (pg_cron + pg_net, chamam `http://web:8080/functions/v1`)

| Job | Horário | Função | Autenticação |
|---|---|---|---|
| `ctt-track-hourly` | minuto 41 de cada hora | `ctt-track` com `{"all": true}` | `x-cron-secret` do Vault (`cron_secret`) |
| `cleanup-design-files-hourly` | minuto 17 de cada hora | `cleanup-design-files` | chave anon do Vault (`anon_key`) |

O `migrate.sh` copia `CRON_SECRET` e `ANON_KEY` do env para o Vault a cada execução. Não há cron para a fila de
e-mails nem para as taxas de câmbio.

## 8. Publicação e cópias de segurança (`deploy/`)

| Arquivo | O que faz | Estado |
|---|---|---|
| `PASSO-A-PASSO.md` | Guia para pôr a loja online em `loja3d.kodemi.pt` (DNS, chave de leitura do GitHub, bootstrap, domínio, primeiro admin) | Pronto (falta o dono executar) |
| `bootstrap.sh` | Primeira instalação no VPS, em duas execuções: cria a chave de deploy; depois gera segredos, sobe tudo, aplica migrations e liga a atualização automática | Pronto |
| `gen-secrets.sh` | Gera os segredos que faltarem em `~/loja3d/env` (chmod 600), sem os mostrar | Pronto |
| `sync.sh` + `loja3d-sync.service`/`.timer` | De 2 em 2 minutos: com commit novo no `main`, constrói o site, sobe o backend, corre o migrate com cópia antes e troca o site só se responder; senão volta à versão anterior. `sync.sh force` reconstrói sem commit novo | Pronto |
| `migrate.sh` | Migrations por ordem, uma transação por arquivo, com pg_dump antes; `--status` e `--backup` | Pronto |
| `backup.sh` + `loja3d-backup.service`/`.timer` | Cópia diária às 03:30 de Brasília: base (`pg_dump -Fc`) e arquivos enviados (tar.gz do volume), verificadas; 7 diárias + 4 semanais em `~/loja3d/backups`; envio opcional para fora com `LOJA3D_BACKUP_REMOTE` | Pronto |
| `restore.sh` | `--listar`; restaura a base e/ou os arquivos (`--ficheiros`), guardando antes o estado atual | Pronto |
| `expose-domain.sh` + `host-nginx/loja3d.conf.template` | Cria só o arquivo deste subdomínio no nginx do servidor e pede o certificado HTTPS | Pronto |
| `local-up.sh`, `local-down.sh` | Stack completa local para testes em `127.0.0.1:18190` | Pronto |
| `test-migrations.sh` | Teste das migrations numa base descartável (ver seção 9) | Pronto |
| `nginx.conf`, `functions/main/index.ts`, `db/*.sql` | Gateway do site, router das funções, scripts da primeira inicialização da base | Pronto |

## 9. Testes

Não há `npm test`: cada teste corre à parte. Todos os de Node abaixo passaram em 5/10/2026.

| Comando | O que testa |
|---|---|
| `node --experimental-strip-types scripts/test-print3d.mjs` | Leitura de STL, OBJ e 3MF, medidas e orçamento (`src/lib/print3d.ts`) |
| `node --experimental-strip-types scripts/test-tax-id.mjs` | CPF, CNPJ, NIF PT, NIF/NIE/CIF ES e cópias iguais de `taxId.ts` |
| `node scripts/test-order-pricing.cjs` | `_shared/pricing.ts` com base em memória: `checkOrderPricing` (escalões, cor, tamanho, áreas, kits), `shippingFor` (retirada, tarifa fixa, distritos de Portugal, frete grátis, ilhas) e `couponDiscount` |
| `node --experimental-strip-types scripts/test-product-compliance.mjs` | Regras do menor preço de 30 dias e da segurança do produto (`src/lib/productCompliance.ts`) |
| `node --experimental-strip-types scripts/test-returns.mjs` | Prazo, botão e quantidades das devoluções (`src/lib/returns.ts`) |
| `node --experimental-strip-types scripts/test-features.mjs` | Catálogo de recursos, padrão, seções do Admin e links de páginas de recursos (`src/lib/features.ts`) |
| `node --experimental-strip-types scripts/test-price-display.mjs` | Exibição de preços: preço no Pix igual ao desconto do servidor, meio por país e limites, parcelas sem e com juros, parcela mínima, destaque por lugar, regras e textos |
| `node --experimental-strip-types scripts/test-order-print.mjs` | Impressão de pedidos: regras, padrões iguais aos da fila no servidor, documentos escapados, campos, códigos de barras, retirada, 4 etiquetas por A4, declaração |
| `node --experimental-strip-types scripts/test-barcode.mjs` | Code 128 e EAN-13 comparados com referências e lidos de volta |
| `node --experimental-strip-types scripts/test-product-codes.mjs` | Códigos do produto e calculadora de frete: onde cada código aparece, validação, migration, feed, regras e ordem das opções |
| `node --experimental-strip-types scripts/test-finance.mjs` | Financeiro: pedido pago, impostos, frete, taxas, custo, filtros por produto, períodos e comparação, conversão de moeda, repetição mensal, resumo, fluxo de caixa e meta (`src/lib/finance.ts`) |
| `node --experimental-strip-types scripts/test-product-questions.mjs` | Perguntas e respostas: regras, códigos de erro iguais aos da RPC, leitura pública, segurança da tabela, recurso, Admin e textos |
| `node --experimental-strip-types scripts/test-stock-history.mjs` | Histórico de estoque: motivos iguais ao CHECK, ajuste nunca negativo, período, totais, triggers nas 4 tabelas, contexto nas funções de pedido, recurso e textos |
| `node --experimental-strip-types scripts/test-barcode.mjs` | Code 128 e EAN-13: tabelas, dígito verificador, SVG |
| `node --experimental-strip-types scripts/test-barcode-stock.mjs` | Entradas por leitura (soma, contagem, perda), busca por código, etiquetas (tamanhos, folhas, cópias), migration e recursos |
| `node --experimental-strip-types scripts/test-activity-log.mjs` | Registo de atividade: tabelas do trigger com grupo e nome, links, filtros, valores, prazo, segredos escondidos, funções com chave de serviço, recurso e textos |
| `node --experimental-strip-types scripts/test-admin-security.mjs` | Segurança da conta: estado de acesso, código e chave, regras, provedores, has_role com aal2 na migration, funções com o token do admin, env do Google e Facebook, recursos e textos |
| `node --experimental-strip-types scripts/test-checkout-fields.mjs` | Campos do checkout: cópia igual à do servidor, normalizar, campos por país e ordem, respostas (obrigatório, opção, tamanho, preço), textos por idioma, formulário do Admin, create-order e migration |
| `node --experimental-strip-types scripts/test-cart-stock.mjs` | Estoque no checkout: cópia igual à do servidor, linhas sem controle, esgotado, menos unidades, linhas do mesmo estoque repartidas pela ordem, migration e create-order |
| `node --experimental-strip-types scripts/test-delivery-dates.mjs` | Prazos e entrega: cópia igual à do servidor, regras, dias úteis com feriados, prazo do produto e do carrinho, fuso e hora de corte, data de chegada, atraso, create-order e migration |
| `node --experimental-strip-types scripts/test-shipments.mjs` | Envios parciais: o que falta enviar, rascunho do Admin (mesmos códigos do servidor), progresso, normalizar, funções, guardas e RLS da migration |
| `node --experimental-strip-types scripts/test-subscriptions.mjs` | Assinaturas: cópia igual ao servidor, regras e planos, datas (fim do mês, semanas), renovação liberada e atrasada, cancelar, preço com desconto, migration e telas sem janelas |
| `node --experimental-strip-types scripts/test-product-nav.mjs` | Abas do produto no Admin: toda parte tem grupo e explicação nos 4 idiomas, todo bloco tem dica, sem abas soltas nem janelas |
| `node --experimental-strip-types scripts/test-preorders.mjs` | Pré-venda: regras de exibição e do formulário, data sem fuso, linha marcada pelo servidor, migration (marca, estoque, limite, permissões) e ligações no site e no Admin |
| `node --experimental-strip-types scripts/test-rentals.mjs` | Aluguel: cópia igual ao servidor, regras e produto, dias e períodos (semanas, meses, fim do mês), regras de datas, unidades livres com dias de folga, migration e telas sem janelas |
| `node --experimental-strip-types scripts/test-digital-products.mjs` | Produtos digitais: normalização, estado, prazo e downloads restantes, códigos de erro, chaves coladas, caminho seguro no storage, produtos sem frete no servidor, regras da migration (leitura pública, bucket privado, acesso só depois de pago, chaves fora do registo) e ligações nas telas |
| `node --experimental-strip-types scripts/test-warehouses.mjs` | Vários armazéns: normalização, países, formulário, ordem de saída igual ao servidor, simulação de saída, regras da migration (só leitura para o Admin, sincronização nas 4 tabelas, códigos de erro) e ligações nas telas e textos |
| `node --experimental-strip-types scripts/test-marketplace.mjs` | Marketplace: comissão e parte do vendedor iguais ao servidor, endereço da página, regras, formulários, códigos de erro com texto, regras da migration (livro de vendas, vista pública, permissões) e ligações nas telas e textos |
| `node --experimental-strip-types scripts/test-affiliates.mjs` | Afiliados: comissão igual ao servidor (produtos menos cupom), código e link para qualquer página, regras, formulários, códigos de erro com texto, cookie só com Marketing, regras da migration (livro, autoindicação, permissões) e ligações nas telas e textos |
| `node --experimental-strip-types scripts/test-quotes.mjs` | Orçamentos: estado e validade, totais e desconto, linha do carrinho, regras e formulário, códigos de erro com texto, regras da migration (permissões, erros), preço só pelo servidor e ligações nas telas e textos |
| `node --experimental-strip-types scripts/test-blog.mjs` | Blog: endereço, estado (rascunho, agendado, publicado), idioma, resumo e tempo de leitura, lista com assuntos e busca, vizinhos, regras e formulário, códigos de erro com texto, regras da migration (leitura pública, comentários só pela RPC, limite) e ligações nas telas, rodapé e mapa do site |
| `node --experimental-strip-types scripts/test-polls.mjs` | Enquetes: estado (rascunho, agendada, aberta, terminou, encerrada), idioma, percentagens que fecham em 100, resposta na frente, escolha com limite, formulário do Admin, códigos de erro com texto, regras da migration (tabelas só do Admin, sal e resumo sem permissão, um voto por pessoa, limite de respostas) e ligações nas telas, página inicial e rodapé |
| `node --experimental-strip-types scripts/test-lead-popups.mjs` | Pop-ups de captação: limpeza do desenho vindo do banco, endereços seguros, textos por idioma, conferência dos campos, problemas que impedem ativar, modelos (Lista VIP com os textos antigos, só imagem sem texto solto), páginas, quem vê e quantas vezes, celular (empilhar, copiar, sem peças sobrepostas ao ajustar à imagem), regras da migration e ligações (recurso, menu, privacidade, registo), textos nos 4 idiomas sem travessão nem janelas |
| `node --experimental-strip-types scripts/test-newsletter.mjs` | Newsletter: estado (rascunho, agendada, na fila, enviada), o que falta para enviar, regras da loja, HTML do e-mail (escapa o que vem de fora, até 6 produtos, link para cancelar), códigos de erro com texto, regras da migration (inscrição só ativa, chave fixa, conteúdo fechado, fila só pelas RPCs, cancelar sem conta) e ligações nas telas e textos |
| `node --experimental-strip-types scripts/test-punchout.mjs` | PunchOut: leitura de cXML (envelope, credenciais, SetupRequest, OrderRequest), recusa de DTD interno e XML grande, resposta e PunchOutOrderMessage, campos OCI, endereços de retorno, código auxiliar do item, comparação de totais, formulário da empresa e códigos de erro, regras da migration (colunas escondidas, só service_role autentica) e ligações nas telas |
| `node --experimental-strip-types scripts/test-forum.mjs` | Fórum: regras da loja, formulários (tópico e seção, endereço reservado), iniciais, prazo para editar, tempo relativo, códigos de erro com texto, regras da migration (tabelas só do Admin, limites por hora, tópico fechado, aprovação, leitura só com conta, contadores, uma denúncia por pessoa) e ligações nas telas, rodapé e mapa do site |
| `node --experimental-strip-types scripts/test-gift-cards.mjs` | Códigos de vale-presente (formato, geração sem letras ambíguas) e valor aplicado ao total |
| `node --experimental-strip-types scripts/test-reward-points.mjs` | Pontos: regras e padrões iguais aos da migration, ganhos, máximo para usar, pedido de pontos do servidor e cópias iguais |
| `node --experimental-strip-types scripts/test-product-specs.mjs` | Especificações: textos por idioma, parâmetros da URL, filtro E/OU, contagens dos filtros e ficha do produto |
| `node --experimental-strip-types scripts/test-variants.mjs` | Variantes: formato do código e do código de barras, dígito verificador, linhas por tipo de produto, estoque partilhado, números, preencher códigos sem repetir, CSV |
| `node --experimental-strip-types scripts/test-cross-sell.mjs` | Venda cruzada: regras normalizadas, ordem das sugestões pelo número de itens ligados, junção sem repetir, mover itens e contagens |
| `node --experimental-strip-types scripts/test-customer-groups.mjs` | Grupos de clientes: cópia igual nas funções, nome por idioma, linha da tabela pela quantidade, tabela x desconto, nunca acima do catálogo, validação da tabela |
| `node --experimental-strip-types scripts/test-brands.mjs` | Marcas: endereço (slug) a partir do nome, descrição por idioma, leitura e troca do filtro `?marca=`, contagens por marca e filtro dos produtos |
| `node --experimental-strip-types scripts/test-product-feed.mjs` | Feed de produtos: cópia igual na função, regras, moeda e imposto do país, escalão de 1 unidade, variantes e estoque, promoção, produtos fora do feed, códigos e XML escapado |
| `node --experimental-strip-types scripts/test-exchange-rates.mjs` | Moedas e câmbio: cópia igual na função, XML do BCE, taxa cruzada, moedas à mão, saltos grandes, conversão com margem, cron e trigger na migration |
| `node --experimental-strip-types scripts/test-phase1.mjs` | Avise-me quando chegar (e-mail, códigos iguais aos da migration) e links de contato dos carrinhos abandonados |
| `node --experimental-strip-types scripts/test-site-pages.mjs` | Escolha da versão por idioma e texto legal em HTML (`src/lib/sitePages.ts`) |
| `node scripts/test-cart-selection.mjs` | `src/lib/cartSelection.ts` (quantidades e preços por tamanho; herdado) |
| `node scripts/test-artwork-sizing.mjs` | `src/lib/artworkSizing.ts` (dimensionamento de arte; herdado) |
| `node scripts/test-admin-materials.mjs` | `src/lib/moneyInput.ts` e `src/lib/materialReconciliation.ts` (herdado) |
| `node scripts/test-size-presets.mjs` | `src/lib/sizePresetValidation.ts` |
| `node scripts/test-admin-workflow.cjs` | Teste de navegador do Admin com Playwright e dados falsos de camisetas da Brindes; precisa de Vite em `127.0.0.1:5178`. Resto da Brindes |
| `bash deploy/test-migrations.sh` | Aplica todas as migrations do zero duas vezes e de novo sobre a base migrada; confere tabelas e RPCs usadas no código, buckets, cron jobs e ausência de dados da loja antiga. Só num computador com Docker, nunca no VPS compartilhado |

Validação de código: `npx tsc -p tsconfig.app.json --noEmit` e `npx eslint <arquivos>`.

## 10. Pendências

### Publicação (dono, no VPS)

- Registro DNS `loja3d`, `bootstrap.sh` duas vezes (com a chave de deploy no GitHub), `expose-domain.sh`, `SITE_URL`
  no env e `sync.sh force`, primeiro admin por SQL, dados da loja no Admin.
- Cópias só no próprio VPS até definir `LOJA3D_BACKUP_REMOTE`. O `~/loja3d/env` e o volume `loja3d_db-config` (chave
  do Vault) não entram nas cópias: guardar à parte.

### Configuração inicial da loja (Admin)

- Taxas de câmbio vazias: sem elas o site mostra tudo na moeda base (BRL). Atualizar em Config Gerais, Regional &
  Moeda; não há agendamento automático.
- Criar um método de entrega de tarifa fixa: o método herdado ("Entrega em Domicílio") só calcula frete para
  Portugal e o checkout fica bloqueado nos outros países.
- Preencher e conferir os meios de pagamento (chave Pix, dados bancários).
- Fotos da marca: `src/lib/media.ts` tem `AVAILABLE` vazio; nenhuma imagem de `public/images/` está ativa.

### Pagamentos

- Mercado Pago e Pix automático no Brasil.
- O filtro de meios por país é só no navegador: o `create-order` deve validar `countries.payment_providers`.
- Viva só serve com valores em euros: os pedidos não têm coluna de moeda, os preços estão na moeda base (BRL) e a
  Viva cobra `orders.total` como euros. Resolver a moeda do pedido (e passar a centavos) antes de ativar a Viva.
- `checkOrderPricing` (usado pelo `viva-create-order`) ainda soma 23% fixo (`SHIPPING_VAT_RATE` e `products.vat_rate`)
  em vez da regra do país.
- Stripe só tem o cartão no Admin, sem integração.

### Frete

- No servidor só há zonas de Portugal por distrito e `flat_rate`. Falta frete por CEP (Brasil) e frete grátis por país
  (`free_shipping_from_cents`) em `_shared/pricing.ts`; hoje a barra do carrinho pode anunciar frete grátis que o
  servidor não aplica. O limite de 50 de Portugal está fixo no código.
- Rastreio só por CTT.

### Faturação

- NF-e (Brasil) e faturação por país atrás de uma interface comum.
- A fatura automática da FIZ não consulta `countries.invoice_provider`.

### E-mails

- As funções de e-mail dependiam da Lovable e estão desligadas (`enabled = false`, 503). Falta SMTP e uma função de
  envio própria + cron da fila (pgmq) numa migration nova. Até lá: sem confirmação de e-mail (autoconfirm), sem
  recuperação de senha, sem avisos de pedido nem de contato, `/unsubscribe` sem uso.
- As credenciais do Resend gravadas em Admin, Integrações não são usadas por nenhum código.

### Orçamento 3D, personalizador e catálogo

- Orçamento 3D e personalizador: pôr no carrinho, enviar o arquivo e recalcular o preço no servidor.
- `/customizar/:id` é só "em breve"; o botão Personalizar da página de produto está oculto.

### Textos e idiomas

- Erros das funções chegam em pt-PT: devolver códigos estáveis para o site traduzir.
- O painel Admin continua só em português (pt-BR e pt-PT misturados, herdado); `AdminLogin`, `Customizer.tsx` e
  `OrderConfigure.tsx` também não têm i18n.
- `OrderConfigure.tsx` (pedidos manuais) usa campos de endereço de Portugal e `country: "PT"` fixo.

### Painel Admin

- Sem tela para países (`countries`) e mensagens de contato (`contact_messages`).
- Seções que não mudam o site: busca inteligente e selos
  em Plugins, Operação (modo manutenção, valor mínimo), Configurador e Entrega & Impressão. Os depoimentos de
  `/deixar-avaliacao` são moderados em Admin > Avaliações mas ainda não aparecem em nenhuma página do site.

### Técnico

- Dependências das funções sem versão fixa (`npm:`/`esm.sh`): fixar versões.
- Código morto da Brindes que pode ser removido com cuidado: `src/pages/Configurator.tsx`, o fluxo de arte por áreas
  (seção 4.3), os caminhos antigos do checkout (`create_order_checkout`, gravação direta, `guest-order`),
  `process-image`, os componentes sem uso (`AdvancedFilters`, `CategoryGrid`, `CategoryStrip`, `CurrencySelector`,
  `DynamicBanner`, `FeaturedSections`, `FrameSelector`, `FreeShippingBanner`, `Hero`, `HomeProductSections`,
  `HowItWorks`, `ImageZoom`, `KitsSection`, `NewsletterPopup`, `ProductBadges`, `ProductCard`, `ProductGrid`,
  `ProductImageGallery`, `ProductRatingBadge`, `ProductReviews`, `ProductSpecifications`, `ProductTabs`,
  `ProductionPauseBanner`, `ProductSectionCard`, `PromoBanner`, `QuickViewModal`, `RelatedProducts`, `SearchBar`,
  `SectionDivider`, `ShippingCalculator`, `SizeSelector`, `TestimonialSection`, `VerseHighlight` em `src/components/`),
  os hooks `useCheckout`, `useHomeContent`, `useMenuItems`, `useShippingCalculation`, `useProductMetadata`,
  `use-debounce` e `src/utils/documents.ts`.
- Arquivos públicos herdados sem uso: fotos de lingerie em `public/images/*.jpg`, áreas de camiseta e caneca em
  `public/personalization-areas/`. `public/models/tshirt-model.glb` só é usado pela pré-visualização 3D herdada.
- A cor da página de pagamento da Viva ainda é o azul da Brindes (`BRAND_COLOR = "0057B8"` em
  `viva-create-order`).
- `scripts/test-admin-workflow.cjs` usa dados da Brindes e precisa de Playwright.
- A gaveta do carrinho (`CartSheet`) está montada mas nada a abre: decidir se abre ao adicionar ou se sai do código.
