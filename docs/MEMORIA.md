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

## Em aberto (perguntar ao dono quando for a hora)

- Fotografias reais dos bolos (com fundo transparente) para substituir as imagens provisórias.
- Canal de encomendas: número de WhatsApp (Admin) e Instagram.
- Textos reais sobre o preparo (seção O Sabor em Cada Detalhe) e a página Sobre.
- Domínio e servidor da loja (o `deploy/` ainda tem os nomes da loja3d).
- Categorias do cardápio (o menu padrão do código ainda é o da loja 3D até haver categorias no Admin).

## Linha do tempo

- 5/11/2026: base copiada da loja3d, marca Moni Cakes aplicada e página inicial cinematográfica (PR inicial).
