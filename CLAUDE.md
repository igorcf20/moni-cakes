# Moni Cakes: contexto do projeto

Loja online da **Moni Cakes, café e confeitaria** (bolos artesanais, recheados e personalizados sob encomenda).
Repositório `igorcf20/moni-cakes`. Nasceu em 5/11/2026 como cópia sem histórico da loja PRINT3D (`igorcf20/loja3d`,
loja de impressão 3D do mesmo dono), que por sua vez veio da Brindes M&L. Todo o motor da loja (catálogo, carrinho,
checkout, Admin, multi-país com Brasil como padrão, pagamentos, frete, recursos opcionais) é o da loja3d e as regras
de arquitetura abaixo continuam a valer. Marca: **Moni Cakes**. Onde este ficheiro ainda fala de PRINT3D, é a
loja-modelo: o visual da Moni Cakes está em `docs/GUIA-VISUAL.md` e na secção "Visual: Moni Cakes".

## Documentação do projeto (ler antes de começar)

- `docs/MEMORIA.md`: decisões do dono, preferências de trabalho, restrições, linha do tempo e estado atual.
- `docs/FUNCIONALIDADES.md`: o que a loja faz, por área, com estado (pronto, parcial, pendente) e onde está no código.
- `docs/GUIA-VISUAL.md`: marca Moni Cakes (cores, tipografia, componentes, cenas da página inicial, fotos). Direção do
  dono em `docs/brand/moni-cakes-design.md` (DESIGN.md); logo original e landing aprovada em `docs/brand/`.
- `docs/CHANGELOG.md`: histórico de mudanças (mais recente primeiro).
- `docs/NOVA-LOJA.md`: este código é um **modelo de loja**; como criar outra loja e o que muda onde.
- `deploy/PASSO-A-PASSO.md`: pôr a loja online no VPS (`monicakes.kodemi.pt`, ao lado da loja3d).
- `docs/legado-print3d/`: memória, histórico, guia visual e skill da loja-modelo PRINT3D (referência, não descrevem a Moni Cakes).
- `docs/legado-brindes/`: documentos da loja antiga; não descrevem esta loja.

**Ao terminar cada tarefa**: uma linha no topo de `docs/CHANGELOG.md`; atualizar `docs/FUNCIONALIDADES.md` se mudou o
que a loja faz, `docs/MEMORIA.md` se o dono decidiu algo novo, `docs/GUIA-VISUAL.md` se mudou o visual, e este
`CLAUDE.md` se mudou uma regra ou a arquitetura. Tudo no mesmo commit da mudança ou logo a seguir.

## Multi-país (regras de arquitetura)

- Nada de país fixo no código: moeda, idioma, impostos, documento fiscal (CPF/CNPJ, NIF...), frete,
  meios de pagamento e emissor de fatura vêm da configuração do país (BD), com o Brasil como padrão.
- Valores em unidades mínimas (centavos) com o código da moeda ao lado; formatação com `Intl` pela locale.
- Textos visíveis via i18n (chaves por idioma); nada de texto solto nos componentes novos.
- Impostos e faturação por país atrás de uma interface comum (ex.: NF-e no Brasil, fatura certificada em Portugal).

## Regras de trabalho

- Commits pequenos, com mensagem clara; mudanças entram por pull request no `main`.
- Idioma padrão **português do Brasil**, tratamento por **"você"**; outros idiomas por i18n.
  Sem emojis e sem travessões (—) em textos visíveis, em qualquer idioma.
- **Backend próprio no VPS** (sem conta Supabase nem Lovable; decisão do dono): PostgreSQL e os componentes livres
  que o supabase-js usa, em Docker (`deploy/`). **Nunca** usar o projeto Supabase da Brindes M&L nem serviços da Lovable.
- **Migrations**: em `supabase/migrations/`, aplicadas **automaticamente** pelo deploy (`deploy/migrate.sh`, serviço
  `migrate`), uma transação por ficheiro, com pg_dump antes. Antes de fazer push de uma migration nova:
  `bash deploy/test-migrations.sh` (num computador com Docker, nunca no VPS partilhado). Nada de `BEGIN`/`COMMIT`
  nem `CREATE INDEX CONCURRENTLY`; um valor novo de enum (`ALTER TYPE ... ADD VALUE`) não pode ser usado no mesmo ficheiro.
  Migrations já aplicadas não se editam: a correção vai numa migration nova.
- **Nunca** mostrar chaves, senhas ou tokens no chat nem em commits. `.env` e `~/monicakes/env` não entram no Git.
  Credenciais de pagamento e afins são inseridas pelo utilizador no painel Admin, nunca pelo assistente.
- Edge Functions (`supabase/functions`): publicadas com o deploy (o `sync.sh` recria o serviço `functions`).
  `verify_jwt` por função em `supabase/config.toml` (router `deploy/functions/main/index.ts`; por omissão exige JWT).
  Segredo novo para as funções = acrescentar à lista `environment` do serviço `functions` em `deploy/compose.yaml`
  e ao `deploy/env.example`.
- Validar com `npx tsc -p tsconfig.app.json --noEmit`, `npx eslint <ficheiros>` e os testes em `scripts/`.
- Desenvolvimento: `bash deploy/local-up.sh` (backend em 127.0.0.1:18190) e `npx vite --mode production --port 8080`
  com `VITE_SUPABASE_PUBLISHABLE_KEY` = ANON_KEY do env de teste (o Vite encaminha a API para `LOJA3D_BACKEND_URL`).
- Neste ambiente da Claude os contentores de teste não têm internet (regra de segurança, sem relays nem proxy dentro
  de contentores): o site é construído no anfitrião e a cache do Deno 2.1.4 é preparada no anfitrião e montada só de
  leitura, com overrides de teste fora do repositório (`LOJA3D_COMPOSE_EXTRA` no `local-up.sh`).

## Segurança (não repetir os problemas da Brindes M&L)

- Totais de encomenda (preço, frete, impostos, cupom) são sempre calculados **no servidor**; o browser só mostra.
- Cupons validados no servidor, com sessão e limite de tentativas. Regra nova de cupom = só em `public.coupon_quote`
  (trigger do pedido e `create-order`) e no `_coupon_allowed` que o `check_coupon` usa; o navegador só mostra.
- Pagamento só é dado como confirmado depois de verificado na API do provedor (valor, moeda, referência).

## Arquitetura

- Vite + React 18 + TypeScript + Tailwind/shadcn, React Query, supabase-js contra o backend próprio (ver Backend e publicação).
- Rotas em `src/App.tsx` com lazy-load.
- Orçamento 3D: rota `/orcamento-3d` (`src/lib/print3d.ts`, `StlViewer`, teste `node --experimental-strip-types scripts/test-print3d.mjs`).
  Aceita STL, OBJ (assumido em mm) e 3MF (zip lido com `fflate`, unidade e transformações aplicadas): `parseModel(nome, buffer)`.
  A leitura corre num Web Worker (`new Worker(new URL('../lib/print3d.ts', import.meta.url))`) com recurso à thread principal.
  O ficheiro é lido só no navegador e não é enviado.
- i18n: `src/i18n` (pt-BR padrão, pt-PT, en, es); textos por área em `src/i18n/*.ts`.
- Personalizador: rota `/personalizar` (`src/pages/Personalizar.tsx`). Modelos gerados em código em `src/lib/parametric.ts`
  (chaveiro, placa de nome; peças separadas por cor, formato STL Z para cima), fontes Droid Sans/Serif Bold do three.js
  (Apache 2.0, com acentos) carregadas só nesta página. Visualizador de várias cores `PartsViewer`. Novo modelo = nova
  entrada em `TEMPLATES` + ramo em `buildModel` + textos em `src/i18n/customizer.ts`. Preço estimado no navegador; o
  servidor recalcula quando houver carrinho.
- Países: tabela `countries` (migration `20261004100000_countries.sql`) lida por `src/lib/countries.ts`
  (`useCountry()`, `getCountry()`, `<CountrySync />` no App, seletor `CountryPicker` no cabeçalho: bandeira `Flag` (SVG `country-flag-icons`, um ficheiro por país), o país define idioma e moeda, troca só de idioma no fim da lista; `LanguagePicker` só no Admin). Reserva BR/PT se a tabela faltar.
  Nas Edge Functions: `_shared/countries.ts` (`loadCountry`, `lineTaxRate`, `shippingTaxRate`).
- Impostos: `tax_mode` do país. `inclusive` (BR, US): preço do produto já é final, imposto 0. `vat` (PT, ES): soma `default_tax_rate`.
  `src/utils/pricing.ts` (`getVatRate`, `withVat`, `showsTaxSeparately`) segue o país; nada de 23% fixo.
- Documento fiscal: `src/lib/taxId.ts` = cópia de `supabase/functions/_shared/taxId.ts` (CPF, CNPJ alfanumérico, NIF PT, NIF/NIE/CIF ES).
  Teste: `node --experimental-strip-types scripts/test-tax-id.mjs` (também verifica que as cópias são iguais).
  Hook `useTaxIdRules()`; perfil guarda `tax_id` + `tax_id_country` (migration `20261004100100_profile_tax_id_country.sql`).
- Dinheiro: `src/lib/money.ts` (centavos, `formatMoney`, `formatCents`). Pedidos ainda gravam decimais; migrar para centavos no checkout novo.
- Endereço por país: `src/lib/addressFormats.ts` (`addressFormat(country.postalCodeKind)`: máscara e validação do código postal,
  estados / distritos / províncias, bairro ou freguesia, `lookupPostal` pelo CEP via ViaCEP no Brasil) + rótulos em `src/i18n/address.ts`.
  Campos gravados iguais em todos os países; `country` guarda o código ISO (ler antigos com `addressCountryCode`), região em `district`.
- Frete (Admin > Frete e entrega, `src/components/admin/AdminShipping.tsx`): zonas `shipping_regions`, formas de envio
  `shipping_services` (transportadora do catálogo `src/lib/carriers.ts`; preço por tabela ou cotação `melhor_envio` /
  `sendcloud`), preços `shipping_service_rates` (centavos da moeda da zona; a faixa é de peso, itens ou valor conforme
  `rate_basis`), produtos e classes recusados (`excluded_products`, `excluded_classes`), taxa fixa, percentual e mínimo. Cálculo só no servidor:
  `supabase/functions/_shared/shipping/` (`rules.ts` puro, `quote.ts`, `providers.ts`), função `shipping-quote` e
  `create-order` (`shipping_service_id`). Valores na moeda base da loja (`currency_settings.default`, como os preços).
  Checkout: `useShippingQuote` (opções `svc:<id>`). Provedor novo = função em `PROVIDERS` + chaves no `admin-credentials`
  e em `AdminIntegrations`. Teste: `node --experimental-strip-types scripts/test-shipping.mjs`.
- Pagamentos (Admin > Pagamentos, `AdminPaymentConfig.tsx`): `payment_config` com `countries`, `discount_percent`,
  `min_total`/`max_total`, `name_i18n`/`instructions_i18n`; catálogo `src/lib/paymentMethods.ts`; regras iguais no
  servidor `_shared/payments/methods.ts` (`methodBlock`, `paymentDiscount`; o teste compara as duas). `create-order`
  valida país e limites e grava `orders.payment_discount` (protegido pelo trigger `orders_lock_server_columns`).
  Online (Mercado Pago, Stripe, PayPal): `_shared/payments/gateways.ts` (`create`, `check`) e `service.ts`;
  funções `payment-start`, `payment-verify`, `payment-webhook` (sem JWT; só identifica o pedido e volta a consultar a
  API); `payment_sessions` guarda valor e moeda esperados. Provedor novo = entrada em `GATEWAYS` + catálogo + chaves em
  `admin-credentials` e `AdminIntegrations`. Teste: `node --experimental-strip-types scripts/test-payments.mjs`.
- Avaliações (Admin > Avaliações, `AdminReviews.tsx` + `admin/reviews/*`, `useAdminReviews`, textos `adminReviews.ts`):
  `product_reviews` com `source` (site ou canal de onde a loja trouxe), `verified` e `admin_reply`; o trigger
  `product_reviews_guard` calcula compra verificada e impede o cliente de se aprovar. Vista pública
  `product_reviews_public` (só aprovadas, colunas seguras). Avaliações da loja = `home_section_items` kind `testimonial`.
  Fotos de clientes só com `store_settings.review_settings.customer_photos` (`useReviewSettings`, função
  `review_customer_photos_enabled`, bucket `review-photos/<user_id>/`, `image_url` relativo validado no trigger).
- Pedido de avaliação: `ReviewReminder` na conta (lê pedidos entregues e `product_reviews`); e-mail em fila `review_requests` (trigger
  `orders_review_request` ao entregar, regras `review_settings.request_email` / `request_after_days`), envio futuro só por
  `review_requests_due` + `review_request_mark` (service_role) com o modelo `review-request`; números `admin_review_request_stats`.
- Página de avaliações (recurso `store_reviews`, ligado): `/avaliacoes` (`StoreReviews`, textos `storeReviews.ts`) lê só pela RPC
  `store_reviews_public(_kind 'store'|'products', _limit, _offset)` (resumo + itens aprovados, nome abreviado; nunca e-mail). Teste `scripts/test-store-reviews.mjs`.
- Regras UE no produto (Admin > Preços e segurança, `AdminProductCompliance`, `store_settings.product_compliance`, `src/lib/productCompliance.ts`):
  menor preço de 30 dias (trigger `products_price_history_log` -> `product_price_history`, função `product_lowest_prices`, `useLowestPrice`)
  e aba Segurança GPSR (`products.safety_info`, `ProductSafetyEditor`). Teste: `scripts/test-product-compliance.mjs`.
- Devoluções (`return_requests`): cliente só pela RPC `request_return` (códigos de erro estáveis em `src/lib/returns.ts`), aba
  `?tab=devolucoes` (`ReturnsView`); Admin > Devoluções (`AdminReturns`, `returns/ReturnPage`); `admin_notes` sem grant de coluna, lido
  só por `admin_return_notes`. Regras em `store_settings.return_settings`. Teste: `scripts/test-returns.mjs`.
- Recursos da loja (Admin > Recursos da loja, `AdminFeatures`): catálogo `src/lib/features.ts` (`FEATURES`: categoria, padrão,
  seções do Admin que somem, seção de configuração, precisa de e-mail; `FEATURE_PATHS` para páginas), valor em
  `store_settings.features`, hooks `useFeature(id)` / `useHrefOn()`, rotas com `FeatureRoute`, links com `FeatureLink`;
  servidor `public.feature_enabled(<id>, <padrão>)`. Recurso opcional novo = entrada em `FEATURES` + `f_<id>`/`f_<id>_d`
  em `src/i18n/adminFeatures.ts` + `useFeature` nos pontos do site + `feature_enabled` nas regras do servidor.
  Teste: `scripts/test-features.mjs`.
- Estoque no checkout: `cart_stock_check` (RPC pública, só leitura; `_order_item_stock_slot` = mesma procura de
  `_adjust_order_item_stock`: quem mudar uma muda a outra) + `src/lib/cartStock.ts` = cópia de `_shared/cartStock.ts`,
  `useCartStock` no carrinho, gaveta e checkout; `create-order` barra antes de gravar (409 `out_of_stock`) e
  `create_order_server` liga `loja3d.customer_checkout` (baixa estrita mesmo para admin). Ao adicionar, `useCart` confere
  o carrinho mais a linha nova (`assertStock`, `CartStockError`); cartões `useCardStock` (skeleton, Esgotado). Teste `scripts/test-cart-stock.mjs`.
- Reserva no carrinho (recurso `cart_reservations`, ligado): `cart_reservations` (holder `u:<id>` ou `g:<sha256 do token>`,
  slot, quantidade, prazo; sem grant), `cart_stock_check(_items, _holder_token, _reserve)` reserva e devolve estoque menos as
  reservas dos outros (lock por slot); `cart_stock_check_for` no `create-order`; o trigger `order_items_reserve_stock` barra o
  reservado por outros e apaga a reserva do comprador. Regras `store_settings.cart_reservations`; token `src/lib/cartHolder.ts`;
  `CartReservationSync` no App (carrinho vazio só solta a reserva com `release`), Admin > Reserva no carrinho (`AdminCartReservations`).
- Pré-venda (recurso `preorders`, ligado): `product_preorders` (só Admin; site por `preorders_public`), `_preorder_info` (ativa até a
  `release_date`, vendidas = linhas `design_data.preorder` em pedidos não cancelados). O trigger BEFORE INSERT `order_items_preorder_mark`
  põe ou tira a marca; `_adjust_order_item_stock` ignora linhas marcadas; `_order_item_stock_slot` devolve `pre:<produto>` com o limite
  que resta (sem limite = sem controle); `order_items_reserve_stock` confere o limite com lock. Aba Pré-venda do produto
  (`ProductPreorderEditor`), Admin > Pré-venda (`AdminPreorders`), loja `PreorderPanel`/`PreorderChip`, `usePreorders`. Teste `scripts/test-preorders.mjs`.
- Avise-me quando chegar (`stock_alerts`, só pela RPC `request_stock_alert`, códigos em `src/lib/stockAlerts.ts`,
  `StockAlertForm` na página do produto esgotado) e Admin > Avisos de estoque (`AdminStockAlerts`). Carrinhos abandonados:
  `admin_abandoned_carts` (carrinho da conta, `cart_items.updated_at`), contatos em `abandoned_cart_contacts`,
  Admin > Carrinhos abandonados (`AdminAbandonedCarts`, `src/lib/cartRecovery.ts`). Envio por e-mail: quando houver remetente.
- Histórico de estoque (recurso `stock_history`, ligado; desligado só esconde as telas): `stock_movements` escrito só por triggers
  AFTER UPDATE OF stock_quantity em products, product_sizes, product_variations e product_variation_size_availability; o motivo vem de
  `set_config('loja3d.stock_ctx', '{"reason":...,"order_id":...,"note":...}', true)` (venda, pedido cancelado, pedido editado, ajuste);
  sem contexto = admin ou system. Função que mexe no estoque por outro motivo = pôr o contexto antes. Ajuste só por `admin_adjust_stock`.
  Admin > Histórico de estoque (`AdminStockHistory`, `?produto=<id>&ajustar=1`), bloco na página de números do produto. Teste: `scripts/test-stock-history.mjs`.
- Código de barras (recursos `barcode_stock` e `barcode_labels`, ligados): Admin > Entradas e conferência (`AdminStockEntries`, leitura
  `stock/ScanField` no navegador com `findUnitByCode`) grava pela RPC `admin_stock_entry` (`stock_entries`, `stock_movements.entry_id`
  pelo `loja3d.stock_ctx`, `_admin_stock_apply` também usado por `admin_adjust_stock`); Admin > Etiquetas de código de barras
  (`AdminBarcodeLabels`, `src/lib/productLabels.ts`, padrão em `store_settings.barcode_labels`). `src/lib/barcode.ts` (Code 128, EAN-13)
  e `src/lib/printWindow.ts` são partilhados com a impressão de pedidos: mudar igual nas duas. Testes `scripts/test-barcode.mjs`, `scripts/test-barcode-stock.mjs`.
- Registo de atividade do Admin (recurso `activity_log`, categoria `security`): `admin_activity_log` escrito pelo trigger
  `zz_admin_activity` (`admin_activity_capture`) só quando `auth.uid()` é admin; tabela nova gerida pelo Admin = acrescentar à
  lista da migration (numa migration nova) e a `ENTITY_GROUPS` em `src/lib/activityLog.ts` + `e_<tabela>` em `adminActivity.ts`.
  Função com chave de serviço que muda algo em nome de um admin = `recordAdminActivity` (`_shared/activityLog.ts`), nunca com
  valores secretos (`hidden()`). Admin > Registo de atividade (`AdminActivityLog`), bloco `EntityActivity`. Teste: `scripts/test-activity-log.mjs`.
- Segurança da conta (Admin > Segurança da conta, `AdminAccountSecurity`; recursos `admin_2fa` ligado e `social_login` desligado):
  `has_role(<próprio>, 'admin')` exige aal2 a quem tem 2FA ou quando `store_settings.security.require_admin_2fa`; o site usa
  `admin_access_state` (`useAdminAccess`, `AdminShell` mostra `AdminMfaGate`). Função nova que confere admin = `has_role` com o
  token do utilizador (`requireAdmin` ou `userClient.rpc`), nunca `user_roles` pela chave de serviço. Google/Facebook: chaves só
  no env do servidor (`GOOGLE_*`, `FACEBOOK_*`), botões `SocialLoginButtons`. Teste: `scripts/test-admin-security.mjs`.
- Campos do checkout (recurso `checkout_fields`, Admin > Vendas > Campos do checkout, `AdminCheckoutFields`): `checkout_fields`
  (checkbox, select com opções e preço por opção, text, textarea; texto por idioma, países), regras em `src/lib/checkoutFields.ts`
  = cópia de `_shared/checkoutFields.ts`; checkout `CheckoutExtraFields`, `create-order` valida e soma (preço sem imposto + imposto
  do país) e grava `orders.checkout_fields`, `extras_amount`, `extras_vat` (já no total; `admin_update_order_items` mantém).
  Mostrar no pedido: `OrderCheckoutFields`. Teste: `scripts/test-checkout-fields.mjs`.
- Prazos e entrega (recurso `delivery_dates`, desligado por padrão): regras em `store_settings.delivery_dates`, prazo do produto em
  `products.lead_time_min_days`/`_max_days`; contas em `src/lib/deliveryDates.ts` = cópia de `_shared/deliveryDates.ts` (dias úteis,
  feriados, corte, fuso). O `create-order` grava `orders.estimated_ship_by`/`estimated_delivery_from`/`_to` (protegidas pelo trigger);
  Admin > Prazos e entrega (`AdminDeliveryDates`), `useDeliveryDates`. Teste: `scripts/test-delivery-dates.mjs`.
- Envios parciais (recurso `partial_shipments`, desligado por padrão): `order_shipments` + `order_shipment_items` (só leitura pela RLS),
  escrita só por `admin_save_shipment` / `admin_delete_shipment` (códigos de erro estáveis); `_order_shipments_sync` muda o estado do
  pedido; trigger `order_items_shipped_guard` (erro `shipped_items`). `OrderShipmentsPanel` no pedido do Admin, `OrderShipments` na conta,
  `src/lib/shipments.ts`, `useShipments`. Teste: `scripts/test-shipments.mjs`.
- Assinaturas (recurso `subscriptions`, desligado por padrão): planos `product_subscription_plans` (aba Assinatura do produto,
  `ProductSubscriptionPlans`), `subscriptions` + `subscription_orders`; a linha do carrinho leva `design_data.subscription`
  (`plan_id` ou `subscription_id` na renovação, `?renovar=<id>` na página do produto) e o trigger `order_items_subscription`
  cria ou renova; pedido cancelado desfaz (`orders_subscription_cancel`). Desconto só no servidor (`_shared/pricing.ts`,
  `src/lib/subscriptions.ts` = cópia de `_shared/subscriptions.ts`). Cliente: aba `?tab=assinaturas` e RPC `my_subscription_action`;
  Admin > Assinaturas (`AdminSubscriptions`, `admin_subscription_update`, regras em `store_settings.subscriptions`). Sem cobrança
  automática: cada renovação é um pedido pago como os outros. Teste: `scripts/test-subscriptions.mjs`.
- Aluguel (recurso `rentals`, desligado por padrão): `product_rentals` (aba Aluguel do produto, `ProductRentalEditor`; produto com
  aluguel ativo só vai ao carrinho com datas) e `rental_bookings`; a linha leva `design_data.rental {start, end, unit, periods}`
  (`RentalPicker`), o servidor cobra preço por período x períodos (`_shared/pricing.ts`, `src/lib/rentals.ts` = cópia de
  `_shared/rentals.ts`) e o trigger `order_items_rental` confere `rental_free_units` e cria a reserva (erros "Aluguel: ...").
  Linhas de aluguel não mexem no estoque. Admin > Aluguéis (`AdminRentals`, `admin_rental_update`, regras em `store_settings.rentals`).
  Teste: `scripts/test-rentals.mjs`.
- Produtos digitais (recurso `digital_products`, desligado por padrão): `product_digital` (aba Digital do produto, `ProductDigitalEditor`),
  `digital_files` (bucket privado `digital-files` ou link https), `digital_license_keys`, `digital_grants` (nascem no trigger
  `orders_digital_events` quando `payment_status = 'paid'`; revogados ao cancelar), `digital_download_log`. Download só por
  `digital_download_start` (códigos em `src/lib/digitalProducts.ts`) + URL assinada; o storage só lê o ficheiro 10 min depois
  (`digital_file_readable`). Sem entrega física (`ships = false`): sem frete (`_shared/digitalProducts.ts` em `quote.ts` e
  `create-order`) e sem estoque (`_adjust_order_item_stock`). Conta `?tab=downloads` (`DownloadsView`), Admin > Downloads (`AdminDigital`).
- Vários armazéns (recurso `warehouses`, desligado por padrão): `warehouses` (um padrão, `serves_countries`, `priority`),
  `warehouse_stock` (unidades por parte: produto, cor, tamanho ou cor x tamanho; parte com linhas = distribuída, a soma é o
  `stock_quantity`), `warehouse_allocations` (de onde saiu cada pedido), `warehouse_moves`. O trigger `warehouse_stock_sync`
  reparte as mudanças de estoque feitas por outro caminho (venda pelo país de entrega e prioridade, devolução ao mesmo armazém,
  resto no padrão); as funções `admin_warehouse_*` gravam o total com `warehouse_sync` no `loja3d.stock_ctx` para não repartir de novo.
  Admin > Armazéns (`AdminWarehouses`), bloco no pedido `orders/OrderWarehousesPanel`. Teste: `scripts/test-warehouses.mjs`.
- Marketplace (recurso `marketplace`, desligado por padrão): `vendors` (comissão, `slug`), `vendor_members` (conta -> vendedor),
  `products.vendor_id`, livro `vendor_ledger` (trigger ao pagar; comissão fixa do momento; cancelar anula), `vendor_payouts`,
  `vendor_applications` (`/vender`, `request_vendor_application`; aprovar = `admin_vendor_application_decide`), vista `vendors_public`.
  Admin > Vendedores (`AdminVendors`, campo `VendorField` no produto), conta `?tab=vendedor` (`VendorPanelView`: `my_vendor`,
  `vendor_orders`, `vendor_products`, `vendor_set_stock`), `/vendedor/<slug>` e `VendorLine` no produto; regras em
  `store_settings.marketplace` (`src/lib/marketplace.ts`, `useMarketplace`). Teste: `scripts/test-marketplace.mjs`.
- Afiliados (recurso `affiliates`, desligado por padrão): `affiliates` (código, comissão, `status` pending/active/paused/rejected,
  `user_id`), `affiliate_visits` (por dia, `affiliate_visit`), `orders.affiliate_id` (só `create-order` via `affiliate_for_order`,
  sem autoindicação; travado em `orders_lock_server_columns`), livro `affiliate_ledger` (ao pagar; produtos menos cupom; cancelar anula),
  `affiliate_payouts`. Admin > Afiliados (`AdminAffiliates`), `/afiliados` (`request_affiliate`), conta `?tab=afiliado`
  (`AffiliatePanelView`, `my_affiliate`). Código no navegador: `AffiliateCapture` + `src/lib/affiliateTracking.ts` (memória; aparelho só
  com consentimento de Marketing). Regras em `store_settings.affiliates`. Teste: `scripts/test-affiliates.mjs`.
- Pedido de orçamento B2B (recurso `quotes`, desligado por padrão): `quote_requests` + `quote_items` (só admin pelo REST; cliente pelas RPCs
  `request_quote`, `my_quotes`, `accept_quote`, `decline_quote`; admin `admin_quote_send`, `admin_quote_reject`), regras em `store_settings.quotes`.
  Página `/pedido-de-orcamento` (`QuoteRequest`), aba `?tab=orcamentos` (`QuotesView`), Admin > Orçamentos (`AdminQuotes`). Aceitar põe os itens no
  carrinho com `design_data.quote {id, item_id}`; o preço só vale pelo `quoteUnits` de `_shared/pricing.ts`; triggers `order_items_quote` (usado)
  e `orders_quote_release` (pedido cancelado libera). Teste: `scripts/test-quotes.mjs`.
- Blog (recurso `blog`, desligado por padrão): `blog_posts` (leitura pública só publicados com `published_at` passado; `locale` NULL = todos)
  e `blog_comments` (cliente só pela RPC `add_blog_comment`, lê por `blog_post_comments`; leituras por `blog_count_view`), regras em
  `store_settings.blog`. Páginas `/blog` e `/blog/:slug` (`Blog`, `BlogPost`, texto por `SiteHtml`), Admin > Blog (`AdminBlog`), `src/lib/blog.ts`,
  `useBlog`. Rodapé e função `sitemap` só com o recurso ligado. Teste: `scripts/test-blog.mjs`.
- PunchOut (recurso `punchout`, desligado por padrão): `punchout_buyers` (senha em bcrypt, coluna `secret_hash` sem grant), `punchout_sessions`
  (código de uso único guardado como sha256), `punchout_orders`; RPCs `admin_save_punchout_buyer`, `admin_punchout_test_session`, `admin_punchout_stats`,
  `punchout_authenticate` (só service_role). Função `punchout` sem JWT (cXML SetupRequest e OrderRequest, OCI, ações open/return/cancel do site),
  leitura de XML em `_shared/punchout.ts` (sem DTD interno). Site: `src/lib/punchout.ts` (sessão em sessionStorage `loja3d-punchout`, item essencial
  no `COOKIE_REGISTRY`), `usePunchout`, `PunchoutBar` + `PunchoutCheckoutGuard`, rotas `/punchout/entrar` e `/punchout/teste`; Admin > Vendas > PunchOut
  (`AdminPunchout`). Preços pela conta de cliente da empresa no servidor; pedido de compra = `create_order_with_benefits` com `purchase_order`.
  Teste: `scripts/test-punchout.mjs`.
- Fórum (recurso `forum`, desligado por padrão): `forum_categories`, `forum_topics`, `forum_posts`, `forum_reports` (tabelas só do Admin; texto simples).
  O site só pelas RPCs `forum_categories_public`, `forum_topics_list`, `forum_topic`, `forum_create_topic`, `forum_reply`, `forum_edit`,
  `forum_report`, `forum_count_view` (regras `store_settings.forum` em `_forum_rules`; contadores por `forum_refresh_topic`). Páginas `/forum`,
  `/forum/<seção>`, `/forum/topico/<id>` (`Forum`, `ForumTopic`, `components/forum/ForumParts`), Admin > Fórum (`AdminForum`), `src/lib/forum.ts`,
  `useForum`; contador no menu `useAdminAttention.forum`; mapa do site na função `sitemap`. Teste: `scripts/test-forum.mjs`.
- Newsletter (recurso `newsletter_campaigns`, desligado por padrão): `newsletter_subscriptions` (+ `locale`, `unsubscribe_token`, sem `select *`;
  trigger `newsletter_subscriptions_normalize`), `newsletter_campaigns` (conteúdo fechado fora de `draft`; estado só pelas RPCs
  `newsletter_queue` / `newsletter_cancel`), `newsletter_deliveries` (destinatários congelados), regras em `store_settings.newsletter`.
  Admin > Newsletter (`AdminNewsletter`), `/newsletter/cancelar?t=` (`NewsletterUnsubscribe`, RPC `newsletter_unsubscribe`), HTML do
  e-mail em `renderNewsletterEmail` (`src/lib/newsletter.ts`). O envio espera um remetente de e-mail. Teste: `scripts/test-newsletter.mjs`.
- Pop-ups de captação (recurso `lead_popups`, ligado; Admin > Aparência da loja > Pop-ups de captação, `AdminPopups` + `admin/popups/*`): `lead_popups`
  (desenho em `content`, regras em `rules`, `coupon_code`, `guest_salt` sem grant) e `popup_leads` (só Admin). O site só pelas RPCs `site_popups`
  (admin pode prever qualquer um com `?popup_preview=<id>`), `popup_seen`, `submit_popup_lead` (confere os campos do desenho, limita por visitante,
  devolve o cupom). Formato e regras em `src/lib/leadPopups.ts` (`normalizeContent`, `popupBlocked`, `stackForMobile`, `keepApart`); desenho igual no
  editor e na loja por `components/popups/PopupCanvas`; loja `LeadPopups` (montado no App só com o recurso ligado; memória `loja3d-popups`).
  Teste `scripts/test-lead-popups.mjs`.
- Enquetes (recurso `polls`, desligado por padrão): `polls` (pergunta em `title`), `poll_options`, `poll_ballots` (um voto por `user_id` ou
  por `voter_hash` = md5 do sal da enquete + IP + navegador). Tabelas só do Admin (sem `select *`: `guest_salt` sem grant); o site usa só
  `site_polls(_scope)` e `vote_poll`, que decidem o resultado visível; números do Admin por `admin_poll_stats`. `/enquetes` (`Polls`),
  `HomePolls` na página inicial, `PollCard`, Admin > Enquetes (`AdminPolls`), `src/lib/polls.ts`, `usePolls`. Teste: `scripts/test-polls.mjs`.
- Vale-presente (recurso `gift_cards`, desligado por padrão): `gift_cards` + `gift_card_transactions` (saldo só muda por
  transação; trigger `gift_cards_guard`), `check_gift_card` no navegador só para mostrar, desconto no servidor em
  `create-order` -> `create_order_with_gift_card`; `orders.gift_card_amount` sai do total e volta ao vale ao cancelar
  (`zz_orders_gift_card_refund`). Admin > Vales-presente (`AdminGiftCards`), checkout `GiftCardInput`, `src/lib/giftCards.ts`.
- Pontos (recurso `reward_points`, desligado por padrão): extrato `reward_point_entries` (só funções do servidor escrevem),
  regras `store_settings.reward_points` (`src/lib/rewardPoints.ts` = cópia de `_shared/rewardPoints.ts`), `create-order` ->
  `create_order_with_benefits` (pontos + vale); trigger `orders_reward_points_events` dá pontos ao pagar/entregar e retira ou
  devolve ao cancelar; vencimento em `reward_points_settle`. Admin > Pontos (`AdminRewardPoints`), conta `?tab=pontos`.
- Kits (recurso `kits`, ligado): `kits` + `kit_items` (`product_id` sem chave estrangeira: nada de junção no PostgREST), desconto em
  `src/lib/kitPricing.ts` e `kitDiscounts` de `_shared/pricing.ts` (desligado ou fora de `starts_at`/`ends_at` = sem desconto). Leitura
  pública pela política `kit_is_live`; textos `*_i18n`, `slug` (trigger `kits_slug_fill`), `gallery`, `highlights`, `show_on_home`, SEO.
  Site: `/kits`, `/kit/:slug` (`KitDetail`, cor e tamanho por peça com `kitCartLines` + `selectionPricing`), `ProductKitOffer`, `HomeKits`
  (seção `kits` da página inicial, capa `KitCover`), `CartKitHints` (carrinho, gaveta, checkout); `useKits`, `src/lib/kits.ts`. Admin > Kits em páginas (`admin/kits/*`, `admin_kit_stats`);
  onde oferecer = `store_settings.kits` (`KitSettings`, `useKitSettings` em `src/hooks/useOfferSettings.ts`, página `KitOfferSettings`).
  Teste `scripts/test-kits.mjs`.
- Comparar produtos (recurso `compare`, ligado): `src/lib/compare.ts` (até 4, `loja3d-compare` só com consentimento de preferências),
  `CompareToggle` no cartão e no produto, `CompareBar` no App, `/comparar` (`Compare`, `useCompareProducts`). Formato (em destaque ou
  discreto) em `store_settings.compare` (`CompareSettings`, `useCompareSettings`), Admin > Comparar produtos (`AdminCompare`). Teste `scripts/test-compare.mjs`.
- Carrinho e checkout (Admin > Pagamentos e entrega > Carrinho e checkout, `AdminCheckoutPage`): `store_settings.checkout_page`
  (`src/lib/checkoutPage.ts`, `useCheckoutPage`): etapas recolhidas (`stepFolded`; cada pendência do checkout leva a etapa em
  `block(texto, etapa)`), barra fixa `CheckoutMobileBar`, topo curto, cupom `CouponReveal`, selos, linhas do carrinho. Só visual.
  Teste `scripts/test-checkout-page.mjs`.
- Exibição de preços (recurso `price_display`, Admin > Exibição de preços, `AdminPriceDisplay`): `store_settings.price_display`
  (`src/lib/priceDisplay.ts`), peças `src/components/price/SmartPrice.tsx` (`usePriceView(lugar, valor com imposto)`, `PriceMain`,
  `PriceExtras`, `InstallmentTable`, `CartPriceHint`). O desconto mostrado é o `payment_config.discount_percent` do meio (igual a
  `paymentDiscount` do servidor; o teste compara): nunca outro percentual. Parcelas só informativas. Teste `scripts/test-price-display.mjs`.
- Financeiro (recurso `finance`, ligado; Admin > Visão geral > Financeiro, `AdminFinance` + `src/components/admin/finance/*`, textos
  `adminFinance.ts`): lê os pedidos como estão (vendido = pago e não cancelado, sem pedidos de teste) e soma `finance_entries`
  (despesas e outras entradas em centavos com moeda, convertidas pelas taxas de `currency_settings`; `repeat_group` = repetição mensal),
  `finance_categories` (`code` = padrão, nome no i18n) e `finance_settings` (uma linha, fora de `store_settings` por ser só Admin).
  Contas puras em `src/lib/finance.ts`, consultas `useFinance.ts`, filtros na URL. Teste `scripts/test-finance.mjs`.
- Códigos do produto: `products.internal_code` (único, erro `internal_code_taken`) e `mpn`; onde aparecem em `store_settings.product_codes`
  (`src/lib/productCodes.ts`, `ProductCodesLine`, Admin > Códigos do produto). Calcular frete no produto: recurso `shipping_estimate`,
  `ShippingEstimate` + `shipping-quote`, regras `store_settings.shipping_estimate`. Teste `scripts/test-product-codes.mjs`.
- Perguntas e respostas (recurso `product_questions`): `product_questions` (só admin pela RLS; o trigger não deixa mudar a pergunta),
  cliente só por `ask_product_question` (códigos em `src/lib/productQuestions.ts`), site lê `product_questions_public`; `ProductQuestions`
  (âncora `#perguntas`), Admin > Perguntas dos clientes (`AdminProductQuestions`). Teste `scripts/test-product-questions.mjs`.
- Telas herdadas do Admin (Kits, Tamanhos, Módulos extras): textos em `src/i18n/adminLegacy.ts`; ícones de pagamento `PaymentMethods`
  (rodapé e checkout) com SVG de `simple-icons`, nunca imagens de CDN.
- Impressão de pedidos (recurso `order_printing`, ligado; Admin > Pedidos > Impressão de pedidos, `AdminOrderPrinting`): documentos em
  `src/lib/orderPrint.ts` (`renderPrintDocument`: folha, etiqueta de envio, declaração; HTML escapado, impresso num iframe por `PrintFrame`),
  regras em `store_settings.order_print`, fila `admin_print_queue` (mesmos padrões de `DEFAULT_ORDER_PRINT`) + registos `order_prints`;
  página `?tab=order-printing&ver=imprimir&id=<ids>&doc=` (`printHref`). Códigos de barras: `src/lib/barcode.ts`. Teste `scripts/test-order-print.mjs`.
- Notas do pedido: `order_notes` (internas ou `visible_to_customer`), `OrderNotesPanel` no Admin e `OrderMessages` na conta.
- Páginas da loja (`site_pages`, Admin > Páginas da loja, `AdminSitePages`): Sobre, Contato, Termos, Privacidade e Devoluções por idioma;
  `useSitePage(page)` + `SiteHtml` (DOMPurify) em `About.tsx`, `Contact.tsx` e `LegalPage.tsx`; sem versão publicada, texto padrão.
  Teste: `scripts/test-site-pages.mjs`.
- Nome da loja: nunca escrito no código. Site: `useStoreName()`/`useBrand()`; funções e e-mails:
  `_shared/storeBrand.ts` (`loadStoreBrand`, `applyBrand` dos modelos de e-mail).
- Endereço público da loja: `siteUrl()` (`src/lib/siteUrl.ts`, variável `VITE_SITE_URL`, senão a origem aberta) para links de e-mail e Admin.
- Página do produto (`src/pages/ProductDetail.tsx`, `src/hooks/useProductPage.ts`, `src/components/product/*`): galeria 55% e compra 45%,
  barra fixa no celular (`MobileBuyBar` em portal; no computador também, com `desktop_bar`). Blocos e formato em
  `store_settings.product_page` (`src/lib/productPage.ts`, `useProductPageSettings`, Admin > Aparência da loja > Página do produto
  `AdminProductPage`; garantias `ProductTrust`, `AvailabilityLine`, `ShareButton`; detalhes `ProductDetailsTabs layout`).
  Teste `scripts/test-product-page.mjs`. `product_volume_tiers.price_per_meter` é o preço unitário absoluto do escalão,
  multiplicado pelo rácio da promoção, mais os acréscimos de cor e tamanho (igual a `_shared/pricing.ts`). O carrinho recebe
  `designData.selectionPricing {version:1, basePrice, modifier, tierRatio}`. O botão Personalizar fica oculto enquanto `/customizar/:id` for "em breve".
- Variantes (recurso `variants`): `sku`/`gtin` em `products`, `product_sizes`, `product_variations` (+ `stock_quantity` por cor,
  vazio = estoque do produto) e `product_variation_size_availability` (+ `image_url`); código único na loja (triggers
  `variant_codes_guard_*`, erros `sku_taken`/`sku_invalid`/`gtin_invalid`); `order_items.sku` só pelo servidor
  (`_order_item_sku`). Regras em `src/lib/variants.ts`, aba Variantes `ProductVariantsEditor`. Teste `scripts/test-variants.mjs`.
- Grupos de clientes (recurso `customer_groups`): `customer_groups`, `customer_group_members` (um por cliente),
  `customer_group_prices`, `coupons.customer_group_ids` (em `_coupon_allowed`). Conta do preço em `src/lib/customerGroups.ts`
  = cópia de `_shared/customerGroups.ts`, usada por `useCart` e `priceItems` (`userId`); site lê `my_group_pricing`, servidor
  `customer_group_pricing_for`. Admin > Grupos de clientes (`AdminCustomerGroups`). Teste `scripts/test-customer-groups.mjs`.
- Marcas (recurso `brands`): `brands` (leitura pública só das ativas, escrita Admin) + `products.brand_id`; `src/lib/brands.ts`,
  `useBrands`; Admin > Marcas (`AdminBrands`) e campo `BrandField` na aba Dados do produto; loja: filtro `?marca=<slug>` em
  `useListing`/`CatalogFilters` (uma marca só = página da marca), `/marcas` (`pages/Brands.tsx`), `/marca/:slug` redireciona.
  Teste `scripts/test-brands.mjs`.
- Moedas e câmbio (Admin > Moedas e câmbio, `AdminCurrencies`; recurso `auto_exchange_rates`): `store_settings.currency_settings`
  (1 base = `rates[código]`, `markup`, `manual`, `maxChangePercent`, estado da última atualização), regras em
  `src/lib/exchangeRates.ts` = cópia de `_shared/exchangeRates.ts`; função `update-exchange-rates` (BCE, cron
  `exchange-rates-daily` com `x-cron-secret`, ou admin com `force`); histórico `exchange_rate_history` só pelo trigger
  `currency_settings_history`. Teste `scripts/test-exchange-rates.mjs`.
- Feed de produtos (recurso `product_feed`, categoria `marketing`, grupo Marketing do Admin): `src/lib/productFeed.ts` =
  cópia de `_shared/productFeed.ts` (preço como o site: escalão de 1 unidade + acréscimos, IVA do país, moeda com taxa de
  câmbio e margem), função `product-feed` (sem JWT, `?pais=`), regras em `store_settings.product_feed`; Admin > Feed de
  produtos (`AdminProductFeed`, `useProductFeed`). Links do feed usam `?pais=` (`CountrySync`) e `?cor=`/`?tamanho=`
  (`ProductDetail`). Teste `scripts/test-product-feed.mjs`.
- Venda cruzada (recurso `cross_sell`): `related_products.kind` (`cross_sell` = carrinho, `related` = página do produto),
  escrita só pela RPC `admin_set_product_links`; regras `store_settings.cross_sell` (`src/lib/crossSell.ts`, `useCrossSell`);
  Admin > Venda cruzada (`AdminCrossSell`) e aba do produto `ProductLinksEditor`; loja em `Cart.tsx`, `cart/CartSheetCrossSell`
  e `RelatedProducts3D`. Teste `scripts/test-cross-sell.mjs`.
- Especificações (recurso `spec_filters`): `spec_attributes` + `spec_options` + `product_spec_options` (leitura pública,
  escrita Admin), `src/lib/productSpecs.ts`, `useProductSpecs`; Admin > Especificações (`AdminSpecs`) e aba do produto
  (`ProductSpecsEditor`); na loja, filtros `f_<slug>` em `useListing`/`CatalogFilters` e linhas na aba Especificações.
- Listagens: `/produtos` e `/categoria/:slug` (`src/components/catalog/*`, `useCatalogProducts`): busca `?q=` no servidor, filtros e
  ordenação no navegador (máx. 500 produtos), formato em `store_settings.catalog_page` (`src/lib/catalogPage.ts`, `useCatalogPage`, `catalogGrid` = classes e colunas do Carregar mais, cartão `ProductCardClean` ou `ProductCard3D`; Admin > Página de catálogo `AdminCatalogPage`; teste `scripts/test-catalog-page.mjs`), estado na URL (`q`, `ordem`, `promo`, `cat`, `sub`, `preco=min-max` com `moeda`, `f_<característica>`); `?sub=` mapeado por
  `product_categories`, nome da categoria ou termos da subcategoria.

- Página inicial Moni Cakes (`src/pages/Index.tsx`, fora do cabeçalho da loja: tem o próprio `MoniHeader` e usa o
  `Footer`): `src/components/moni/` (`MoniHero`, `MoniSections`, `useMoniMotion`, `moni.css` com classes `mc-*` sob
  `.moni-home`), dados e imagens em `src/lib/moniHome.ts` (`HERO_CAKES` = cenas em camadas com posição em % do palco,
  `HIGHLIGHTS`, `PETALS`, `SAMPLE_CARDS`, `orderHref`), textos em `src/i18n/moniHome.ts`. Movimento só com GSAP +
  ScrollTrigger (`gsap.matchMedia` com condição `always`; pin só a partir de 1024px; abaixo disso `scrollReveals` pela skill scroll-craft: cada bloco entra uma vez por IntersectionObserver (margem -12%, 620ms, subida curta, sequência de 60ms), profundidade presa ao dedo só na fatia, no painel e nas flores; com reduzir movimento, só opacidade; transform, opacity e clip-path). Nossos Bolos = `useHomeCatalog().featured` (sem produtos: cartões "Em breve" sem preço). Banners,
  kits e enquetes do Admin entram depois da narrativa. Encomenda = WhatsApp do Admin ou `/contatos`.
  Nada pode deixar `transform` num antepassado da página (quebra o pin e os elementos fixos): por isso
  `.animate-page-in` usa `backwards`. Canal de encomenda: `useMoniOrder()`.
- Detalhe do bolo (`/produto/:id`): `ProductDetail` com `MoniHeader variant="solid"`, classe `.moni-pdp` (foto
  `[data-pdp-photo]` em estúdio) e `MoniCakeOrder` (como encomendar + convite) entre a compra e os detalhes.

### Marca e tema (modelo de loja)
- Nada de marca fixa no código: nome, logos, cores, fontes, ícone da aba e descrição vêm de `useBrand()` /
  `useStoreName()` (`src/hooks/useBrand.ts`). Valores-base em `src/config/store.ts` (também preenchem o `index.html`
  no build, plugin `storeHtml` do `vite.config.ts`); o Admin > Marca e visual grava `store_settings.store_brand`
  (+ nome em `store_info.name`). Junção em `src/theme/brand.ts`; tema -> variáveis CSS em `src/theme/themeVars.ts`;
  modelos de cores em `src/theme/presets.ts`; fontes embutidas e carregadas sob pedido em `src/theme/fonts.ts`.
- `bootTheme()` (`src/main.tsx`) aplica o tema antes do primeiro desenho; `BrandManager` (`src/App.tsx`) aplica o do servidor.
- Componentes só com tokens (`bg-primary`, `hover:bg-primary-hover`, `text-brand-orange-text`, `bg-[image:var(--gradient-primary)]`),
  nunca hex da marca. Teste: `node --experimental-strip-types scripts/test-theme.mjs` (tema-base `moniCakes` = `src/index.css`).
- Admin (`src/pages/Admin.tsx`): reaproveitar e melhorar o painel existente (decisão do dono), nunca criar outro.
  Seção = uma linha em `ADMIN_GROUPS` (`src/components/admin/shell/adminSections.ts`; cada grupo é uma categoria do menu em acordeão `AdminNav`, uma aberta por vez; grupo novo = `label` + `icon` + `g_<id>` em `admin.ts`) + o componente em `SECTION_VIEWS`
  (`Admin.tsx`) + `s_<id>`/`d_<id>` em `src/i18n/admin.ts`; abre em Estatísticas (`AdminStats`, textos `src/i18n/adminDashboard.ts`, pedidos via `useStoreOrders`); Primeiros passos =
  cartão no canto `AdminSetupHelper` (renderizado pelo `AdminShell`, `?tab=start` reabre);
  caixa de ajuda reutilizável `AdminHelp`. Moldura própria (barra lateral grafite `.admin-sidebar` com `AdminNav tone="dark"`, que recolhe
  aos ícones; `AdminTopBar` com busca de seções e sino dos contadores; sem cabeçalho e rodapé da loja) e contadores
  no menu (`useAdminAttention`). Listas de gestão com as peças comuns `AdminListKit.tsx` (cartão de número, filtros
  rápidos, paginação), `useAdminList.ts` (moeda base da loja, datas, paginação) e `src/lib/csv.ts`; textos em
  `src/i18n/adminManage.ts`.
  **Sem modais no Admin** (decisão do dono): ver, criar e editar pedido, cliente e produto são páginas próprias dentro
  da moldura `AdminShell` (`/admin/pedidos/<id>`, `/admin/pedidos/novo`, `/admin/clientes/<id>`, `.../editar`,
  `/admin/clientes/novo`, `/admin/produto/<id>`, `/admin/cupons/<id>`, `/admin/cupons/novo`, números `/admin/produtos/<id>` e
  `/admin/categorias/<id>`, `/admin/categorias/nova`, `/admin/categorias/<id>/editar`; endereços em `adminHref`, menu em `src/components/admin/shell/adminSections.ts`).
  Números de produto e categoria: contas em `src/lib/salesStats.ts` (vendido = pago e não cancelado; teste
  `node --experimental-strip-types scripts/test-sales-stats.mjs`), consultas em `src/hooks/useSalesStats.ts`, peças
  (período, gráfico, tabelas) em `src/components/admin/stats/StatsParts.tsx`, textos em `src/i18n/adminStats.ts`.
  Painel que abre na página = `InlinePanel`; confirmação = `ConfirmStrip` / `InlineConfirm` / `useInlineConfirm`
  (nada de `Dialog`, `AlertDialog` nem `confirm()` no Admin). Editar itens de pedido: `orders/OrderItemsEditor` + RPC `admin_update_order_items`. Textos em `src/i18n/adminPages.ts`.
  Página do produto: grupos e partes em dois níveis no `ProductSectionNav` (`src/components/admin/product/`; parte nova = item em `sections` com `group` + `d_<valor>` em
  `src/i18n/adminProductNav.ts`), dica dos blocos com `HelpTip` ao lado do título. Teste `scripts/test-product-nav.mjs`.
  Páginas internas de uma seção (ex.: zona ou forma de envio em Frete, meio em Pagamentos) usam `useAdminPage()` e
  `AdminSubpage` (`src/components/admin/AdminSubpage.tsx`: `?tab=<seção>&ver=<página>&id=<id>`).

### Visual: Moni Cakes
- Detalhes em `docs/GUIA-VISUAL.md`. Tema-base `moniCakes` (`src/theme/presets.ts`; `src/index.css` = reserva igual):
  creme `#FFF5E9`, rosa profundo `#A75269` (`--primary`), coral `#E87975` (primary2), rosa antigo `#B96979`, texto
  `#3B2015`, marrom café `#66351F` (`--brand-ink-soft`); pêssego, rosa claro e dourado só como apoio na página inicial.
  Títulos em Cormorant Garamond, texto em Inter.
- Imagens de `public/images/moni/` são provisórias (recortes do mockup aprovado): trocar por fotos reais com fundo
  transparente mantendo os nomes. Nunca inventar produtos, preços ou provas sociais.

### Visual herdado da loja-modelo PRINT3D (ainda vale para as outras páginas até serem revistas)
- Princípio: marca de produtos de design feitos em impressão 3D. Primeiro "isso é bonito", depois "é útil", depois "posso personalizar".
  Produto e fotografia em primeiro lugar; nada de estética futurista, neon ou fundo escuro como padrão.
- Paleta editorial (kit do dono, 26/10/2026; `src/index.css` = modelo `print3d` de `src/theme/presets.ts`): creme `#FBF8F3`,
  cartões brancos, terracota `#D2461E` (`--primary`), hover e texto pequeno `#B83D1B` (`text-brand-orange-text`), suave `#F6E4DA`,
  grafite `#171715`, cinzas `#3D3A36` / `#6D6A65`, bordas `#E8E1D8`, fundo alternativo `#F4EEE6`. O laranja antigo é o modelo
  `print3dClassic`. Tokens antigos (`--brand-gold*`, `--brand-navy`...) apontam para esta paleta.
- Fontes: Inter (texto e interface) e Cormorant Garamond nos títulos h1/h2 da loja (`html[data-heading="serif"]`, aplicado por
  `applyTheme`; peso `--heading-weight`, `font-size-adjust`); classe `font-editorial` para serifa fora de h1/h2. O Admin fica
  todo em Inter pela classe `admin-ui` (`AdminShell`, `AdminLogin`): página nova do Admin fora do `AdminShell` = pôr `admin-ui`.
- Raios: botões 12 a 14px, inputs 14px, cartões 18 a 20px, banners 24px, mega menu 20px. Sombras muito suaves.
- Grelha: classe `.shell` (conteúdo até 1320px; margens 16 / 24 / 32 / 48px). Produtos: 2 / 3 / 4 / 5 colunas.
- Ícones só Lucide, traço 1,7 a 2. Sem emojis em textos visíveis (ícones Lucide no lugar).
- Microinterações de 150 a 250ms; `MotionConfig reducedMotion="user"`.
- Cabeçalho (`src/components/Header.tsx` + `src/components/header/*`): duas linhas sticky, busca com sugestões, categorias,
  histórico e miniaturas (`SearchBox`), botão laranja Todas as categorias com `MegaMenu`, menu lateral com acordeão no celular.
- Catálogo: menu = Admin > Categorias (`categories`: `icon`, `name_i18n`, `link_url`, `show_in_menu`), montado por
  `src/lib/catalogMenu.ts` e `useCatalogMenu()` (`src/hooks/useCatalogMenu.ts`); sem categorias no menu, o cardápio padrão
  `src/lib/catalog.ts` (Moni Cakes: 4 categorias de bolos com subcategorias), que o Admin copia para o banco. Destaques do mega menu: `store_settings.mega_menu` (`src/lib/megaMenu.ts`, `pickFeatured`), banner `CategoryBanner` em `MegaMenu`
  e faixa no `MobileMenu`; Admin > Categorias > Menu de categorias (`admin/categories/MegaMenuSettings`, `?tab=categories&ver=menu`). Slug de sub = `<categoria>-<sub>`. Fotos: `src/lib/media.ts` (chaves e `AVAILABLE`), ficheiros em
  `public/images/<chave>.webp`; sem foto, `MediaImage` mostra `LayerArt` (reserva com linhas de camada).
- Catálogo inicial: na Moni Cakes as migrations `20261005190000_produto_base_vaso.sql` e `20261025180000_catalogo_inicial.sql`
  ficaram sem produtos (só a coluna `banners.texts_i18n`); o catálogo real entra pelo Admin.
- Cartão de produto `ProductCard3D`: foto no cartão todo com nome, preço e carrinho sobre degradê escuro; selos Promoção, Novo e Destaque (`CardProduct.featured`, no máximo dois); favorito, avaliação real, carrinho com confirmação; `ProductCardSoon` quando o catálogo
  está vazio (sem preço nem avaliação inventados). Página inicial em `src/pages/Index.tsx` com `useHomeCatalog`;
  textos, fotos, seções visíveis e categoria em destaque editáveis no Admin > Conteúdo da página inicial
  (`store_settings.home_page`, `src/lib/homePage.ts`, `useHomePage()`, editor `src/components/admin/home/HomeEditor.tsx`;
  vazio = texto do i18n). Teste: `node --experimental-strip-types scripts/test-home-page.mjs`.
  O bloco Newsletter do mesmo editor vale para o rodapé. Banners de campanha: tabela `banners` (Admin > Banners,
  `useCampaignBanners`, `src/components/home/CampaignBanners.tsx`; traduções em `banners.texts_i18n`, `bannerInLocale`). FAQ: perguntas padrão no i18n + `site_faqs` (com `locale`)
  e grupos escondidos em `store_settings.faq_settings` (`useSiteFaqs`).
- Área do cliente (`src/pages/Dashboard.tsx`): abas em `SECTIONS` com grupo (Compras / Minha conta); aba Faturas
  (`InvoicesView`: comprovante gerado no navegador + PDF fiscal de `order_invoices.document_path`, bucket `invoices`, função
  `my_invoices()`; o Admin envia o PDF no pedido). Cartões de produto por ids: `useProductCards`.
  Formato em Admin > Aparência da loja > Área do cliente (`AdminAccountPage`, `store_settings.account_page`, `src/lib/accountPage.ts`,
  `useAccountPage`; textos `accountPage.ts`): saudação, menu, blocos do Resumo, itens do pedido, Comprar tudo de novo (`rebuyLines`), favoritos, ajuda.
  Teste `scripts/test-account-page.mjs`.
- Cookies e privacidade: `src/lib/consent.ts` (escolha com código, validade, GPC, registo em `consent_records`), `src/lib/privacy.ts`
  (`store_settings.privacy_settings`: GA4, Meta Pixel, meses; `offeredCategories`; `COOKIE_REGISTRY` = tudo o que o site guarda no aparelho:
  item novo = uma linha lá), `CookieConsent.tsx`, `ConsentScripts.tsx` (só carrega ferramentas com consentimento), Admin > Privacidade e cookies.
  Script de terceiros novo = só via `ConsentScripts`, nunca solto. Teste: `node --experimental-strip-types scripts/test-privacy.mjs`.
- Padrões de `useVisualSettings` ficam vazios (cor, fonte, WhatsApp) para não reaplicar a identidade antiga; WhatsApp só aparece com número no Admin.
- Nada de prova social inventada (notificações de vendas falsas, contadores, avaliações de exemplo): o antigo `SalesPopup` foi removido.

## Backend e publicação (VPS)

- A Moni Cakes corre no mesmo VPS da loja3d, **ao lado** dela (decisão do dono, 5/11/2026): pasta `~/monicakes`,
  projeto Compose `monicakes`, porta 8191, timers `monicakes-*`, chave de deploy `github-monicakes`, imagem
  `monicakes-web`. Nunca mexer em `~/loja3d` nem nos contentores do projeto `loja3d`. Passos: `deploy/PASSO-A-PASSO.md`.

- `deploy/compose.yaml` (projeto Compose `monicakes`): `db` (supabase/postgres 17), `auth` (GoTrue), `rest` (PostgREST,
  OpenAPI desligado), `storage` (ficheiros no volume `monicakes_storage-data`), `functions` (edge-runtime), `web`
  (`Dockerfile`: build Vite + nginx, que também é o gateway `/rest/v1`, `/auth/v1`, `/storage/v1`, `/functions/v1`
  no mesmo domínio do site) e `migrate` (uso único). Só a porta `127.0.0.1:8191` é publicada.
- O site usa a origem aberta como URL do backend (`src/integrations/supabase/client.ts`); o build só precisa da
  ANON_KEY (`vite.config.ts` recusa a service_role).
- Segredos gerados no VPS por `deploy/gen-secrets.sh` em `~/monicakes/env` (chmod 600): POSTGRES_PASSWORD, JWT_SECRET,
  ANON_KEY, SERVICE_ROLE_KEY, CRON_SECRET. `SITE_URL` = endereço público (hoje `https://monicakes.kodemi.pt`).
- Ficheiros enviados são servidos com CSP sandbox (sem XSS no domínio do site). Sem SMTP o registo entra direto
  (autoconfirm); com `SMTP_*` no env passa a pedir confirmação.
- `deploy/bootstrap.sh` (1.ª vez, corre duas vezes: chave de deploy do GitHub, depois publica);
  `deploy/sync.sh` + timer `monicakes-sync.timer` publicam cada push no `main` (build, backend, migrate com cópia,
  troca do site só se responder; senão volta à versão anterior).
- Cópias de segurança diárias (`deploy/backup.sh`, timer `monicakes-backup.timer` às 03:30 de Brasília): base (pg_dump -Fc)
  e ficheiros enviados (tar.gz do volume, com atributos), verificadas antes de contarem, 7 diárias + 4 semanais em
  `~/monicakes/backups`; `LOJA3D_BACKUP_REMOTE` opcional (rsync/ssh) para guardar fora do VPS. Restauro:
  `deploy/restore.sh --listar`, `restore.sh <diaria.dump> --ficheiros <ficheiros.tar.gz>` (base e ficheiros do mesmo dia).
- Domínio (só subdomínios; `kodemi.pt` é o site da empresa e não se toca): `sudo bash deploy/expose-domain.sh monicakes.kodemi.pt` cria só o ficheiro deste subdomínio no nginx do
  servidor e pede o certificado HTTPS (certbot). Registo DNS: A `monicakes` -> 62.129.141.82.
- Primeiro administrador: `insert into public.user_roles (user_id, role) select id, 'admin' from auth.users
  where email = '<email>' on conflict do nothing;` (psql no contentor db).
- No VPS partilhado (62.129.141.82): só `/home/administrator/monicakes`, sem tocar noutros serviços; no nginx do
  servidor só o ficheiro da loja (autorizado pelo dono para o subdomínio monicakes.kodemi.pt).

## Pendências

- Moni Cakes: fotos reais dos bolos; número de WhatsApp e redes no Admin; textos reais do preparo e da página Sobre;
  confirmar com o dono as categorias do cardápio padrão (`src/lib/catalog.ts`: Bolos clássicos, Bolos recheados, Bolos
  personalizados, Fatias e doces; fotos provisórias); cadastrar os bolos reais no Admin. Orçamento 3D e personalizador
  vêm desligados por padrão (`defaultOn: false` em `src/lib/features.ts`). Loja online em https://monicakes.kodemi.pt desde 5/11/2026 (HTTPS, sync e cópias
  diárias ligados); falta o primeiro administrador e o dono preencher os dados da loja no Admin.

- O site da empresa em `kodemi.pt` nunca é tocado: só subdomínios (a loja-modelo PRINT3D está em loja3d.kodemi.pt).
- E-mails: as funções de e-mail dependiam da Lovable e estão desligadas (`enabled = false`, 503). Falta SMTP e uma
  função de envio própria + cron da fila (pgmq) numa migration nova; esse envio também deve tratar `review_requests_due`.
- Pagamentos online (Mercado Pago, Stripe, PayPal) feitos pela documentação, ainda sem teste com conta real; a Viva
  ainda cobra só em euros.
- Frete: as cotações automáticas (Melhor Envio, Sendcloud) foram feitas pela documentação e ainda não foram testadas com
  conta real; outras APIs diretas (Correios, CTT, DHL, FedEx) entram como provedor novo em `_shared/shipping/providers.ts`.
  As regras antigas (`shippingFor`: zonas de Portugal por distrito e `flat_rate`) só valem sem formas de envio ligadas;
  frete por CEP e frete grátis por país nelas
  (`free_shipping_from_cents`) ainda não são aplicados em `_shared/pricing.ts`.
- Erros das funções chegam em pt-PT: devolver códigos estáveis para o site traduzir.
- O painel Admin: moldura, Estatísticas, Primeiros passos, página de produto, novo pedido, edição de itens e blocos do pedido, Marca e visual, Custo x Venda, abas internas do produto
  (`adminProductTabs.ts`, `adminProductAreas.ts`), as listas de Pedidos, Produtos e Clientes e as telas herdadas Kits, Módulos e Tamanhos em 4 idiomas.
  Nenhuma tela do menu do Admin usa janela; restam só ficheiros sem uso (`ProductCustomizationManager`, `AdminUsageGuide`, `AdminHomeContent`).
- Modelo de loja: colunas de links do rodapé ainda só no i18n (Sobre, Contato e páginas legais já se editam em Admin > Páginas da loja).
- Dependências das funções sem versão fixa (npm:/esm.sh): fixar versões.
- Cópias só no próprio VPS até definir `LOJA3D_BACKUP_REMOTE`; o `~/loja3d/env` e o volume `loja3d_db-config` (chave do Vault) não entram nas cópias: guardar à parte.
- NF-e (Brasil) e faturação por país atrás de uma interface comum (hoje o Admin envia o PDF emitido fora da loja; só Portugal tem emissão integrada, FIZ).
