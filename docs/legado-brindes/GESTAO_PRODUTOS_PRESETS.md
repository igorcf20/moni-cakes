# Gestão de produtos, variações e estampagem

Entrega de 23/09/2026, pedido de Monise. Cliente não identificado.

## Utilização

- Catálogo: selecione uma categoria, pesquise nome/referência e filtre ativos ou rascunhos. Editar e Duplicar ficam visíveis em cada cartão.
- Criação: preencha Produto e categoria e Fotografias, depois guarde. As associações dependentes do produto ficam disponíveis após a criação.
- Edição: navegação em grelha, com ligações diretas por `?tab=sizes`, `variations` e `customization`.
- Tamanhos: Gerir permite guardar os tamanhos atuais com acréscimos e editar nome, valores e ordem interna dos presets.
- Cores: Gerir presets → Criar a partir deste produto copia nome, HEX, imagem, acréscimo e ordem. Aplicar acrescenta apenas cores ausentes.
- Estampagem: defina o preço da área ou preços próprios por técnica. Na secção Métodos, materiais e valores, edite uma configuração e escolha Criar preset desta área. Reveja e guarde na biblioteca.
- Materiais: cada item conserva valor fixo ou preço por metro e dimensão usada. As cópias para produtos e presets são independentes.
- Duplicação: o produto nasce inativo e copia também as técnicas e materiais de cada área.

## SQL manual

Preservadas as migrations anteriores. Executar a nova migration
`supabase/migrations/20260923120000_all_technique_presets.sql`
depois de `20260920183000_customization_technique_pricing.sql`.
Amplia a restrição de técnicas dos presets para todos os métodos já oferecidos nas áreas.
Para materiais por metro continua necessária `20260920193000_material_pricing_by_length.sql`.

O envio ao GitHub não aplica SQL no Lovable/Supabase.

## Correções

- Atalhos da listagem passam a selecionar o separador correto.
- Produtos novos não usam o ID ainda não persistido para criar associações.
- Consultas reduzidas de áreas/tamanhos já não partilham cache com consultas completas.
- Carregamento de preços não entra num ciclo de atualização com arrays vazios.
- Trocar técnicas não apaga os valores em edição; o preço geral mantém-se até ativar um preço próprio.
- Duplicação preserva preços por técnica e materiais.
- Gravação de materiais verifica erros, escreve antes de remover registos obsoletos e permite repetir gravação de um novo preset sem duplicá-lo.
- A explicação dos acréscimos corresponde à soma usada pelo seletor público.
- Presets de tamanhos passam a persistir os itens, valores e ordem na edição.

## Verificação

`node node_modules/typescript/bin/tsc -p tsconfig.app.json --noEmit`
`node node_modules/vite/bin/vite.js build`
`node scripts/test-cart-selection.mjs`
`node scripts/test-artwork-sizing.mjs`

Teste de browser: iniciar Vite local em 127.0.0.1:5178 e executar
`node scripts/test-admin-workflow.cjs` com Playwright disponível.
Pode indicar `PLAYWRIGHT_MODULE` e `BROWSER_CHANNEL=msedge`.
O teste intercepta o backend e autenticação apenas no browser de teste, sem gravar na loja.
Verifica 390/1440 px, categorias, atalhos, preços de presets de tamanhos/cores,
cópia de materiais para presets e duplicação completa.

Validar após SQL no ambiente real: criar preset por cada método, reaplicar cores sem
sobrescrever as existentes, selecionar variações no produto e confirmar preço no carrinho.
Autenticação/RLS e persistência no Supabase real exigem esta validação após a aplicação manual.

Limitação local anterior: plugin lovable-tagger tem dependência esbuild incompleta no node_modules.
O servidor de verificação usa --mode production, que não carrega esse plugin.

