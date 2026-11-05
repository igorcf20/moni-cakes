---
name: print3d-marca
description: Use sempre que for criar ou alterar qualquer página, componente, cor, texto visível ou imagem da loja PRINT3D (repositório loja3d), inclusive ajustes pequenos de layout, estilo, logo, fotos ou textos. Garante o visual da marca (creme, laranja, Inter, ícones Lucide), os textos em i18n nos 4 idiomas e a conferência no navegador.
---

# Marca PRINT3D

Esta skill só aponta o caminho. As regras completas estão em `docs/GUIA-VISUAL.md`; não copie o conteúdo do guia para cá.

## Antes de mexer

1. Leia `docs/GUIA-VISUAL.md` (cores, tipografia, componentes, logo, fotos, texto e checklist) e o `CLAUDE.md` da raiz
   (regras do projeto, multi-país e como subir o site). A direção original do dono está em `docs/brand/direcao-ui-ux.md`.
2. Veja uma página parecida que já está no visual novo e siga o mesmo padrão (`src/pages/Index.tsx`,
   `src/pages/ProductDetail.tsx`, `src/components/catalog/*`, `src/components/institutional/*`).

## Enquanto faz

- Use os tokens de `src/index.css` e `tailwind.config.ts` e as peças que já existem: classes de
  `src/components/catalog/ui.ts` e `src/components/institutional/styles.ts`; componentes `Logo`, `MediaImage` e
  `LayerArt`, `ProductCard3D`, `PageShell`, `PageIntro`, `StatusCard`, `CatalogBreadcrumb`.
- Nada de cor hex nova, fonte nova, outra família de ícones (só Lucide) ou classes e aliases herdados (gold, navy, royal).
- Texto laranja pequeno sempre com `text-brand-orange-text`; alvos de toque de 44px; animações de 150 a 250ms com
  `MotionConfig reducedMotion="user"`.
- Todo texto visível no i18n (`src/i18n/<área>.ts`) nos 4 idiomas: pt-BR (padrão, tratamento por "você"), pt-PT, en e es.
  Sem emojis e sem travessões. Preços pelo formatador do país, nunca com moeda fixa.
- Fotos no padrão do guia (1:1, fundo creme, luz quente da esquerda); sem foto, `LayerArt`. Nada de dados inventados.

## Antes de dizer que terminou

1. `npx tsc -p tsconfig.app.json --noEmit` e `npx eslint <arquivos alterados>`.
2. Abra o site no navegador (ver "Desenvolvimento" no `CLAUDE.md`) e confira em desktop (1280px e 1024px) e
   celular (390px): sem rolagem horizontal, foco visível, estados de carregamento, vazio e erro.
3. Percorra o checklist da seção 15 do `docs/GUIA-VISUAL.md`.
4. Se mudou o visual, atualize `docs/GUIA-VISUAL.md`; registre a mudança no topo de `docs/CHANGELOG.md`.
