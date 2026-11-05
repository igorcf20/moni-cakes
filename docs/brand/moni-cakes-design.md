# DESIGN.md: Moni Cakes | Experiência Visual de Bolos

Direção de arte enviada pelo dono em 5/11/2026, guardada como referência (texto original, só formatado).
Referências visuais nesta pasta: `moni-cakes-logo-original.png` (logo), `referencia-landing.png` (landing aprovada,
referência de identidade) e `experiencia-scroll.png` (como o dono imagina a rolagem). A referência "Sugar Rush"
citada abaixo orienta composição, profundidade, tipografia e iluminação; não se copia nome, logo, produtos nem textos.
Como foi aplicado no código: `docs/GUIA-VISUAL.md`.

## 1. Direção criativa

Criar uma experiência visual premium e imersiva para a página de bolos da Moni Cakes, inspirada na composição
editorial da referência Sugar Rush fornecida.

**Objetivo:** transformar os bolos nos protagonistas absolutos da página.

A referência deve orientar a composição, a profundidade, a hierarquia tipográfica, a iluminação e as interações,
sem copiar sua identidade visual.

Manter a identidade original da Moni Cakes: rosa, coral, pêssego, creme, dourado e marrom café.

## 2. Hero cinematográfico

Criar um hero ocupando aproximadamente 100vh no desktop.

### Fundo

- Gradiente sofisticado em rosa antigo, coral suave e pêssego.
- Iluminação difusa, com um brilho central atrás dos produtos.
- Superfície inferior integrada ao fundo, criando a sensação de um estúdio fotográfico.
- Sombras realistas de contato.
- Sem texturas pesadas ou elementos decorativos excessivos.

### Tipografia monumental

Usar um título serifado extremamente grande, inspirado na hierarquia da referência.

**Título sugerido:** BOLOS QUE ENCANTAM

- Tipografia editorial de alto contraste.
- Letras finas e elegantes.
- Cor rosa-claro ou creme.
- O título pode ocupar quase toda a largura da tela.
- Integrar visualmente a tipografia à composição fotográfica.
- Permitir sobreposição controlada entre título e produtos, preservando a leitura.

### Composição central

Substituir os macarons da referência por uma composição de bolos da Moni Cakes.

Utilizar:

- Um bolo principal grande e visualmente marcante.
- Dois ou três bolos complementares, em diferentes posições e profundidades.
- Fatias que revelem recheios e texturas.
- Pequenas flores, pétalas e ingredientes suspensos ao redor.
- Migalhas e detalhes sobre a superfície inferior.

Os bolos devem parecer fotografados profissionalmente, não ilustrações ou objetos artificiais.

A composição precisa ter profundidade real, com iluminação, perspectiva, sombras e sobreposição de camadas.

Não copiar literalmente a pilha de macarons. Criar uma composição adequada às proporções e características dos bolos.

## 3. Layout do hero

### Header

Manter a logo original da Moni Cakes no canto esquerdo.

Navegação central: Início, Bolos, Cardápio, Encomendas, Sobre Nós.

À direita: ícone de WhatsApp ou pedido; botão de encomenda.

O header deve ser minimalista e integrado ao fundo.

### Coluna esquerda

Pequeno texto editorial apresentando a confeitaria.

**Texto sugerido:** Receitas artesanais, recheios irresistíveis e sabores preparados para transformar cada momento
em uma celebração.

Link: Conheça nossos bolos.

### Centro

Composição fotográfica tridimensional dos bolos.

O produto principal deve ocupar a maior área visual e permanecer acima da linha inferior do hero.

### Coluna direita

Apresentar três destaques do catálogo. Cada destaque deve conter: miniatura circular do bolo, nome, descrição curta,
link para detalhes.

Exemplos de conteúdo visual, sujeitos ao catálogo real: Bolos Clássicos, Bolos Recheados, Bolos Personalizados.

Não criar produtos ou preços fictícios como conteúdo definitivo.

### Navegação inferior

Adicionar uma pequena barra flutuante com miniaturas de três bolos.

A seleção de uma miniatura deve atualizar o produto principal, o título e a descrição.

## 4. Interatividade e movimento

O hero deve transmitir profundidade e sofisticação.

### Transição entre bolos

Ao selecionar outro bolo:

1. O bolo atual desaparece com uma transição suave.
2. O novo bolo entra com leve deslocamento e escala.
3. Os elementos decorativos acompanham a mudança.
4. Nome e descrição são atualizados.
5. O destaque da miniatura selecionada muda.

Duração aproximada: 450 a 700 ms.

### Movimento ambiental

- Pétalas com movimento vertical muito discreto.
- Pequenas rotações lentas dos elementos decorativos.
- Parallax sutil em desktop, quando apropriado.
- Movimento suave, sem distrações.

Respeitar `prefers-reduced-motion`.

Evitar animações exageradas, movimentos bruscos ou efeitos de videogame.

## 5. Continuação da página

Após o hero, fazer uma transição orgânica para o catálogo.

### Seção 1: Nossos Bolos

Fundo creme texturizado, como na landing page original. Título: Nossos Bolos. Cards com fotografia grande, nome do
bolo, descrição, preço quando disponível e ação de encomenda.

### Seção 2: O Sabor em Cada Detalhe

Seção editorial com fotografia macro de uma fatia de bolo. Destacar visualmente as camadas, a cobertura e os
recheios. Texto curto sobre o preparo artesanal, utilizando informações reais da marca.

### Seção 3: Bolos para Celebrar

Painel visual com bolos personalizados para ocasiões especiais. Fotografia grande e texto sobreposto ou lateral.
CTA: Solicitar Orçamento.

### Seção 4: Encomende Seu Favorito

Convite final para encomenda, com fundo rosa suave e composição floral discreta. CTA direcionado ao canal real de pedidos.

## 6. Paleta

- Rosa antigo: #B96979
- Rosa profundo: #A75269
- Rosa claro: #F3C5CD
- Coral: #E87975
- Pêssego: #F2AC87
- Creme: #FFF5E9
- Marrom café: #66351F
- Dourado: #B98242

Os valores são aproximados e devem ser ajustados à logo original e às fotografias.

O hero pode utilizar tons mais intensos do que o restante da landing page, criando contraste entre uma abertura
editorial impactante e as seções claras subsequentes.

## 7. Fotografia e assets

A qualidade dos assets é fundamental. Preparar os elementos separadamente: bolo principal com fundo realmente
transparente, bolos secundários, fatias e detalhes, flores e pétalas, ingredientes decorativos, sombras e superfície
de apoio.

Não utilizar uma única imagem achatada para simular toda a interface. O fundo e as imagens devem ser camadas
independentes, permitindo responsividade, animação e interação.

Priorizar fotografias reais dos produtos da Moni Cakes. Não modificar características comerciais dos bolos.

## 8. Responsividade

- Desktop: composição editorial completa (título monumental, produto central, conteúdo lateral, miniaturas inferiores).
- Tablet: reduzir os elementos decorativos e reorganizar os destaques para evitar sobreposições.
- Mobile: composição própria (header compacto, título adaptado à largura, bolo central em destaque, texto resumido,
  miniaturas em carrossel horizontal, CTA de encomenda visível). Não reduzir simplesmente a versão desktop.

## 9. Implementação

Inspecionar a stack atual antes de escolher bibliotecas. HTML semântico, CSS responsivo e componentes reutilizáveis.
Transforms e opacity para animações eficientes. Conteúdo legível e utilizável com as animações desativadas.
Carregamento otimizado das imagens, sem deslocamentos de layout.

## 10. Instrução final

A imagem Sugar Rush é a principal referência de direção de arte; a landing page Moni Cakes aprovada é a referência
de identidade visual. Combinar as duas, sem copiar nome, logo, produtos ou textos da Sugar Rush, e sem virar um
catálogo genérico com banner convencional. Resultado de confeitaria boutique feito por um estúdio de design digital.

Prioridades: 1. impacto visual e qualidade fotográfica; 2. fidelidade à identidade Moni Cakes; 3. composição
editorial com profundidade; 4. interatividade funcional; 5. responsividade e desempenho. O hero é a peça visual mais
marcante da página.

## 12. Cinematic Motion e Scroll Experience

Experiência cinematográfica com narrativa conduzida pela rolagem, como uma campanha publicitária premium de confeitaria.

### 12.1 Hero cinematográfico (entrada)

1. Fundo rosa surge com transição suave.
2. Título monumental aparece progressivamente, com revelação por máscara.
3. Bolo principal entra com escala de 1.12 para 1 e leve deslocamento vertical.
4. Bolos secundários surgem em profundidades diferentes.
5. Pétalas e flores aparecem com movimentos independentes.
6. Textos laterais entram de maneira escalonada.
7. O seletor de bolos aparece por último.

Duração total: 1,8 a 2,6 segundos, com timeline (nada aparece tudo ao mesmo tempo).

### 12.2 Rolagem cinematográfica

- Cena 1 (Apresentação): hero fixo na viewport (scroll pinning); título desloca-se devagar, bolo cresce levemente,
  decoração em velocidades diferentes, fundo muda a luminosidade, textos laterais desaparecem.
- Cena 2 (Transição para o catálogo): bolo desloca-se, a composição abre espaço, o fundo rosa passa a creme, título
  "Nossos Bolos" com revelação elegante, cards entram em sequência. Deve parecer uma cena contínua.
- Cena 3 (Destaque dos recheios): fatia em primeiro plano que se aproxima; camadas em destaque; texto ao lado em
  momentos específicos; elementos gráficos discretos. Sem alterar a aparência real do produto.
- Cena 4 (Bolos para celebrar): fotografia grande com entrada por máscara ou clip-path, câmera simulada, texto
  progressivo, decoração com parallax.
- Cena 5 (Encomenda final): transição para fundo rosa, bolo final em destaque, título elegante, botão com
  microinteração refinada.

### 12.3 Animações entre produtos

Saída do bolo atual, entrada do novo com escala e deslocamento, decoração animada, nome, descrição e destaque
atualizados, layout estável. Timelines coordenadas.

### 12.4 Tecnologias recomendadas

GSAP + ScrollTrigger como motor principal (timelines, pinning, scrub). Lenis só se a suavização melhorar a
experiência, sem interferir em teclado, âncoras e comportamento nativo. Motion para microinterações. CSS para
gradientes, máscaras, hover e foco. Não usar várias bibliotecas para a mesma função.

### 12.5 Regras de qualidade

Transform e opacity; nada de animar propriedades de layout; imagens otimizadas; sem 3D complexo sem benefício;
Core Web Vitals preservados; efeitos simplificados em aparelhos fracos; `prefers-reduced-motion`; rolagem nativa e
acessibilidade; conteúdo acessível sem JavaScript de animação.

### 12.6 Direção final

Sequência de cenas de uma campanha de confeitaria de luxo: movimento elegante, fluido e intencional, sempre a
valorizar os bolos, revelar detalhes ou conduzir à encomenda. Não basta fade-in nas seções: a rolagem controla uma
narrativa contínua, com cenas conectadas, produtos em camadas e transições sincronizadas.
