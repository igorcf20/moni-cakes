# Preços por método de personalização

## Modelo

O preço de uma área é calculado pela técnica escolhida pelo cliente. A ordem é:

1. regra específica de `product_print_area_techniques` para a área e técnica;
2. fallback para o preço antigo de `product_print_areas`, enquanto não existir regra específica;
3. preço do material ou acabamento escolhido, fixo ou por metro linear;
4. soma ao preço do produto, variação e tamanho já calculados.

Os presets são modelos reutilizáveis. Aplicar um preset copia a regra e os materiais para o produto. Não existe vínculo de atualização: alterar ou apagar o preset não modifica produtos já configurados.

## Tabelas

- `customization_technique_presets`: nome, técnica e regra de preço padrão.
- `customization_technique_preset_materials`: materiais e respetivas regras de cobrança padrão.
- `product_print_area_techniques`: cópia editável da regra para cada área do produto.
- `product_print_area_technique_materials`: materiais e acréscimos efetivamente disponíveis nessa área.

As técnicas aceitam valor fixo ou valor por cm² com mínimo. Cada material aceita valor fixo ou valor por metro linear. No modo linear, o administrador escolhe como medir o consumo: largura da arte, altura da arte ou maior lado.

Fórmula do material por metro:

`preço do material = centímetros usados / 100 × preço por metro`

Valores negativos, vazios inválidos e preços por metro iguais a zero são rejeitados.

## Aplicação manual

Executar no SQL Editor do Supabase:

`supabase/migrations/20260920183000_customization_technique_pricing.sql`

Em seguida, executar:

`supabase/migrations/20260920193000_material_pricing_by_length.sql`

A segunda migration também deve ser executada se a primeira já tiver sido aplicada anteriormente. Ela preserva todos os materiais existentes como cobrança fixa.

A migration é idempotente na criação de estruturas e preserva as áreas existentes. Para cada técnica já permitida numa área, cria uma regra inicial com os valores antigos da área.

## Fluxo administrativo

Na edição do produto, abrir a secção de personalização:

1. criar um preset DTF, serigrafia ou bordado;
2. adicionar materiais ou acabamentos e escolher valor fixo ou valor por metro;
3. escolher uma área e aplicar o preset;
4. opcionalmente editar a cópia exclusiva do produto.

Duplicar uma área ou copiar a configuração de outro produto também copia as regras de técnica e os materiais, sem criar dependência com a origem.

## Persistência na encomenda

O item do carrinho guarda, por área, a técnica, material, modo de cobrança, centímetros usados, preço por metro, valor calculado do material e preço final da área. O preço unitário confirmado é preservado pelo carrinho e checkout; não é recalculado com o preço público depois da confirmação.
