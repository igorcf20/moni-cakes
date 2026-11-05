# Guia visual da marca PRINT3D

Guia prático para quem for criar ou alterar páginas, componentes, cores, textos visíveis ou imagens da loja.
Tudo aqui foi conferido no código. Quando o código e este guia discordarem, vale o código: corrija o guia.

- Direção original do dono (texto aprovado em 4 de outubro de 2026): `docs/brand/direcao-ui-ux.md`.
- Tokens reais: `src/index.css` (variáveis CSS) e `tailwind.config.ts` (classes Tailwind).
- Logo: `src/components/brand/Logo.tsx`, `public/brand/*`, original em `docs/brand/print3d-logo-original.png`.
- Páginas de referência já no visual novo: `src/pages/Index.tsx` (home), `src/pages/ProductDetail.tsx` (produto),
  `src/components/catalog/*` (listagens), `src/components/product/ProductCard3D.tsx`, `src/components/Header.tsx`,
  `src/components/Footer.tsx`, `src/components/institutional/*` (páginas internas).
- Skill do projeto: `.claude/skills/print3d-marca/SKILL.md` (aponta para este guia).

Se você mudar o visual, atualize este guia no mesmo commit e registre a mudança em `docs/CHANGELOG.md`.

> **Redesenho editorial (26 de outubro de 2026, kit do dono).** O tema PRINT3D mudou: terracota `#D2461E`
> (hover e texto `#B83D1B`, suave `#F6E4DA`), creme `#FBF8F3`, grafite `#171715`, cinzas `#3D3A36` / `#6D6A65`,
> bordas `#E8E1D8`, fundo alternativo `#F4EEE6`. Títulos h1 e h2 da loja em **Cormorant Garamond** (peso 560,
> `font-size-adjust: 0.46`, títulos de seção da loja até 42px e da página do produto até 30px); h3 a h6, texto e todo o Admin em Inter. Botões principais em pílula (`rounded-full`),
> cartões de produto sem caixa (foto com cantos de 14px), frase pequena acima dos títulos em maiúsculas espaçadas com
> um traço (`Eyebrow` em `src/pages/Index.tsx`), ponto final na cor da marca nos títulos editoriais, `font-editorial`
> para título em serifa fora de h1/h2. Onde as tabelas abaixo ainda falarem do laranja `#FF5A0A` e da Inter nos
> títulos, leia "cor da marca" e os valores deste quadro; o laranja antigo é o modelo "PRINT3D clássico" no Admin.
> Catálogo, produto e carrinho seguem o mesmo traço (pílulas, menos caixas, mais espaço). Cantos: fotos de categoria e
> blocos editoriais 4 a 6px, foto do cartão de produto 8px, painéis do carrinho 6px; só botões e chips são pílula.
> Logo e ícones em terracota (os originais laranja ficam no histórico do Git). Admin: barra lateral grafite
> `hsl(200 7% 9%)` (`.admin-sidebar`, variável `--admin-sidebar`), texto branco a 60-80%, item ativo com fundo branco a 10%
> e filete na cor da marca; conteúdo em creme com cartões brancos; títulos sempre em Inter.
> Nome do produto nos cartões em Inter 14 a 15px semibold (a serifa grande nos cartões parecia site genérico, pedido do dono).

## 1. Princípio da marca

A PRINT3D não é "uma loja de impressão 3D": é uma **marca de produtos de design cuja fabricação é impressão 3D**.
O cliente primeiro deseja o produto e só depois percebe como ele foi feito. A experiência deve dizer, nesta ordem:

1. "Isso é bonito."
2. "Isso é útil."
3. "E ainda posso personalizar."

Na prática:

- Produto e fotografia em primeiro lugar; elementos tecnológicos decorativos por último.
- Moderna, jovem, confiável, criativa, tecnológica, acessível, premium sem parecer luxuosa demais.
- Muito espaço livre, cantos arredondados, sombras quase invisíveis, fotos grandes.
- **Nada** de estética futurista exagerada, cyberpunk, neon ou fundo escuro como padrão (o único bloco escuro é o rodapé).
- Personalização é uma característica central (personalizador `/personalizar` e orçamento por arquivo 3D `/orcamento-3d`).
- Nada de prova social inventada: sem vendas falsas, contadores, avaliações ou preços de exemplo.

## 2. Cores

Esta paleta é o **tema PRINT3D** (`src/theme/presets.ts`, modelo `print3d`), padrão desta loja em `src/config/store.ts`.
O Admin > Marca e visual pode trocá-la; por isso componentes usam só tokens (nunca hex fixo) e o laranja abaixo quer
dizer "cor da marca". Os tokens ficam em `src/index.css` no formato HSL (`--primary: 20 100% 52%`) e são usados como `hsl(var(--primary))`.
A conversão HSL pode diferir 1 ou 2 unidades do hex da direção (ex.: `--primary` dá `#FF5C0A`); a diferença não se vê.
Modificadores de opacidade funcionam (`bg-primary/10`, `border-foreground/30`).

| Cor | Hex | Token CSS | Classe Tailwind | Quando usar |
|---|---|---|---|---|
| Creme (fundo principal) | `#FBF8F3` | `--background` | `bg-background` | Fundo de todas as páginas e grandes superfícies; substitui o branco puro. Também é o fundo das fotos de produto, do quadrado do cubo no rodapé e do `theme-color`. |
| Branco | `#FFFFFF` | `--card`, `--popover` | `bg-white`, `bg-card`, `bg-popover` | Cartões, menus, dropdowns, mega menu, campos de formulário, barra de confiança, seções alternadas da home. |
| Laranja principal | `#FF5A0A` | `--primary`, `--brand-orange`, `--ring` | `bg-primary`, `text-primary`, `border-primary`, `fill-primary`, `ring-ring` | CTA e botões principais, badges de desconto e do carrinho, ícones de destaque, estrelas, sublinhado do link ativo, anel de foco. Como cor de texto, só em tamanho grande (o "3D" do hero) ou em ícones. |
| Laranja de hover | `#F04E00` | `--primary-hover` | `hover:bg-primary-hover` | Só o hover dos botões laranja (já incluído em `btnPrimary`). |
| Laranja secundário | `#FF7A18` | `--brand-orange-2` | `bg-brand-orange-2` | Início do gradiente e elementos secundários. |
| Laranja para texto | `#C2410C` | `--brand-orange-text` | `text-brand-orange-text` | **Todo texto laranja pequeno ou médio**: eyebrows, links "Ver todos", preço promocional, hover de links, categoria ativa, contagem de resultados, avisos. Existe para manter contraste legível no creme. |
| Laranja suave | `#FFF0E7` | `--accent`, `--brand-orange-soft` | `bg-accent`, `bg-brand-orange-soft` | Fundo de ícones em quadrado ou círculo, badges "Em breve" e "Personalizável", card do mega menu, avisos da compra, hover de "Ofertas". |
| Preto | `#171717` | `--foreground`, `--brand-ink` | `text-foreground`, `bg-brand-ink` | Títulos, navegação, texto principal, fundo do rodapé, badge "Novo". |
| Cinza escuro | `#404040` | `--brand-ink-soft` | `text-brand-ink-soft` | Texto secundário importante: texto de abertura abaixo do H1, texto de banners, itens do mega menu. |
| Cinza | `#737373` | `--muted-foreground` | `text-muted-foreground` | Metadados, legendas, número de avaliações, preço riscado, trilho de navegação. |
| Borda | `#EDE9E3` | `--border` | `border-border` (padrão de todas as bordas) | Divisores, bordas de botões secundários, campos, cabeçalho, mega menu. |
| Borda de cartão | `#EEEAE5` | `--card-border` | `border-brand-card-border` | Borda dos cartões (produto, categoria, passos, avaliações, galeria, estados vazios). |
| Fundo alternativo | `#F5F1EA` | `--secondary`, `--muted`, `--brand-alt` | `bg-brand-alt`, `bg-secondary`, `bg-muted` | Seções alternadas (banner PLA, avaliações), fundo do `LayerArt` e da galeria, hover de botões de ícone. |

Outros tokens: `--input` (borda dos campos shadcn, `border-input`) e `--destructive` (erros, `text-destructive`).

### Contraste (WCAG)

| Combinação | Contraste | Uso permitido |
|---|---|---|
| `#171717` em creme | 16,9:1 | Qualquer texto |
| `#404040` em creme | 9,8:1 | Qualquer texto |
| `#737373` em creme | 4,48:1 (em branco 4,74:1) | No limite do AA: só metadados e legendas, nunca texto principal |
| `#C2410C` em creme / branco / `#FFF0E7` | 4,9:1 / 5,2:1 / 4,65:1 | Texto laranja de qualquer tamanho |
| `#FF5A0A` em creme | 2,95:1 | **Não** usar em texto pequeno; só ícones, texto grande ou fundo |
| Branco em `#FF5A0A` | 3,1:1 | CTA, badges e chips com texto em negrito (padrão da direção). Nunca texto corrido ou fino em fundo laranja |

### Cores funcionais (fora da paleta da marca)

- Erro: `--destructive` (`text-destructive`, `bg-destructive/5`, `border-destructive/30`).
- Sucesso: `emerald-600` e `emerald-700` do Tailwind (botão "adicionado", escalão aplicado), sem token.
- Aviso: `bg-amber-50 text-amber-700` (`StatusCard` com `tone="warning"`).
- Estados do pedido e do pagamento: `src/lib/orderStatusStyles.ts` (âmbar, azul, violeta, verde-azulado, índigo,
  verde, rosa, cinza). Só para estados; não use essas cores em outros lugares.

### Nomes herdados (não usar em código novo)

A loja nasceu da Brindes M&L (azul) e passou por um visual dourado. Os nomes antigos continuam a existir para os
componentes não migrados não quebrarem, mas apontam para a paleta nova: `--brand-gold*`, `--brand-navy*`,
`--brand-royal*`, `--brand-cyan`, `--brand-sand`, `--brand-ash`, `--brand-mist`, `--surface-*` e as classes
`brand-gold*`, `brand-navy`, `brand-royal*`, `brand-black*`, `brand-cream*`, `brand-yellow`, `brand-red`,
`brand-graphite`, `brand-ash`, `brand-sand`, `brand-white`, `brand-text-dark`, `brand-text-light`, `surface-*`.
Cuidado com `brand-orange-deep`: apesar do nome, é preto (aponta para `--brand-navy`). Alguns aliases do Tailwind
ainda têm tons azulados antigos (`brand-black-soft`, `brand-black-border`, `brand-cream-border`, `brand-cream-muted`).
Em código novo use só os nomes da tabela acima.

### Cores e fontes vindas do Admin

Admin > Marca e visual grava o tema em `store_settings.store_brand`; `src/theme/themeVars.ts` transforma-o em todas
as variáveis acima e `src/components/brand/BrandManager.tsx` aplica-as no site inteiro (o `src/index.css` é só a
reserva). Os ajustes finos (laranja de texto, laranja suave, hover, fim do gradiente, cinza escuro) do tema PRINT3D
são os desta tabela; noutros temas, vazios, são calculados com contraste mínimo. Fontes: lista em `src/theme/fonts.ts`
(variáveis `--font-body` e `--font-heading`).

## 3. Gradiente e fundos

- Gradiente da marca (único permitido): `linear-gradient(135deg, #FF7A18 0%, #FF4D00 100%)`, token `--gradient-primary`.
  Classes: `bg-gradient-primary` ou `bg-[image:var(--gradient-primary)]`.
- Onde usar: banners de destaque com texto branco (banner "Crie sua peça" na home, bloco de destaque em `/sobre`).
  Não usar em botões, texto ou fundos de página.
- Fundos de página: creme. Para separar seções, alterne com `bg-white` (listas de produtos da home) ou
  `bg-brand-alt` (banner PLA, avaliações). O rodapé é o único bloco escuro (`bg-brand-ink`).
- `--gradient-hero` (creme para `#F5F1EA`) e `--gradient-card` (branco para creme) existem para fundos suaves.
- O tema `.dark` em `src/index.css` é opcional e nunca é ativado; a marca é clara.

## 4. Tipografia

- Fonte única: **Inter** variável, embutida no site com `@fontsource-variable/inter` (importada em `src/main.tsx`).
  Não carregue Google Fonts nem outras fontes. `font-sans`, `font-heading`, `font-display` e `font-body` apontam todas
  para a Inter. O `body` usa `font-feature-settings: 'cv11', 'ss01'`.
- Exceção: o personalizador (`/personalizar`) carrega fontes Droid do three.js só para gerar o texto do modelo 3D; não são fontes de interface.
- Base em `src/index.css`: `h1` a `h6` com peso 750, `letter-spacing: -0.025em`, `line-height: 1.1`.
- Títulos fortes e compactos, com espaçamento negativo; use `[text-wrap:balance]` em títulos de várias linhas.

| Elemento | Tamanho (celular, depois maiores) | Classes de referência | Onde está |
|---|---|---|---|
| H1 do hero | 40, 52, 60, 64px, peso 780 | `text-[40px] font-[780] leading-[1.03] tracking-[-0.04em] [text-wrap:balance] sm:text-[52px] lg:text-[60px] xl:text-[64px]` | `Hero` em `src/pages/Index.tsx` |
| H1 de listagem | 40, 52, 60px, peso 780 | constante `h1` em `src/components/catalog/CatalogHeader.tsx` | `/produtos`, `/categoria/:slug` |
| H1 do produto | 40, 52, 56, 60px, peso 780 | `text-[40px] font-[780] leading-[1.05] tracking-[-0.03em] sm:text-[52px] lg:text-[56px] xl:text-[60px]` | `src/pages/ProductDetail.tsx` |
| H1 de páginas internas | 34, 44, 52px, extrabold | `h1` em `src/components/institutional/styles.ts` | Sobre, FAQ, Contato, Kits, legais |
| H2 de seção | 28 a 32px, até 38 a 42px | `text-[28px] font-bold leading-tight tracking-[-0.03em] md:text-[38px]` (`SectionHead` da home); `h2` de `styles.ts` (26 e 34px) | Home, produto, páginas internas |
| H3 | 20 a 22px, bold | `h3` de `styles.ts`: `text-[20px] font-bold leading-snug tracking-[-0.02em] md:text-[22px]` | Cartões de passos, blocos |
| Texto de abertura | 17 e 18px | `text-[17px] leading-relaxed text-brand-ink-soft md:text-lg` | Abaixo dos H1 e em banners |
| Corpo | 15 e 16px | `text-[15px]` ou `text-[16px]`, `leading-relaxed` | Descrições, cartões |
| Texto pequeno | 13 e 14px | `text-[13px]`, `text-sm`; badges 11 e 12px em negrito | Metadados, trilho, rótulos |
| Eyebrow | 13px, semibold, caixa alta | constante `eyebrow` (ver seção 6) | Acima dos títulos |
| Preço | Cartão 17px bold; produto 32 e 36px peso 780 | sempre com `tabular-nums` | `ProductCard3D`, `ProductDetail` |

## 5. Raios, sombras, espaçamento e grade

### Raios

| Elemento | Raio | Classe usada |
|---|---|---|
| Botões grandes e campos | 14px | `rounded-[14px]` (ou `rounded-lg`, que é `--radius` = 14px) |
| Botões de ícone e chips | 12px | `rounded-xl` (12px no Tailwind) |
| Badges | 14px | `rounded-lg` |
| Cartões | 18 a 20px | `rounded-[20px]` (produto, `card`), `rounded-[18px]` (categoria, card do mega menu) |
| Imagens dentro de cartões | 14px | `rounded-[14px]` |
| Banners, galeria do produto, estados vazios | 24px | `rounded-[24px]` |
| Mega menu | 20px só embaixo | `rounded-b-[20px]` |

Não arredonde tudo ao máximo: `rounded-full` só para círculos (swatches de cor, botão de favorito, badge do carrinho, ícones em círculo).
No Tailwind deste projeto `rounded-lg` = 14px, `rounded-md` = 12px e `rounded-sm` = 10px (derivados de `--radius`).

### Sombras (muito suaves)

| Token | Classe | Uso |
|---|---|---|
| `--shadow-soft` | `shadow-soft` ou `shadow-[var(--shadow-soft)]` | Cabeçalho depois de rolar, botões flutuantes, ícone do `LayerArt` |
| `--shadow-card` | `shadow-[var(--shadow-card)]` | Cartões de página (`card`, estados) |
| `--shadow-hover` | `shadow-hover` ou `shadow-[var(--shadow-hover)]` | Hover de cartões de produto e categoria |
| `--shadow-elevated` | `shadow-[var(--shadow-elevated)]` | Mega menu e sugestões da busca (`0 18px 50px rgba(0,0,0,.10)`) |
| `--shadow-luxury` | `shadow-luxury` | Elemento flutuante sobre banner laranja |
| `--shadow-glow-orange` | `shadow-glow-orange` ou `shadow-[var(--shadow-glow-orange)]` | Botão laranja principal e chip ativo |
| `--shadow-ring-royal` | `shadow-[var(--shadow-ring-royal)]` | Anel laranja de foco do campo de busca (o nome é herdado; a cor é laranja) |

Nada de sombras fortes nos cartões; o card de produto não tem sombra parado, só no hover.

### Espaçamento

- Seções da home: `py-12 md:py-16` (listas de produtos, categorias) e `py-14 md:py-20` (banner PLA, "Como funciona",
  avaliações, inspirações). O banner "Crie sua peça" fica entre seções com `py-6 md:py-8`.
- Cabeça de seção (título e link "Ver todos"): `mb-6 md:mb-8`.
- Grades: `gap-3 sm:gap-4`. Cartões: `p-4` (produto), `p-6` (passos, avaliações), `p-8` (mega menu).
  Banners: `p-6 sm:p-10 lg:p-12`.
- Hero: `pt-8 pb-10 md:pt-12 md:pb-14`, colunas `lg:grid-cols-[45fr_55fr]` (45% texto, 55% produto).
- Página do produto: `lg:grid-cols-[minmax(0,55fr)_minmax(0,45fr)]` (galeria 55%, compra 45%), colunas fixas com `lg:sticky lg:top-[152px]`.

### Grade

- Use sempre a classe **`.shell`** (em `src/index.css`) para o conteúdo: largura máxima 1320px de conteúdo
  (1416px com as margens), margens laterais de 16px (celular), 24px (a partir de 768px), 32px (1024px) e 48px (1280px).
  Não use o `container` do Tailwind (herdado, 1400px).
- Pontos de quebra do Tailwind (padrão): `sm` 640, `md` 768, `lg` 1024, `xl` 1280, `2xl` 1536px.
- Grade de produtos: 2 colunas no celular, 3 no tablet, 4 e 5 no desktop.
  - Sem coluna de filtros: `productGridWide` em `src/components/catalog/ui.ts` (`grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5`), igual à home.
  - Com coluna de filtros (listagens): `productGrid` (`grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5`).
  - A home esconde itens que deixariam uma linha incompleta em cada largura (ver `ProductGrid` em `Index.tsx`).
- Cabeçalho: linha principal com 64px no celular e 76px no desktop; segunda linha (categorias) de 56px só no desktop.
  O `html` tem `scroll-padding-top: 7rem` para as âncoras não ficarem atrás do cabeçalho fixo.
- País, idioma e moeda: um só botão com bandeira (`Flag`, SVG 3:2, cantos de 4 a 5px e contorno fino), nome do país e símbolo da moeda; nunca bandeira em emoji (o Windows não desenha).

## 6. Componentes

Classes e peças compartilhadas:

- `src/components/catalog/ui.ts`: `btnPrimary`, `btnSecondary`, `chip`, `chipIdle`, `chipActive`, `productGrid`, `productGridWide`.
- `src/components/institutional/styles.ts`: `card`, `eyebrow`, `h1`, `h2`, `h3`, `field`, `textarea`, `linkInline`,
  animações `reveal` e `appear` (e reexporta `btnPrimary` e `btnSecondary`).
- `src/components/institutional/ui.tsx`: `PageShell` (cabeçalho, conteúdo, rodapé e `MotionConfig`), `PageIntro`
  (trilho, eyebrow, H1 e texto de abertura), `StatusCard` (carregando, sucesso, aviso, erro), `FieldLabel`, `StarRatingInput`.
- `src/components/MediaImage.tsx`: `MediaImage` (foto da loja com reserva) e `LayerArt` (reserva visual).
- `src/components/product/*`: `ProductCard3D`, `ProductCardSoon`, `ProductCardSkeleton`, `ProductGallery`,
  `ProductOptions` (`ColorSwatches`, `SizeOptions`, `QuantityStepper`, `TierTable`), `AddToCartButton`, `MobileBuyBar`, `RatingStars`.

### Botões

- **Principal** (`btnPrimary`): laranja, texto branco 15px semibold, altura mínima 48px, raio 14px, `px-6`,
  `shadow-glow-orange`, hover `#F04E00`, `active:scale-[0.98]`, anel de foco laranja. Um por bloco: a ação principal.
- **Secundário** (`btnSecondary`): branco com borda `border-border`, texto preto, mesma altura e raio, hover escurece a borda.
- Ícone dentro do botão: Lucide 18px (`h-[18px] w-[18px]`), seta `ArrowRight` que anda 2px no hover (`group-hover:translate-x-0.5`).
- Sobre o banner laranja: botão branco `bg-white text-brand-ink` e botão contornado `border border-white/45 text-white hover:bg-white/10`.
- Botão só de ícone: `grid h-11 w-11 place-items-center rounded-xl hover:bg-secondary`, sempre com `aria-label`.
- Adicionar ao carrinho no cartão: quadrado laranja de 44px com `ShoppingBag`; depois de adicionar fica verde
  (`bg-emerald-600`) com `Check` por 1,4 s e aparece um toast.
- Botões `Todas as categorias` (laranja, 40px de altura) e `Ofertas` (texto `text-brand-orange-text` com `Flame`) no cabeçalho.
- O `Button` do shadcn (`src/components/ui/button.tsx`, 40px, raio 12px) é usado no Admin; no site prefira as classes acima.
  `Index.tsx` tem cópias locais de `btnPrimary` e `btnSecondary` sem anel de foco: em código novo importe as de `catalog/ui.ts`.

### Chips

`chip` + `chipIdle` ou `chipActive` (`src/components/catalog/ui.ts`): 44px de altura, raio 12px, 14px semibold.
Parado: branco com borda; hover: borda laranja e texto `text-brand-orange-text`; ativo: fundo laranja, texto branco, `shadow-glow-orange`.
Usados em subcategorias, atalhos de categoria e filtros.

### Campos de formulário

- `field` (`styles.ts`): `h-12 rounded-[14px] border-border bg-white text-[16px] md:text-[15px]`.
  16px no celular evita o zoom automático do iPhone. `textarea` segue o mesmo padrão com `min-h-[140px]`.
- Rótulo com `FieldLabel` (15px semibold; "(opcional)" e dicas em 13px cinza) ou `sr-only` quando o campo já se explica.
- Busca do cabeçalho (`src/components/header/SearchBox.tsx`): `h-12 rounded-[14px]`, ícone `Search` à esquerda,
  botão laranja dentro do campo, foco com borda laranja e `shadow-[var(--shadow-ring-royal)]`; sugestões em painel
  branco `rounded-[18px]` com `shadow-[var(--shadow-elevated)]` (produtos com miniatura, categorias, histórico).
- Newsletter no rodapé: campo escuro `bg-white/[0.06] border-white/15` e botão laranja, ambos com 48px.
- Opções do produto: cores em círculos de 44px (`ColorSwatches`, com marca laranja no escolhido), tamanhos em botões
  de 44px (`SizeOptions`), quantidade `[-] 1 [+]` com botões de 48px (`QuantityStepper`).

### Cartões

- **Cartão base** (`card`): `rounded-[20px] border border-brand-card-border bg-white shadow-[var(--shadow-card)]`.
- **Produto** (`ProductCard3D`): branco, `rounded-[20px]`, borda `brand-card-border`, sem sombra parado.
  Foto 1:1 (`aspect-square`, fundo creme), segunda foto aparece no hover; favorito redondo no canto superior direito
  (coração laranja preenchido quando ativo, com animação de mola); badges no canto superior esquerdo; nome em 15px
  semibold (2 linhas no máximo); estrelas e número de avaliações **só se existirem avaliações reais**; preço 17px bold.
  Hover: sobe 4px (`hover:-translate-y-1`), ganha `shadow-hover` e a foto cresce para `scale-[1.03]`, tudo em 200ms.
- **Produto nas listagens** (`ProductCardClean`, padrão de /produtos e /categoria): foto 4:5 `rounded-[14px]` sobre branco,
  nome em Inter 14 a 15px semibold (nunca serifa no cartão), preço 15 a 16px semibold e carrinho redondo de 40px com borda
  ao lado; selos Promoção e Novo sobre a foto. O cartão de foto inteira (`ProductCard3D`) fica como opção em Admin > Página de catálogo.
- **Cabeçalho das listagens**: título h1 em serifa moderada (28 / 34 / 38px), contagem simples com ponto terracota, sem eyebrow
  em maiúsculas espaçadas; no celular os produtos começam na primeira tela.
- **Categoria** (home): branco, `rounded-[18px]`, `p-2`, foto `aspect-[4/3.3]` com `rounded-[14px]`, nome embaixo e
  `ArrowRight` que fica laranja no hover.
- **Passos e avaliações**: `rounded-[20px] border-brand-card-border bg-white p-6`, ícone num quadrado `bg-brand-orange-soft`.
- **Banners**: `rounded-[24px]`, gradiente laranja ou foto; texto branco no gradiente.
- **Mega menu** (`src/components/header/MegaMenu.tsx`): até 1200px, centralizado, branco, borda `border-border` sem topo,
  `rounded-b-[20px]`, `shadow-[var(--shadow-elevated)]` (não existe a classe `shadow-elevated`), `p-8`; 4 colunas de categorias mais 2 embaixo; cerca de 28% da largura para
  o card visual "Novidades" (`bg-brand-orange-soft`, `rounded-[18px]`) e atalhos Mais vendidos, Ofertas, Novidades, Presentes.

### Badges

| Badge | Classes |
|---|---|
| Desconto (`-20%`) no cartão | `rounded-lg bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground` (na página do produto, 13px ao lado do preço) |
| Desconto no Pix (`-5%`) | `rounded-md bg-emerald-50 px-2 py-0.5 text-[12px] font-bold text-emerald-700` (cartão: 11px); preço no Pix e "sem juros" em `text-emerald-700`, ícone `QrCode` (`SmartPrice`) |
| Novo | `rounded-lg bg-brand-ink px-2 py-0.5 text-[11px] font-bold text-white` |
| Personalizável (Em breve usa o mesmo fundo e cor) | `rounded-lg bg-accent px-2 py-0.5 text-[12px] font-bold text-brand-orange-text` |
| Contagem de resultados | `rounded-lg bg-brand-orange-soft px-3 py-1.5 text-[14px] font-semibold text-brand-orange-text` |
| Carrinho no cabeçalho | bolinha `bg-primary` de 18px, texto 10px bold, `ring-2 ring-background`, entra com mola; mostra `99+` acima de 99 |

### Eyebrow

Pequeno rótulo acima do título: constante `eyebrow` de `src/components/institutional/styles.ts`
(`text-[13px] font-semibold uppercase tracking-[0.18em] text-brand-orange-text`). No banner laranja use `text-white/85`.
Escreva o texto normal no i18n (ex.: `hero_eyebrow: 'Ideias que ganham forma'`); a caixa alta vem do CSS.
Não use a classe CSS `.eyebrow` de `src/index.css` (herdada: traço antes do texto e laranja `#FF5A0A` em 11px, com pouco contraste).

### Cabeça de seção

`SectionHead` em `src/pages/Index.tsx`: H2 à esquerda (com subtítulo opcional em cinza) e, à direita, o link
"Ver todos" em `text-brand-orange-text` com `ArrowRight`.

### Trilho de navegação (breadcrumbs)

`CatalogBreadcrumb` (`src/components/catalog/CatalogBreadcrumb.tsx`): `nav` com `aria-label`, lista `ol`,
separador `ChevronRight` de 14px, texto 13px cinza, links com hover laranja e 44px de altura no celular,
último item em preto com `aria-current="page"`. A página do produto tem uma versão própria com o mesmo visual.
Em páginas internas use `PageIntro`, que já junta trilho, eyebrow, H1 e texto de abertura.

### Estados vazios, de erro e "em breve"

- **`LayerArt`** (`src/components/MediaImage.tsx`): reserva para qualquer foto que ainda não existe. Fundo
  `bg-brand-alt` com linhas horizontais finas a cada 7px (como camadas de impressão), sombra elíptica suave e um
  ícone Lucide laranja dentro de um círculo branco. Tamanhos `sm`, `md` e `lg`. Nunca deixe imagem quebrada.
- **`ProductCardSoon`**: quando o catálogo está vazio, mostra a ideia do produto com o badge "Em breve", sem preço nem avaliação.
- **Listagens** (`src/components/catalog/CatalogGrid.tsx`): `ListingEmpty` (nada encontrado, com `LayerArt` e
  caminhos para continuar), `ListingSoon` (catálogo ainda vazio) e `ListingError` (erro com botão de tentar de novo).
- **Páginas**: `StatusCard` com tons `brand`, `success`, `warning`, `error` e `muted`; página do produto usa `ProductMessage`.
- Regra: um estado vazio explica o que aconteceu e oferece um caminho (ver produtos, personalizar, enviar arquivo 3D).

### Carregamento (skeleton)

- Classe `.skeleton` (brilho em `src/index.css`) com o mesmo raio do elemento final.
- `ProductCardSkeleton` para grades; a página do produto tem um skeleton que repete o layout (galeria e compra).
- Skeleton decorativo com `aria-hidden="true"`; o contêiner de carregamento com `role="status"` e `aria-label`.
- No lugar do conteúdo, prefira skeleton a spinner. O spinner (`Loader2` com `animate-spin`) fica para dentro de
  botões e para o `StatusCard` com `busy`.

### Toasts

`sonner`: `toast.success(t('added'), { description: p.name })` e `toast.error(...)`, sempre com texto do i18n.

## 7. Ícones

- **Só Lucide** (`lucide-react`), estilo contorno. Não misture outras famílias.
- Traço entre 1,7 e 2: o padrão do site é `strokeWidth={1.8}`; 1,9 a 2 em botões pequenos; estrelas usam 1,6 com preenchimento.
- Tamanhos usuais: 16px (`h-4 w-4`) em linha, 18px (`h-[18px] w-[18px]`) em botões, 22px nas ações do cabeçalho,
  24px (`h-6 w-6`) em ícones de destaque dentro de um quadrado de 48px `bg-brand-orange-soft`.
- Ícone decorativo: `aria-hidden="true"`. Botão só de ícone: `aria-label` com texto do i18n.
- Os emojis da direção original viraram ícones: Ofertas `Flame`, Mais vendidos `Star`, Novidades `Sparkles`,
  Presentes `Gift`; barra de confiança `Truck`, `ShieldCheck`, `CreditCard`, `Leaf`; a seta "Ver produtos" é `ArrowRight`.
- Redes sociais no rodapé também são Lucide (`Instagram`, `Facebook`, `Music2` para TikTok, `MessageCircle` para WhatsApp).
- Exceção: logotipos de meios de pagamento em `src/components/PaymentMethods.tsx` (pronto, ainda sem uso) são marcas, não ícones.

## 8. Movimento

- A interface deve parecer viva, nunca exagerada. Duração padrão **150 a 250ms** (`duration-150`, `duration-200`;
  no framer-motion `duration: 0.2` a `0.25`). Sem animações longas nem infinitas em conteúdo.
- Envolva as páginas em `<MotionConfig reducedMotion="user">` (já feito em `PageShell`, `Index`, `ProductDetail`,
  listagens, carrinho, checkout e outras). As animações CSS de entrada (`animate-page-in`, `stagger-in`, `.reveal`)
  têm guarda para `prefers-reduced-motion`; em CSS novo, ponha a mesma guarda.
- Padrões em uso:
  - Entrada ao rolar: `reveal(i)` (opacidade 0 para 1 e 10px para 0, 0,25 s, atraso de 0,04 s por item, uma vez).
    Ao montar: `appear(i)`. Ambos em `src/components/institutional/styles.ts` (a home tem a sua cópia).
  - Hover de cartão: sobe 4px e ganha `shadow-hover`; foto `scale-[1.03]`; seta anda 2px; tudo em 200ms.
    O ícone do `LayerArt` sobe 4px quando está dentro de um cartão com a classe `group`.
  - Botões grandes da página inicial sobem 2px no hover e voltam a 0 no clique.
  - Parallax: só na página inicial, preso à rolagem (sem duração própria) e com deslocamentos pequenos (14 a 70px):
    `useParallax(distancia)` em `src/pages/Index.tsx`; parado com "reduzir movimento" (`useReducedMotion`).
  - Clique: `active:scale-[0.98]` em botões grandes e `active:scale-95` em botões de ícone.
  - Mega menu: opacidade 0 para 1 e `y` de -5px para 0 em 200ms.
  - Favorito: coração com mola; badge do carrinho com mola; confirmação verde ao adicionar; toast.
  - Troca de página: `PageTransition` com `animate-page-in` (0,45 s, desligada com "reduzir movimento").
- Cuidados (já deram problema):
  - `y` do framer-motion sobrescreve as classes `translate-*` do Tailwind no mesmo elemento: centralize com um contêiner flex por fora.
  - `PageTransition` usa `transform`, por isso um `position: fixed` dentro dele fica preso: barras fixas vão num
    portal (`createPortal`), como `MobileBuyBar`.
- Não use os auxiliares antigos de `src/index.css` com durações longas ou infinitas: `.hover-lift`, `.card-hover`,
  `.img-zoom`, `.stagger-fade-in`, a classe CSS `.reveal` (0,7 s; não confundir com a função `reveal(i)`), `.cta-royal`,
  `.btn-shine`, `.ring-royal`, nem as animações `float`, `bounce-soft` e `subtle-zoom` do Tailwind.

## 9. Acessibilidade

- **Alvos de toque de 44px no mínimo** (`min-h-[44px]`, `h-11 w-11`); botões principais com 48px; links do trilho
  com 44px no celular. O botão de favorito do cartão de produto tem hoje 40px: ao mexer nele, suba para 44px.
- **Foco visível**: `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`
  (anel laranja); dentro de imagens use `focus-visible:ring-inset`. Nunca tire o foco sem pôr outro no lugar.
- **Contraste**: ver a tabela da seção 2. Texto laranja pequeno sempre com `text-brand-orange-text`.
- **Leitores de tela**: `aria-hidden` em ícones decorativos, `aria-label` em botões de ícone, `aria-pressed` em
  favoritos, `aria-expanded` em menus, `aria-current="page"` no item ativo, `role="status"` ou `aria-live` em
  contagens e mensagens que mudam, `sr-only` para preço antigo e novo e para a nota das estrelas.
- O `lang` do `<html>` acompanha o idioma escolhido (`src/i18n/index.ts`).
- Hover só onde existe mouse quando o efeito atrapalha no toque (o rodapé usa `[@media(hover:hover)]:hover:`).
- Sem rolagem horizontal em nenhuma largura (testar 320 a 390px no celular e 1024 a 1279px no desktop).

## 10. Logo

O logo oficial é um **cubo laranja e preto que forma um P**, mais o nome **PRINT3D** (PRINT em preto, 3D em laranja)
e, na versão completa, **LOJA ONLINE** embaixo, espaçado. Aplicado no commit `1d6d427` (4 de outubro de 2026),
substituindo um logo provisório de camadas.

### Arquivos

| Arquivo | Tamanho e fundo | O que é | Onde é usado |
|---|---|---|---|
| `docs/brand/print3d-logo-original.png` | 1254x1254 PNG, transparente, com brilho e sombra | Original enviado pelo dono (cubo, nome e LOJA ONLINE) | Fonte para gerar versões. Não usar direto nas páginas |
| `public/brand/logo-full.webp` | 600x606, transparente | Logo completo recortado | `logos.full` em `src/config/store.ts`; tela de login do Admin (o Admin pode trocar em Marca e visual) |
| `public/brand-logo.png` | 480x485 PNG, transparente | Logo completo | E-mails (`<SITE_URL>/brand-logo.png` em `supabase/functions/_shared/email-templates/_brand.tsx` e `supabase/functions/_shared/transactional-email-templates/brand.tsx`; as funções de e-mail estão desligadas por enquanto) |
| `public/brand/icon-96.webp`, `icon-160.webp` | 96 e 160px, transparentes | Só o cubo (símbolo) | `logos.icon` (`icon-160.webp`) em `src/config/store.ts`, usado por `LogoMark` (44px); o de 96px já não é usado |
| `public/brand/wordmark.webp` | 487x96, transparente | Nome PRINT3D para fundo claro (PRINT preto, 3D laranja) | `logos.wordmark`; `Wordmark` com `tone="dark"` (cabeçalho, menu do celular, `/auth`) |
| `public/brand/wordmark-light.webp` | 487x96, transparente | Nome para fundo escuro (PRINT branco, 3D laranja) | `logos.wordmarkLight`; `Wordmark` com `tone="light"` (rodapé) |
| `public/favicon-32.png`, `public/favicon.png` (192), `public/icon-512.png` | transparentes | Cubo | `favicon` em `src/config/store.ts` (192) e `index.html` (512); `favicon-32.png` já não é usado |
| `public/apple-touch-icon.png` | 180x180, fundo creme `#FBF8F3` | Cubo | Ícone da tela inicial do iPhone e iPad |
| `public/og-image.jpg` | 1200x630, fundo creme | Logo completo centralizado | Imagem de compartilhamento (`og:image` e `twitter:image` em `index.html`) |

Não são da marca: `public/brand/kodemi-logo.png` (crédito "Desenvolvido por KodeMI" no rodapé, em branco com 60% de
opacidade), `public/brand/mbway-logo.png` e `public/viva-logo-128.png` (meios de pagamento herdados).

### Como aparece no código

`src/components/brand/Logo.tsx` exporta três peças:

- `Logo`: link para `/` com o cubo (`LogoMark`, 44px) e o nome (`Wordmark`, 22px de altura, 24px a partir de 640px).
  No hover o cubo gira 6 graus em 200ms. Use sempre este componente; não monte o logo à mão.
- `Logo tone="light"` (rodapé escuro): o cubo vai dentro de um **quadrado creme** (`tile`: 44px, `rounded-[12px]`,
  `bg-background`, cubo de 36px), porque a face preta do cubo desaparece no `#171717`; o nome usa a versão clara.
- `Wordmark`: se o nome da loja (Admin, `useStoreInfo`) for "PRINT3D" ou "PRINT 3D", usa a imagem oficial; se for
  outro nome, escreve o texto em Inter extrabold (`text-[1.45rem] tracking-[-0.04em]`) com o "3D" final em laranja.
- `index.html`: `theme-color` `#FBF8F3`, `og:site_name` PRINT3D.

### Quando usar cada versão

| Situação | Versão |
|---|---|
| Cabeçalho, menu do celular, telas de entrada | `Logo` (cubo e nome, fundo claro) |
| Fundo escuro (rodapé) | `Logo tone="light"` (cubo no quadrado creme e nome claro) |
| Espaço pequeno ou quadrado (avatar, ícone, favicon) | Só o cubo |
| Documentos, e-mails, Admin, compartilhamento em redes | Logo completo com LOJA ONLINE |

### O que não fazer

- Não recriar o logo em texto, CSS ou com outra fonte: o desenho das letras é próprio.
- Não mudar as cores (cubo laranja e preto, PRINT preto, 3D laranja), nem aplicar gradiente, contorno, sombra ou brilho extra.
- Não esticar nem distorcer: defina só a altura e deixe `w-auto` com `object-contain`.
- Não pôr o cubo direto em fundo escuro (use o quadrado creme) nem o nome escuro em fundo escuro.
- Não colocar o logo sobre fotos movimentadas.
- Não usar o original com brilho (`docs/brand/print3d-logo-original.png`) nas páginas; gere versões recortadas a
  partir dele, em WebP transparente, e mantenha os nomes de arquivo atuais.
- O menor uso atual do nome é 22px de altura; abaixo disso, use só o cubo.

## 11. Fotografia

### Direção (item 12 da direção original)

Na página inicial as fotos levam a classe `photo-warm` (saturação um pouco menor e leve tom quente) para parecerem uma só sessão.
Categorias da página inicial: blocos verticais altos (3:4), sem cantos, título em serifa sobre a foto.

Todas as fotos seguem exatamente o mesmo padrão:

- Foto realista de uma peça impressa em 3D em PLA, com linhas de camada sutis visíveis.
- Fundo `#FBF8F3` (o creme do site).
- Luz de estúdio suave e quente vindo da esquerda; sombra macia embaixo.
- Sem texto, sem logos, sem marcas d'água.
- Produto centralizado, com margem. **Formato 1:1.**
- Nada de ilustrações genéricas no lugar de fotos.

O dono gera as fotos no ChatGPT (sem API) e entrega os arquivos (ver `docs/MEMORIA.md`, decisão 7).

### Fotos de produto

Entram pelo Admin (campos `image` e `images` do produto). O cartão mostra a primeira foto em 1:1 com `object-cover`
e a segunda no hover; a galeria do produto também é quadrada. Sem foto, o cartão mostra `LayerArt`.

### Fotos fixas da loja (`src/lib/media.ts`)

Cada foto tem uma chave. Para ativar: salve o arquivo em `public/images/<chave>.webp` e acrescente a chave na lista
`AVAILABLE` de `src/lib/media.ts`. Enquanto a chave não estiver lá, o site mostra a reserva (`LayerArt` ou outra) e
nunca uma imagem quebrada (`MediaImage` também volta para a reserva se o arquivo falhar).

| Chave | Onde aparece | Proporção no layout | Reserva sem foto |
|---|---|---|---|
| `hero` | Hero da home; lateral da página `/auth` | 4:3,4 no celular, 5:4 no desktop | Vaso 3D girando (`StlViewer`) na home; `LayerArt` no `/auth` |
| `cat-decoracao`, `cat-organizacao`, `cat-suportes`, `cat-geek`, `cat-casa`, `cat-personalizados` | Cartões de categoria da home, banner da página da categoria e imagem de compartilhamento dessa página | 4:3,3 nos cartões; 16:7 no banner do celular | `LayerArt` com o ícone da categoria |
| `mega-novidades` | Card "Novidades" do mega menu | 4:3 | `LayerArt` |
| `banner-crie` | Banner "Crie sua peça" da home e página `/sobre` | 16:10 na home, 4:3 em `/sobre` | Exemplo de chaveiro desenhado em código (home); `LayerArt` (`/sobre`) |
| `banner-pla` | Banner "PLA sustentável" da home | 4:3 | `LayerArt` com folha |
| `insp-1` a `insp-6` | Grade "Inspirações" da home | 1:1 | `LayerArt` |
| `share` | Reservada, ainda sem uso | | O compartilhamento usa `public/og-image.jpg` |

Mesmo quando o layout corta a foto (4:3, 16:10), gere a imagem no padrão da direção com o produto bem centralizado e com margem,
para o corte não comer a peça.

Os JPG que já estão em `public/images` (`lingerie-*`, `category-*`, `banner-*`) vieram da cópia inicial do código,
não são referenciados em lugar nenhum e não são da PRINT3D: não use.

## 12. Texto

- Idioma padrão **português do Brasil**, tratamento por **"você"**, frases curtas e diretas.
  Ex.: "O que você está procurando?", "Ver produtos", "Criar peça personalizada", "Adicionado ao carrinho".
- **Sem emojis e sem travessões** em textos visíveis, em qualquer idioma. Use vírgula, dois-pontos ou frases separadas;
  setas e símbolos viram ícones Lucide.
- **Todo texto visível vem do i18n**: nada de texto solto nos componentes. Quatro idiomas: pt-BR (padrão), pt-PT, en, es.
  - Dicionários por área em `src/i18n/<área>.ts` (`layout`, `catalog`, `product`, `cart`, `checkout`, `account`,
    `pages`, `pagesShell`, `legal`, `orders`, `payments`, `address`, `taxId`, `customizer`, `print3d`).
  - `defineMessages({ 'pt-BR': {...}, 'pt-PT': {...}, en: {...}, es: {...} })`: o pt-BR é o modelo e o TypeScript
    obriga os outros idiomas a ter as mesmas chaves.
  - No componente: `const { t } = useMessages(layoutMessages)` e `t('chave', { nome: valor })` para `{nome}` no texto.
- Preços sempre pelo formatador do país (`src/lib/money.ts`, `useCurrency`), nunca com "R$" ou "€" fixo; use `tabular-nums`.
- Textos legais por país ficam em `src/legal/<jurisdição>.ts`.
- O painel Admin: moldura e listas de gestão (Pedidos, Produtos, Clientes) no i18n; diálogos internos herdados ainda
  só em português (pendência). Listas novas do Admin usam `AdminListKit.tsx` (cartão de número, chips de filtro com
  contagem, paginação), menu ativo em `bg-primary/10 text-brand-orange-text` e contadores em laranja.

## 13. Celular

O celular não é o desktop encolhido:

- Cabeçalho: menu, logo, busca e carrinho; a busca abre por baixo do topo; o menu é uma gaveta lateral à esquerda
  com as categorias em acordeão (`src/components/header/MobileMenu.tsx`).
- Barra de navegação fixa embaixo (`src/components/MobileTabBar.tsx`, 64px mais a área segura, só abaixo de 768px):
  Início, Produtos, Carrinho, Ajuda, Conta, com o ativo em laranja.
- Barras fixas da página (compra do produto, resumo do carrinho, total do checkout) ficam por cima da `MobileTabBar` e vão num portal.
- Checkout no celular: etapas já preenchidas numa linha com Alterar, juntas num só cartão; títulos das etapas em Inter
  18px (serifa só no título da página, até 40px); Continuar no fim de cada etapa aberta.
- Hero: texto, botões, imagem (em coluna). Grades de produtos com 2 colunas.
- Botões e alvos com 44px no mínimo; campos com texto de 16px.

## 14. Heranças a evitar

- Classes antigas em `src/index.css` com nomes ou estilo da identidade anterior: `.eyebrow` (classe CSS),
  `.section-label`, `.card-luxe`, `.card-premium`, `.cta-royal`, `.glow-royal`, `.glow-royal-soft`, `.ring-royal`,
  `.text-gradient-royal`, `.gradient-text`, `.nav-link`, `.glass-navy`, `.glass-light`, `.blob`, `.hover-lift`,
  `.hover-glow`, `.card-hover`, `.btn-shine`, `.img-zoom`, `.stagger-fade-in`, `.divider-gold`, `.pattern-*`, `.bg-surface-*`.
- Aliases de cor antigos (seção 2) e o `container` do Tailwind.
- Componentes antigos que nenhuma página importa: `src/components/ProductCard.tsx`, `ProductGrid.tsx`,
  `RelatedProducts.tsx`, `Hero.tsx`. Não use como modelo; o cartão atual é `ProductCard3D`.

## 15. Checklist para rever uma página nova

1. Fundo creme, cartões brancos, laranja só em CTA e destaques; texto laranja pequeno com `text-brand-orange-text`.
2. Só tokens e classes deste guia: nenhuma cor hex nova, nenhuma fonte nova, nenhum alias herdado.
3. Conteúdo dentro de `.shell`; grade de produtos com 2, 3, 4 e 5 colunas.
4. Títulos nas escalas da seção 4; eyebrow com a constante `eyebrow`; texto de abertura em `text-brand-ink-soft`.
5. Raios: 14px em botões e campos, 18 a 20px em cartões, 24px em banners. Sombras suaves, nada forte.
6. Botões com `btnPrimary` e `btnSecondary`; um só botão principal por bloco; alvos de 44px; foco visível.
7. Ícones Lucide com traço 1,7 a 2; `aria-hidden` nos decorativos e `aria-label` nos botões de ícone.
8. Animações de 150 a 250ms, nada infinito; página dentro de `MotionConfig reducedMotion="user"`.
9. Fotos no padrão (1:1, fundo creme, luz da esquerda); sem foto, `MediaImage` com `LayerArt`; nenhum dado inventado.
10. Textos no i18n nos 4 idiomas, pt-BR com "você", sem emojis nem travessões; preços pelo formatador do país.
11. Logo só pelo componente `Logo`.
12. Estados de carregamento (skeleton), vazio e erro pensados e com caminho para continuar.
13. Celular: sem rolagem horizontal de 320 a 390px, barras fixas em portal acima da `MobileTabBar`, campos com 16px.
14. Validação: `npx tsc -p tsconfig.app.json --noEmit`, `npx eslint <arquivos alterados>` e conferência no navegador
    em desktop (1280px e 1024px) e celular (390px).
15. Se mudou o visual: atualizar este guia; registrar em `docs/CHANGELOG.md`.
