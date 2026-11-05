# Presets, variações e preços em lote

## Migration manual

Execute no SQL Editor do Supabase o conteúdo integral de:

`supabase/migrations/20260920073000_admin_variation_presets_complete.sql`

Esta migration é idempotente e substitui, para esta funcionalidade, a necessidade de executar primeiro a migration antiga de presets de variações. Ela:

- cria ou completa `variation_presets`;
- cria ou completa `variation_preset_items`;
- cria ou completa `variation_preset_sizes`;
- adiciona `size_presets.items`;
- garante os acréscimos de `product_variations`, `product_sizes` e das combinações cor + tamanho, mesmo sem executar as migrations antigas;
- converte presets de tamanhos antigos para itens com acréscimo padrão `0`;
- adiciona ordem aos presets;
- mantém os campos antigos para compatibilidade;
- recria as políticas RLS administrativas necessárias.

## Funcionalidades administrativas

Na edição de produto, na aba **Variantes**:

- aplicar preset copiando nome, HEX, imagem e acréscimo padrão;
- criar um preset copiando as cores do produto atual;
- complementar um preset com as cores ausentes do produto atual;
- editar e ordenar presets;
- editar e ordenar as cores dentro do preset;
- carregar uma imagem para cada cor;
- definir o mesmo acréscimo para todas as cores do preset;
- definir em lote o acréscimo base de todas as cores do produto;
- definir em lote o acréscimo de todas as combinações cor + tamanho;
- manter stock e disponibilidade quando somente o preço é alterado.

Na área administrativa **Tamanhos**:

- editar o nome e os itens de cada preset;
- definir o acréscimo padrão de cada tamanho;
- ordenar itens e os próprios presets.

Na aba **Tamanhos** de um produto:

- guardar os tamanhos atuais, incluindo acréscimos, como preset;
- aplicar apenas tamanhos ausentes;
- copiar o acréscimo padrão para o tamanho novo;
- editar o acréscimo do tamanho no produto sem alterar o preset original.

## Compatibilidade

- Presets antigos continuam disponíveis com acréscimo `0`.
- Aplicar novamente um preset não sobrescreve tamanhos ou cores existentes.
- A importação copia os dados; não existe vínculo permanente entre produto e preset.
- Valores monetários vazios, negativos, `NaN` ou com mais de duas casas decimais são rejeitados.

## Verificação sugerida

1. Criar um preset com três cores, imagens e acréscimos diferentes.
2. Alterar a ordem das cores e dos presets.
3. Aplicar o preset a um produto e confirmar os valores copiados.
4. Alterar uma cor no produto e confirmar que o preset não mudou.
5. Criar outro preset a partir do produto.
6. Reaplicar o preset e confirmar que nenhuma cor foi duplicada.
7. Criar um preset de tamanhos com acréscimos diferentes.
8. Aplicar o preset duas vezes e confirmar que somente os tamanhos ausentes foram inseridos.
9. Testar as duas operações de preço em lote e confirmar os diálogos de substituição.
