# Histórico de mudanças

A loja Moni Cakes (repositório `igorcf20/moni-cakes`) nasceu como cópia sem histórico da loja PRINT3D
(`igorcf20/loja3d`, estado de 5/11/2026). O histórico da loja-modelo está em `docs/legado-print3d/CHANGELOG.md`.
Mais recente primeiro.

- 2026-11-05: VPS novo: 62.129.141.82 (guia de publicação, DNS e documentação).
- 2026-11-05: Publicação adaptada para `monicakes.kodemi.pt` ao lado da loja3d no mesmo VPS (pasta `~/monicakes`, projeto `monicakes`, porta 8191, timers `monicakes-sync`/`monicakes-backup`, chave de deploy própria, guia `deploy/PASSO-A-PASSO.md`); `robots.txt` aponta para o novo domínio.
- 2026-11-05: Hero revisto (título monumental atrás dos bolos, palco maior com chão de estúdio, barra flutuante com nome, Ver detalhes e miniaturas, selo girando; correção da maré creme na rolagem). Página de detalhe do bolo com o visual da marca (cabeçalho rosa, foto em estúdio, Como encomendar, convite para bolo personalizado). Rodapé sem textos da loja 3D.
- 2026-11-05: Cabeçalho da página inicial: o botão do menu do celular não aparece mais no computador.
- 2026-11-05: Moni Cakes a partir da loja3d: código copiado sem os protótipos de outros clientes nem os produtos de exemplo de impressão 3D (migrations de catálogo esvaziadas), marca Moni Cakes (logo, tema `moniCakes`, ícones, imagem de partilha, `store.ts`), página inicial cinematográfica com GSAP + ScrollTrigger (hero em camadas com seletor de bolos, cenas de rolagem Nossos Bolos, O Sabor em Cada Detalhe, Bolos para Celebrar e Encomende Seu Favorito, 4 idiomas) e imagens provisórias recortadas do mockup aprovado. Correção: a animação de entrada das páginas deixava um transform que prendia elementos fixos.
