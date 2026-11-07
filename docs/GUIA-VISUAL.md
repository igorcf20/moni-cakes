# Guia visual da Moni Cakes

Direção do dono: `docs/brand/moni-cakes-design.md` (DESIGN.md completo), logo original em
`docs/brand/moni-cakes-logo-original.png`, landing aprovada em `docs/brand/referencia-landing.png`.
O guia da loja-modelo (PRINT3D) ficou em `docs/legado-print3d/GUIA-VISUAL.md` só como histórico.

## Identidade

- Café e confeitaria boutique. Os bolos são os protagonistas: fotografia primeiro, texto curto, movimento elegante.
- Logo: `public/brand/wordmark.webp` (fundo claro), `wordmark-light.webp` (letras creme, para o hero rosa e o rodapé),
  `logo-full.webp`, símbolo do bolo em `icon-160.webp` / `icon-96.webp`, `favicon.png`, `og-image.jpg` (1200 x 630).
- Tema-base `moniCakes` em `src/theme/presets.ts` (o `src/index.css` repete os mesmos valores como reserva; o teste
  `scripts/test-theme.mjs` confere).

| Papel | Cor | Token |
|---|---|---|
| Marca (botões, links, títulos de seção) | Rosa profundo #A75269 | `--primary` |
| Segunda cor / CTA do hero | Coral #E87975 | `--brand-orange-2` (primary2) |
| Fim do degradê | Rosa antigo #B96979 | gradientEnd |
| Fundo | Creme #FFF5E9 | `--background` |
| Fundo alternativo | #FBE9E0 | `--secondary` |
| Texto | #3B2015 | `--foreground` |
| Texto intermédio | Marrom café #66351F | `--brand-ink-soft` |
| Apoio só na página inicial | Rosa claro #F3C5CD, pêssego #F2AC87, dourado #B98242 | `--mc-*` em `moni.css` |

- Fontes: Cormorant Garamond nos títulos (no hero, peso 400, fina e editorial: classe `mc-display`; `mc-serif` para
  nomes e textos editoriais) e Inter no texto e na interface.
- Botões: pílula. Coral no hero e nos convites (`mc-btn--coral`), rosa profundo nas seções claras (`mc-btn--rose`),
  contorno (`mc-btn--ghost`). Microinteração: leve elevação e um brilho que atravessa o botão.
- Sem emojis e sem travessões em textos visíveis. Ícones Lucide (traço 1,6 a 1,8).

## Página inicial (cenas)

Código: `src/pages/Index.tsx`, `src/components/moni/*` (`MoniHeader`, `MoniHero`, `MoniSections`, `useMoniMotion`,
`moni.css`), dados e imagens em `src/lib/moniHome.ts`, textos em `src/i18n/moniHome.ts` (4 idiomas).

1. **Hero** (100vh, revisto a 5/11/2026 a pedido do dono): degradê rosa antigo, coral e pêssego com luz de estúdio
   atrás dos bolos e chão claro a partir da linha do horizonte; título monumental numa linha (cabe sempre na largura,
   letras em degradê creme para rosa-claro) **atrás** da composição: o topo do bolo principal cobre a base das letras;
   palco grande, calculado para essa sobreposição em qualquer altura de ecrã; composição em camadas (`HERO_CAKES`);
   selo redondo que gira devagar ("Feito à mão"); texto editorial à esquerda; três destaques à direita; barra
   flutuante em vidro com número, nome do bolo, "Ver detalhes" e miniaturas; "Role para descobrir" à direita. Celular: composição própria (título em duas linhas, bolo ao centro,
   miniaturas em carrossel, botão de encomenda, destaques em lista). A luz fica no bolo e o fundo escurece para o rosa
   profundo daí para baixo, para o texto creme se ler; o pêssego e o chão claro são só do computador.
2. **Rolagem**: o hero fica fixo; título sobe, bolo cresce, decoração em velocidades diferentes, luz muda, textos
   laterais somem; uma maré creme sobe e liga o hero a **Nossos Bolos** (título por máscara, cartões em sequência).
3. **O Sabor em Cada Detalhe**: fatia em primeiro plano que se aproxima; massa, recheio e cobertura aparecem um a um.
4. **Bolos para Celebrar**: painel que abre por clip-path, câmera simulada e flores em parallax; CTA Solicitar Orçamento.
5. **Encomende Seu Favorito**: fundo rosa suave com flores, bolo em destaque e botão de encomenda.

Movimento com GSAP + ScrollTrigger (sem Lenis: rolagem nativa). Só transform, opacity e clip-path. Com
"reduzir movimento" ficam só fades de opacidade; sem JavaScript tudo fica visível. Hover só com rato.

**Direção cinematográfica (7/11/2026, método scroll-craft).** Curva de sensações: expectativa (abertura), apetite
(Nossos Bolos), intimidade (pico), alegria (Celebrar), decisão (convite). Um só pico: O Sabor em Cada Detalhe, com o
maior espaço de rolagem e uma seção calma antes dele.
- Abertura: faixas de cinema café (`.mc-letterbox`) cobrem o primeiro ecrã e afastam-se do centro; uma faixa de luz
  (`.mc-hero__sheen`) atravessa o título uma vez; título sobe da máscara e o bolo assenta.
- Profundidade no hero: fundo, luz, título, bolo, decoração e pétalas em velocidades diferentes (no computador a luz
  também segue o rato, ao contrário das camadas).
- Grão de filme estático sobre a página (`.moni-home::after`, 7% de opacidade).
- Títulos das seções revelados palavra a palavra (`.mc-mask`), em onda; cartões abrem por máscara de baixo para cima.
- Pico: íris (`clip-path: circle`) que se abre sobre a fatia enquanto a câmera recua; massa, recheio e cobertura
  pousam de cima um a um (movimento assinatura: o bolo monta-se).
- Celebrar: o painel abre a partir de uma faixa estreita e arredondada. Convite final: corte de cena (a seção sobe
  com os cantos arredondados que se abrem até à largura toda).
- Celular: sem pin, tudo preso à rolagem; cada entrada começa a 88% do ecrã (acima da barra de baixo) e mexe 56 a
  110px ou abre por máscara, para se notar num arrasto rápido. Teste: `scripts/test-home-motion.cjs`.
O botão de encomenda vai para o WhatsApp configurado no Admin (Aparência > WhatsApp); sem número, para `/contatos`.

## Detalhe do bolo (`/produto/:id`)

Mesmo motor da página de produto (`src/pages/ProductDetail.tsx`: tamanhos, preço, carrinho, prazos, avaliações),
com a pele da marca: cabeçalho `MoniHeader variant="solid"` (faixa rosa), fundo creme texturizado, foto principal
em "estúdio" (degradê rosa-claro, imagem inteira com sombra; ideal para fotos com fundo transparente), categoria em
dourado acima do nome em Cormorant grande. Depois da compra: **Como encomendar** (três passos) e o convite **Quer
algo só seu?** com botão para o canal de pedidos (`src/components/moni/MoniCakeOrder.tsx`). Estilos `.moni-pdp` em
`moni.css`.

## Fotografia

- Hoje as imagens de `public/images/moni/` são **provisórias**: recortes do mockup aprovado com o fundo removido,
  em baixa resolução, marcados no site como "Imagem ilustrativa". Antes de publicar, trocar por fotografias reais dos
  bolos da Moni Cakes, cada peça com fundo transparente (WebP ou PNG), pelo menos 2x o tamanho mostrado (bolo
  principal com 1200 px de largura). Mantendo os nomes dos ficheiros, nada mais muda.
- Nunca alterar as características comerciais dos bolos nas imagens.
