// =============================================================================================
// Regras de exibição guardadas em store_settings (leitura pública, escrita só Admin):
//   kits     onde oferecer os kits (página do produto, carrinho, carrinho lateral, checkout, rodapé)  src/lib/kits.ts
//   compare  como mostrar o botão Comparar (cartão, página do produto, barra)                        src/lib/compare.ts
//   mega_menu  categorias em destaque com banner no menu Todas as categorias                        src/lib/megaMenu.ts
//   price_display  preço à vista, parcelamento e preço em destaque por lugar                         src/lib/priceDisplay.ts
//   shipping_estimate  calculadora de frete na página do produto (caixa, link discreto)             src/lib/shippingEstimate.ts
//   product_questions  perguntas e respostas no produto (perguntar, estilo, por página)          src/lib/productQuestions.ts
//   product_codes  que códigos do produto (SKU, interno, da marca, GTIN) aparecem e onde             src/lib/productCodes.ts
//   product_page  blocos e formato da página do produto (compra, garantias, detalhes, barras)        src/lib/productPage.ts
// =============================================================================================
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { normalizeCompareSettings, type CompareSettings } from "@/lib/compare";
import { normalizeKitSettings, type KitSettings } from "@/lib/kits";
import { normalizeMegaMenu, type MegaMenuSettings } from "@/lib/megaMenu";
import { normalizePriceDisplay, type PriceDisplaySettings } from "@/lib/priceDisplay";
import { normalizeProductCodes, type ProductCodesSettings } from "@/lib/productCodes";
import { normalizeShippingEstimate, type ShippingEstimateSettings } from "@/lib/shippingEstimate";
import { normalizeProductQuestions, type ProductQuestionsSettings } from "@/lib/productQuestions";
import { normalizeProductPage, type ProductPageSettings } from "@/lib/productPage";

function useSetting<T>(key: string, normalize: (raw: unknown) => T) {
  return useQuery({
    queryKey: ["store-setting", key],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<T> => {
      const { data, error } = await supabase.from("store_settings").select("value").eq("key", key).maybeSingle();
      if (error) throw error;
      return normalize(data?.value);
    },
  });
}

function useSaveSetting<T>(key: string, normalize: (raw: unknown) => T) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (next: T) => {
      const { error } = await supabase.from("store_settings")
        .upsert({ key, value: normalize(next) as any }, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["store-setting", key] }),
  });
}

export const useKitSettings = () => useSetting<KitSettings>("kits", normalizeKitSettings);
export const useSaveKitSettings = () => useSaveSetting<KitSettings>("kits", normalizeKitSettings);
export const useCompareSettings = () => useSetting<CompareSettings>("compare", normalizeCompareSettings);
export const useSaveCompareSettings = () => useSaveSetting<CompareSettings>("compare", normalizeCompareSettings);
export const useMegaMenuSettings = () => useSetting<MegaMenuSettings>("mega_menu", normalizeMegaMenu);
export const useSaveMegaMenuSettings = () => useSaveSetting<MegaMenuSettings>("mega_menu", normalizeMegaMenu);
export const usePriceDisplaySettings = () => useSetting<PriceDisplaySettings>("price_display", normalizePriceDisplay);
export const useSavePriceDisplaySettings = () => useSaveSetting<PriceDisplaySettings>("price_display", normalizePriceDisplay);
export const useProductCodesSettings = () => useSetting<ProductCodesSettings>("product_codes", normalizeProductCodes);
export const useSaveProductCodesSettings = () => useSaveSetting<ProductCodesSettings>("product_codes", normalizeProductCodes);
export const useShippingEstimateSettings = () => useSetting<ShippingEstimateSettings>("shipping_estimate", normalizeShippingEstimate);
export const useSaveShippingEstimateSettings = () => useSaveSetting<ShippingEstimateSettings>("shipping_estimate", normalizeShippingEstimate);
export const useProductQuestionsSettings = () => useSetting<ProductQuestionsSettings>("product_questions", normalizeProductQuestions);
export const useSaveProductQuestionsSettings = () => useSaveSetting<ProductQuestionsSettings>("product_questions", normalizeProductQuestions);
export const useProductPageSettings = () => useSetting<ProductPageSettings>("product_page", normalizeProductPage);
export const useSaveProductPageSettings = () => useSaveSetting<ProductPageSettings>("product_page", normalizeProductPage);
