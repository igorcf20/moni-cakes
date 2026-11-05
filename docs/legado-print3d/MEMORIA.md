# Memória do projeto PRINT3D

Resumo das conversas com o dono da loja: decisões tomadas, preferências, restrições e o caminho feito até aqui.
Serve para qualquer conversa nova continuar sem perder contexto. Regras técnicas e arquitetura: `CLAUDE.md`.
Histórico de commits: `docs/CHANGELOG.md`. O que a loja faz: `docs/FUNCIONALIDADES.md`. Visual: `docs/GUIA-VISUAL.md`.

**Ao terminar uma tarefa, atualize este ficheiro** (secção Decisões ou Linha do tempo) se houve decisão nova do dono.

## Quem é o dono e como prefere trabalhar

- Fala português (mistura pt-BR e pt-PT; o site é pt-BR por padrão). Responder **em pt-BR**, curto e direto.
- Usa muito o **celular**: perguntas **curtas, uma de cada vez**, de preferência com opções para tocar.
  Explicações técnicas longas confundem ("não entendi"): explicar em linguagem simples, com o resultado prático.
- Quer o **melhor resultado visual e técnico** ("visual épico", "profissional", "completo") e pede para usar as
  skills disponíveis (design, frontend, revisão). Gosta de ver capturas de tela do resultado.
- Quer que se **avance sem pedir confirmação** em decisões técnicas óbvias; perguntar só o que é dele decidir
  (domínio, contas, dinheiro, textos legais, coisas fora do repositório).
- Projetos irmãos dele: **Brindes M&L** (`igorcf20/brindeml-dba87a7e`, loja de Portugal, origem deste código) e
  **Kode-mi** (`kodemi.pt`, domínio que o dono usa noutros projetos no mesmo VPS; o rodapé da PRINT3D tem o crédito
  "Desenvolvido por KodeMI").

## Restrições que o dono deu (valem sempre)

- **Brindes M&L é só leitura**: nunca fazer push nem alterar esse repositório. Nunca usar o Supabase da Brindes nem
  copiar o `.env` dela. Trabalhar **só** em `igorcf20/loja3d`.
- **Não levar nada para o site da Kode-mi.** O site da empresa em `kodemi.pt` (e `www`) nunca pode ser retirado nem alterado;
  lojas de demonstração só em subdomínios (esta: `loja3d.kodemi.pt`), com registo DNS novo e ficheiro próprio no nginx.
- **Nunca mostrar chaves, senhas ou tokens** no chat nem em commits. Credenciais (pagamentos, e-mail...) são
  inseridas pelo dono no painel Admin ou no `~/loja3d/env` do VPS, nunca pelo assistente.
- **VPS partilhado** `integranext-vps` (204.12.203.83, utilizador `administrator`): só `/home/administrator/loja3d`,
  só a porta local 8190, sem tocar noutros serviços. No nginx do servidor só o ficheiro do subdomínio da loja
  (autorizado para `loja3d.kodemi.pt`).
- Se uma regra de segurança do ambiente bloquear algo, **parar e explicar**, sem contornar.
- **Nada de prova social inventada**: sem vendas falsas, contadores, avaliações ou números de exemplo no site.

## Decisões tomadas (por ordem)

1. **Loja multi-país** desde o início: Brasil é o padrão, mas moeda, idioma, impostos, documento fiscal, frete,
   pagamentos e faturação vêm da configuração do país (tabela `countries`). Portugal fica como segundo país;
   Espanha e EUA também configurados. Idiomas do site: pt-BR, pt-PT, en, es.
2. **Visual**: depois de duas tentativas rejeitadas (uma "péssima", outra inspirada numa imagem "3D STORE" em
   dourado), o dono enviou a **direção de UI/UX PRINT3D** (texto original em `docs/brand/direcao-ui-ux.md`):
   creme `#FBF8F3`, laranja `#FF5A0A`, preto `#171717`, Inter, muito espaço, produto e fotografia primeiro.
   Princípio: "Isso é bonito" > "Isso é útil" > "E ainda posso personalizar".
3. **Logo oficial**: cubo laranja e preto formando um P + "PRINT3D" (PRINT preto, 3D laranja) + "LOJA ONLINE".
   Original em `docs/brand/print3d-logo-original.png`; versões recortadas em `public/brand/` (ver guia visual).
4. **Pagamentos ficam para depois** ("não se preocupe com forma de pagamento agora"). Sugestão feita, não
   confirmada: Mercado Pago (Pix e cartão) no Brasil. Viva Wallet é herança de Portugal.
5. **Banco de dados próprio, sem Supabase nem Lovable** ("vamos usar SQL próprio"): escolhido "tudo no seu VPS".
   PostgreSQL + componentes livres (GoTrue, PostgREST, storage-api, edge-runtime) em Docker, sem conta em
   serviços externos. Migrations aplicadas automaticamente pelo deploy, com cópia antes.
6. **Domínio**: o dono não tem domínio próprio para a loja; usar o dos outros projetos dele:
   **`loja3d.kodemi.pt`** (registo DNS A `loja3d` -> 204.12.203.83, a criar pelo dono). O site da Kode-mi não muda.
7. **Imagens**: o dono gera fotos no ChatGPT (assinatura, sem API). As fotos entram como ficheiros em
   `public/images/<chave>.webp` com as chaves de `src/lib/media.ts`; sem foto, o site mostra a arte de camadas.
8. **Cópias de segurança diárias** da base e dos ficheiros enviados (03:30 de Brasília), com restauro testado.
   Ficam só no VPS até o dono definir um destino externo (`LOJA3D_BACKUP_REMOTE`).
9. Texto legal por país (LGPD/CDC no Brasil, RGPD em Portugal e Espanha). No Brasil as peças personalizadas **não**
   afastam o direito de arrependimento de 7 dias (art. 49 do CDC). Pontos a confirmar com advogado ficaram
   anotados (morada/razão social, encarregado LGPD, prazos).

10. **Modelo de loja** (5 de outubro): este código vai servir de modelo para outras lojas. O visual PRINT3D é só
   desta loja; outras lojas terão o seu guia visual e logo, trocados no Admin (Marca e visual). O Admin deve
   controlar tudo da loja, de forma fácil e bem explicada, e o código deve ter instruções por seção. O dono pediu
   para **reaproveitar e melhorar o painel Admin existente, não criar um novo**. Guia: `docs/NOVA-LOJA.md`.
11. **Admin sem modais** (5 de outubro): clientes, pedidos e produtos têm página própria de detalhes, e criar e
   editar também são páginas, nada de janela por cima. Confirmações ficam na própria página (faixa), não em diálogo.

11. **Loja base para qualquer ramo** (5 de outubro): o modelo tem de servir de vinhos a roupas, comida e produtos
   personalizados, não só impressão 3D. Frete pronto para o mundo todo, com Correios, CTT, transportadoras privadas,
   FedEx, DHL e as de Portugal, Brasil e Espanha (países base de venda). Contas e chaves das transportadoras são de
   cada loja e entram no Admin; sem conta, vale a tabela de preços que o dono configura por zona e peso.

12. **Pagamentos** (5 de outubro, "agora melhore as formas de pagamento"): meios por país para qualquer ramo, com
   Mercado Pago, Stripe, PayPal e Viva como provedores online e meios manuais (Pix, transferência, Multibanco,
   MB WAY, Bizum). As contas e chaves são de cada loja e o dono as põe no Admin. Isto substitui a decisão 4.
13. **Telas do Admin em páginas próprias, nada de janelas (modais)** (5 de outubro): clientes, pedidos, criação,
   edição e detalhes têm página própria com endereço; vale para as seções novas (Frete, Pagamentos).
14. **Restos da Bom DTF** (5 de outubro): o código parado do DTF fica no repositório, desligado ("poderá ser usado,
   mas fica desativado por enquanto"); saem só os textos visíveis. O nome da loja em títulos, e-mails e tudo o resto
   é sempre o nome configurado no Admin, nunca escrito no código.

15. **Admin abre em Estatísticas** (6 de outubro): a página principal do painel são as estatísticas; Primeiros passos
   é secundário, um cartão pequeno no canto inferior direito que só ajuda o dono novo a deixar a loja com a cara dele.

16. **Ideias do nopCommerce** (6 de outubro): a licença (AGPL v3 + aviso "powered by" obrigatório) não deixa copiar
   código, textos nem imagens; só ideias. O dono pediu os itens 1 a 5 da lista (`/mnt/project-files/estudos/nopcommerce-ideias.md`):
   menor preço de 30 dias, segurança do produto (GPSR), devoluções pela conta, notas no pedido e páginas Sobre,
   Contato e legais editáveis no Admin.

17. **Plano completo do nopCommerce, tudo configurável** (6 de outubro): o dono pediu todos os itens do plano
   (`/mnt/project-files/estudos/nopcommerce-plano.md`), em ordem, porque a loja é um modelo e deve estar preparada
   para tudo, com cada recurso ligável ou desligável e o Admin organizado por categorias e bem explicado. Só o
   **app móvel** fica de fora: depende do desejo e do orçamento de cada cliente. Fórum e PunchOut entram (desligados
   por padrão). Base: Admin > Recursos da loja (`src/lib/features.ts`).

18. **Cada lugar de oferta é configurável** (8 de outubro): além de ligar e desligar um recurso, o dono quer escolher
   onde ele aparece (ex.: kits na página do produto, no carrinho, no checkout) e quão chamativo é (ex.: comparar
   produtos com modo discreto, um botão simples ao lado do coração ou abaixo do preço). Vale para recursos novos que
   ofereçam algo ao cliente em várias telas. Confirmado em 8 de outubro (07:21 UTC): todo "adicional" da loja
   (recurso, bloco, botão, destaque) tem sempre configuração própria no Admin, para personalização completa da loja.

19. **Redesenho editorial** (26 de outubro): o dono enviou um kit (`PRINT3D_Claude_Implementation_Kit.zip`: DESIGN,
   STOREFRONT, ADMIN, IMPLEMENTATION, ACCEPTANCE e dois mockups) e pediu para começar. Direção: editorial, terracota,
   títulos em serifa, fotografia em primeiro lugar, sem cara de marketplace; nada de dados ou métricas inventados;
   Admin com barra lateral grafite. Fases: fundações e vitrine primeiro, depois catálogo e produto, carrinho, Admin.

## Linha do tempo resumida

- **4 de outubro de 2026**: cópia sem histórico da Brindes M&L (primeiro commit); FASE 1 (estrutura, kit de publicação no VPS,
  orçamento 3D a partir de STL, i18n mínimo). FASE 2 começou: países, dinheiro por país, impostos por país,
  documento fiscal (CPF, CNPJ alfanumérico, NIF), `create-order` no servidor com as regras do país.
  Personalizador (chaveiro e placa de nome gerados em código). Visual PRINT3D completo: cabeçalho com mega menu,
  página inicial, rodapé, página do produto, listagens, orçamento com STL/OBJ/3MF.
- **4 de outubro (fim do dia)**: logo oficial aplicada; formatos de endereço por país.
- **5 de outubro**: script do subdomínio `loja3d.kodemi.pt`; páginas do carrinho, checkout, conta, institucionais e legais refeitas (4 idiomas, por país);
  backend próprio no VPS testado de ponta a ponta com Docker (conta, login, admin, produto, upload, pedido,
  reinício sem perder dados) e revisto em segurança (XSS por ficheiros enviados corrigido, senha fora dos logs);
  cópias diárias; passo a passo para pôr online (`deploy/PASSO-A-PASSO.md`); documentação permanente (`docs/`).
- **5 de outubro (tarde)**: loja modelo (marca, categorias, página inicial, banners, FAQ no Admin), cookies LGPD/RGPD
  com registo e Admin de privacidade, área do cliente com Faturas; tudo entrou no `main` (PR #1) para ir para o VPS.
- **5 de outubro (fim da tarde)**: **loja online em https://loja3d.kodemi.pt** (HTTPS Let's Encrypt até 3/1/2027, renova
  sozinho). O dono rodou os comandos no VPS (o Claude do PC dele estava em modo automático e foi bloqueado). Primeira
  publicação parou no teste de saúde do storage (`localhost` virava IPv6); corrigido com 127.0.0.1. Primeiro admin criado.

## Estado no fim da última conversa

- Tudo no `main` e **online em https://loja3d.kodemi.pt**, publicado sozinho a cada push (timer `loja3d-sync`).
  Cópias diárias ligadas. Falta o dono preencher a loja no Admin (Primeiros passos).
- Não funcionam ainda: e-mails automáticos (precisa de SMTP e de uma função própria) e pagamento online.
- O dono quer continuar no **PC** com as skills locais dele: `git clone`, `npm ci`, `claude --teleport` ou uma
  conversa nova lendo este ficheiro e o `CLAUDE.md`.

## Coisas que já deram problema (não repetir)

- Configurações padrão herdadas reaplicavam a identidade azul da Brindes: padrões visuais ficam vazios.
- Números de WhatsApp de exemplo apareciam no site: só aparece com número real no Admin.
- `framer-motion` com `y` sobrescreve `translate` do Tailwind (centrar com um contentor flex por fora).
- `PageTransition` usa transform: elementos `position: fixed` dentro dele ficam presos (usar portal).
- No ambiente da Claude na nuvem os contentores Docker não podem ter internet (regra de segurança): não tentar
  relays nem passar o proxy para dentro de contentores.
- Antes de dizer que algo está feito: `tsc`, `eslint`, testes de `scripts/` e conferir no navegador
  (desktop e celular, sem rolagem horizontal).
