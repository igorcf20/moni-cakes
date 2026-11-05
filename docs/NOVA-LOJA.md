# Criar uma loja nova a partir deste modelo

Este código é um **modelo de loja**: a PRINT3D é a primeira loja, mas nome, logos, cores, fontes e textos da marca
não estão presos no código. Quase tudo muda no painel Admin; o resto está em poucos ficheiros, listados aqui.

## O que muda onde

| O quê | Onde | Quem muda |
|---|---|---|
| Nome, frase, logos, ícone da aba, imagem de partilha, cores, fontes, descrição para o Google | Admin > **Marca e visual** (`/admin?tab=brand`) | Dono da loja |
| Contactos, redes sociais, moeda | Admin > Configurações gerais | Dono da loja |
| Banners de campanha (com datas) | Admin > **Banners** | Dono da loja |
| Perguntas frequentes (esconder grupos padrão, perguntas próprias por idioma) | Admin > **Perguntas frequentes** | Dono da loja |
| Textos, fotos e seções da página inicial (por idioma) | Admin > **Conteúdo da página inicial** | Dono da loja |
| Google Analytics 4, Meta Pixel e validade do consentimento de cookies (LGPD e RGPD) | Admin > **Privacidade e cookies** | Dono da loja |
| Categorias e menu do site (ícone, nomes por idioma, ordem) | Admin > **Categorias** (botão Copiar categorias padrão) | Dono da loja |
| Produtos, cupons, entrega, pagamento | Admin (ver **Primeiros passos**, `/admin?tab=start`) | Dono da loja |
| Valores-base da marca (primeira visita, HTML inicial para o Google, botão "Voltar ao padrão") | `src/config/store.ts` | Programador, uma vez |
| Ficheiros da marca padrão | `public/brand/`, `public/favicon.png`, `public/icon-512.png`, `public/apple-touch-icon.png`, `public/og-image.jpg` | Programador, uma vez |
| Modelos de cores oferecidos no Admin | `src/theme/presets.ts` (+ nomes em `src/i18n/adminBrand.ts`) | Programador, opcional |
| Fontes oferecidas no Admin | `src/theme/fonts.ts` (+ `npm i @fontsource-variable/<nome>`) | Programador, opcional |

## Passo a passo (programador)

1. Copie o repositório para um novo (sem o histórico, se preferir) e siga `deploy/PASSO-A-PASSO.md` para pôr a loja
   num servidor com o domínio dela.
2. Troque os ficheiros de `public/brand/` e os ícones de `public/` pelos da marca nova (ou apague-os e deixe os
   campos vazios em `src/config/store.ts`: sem imagem, o site mostra o nome em texto e a inicial num quadrado).
3. Em `src/config/store.ts` mude `name`, `tagline`, `nameAccent`, `description` e os caminhos das imagens, e escolha
   o tema-base: `theme: presetTheme('ocean')` (ou crie um modelo novo em `src/theme/presets.ts`).
4. Ajuste o catálogo padrão e os textos próprios do ramo da loja: `src/lib/catalog.ts` (categorias mostradas
   enquanto o Admin > Categorias está vazio),
   `src/i18n/layout.ts` (textos da página inicial), `src/lib/media.ts` (fotos), `src/legal/` (textos legais).
   Estes ainda são código (ver "Ainda no código" abaixo). As migrations `20261005190000_produto_base_vaso.sql` e
   `20261025180000_catalogo_inicial.sql` criam o catálogo da PRINT3D (produtos e banners de impressão 3D): numa loja
   de outro ramo, apague esses produtos e banners no Admin depois de publicar, e troque as fotos de `public/images/`.
5. Corra os testes: `node --experimental-strip-types scripts/test-theme.mjs` (o tema PRINT3D tem de continuar igual
   ao `src/index.css`; se mudar o tema-base, atualize também os valores de reserva do `src/index.css`).
6. Publique e crie o primeiro administrador (comando em `CLAUDE.md`, Backend e publicação).

## Passo a passo (dono da loja, no Admin)

Abra `/admin`: a primeira seção é **Primeiros passos**, com a lista do que falta e um botão para cada passo
(dados da loja, marca, categorias, primeiro produto, entrega, pagamento, redes sociais). Cada seção do painel tem,
no topo, o nome e uma frase sobre o que faz.

## Como o tema funciona (resumo técnico)

- `src/theme/types.ts`: o que é uma marca (`StoreBrand`) e um tema (`StoreTheme`: 8 cores + ajustes finos opcionais + 2 fontes).
- `src/theme/themeVars.ts`: tema -> variáveis CSS (`--primary`, `--background`, `--brand-orange-text`...). Os ajustes
  finos vazios são calculados (ex.: a cor da marca em texto pequeno é escurecida até ter contraste 4,5:1).
- `src/theme/brand.ts`: junta `src/config/store.ts` + o que o Admin gravou (`store_settings.store_brand`) + o nome
  (`store_info.name`) + chaves antigas (`visual_settings`, `seo_settings`) como reserva.
- `src/theme/boot.ts` aplica o tema antes do primeiro desenho (último tema visto neste navegador ou o tema-base);
  `src/components/brand/BrandManager.tsx` aplica o tema do servidor e atualiza título, descrição e ícone.
- Componentes usam só classes com variáveis (`bg-primary`, `text-brand-orange-text`, `hover:bg-primary-hover`,
  `bg-[image:var(--gradient-primary)]`), nunca cores fixas. Nome da loja: `useStoreName()` ou `useBrand()`.
- Os nomes `--brand-orange*` são históricos: querem dizer "cor da marca", qualquer que seja a cor.

## Ainda no código (próximos passos para o Admin controlar tudo)

- Textos das páginas institucionais (Sobre, Contato, textos legais) e as colunas de links do rodapé (`src/i18n/pages.ts`,
  `src/i18n/layout.ts`, `src/legal/`).
- As perguntas padrão da página Perguntas frequentes estão no i18n (o Admin esconde grupos e acrescenta perguntas).
- Cores fixas de detalhe que não fazem parte da marca (verde do WhatsApp, cinzas de sombras, o vaso 3D da página inicial).
