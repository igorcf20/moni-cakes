# Gestão simples de produtos — 23/09/2026

## Edição estável de tamanhos — 25/09/2026

- Na gestão geral **Tamanhos**, escrever o nome de um item deixa de recriar o campo a cada tecla. Os identificadores temporários mantêm também os preços ligados ao item durante a reordenação e nunca são enviados ao banco.
- Criação/edição validam nome do preset, nomes dos tamanhos sem repetições (ignorando espaços nas extremidades e maiúsculas), acréscimos não negativos com duas casas decimais e ordem normalizada.
- Campos vazios/invalidos deixam de regressar silenciosamente ao preço anterior ao sair do campo; o administrador precisa corrigi-los antes de guardar. Um erro de carregamento deixa de aparecer como biblioteca vazia.
- Presets vazios já existentes continuam suportados na edição. Produtos associados não são alterados. Nenhuma migration nova.
- Testar: Administração → Tamanhos; escrever várias letras no nome de um tamanho, guardar `1,25`, tentar preço vazio e adicionar o mesmo tamanho com espaços/maiúsculas diferentes. Guardar apenas depois de corrigir os erros.
- Ficheiros: `src/components/admin/AdminSizes.tsx`, `src/lib/sizePresetValidation.ts`, `scripts/test-size-presets.mjs`, `scripts/test-admin-workflow.cjs` e este guia.
- Teste unitário: `node scripts/test-size-presets.mjs`. O teste de navegador inclui digitação contínua e foco, preços vazios/vírgula, duplicados e largura da página a 390/1440px, com backend simulado.

## Biblioteca de materiais — 25/09/2026

- Pesquisa local por nome do preset, método e nome do material. Aceita várias palavras e ignora acentos, com contagem de resultados e botão para limpar.
- Estados distintos para biblioteca vazia, pesquisa sem resultados e falha ao carregar. Erros de carregamento das áreas são apresentados e impedem aplicar um preset com dados incompletos; **Tentar novamente** atualiza as consultas.
- Durante a gravação, o editor do preset, as ações da biblioteca e o fecho do modal ficam bloqueados. Eliminar um preset continua a pedir confirmação e limpa a seleção correspondente.
- O teste `scripts/test-admin-workflow.cjs` cobre pesquisa por material/método sem acentos, filtro de cópias, ausência de resultados, preços e ausência de overflow no modal de materiais a 390px. As consultas simuladas agora respeitam filtros `in` além de `eq`.
- Ficheiros: `src/components/admin/TechniquePricingManager.tsx`, `scripts/test-admin-workflow.cjs` e este guia. Nenhuma migration nova.

## Continuação — 24/09/2026

- Materiais podem ser reordenados com as setas antes de guardar o produto ou preset.
- Renomear um material preserva o seu identificador. Copiar um preset não reutiliza identificadores de materiais de outro produto/preset.
- Campos monetários aceitam vírgula ou ponto decimal; valores vazios, negativos ou inválidos impedem a gravação. Valores fixos usam duas casas decimais e tarifas por medida aceitam até quatro.
- Para testar: editar um preset, renomear um material, escrever `4,25`, adicionar outro e subir a sua posição; guardar e reabrir. Confirmar que o produto anteriormente associado não mudou. Apagar o preço e tentar guardar deve apresentar erro, não guardar zero.
- Testes adicionais: `node scripts/test-admin-materials.mjs`; o teste de navegador cobre renomeação, preço vazio, vírgula decimal, ordem e independência do preset.
- Esta continuação não requer SQL novo. As migrations anteriores continuam necessárias. Os testes locais usam dados simulados; não comprovam RLS nem publicação no Lovable.
- Ficheiros desta continuação: `TechniquePricingManager.tsx`, novo `PriceInput.tsx`, `moneyInput.ts`, novo `materialReconciliation.ts`, `test-admin-materials.mjs`, `test-admin-workflow.cjs` e este guia.

Correção solicitada pela utilizadora: substituir as abas em grelha e a página de estampagem extensa por controlos compactos e bibliotecas de presets em modal.

## Utilização

- Desktop: uma linha de abas. Telemóvel: seletor de secção.
- Tamanhos e Cores: escolher/aplicar um preset ou abrir **Gerir presets** no topo.
- Nos modais: criar do zero, copiar um preset existente, editar nomes e acréscimos. Também é possível criar a partir do produto.
- Materiais: secção separada das áreas. **Gerir presets** abre a biblioteca; duplicar copia os valores e os materiais. A aplicação ao produto mantém o modelo de preços anterior.
- Áreas: lista simples com foto, acréscimo, ordem, editar, duplicar e eliminar. Cada produto possui a sua própria lista.
- As medidas máximas e descrição ficam recolhidas no editor da área. Comentários/ficheiros do cliente e identificação no pedido não foram alterados.
- Presets de áreas podem ser criados do zero, do produto ou de outro preset. Reaplicar acrescenta só os nomes ausentes; não sobrescreve áreas já configuradas.
- Preços por método anteriormente configurados continuam a ter prioridade sobre o preço geral. Estão na secção Materiais; não foram apagados ao simplificar a interface. A conversão de uma área antiga por cm² para preço fixo exige seleção explícita no editor.
- A cópia simples de uma área/preset de áreas reutiliza foto, descrição, medidas e acréscimo fixo; materiais e métodos continuam separados. A duplicação completa do produto mantém também esses métodos e materiais.

## SQL manual

Executar `supabase/migrations/20260923160000_customization_area_presets.sql` no SQL Editor.

Cria apenas a biblioteca administrativa de áreas, com RLS exclusiva para administradores. Pode ser executada novamente sem erro de política duplicada. Não apaga áreas, técnicas nem preços existentes.

As migrations anteriores de tamanhos, cores e materiais continuam necessárias para essas funcionalidades. Esta migration não substitui as anteriores nem a migration de uploads de outra tarefa.

## Ficheiros desta alteração

- src/pages/AdminProductEdit.tsx
- src/components/admin/ColorPaletteManager.tsx
- src/components/admin/TechniquePricingManager.tsx
- src/components/admin/SimpleProductAreas.tsx
- scripts/test-admin-workflow.cjs
- supabase/migrations/20260923160000_customization_area_presets.sql
- docs/ADMIN_PRESETS_SIMPLIFICADOS.md

O componente de áreas antigo foi preservado, mas a edição do produto passa a usar a interface simples. Não foram alterados os ficheiros de checkout/uploads da tarefa paralela.

## Verificação

`node node_modules/typescript/bin/tsc -p tsconfig.app.json --noEmit`
`node node_modules/vite/bin/vite.js build`

Com Vite local na porta 5178, executar `scripts/test-admin-workflow.cjs` com Playwright. O backend é simulado: não grava dados reais. Cobertura: 390/1440px, navegação compacta, modais, criação/duplicação de presets com preços, áreas sem controlos de cores/3D, validação monetária, reaplicação sem duplicar e duplicação completa do produto.

No Supabase real, após SQL: confirmar acesso como administrador, ausência de acesso à biblioteca para cliente comum, criar/editar/aplicar presets, abrir produto público e confirmar valores e áreas. A publicação no Lovable e RLS real não são verificadas pelo teste local.

