// Carrinho e checkout (store_settings.checkout_page, regras em src/lib/checkoutPage.ts): leitura pública para a loja
// e gravação pelo Admin > Pagamentos e entrega > Carrinho e checkout.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_CHECKOUT_PAGE, normalizeCheckoutPage, type CheckoutPageSettings } from "@/lib/checkoutPage";

const KEY = ["store-setting", "checkout_page"];

export function useCheckoutPageQuery() {
  return useQuery({
    queryKey: KEY,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<CheckoutPageSettings> => {
      const { data, error } = await supabase.from("store_settings").select("value").eq("key", "checkout_page").maybeSingle();
      if (error) throw error;
      return normalizeCheckoutPage(data?.value);
    },
  });
}

/** Regras para a loja: enquanto carrega (ou se a leitura falhar), o padrão. */
export function useCheckoutPage(): CheckoutPageSettings {
  return useCheckoutPageQuery().data ?? DEFAULT_CHECKOUT_PAGE;
}

export function useSaveCheckoutPage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (next: CheckoutPageSettings) => {
      const { error } = await supabase.from("store_settings")
        .upsert({ key: "checkout_page", value: normalizeCheckoutPage(next) as any }, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
