# Direção de UI/UX aprovada pelo dono (texto original)

> Enviada pelo dono na conversa de 4 de outubro de 2026. É a referência do visual da PRINT3D; o resumo prático está em `docs/GUIA-VISUAL.md`.

PRINT3D — Direção de UI/UX para desenvolvimento do site

Crie um e-commerce completo e responsivo para uma loja de produtos impressos em 3D chamada PRINT3D.

A interface deve seguir rigorosamente esta identidade visual.

1. CONCEITO VISUAL

A PRINT3D deve transmitir:

- moderna
- jovem
- confiável
- criativa
- tecnológica
- acessível
- premium sem parecer luxuosa demais

Evitar estética futurista exagerada, cyberpunk, neon ou interface escura como padrão.

A sensação deve ser de uma combinação entre:

design de produto + tecnologia + criatividade + e-commerce moderno.

Usar bastante espaço em branco, cantos arredondados, sombras extremamente suaves e fotografias grandes dos produtos.

A impressão 3D é protagonista.

---

2. PALETA DE CORES

Background principal

"#FBF8F3"

Creme muito claro e quente. Deve substituir o branco puro na maioria das grandes superfícies.

Branco

"#FFFFFF"

Usar principalmente em cards, menus, dropdowns e elementos elevados.

Laranja principal

"#FF5A0A"

Cor principal da marca.

Usar para:

- CTA
- botões
- preços promocionais
- badges
- links ativos
- ícones selecionados
- detalhes gráficos
- hover

Laranja secundário

"#FF7A18"

Para gradientes e elementos secundários.

Gradiente permitido:

"linear-gradient(135deg, #FF7A18 0%, #FF4D00 100%)"

Preto

"#171717"

Usar em títulos, navegação e elementos de alto contraste.

Cinza escuro

"#404040"

Texto secundário importante.

Cinza

"#737373"

Descrições e metadados.

Cinza claro

"#EDE9E3"

Bordas e divisores.

Fundo alternativo

"#F5F1EA"

Para separar determinadas secções.

---

3. TIPOGRAFIA

Utilizar uma sans-serif moderna e extremamente legível.

Preferência:

Inter

Alternativas:

- Manrope
- Geist
- Plus Jakarta Sans

Títulos devem ser fortes e compactos.

Hero:
font-weight: 750–800

H1 desktop:
56–64px

H2:
34–42px

H3:
22–26px

Body:
16–18px

Texto pequeno:
13–14px

Usar "letter-spacing" ligeiramente negativo em títulos grandes.

---

4. HEADER

Desktop deve possuir duas linhas.

Linha principal

Esquerda:
LOGO PRINT3D

Centro:
barra de pesquisa grande.

Placeholder:

"O que você está procurando?"

A pesquisa deve ter:

- autocomplete
- sugestões de produtos
- categorias
- histórico recente
- thumbnail do produto

Direita:

Ajuda
Minha conta
Favoritos
Carrinho

Carrinho deve mostrar badge laranja com quantidade.

Header deve permanecer sticky durante scroll.

---

5. NAVEGAÇÃO PRINCIPAL

Criar botão laranja:

☰ Todas as categorias

Depois:

Decoração
Organização
Suportes
Geek
Casa
Personalizados

No extremo direito:

🔥 Ofertas

---

6. MEGA MENU

Ao passar o mouse ou clicar em Todas as categorias, abrir um mega menu grande.

Não utilizar dropdown estreito tradicional.

O mega menu deve ocupar aproximadamente:

"max-width: 1200px"

e ficar centralizado abaixo da navegação.

Background:
"#FFFFFF"

border:
"1px solid #EDE9E3"

border-radius:
"0 0 20px 20px"

box-shadow:
"0 18px 50px rgba(0,0,0,.10)"

Padding generoso.

Estrutura

Criar 4 colunas principais.

DECORAÇÃO

Vasos
Esculturas
Luminárias
Arte de parede
Decoração geométrica
Miniaturas decorativas

ORGANIZAÇÃO

Organizadores de mesa
Porta-canetas
Organizadores modulares
Caixas
Organização de cabos
Organizadores personalizados

SUPORTES

Suportes para celular
Tablet
Headphones
Comandos
Notebook
Smartwatch

GEEK & COLECIONÁVEIS

Dragões articulados
Animais articulados
Miniaturas
Gaming
Fantasia
Colecionáveis

Adicionar abaixo:

CASA

Cozinha
Casa de banho
Escritório
Plantas
Acessórios

PERSONALIZADOS

Criar minha peça
Enviar modelo 3D
Personalizar produto
Presentes personalizados

---

7. ÁREA VISUAL DO MEGA MENU

Reservar aproximadamente 25–30% do mega menu para um card visual.

Exemplo:

imagem grande de um dragão articulado.

Texto:

Novidades em 3D

"Descubra os últimos modelos que acabaram de sair da impressora."

Botão:

Ver novidades →

O card pode utilizar fundo:

"#FFF0E7"

e pequenos elementos laranja.

Adicionar também links rápidos:

⭐ Mais vendidos
🔥 Ofertas
✨ Novidades
🎁 Presentes

O mega menu deve possuir microanimação:

opacity 0 → 1
translateY(-5px) → 0

duration:
180–220ms

---

8. HERO

Criar hero grande e extremamente visual.

Layout aproximadamente:

45% texto
55% produto

Headline:

Impressão 3D
para o seu dia a dia

Destacar "3D" em laranja.

Eyebrow:

IDEIAS QUE GANHAM FORMA

Descrição:

"Produtos criativos, úteis e personalizados, impressos com qualidade e atenção aos detalhes."

CTA principal:

Ver produtos →

CTA secundário:

Criar peça personalizada

Imagem grande do produto do lado direito.

Não utilizar ilustrações genéricas.

Usar fotografia realista dos produtos impressos.

---

9. TRUST BAR

Logo abaixo do hero:

🚚 Envio para todo o país
🛡 Compra segura
💳 Pagamento facilitado
🌱 Material sustentável (PLA)

Visual extremamente simples.

---

10. CATEGORIAS

Cards horizontais com fotografia.

Decoração
Organização
Suportes
Geek
Casa
Personalizados

Cada card:

background "#FFFFFF"

border-radius: 18px

Imagem ocupando aproximadamente 75% do card.

Nome da categoria embaixo.

Adicionar seta →.

No hover:

transform: translateY(-4px)

box-shadow suave.

Imagem pode aumentar:

scale(1.03)

Transition:
200ms.

---

11. PRODUCT CARD

Produto deve ser protagonista.

Estrutura:

imagem
favorito ♡
nome
avaliação
número de avaliações
preço
botão adicionar ao carrinho

Exemplo:

Dragão Articulado

★★★★★ (41)

€24,90

[ícone carrinho]

Cards:

background "#FFFFFF"

border-radius: 18–20px

border:
"1px solid #EEEAE5"

Não utilizar sombras fortes.

No hover:

elevar card ligeiramente.

---

12. IMAGENS DOS PRODUTOS

Todas as fotografias devem seguir exatamente a mesma direção:

foto de produto realista de uma peça impressa em 3D em PLA.

Linhas de camada sutis visíveis.

Background:

"#FBF8F3"

Luz de estúdio suave e quente vindo da esquerda.

Sombra macia embaixo.

Sem texto.

Sem logos.

Sem marcas d'água.

Produto centralizado com margem.

Formato 1:1.

Isso é essencial para manter consistência visual no catálogo.

---

13. PERSONALIZAÇÃO

Criar uma área importante:

Transforme sua ideia em realidade.

Permitir:

1. Escolher produto
2. Escolher cor
3. Escolher tamanho
4. Adicionar texto
5. Fazer upload de STL/OBJ/3MF
6. Visualizar modelo
7. Solicitar orçamento ou comprar

Quando possível criar um visualizador WebGL/Three.js permitindo girar o modelo em 360°.

A personalização deve ser uma das características mais importantes da marca.

---

14. PÁGINA DO PRODUTO

Layout desktop:

55% galeria
45% informações

Galeria grande.

Thumbnails laterais ou inferiores.

Produto podendo ser ampliado.

Informações:

Nome
★★★★★ avaliações
Preço
Descrição curta

Depois:

COR

Mostrar swatches circulares.

TAMANHO

P / M / G ou dimensões específicas.

QUANTIDADE

[-] 1 [+]

CTA grande:

Adicionar ao carrinho

CTA secundário:

♡ Adicionar aos favoritos

Informações abaixo:

✓ Produzido em PLA
✓ Fabricado sob encomenda
✓ Produção estimada: X dias
✓ Envio para todo Portugal

---

15. MOBILE

Mobile não deve simplesmente reduzir o desktop.

Criar experiência específica.

Header:

☰ | logo | pesquisa | carrinho

Menu abre como drawer lateral.

Mega menu transforma-se em navegação accordion.

Exemplo:

Categorias

«Decoração
Organização
Suportes
Geek
Casa
Personalizados»

Hero passa para:

texto
CTA
imagem

Product grid:

2 produtos por linha.

Manter botões com altura mínima de 44px.

---

16. MICROINTERAÇÕES

A interface deve parecer viva, mas nunca exagerada.

Adicionar:

- hover suave
- skeleton loading
- feedback ao adicionar ao carrinho
- coração animado nos favoritos
- contador do carrinho
- transições entre imagens
- toast de confirmação
- loading discreto
- animações de entrada muito suaves

Duração padrão:

150–250ms.

Evitar animações longas.

---

17. ÍCONES

Utilizar:

Lucide Icons

Estilo:
outline

stroke:
1.7–2px

Evitar misturar várias famílias de ícones.

---

18. BORDER RADIUS

Criar sistema consistente:

Botões:
12–14px

Inputs:
14px

Cards:
18–20px

Banners:
24px

Mega menu:
20px

Nunca utilizar cantos excessivamente arredondados em todos os elementos.

---

19. GRID

Desktop:

max-width: 1440px

Conteúdo:

1200–1320px

Padding lateral:

32–48px

Tablet:

24px

Mobile:

16px

Grid de produtos:

Desktop: 4–5 colunas
Tablet: 3 colunas
Mobile: 2 colunas

---

20. HOME COMPLETA

Construir nesta ordem:

Header

Navegação

Mega Menu

Hero

Trust Bar

Categorias

Produtos em destaque

Banner "Crie sua peça"

Mais vendidos

Novidades

Banner PLA sustentável

Produtos Geek

Como funciona a personalização

Avaliações dos clientes

Instagram / inspirações

Newsletter

Footer

---

21. FOOTER

Background:

"#171717"

Texto branco/cinza.

Colunas:

PRINT3D

Comprar

- Novidades
- Mais vendidos
- Ofertas
- Personalizados

Ajuda

- FAQ
- Envios
- Devoluções
- Contactos

Sobre

- Nossa história
- Impressão 3D
- Materiais
- Sustentabilidade

Newsletter:

"Receba novidades direto da impressora."

Campo de email + botão laranja.

---

22. PRINCÍPIO CENTRAL

Não criar um site que pareça apenas uma loja de impressão 3D.

Criar uma marca de produtos de design cuja tecnologia de fabricação é impressão 3D.

O cliente deve primeiro desejar o produto.

Depois perceber que ele foi produzido através de impressão 3D.

A experiência deve comunicar:

"Isso é bonito."

depois:

"Isso é útil."

e finalmente:

"E ainda posso personalizar."

Priorizar sempre produto, fotografia e experiência de compra sobre elementos tecnológicos decorativos.