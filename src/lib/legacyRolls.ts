/**
 * O antigo fluxo de venda e montagem de rolos DTF foi retirado da loja.
 *
 * A função centraliza a decisão enquanto os campos históricos permanecem no
 * banco para compatibilidade com encomendas antigas. Materiais usados numa
 * área ainda podem ter preço por metro; isso não reativa a gestão de rolos.
 */
export const isLegacyRollProduct = (
  _unitType?: string | null,
  _pricePerMeter?: number | string | null,
): boolean => false;
