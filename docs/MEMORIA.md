# Memória do projeto Moni Cakes

Resumo das decisões do dono e do caminho feito. Regras técnicas e arquitetura: `CLAUDE.md`. Histórico: `docs/CHANGELOG.md`.
O que a loja faz: `docs/FUNCIONALIDADES.md`. Visual: `docs/GUIA-VISUAL.md`. A memória da loja-modelo (PRINT3D),
com as preferências gerais do dono, ficou em `docs/legado-print3d/MEMORIA.md`.

## Decisões do dono

- 5/11/2026: a loja da Moni Cakes (café e confeitaria) é feita a partir do código da loja PRINT3D (`igorcf20/loja3d`),
  copiado sem histórico para `igorcf20/moni-cakes`. Os recursos da loja (catálogo, carrinho, checkout, Admin,
  multi-país, pagamentos, frete) vêm todos de lá.
- Visual: logo original e landing aprovada (`docs/brand/`), direção de arte e experiência de rolagem no DESIGN.md
  (`docs/brand/moni-cakes-design.md`). Motor de animação escolhido: GSAP + ScrollTrigger (Lenis só se valer a pena).
- Nada de produtos ou preços inventados como conteúdo definitivo: o hero usa exemplos visuais marcados como
  "Imagem ilustrativa" e Nossos Bolos mostra o catálogo real do Admin (sem produtos, cartões "Em breve" sem preço).
- 5/11/2026: a loja real fica em `monicakes.kodemi.pt`, no mesmo VPS da loja3d, **ao lado** dela (pasta
  `~/monicakes`, projeto Compose `monicakes`, porta 8191, timers `monicakes-*`). Nunca mexer na loja3d nem em `kodemi.pt`. O VPS passou a ser 62.129.141.82 (aviso do dono, 5/11/2026).

## Em aberto (perguntar ao dono quando for a hora)

- Fotografias reais dos bolos (com fundo transparente) para substituir as imagens provisórias.
- Canal de encomendas: número de WhatsApp (Admin) e Instagram.
- Textos reais sobre o preparo (seção O Sabor em Cada Detalhe) e a página Sobre.
- Primeiro administrador (e-mail da conta do dono) e dados da loja no Admin.
- Categorias do cardápio (o menu padrão do código ainda é o da loja 3D até haver categorias no Admin).

## Linha do tempo

- 5/11/2026: base copiada da loja3d, marca Moni Cakes aplicada e página inicial cinematográfica (PR inicial).
- 5/11/2026: hero revisto a pedido do dono, página de detalhe do bolo e `deploy/` adaptado para monicakes.kodemi.pt.
- 5/11/2026: loja publicada em https://monicakes.kodemi.pt (VPS 62.129.141.82, ao lado da loja3d), a pedido do dono.
