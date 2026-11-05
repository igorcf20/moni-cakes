// Regras das listagens (/produtos e /categoria/:slug) em store_settings.catalog_page (src/lib/catalogPage.ts).
// Enquanto carrega, ou se a leitura falhar, vale o padrão: a loja nunca fica sem grade.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_CATALOG_PAGE, normalizeCatalogPage, type CatalogPageSettings } from "@/lib/catalogPage";

const KEY = "catalog_page";

export function useCatalogPageSettings() {
  return useQuery({
    queryKey: ["store-setting", KEY],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<CatalogPageSettings> => {
      const { data, error } = await supabase.from("store_settings").select("value").eq("key", KEY).maybeSingle();
      if (error) throw error;
      return normalizeCatalogPage(data?.value);
    },
  });
}

/** Regras já resolvidas para a loja (padrão enquanto carrega). */
export function useCatalogPage(): CatalogPageSettings {
  return useCatalogPageSettings().data ?? DEFAULT_CATALOG_PAGE;
}

export function useSaveCatalogPageSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (next: CatalogPageSettings) => {
      const { error } = await supabase.from("store_settings")
        .upsert({ key: KEY, value: normalizeCatalogPage(next) as any }, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["store-setting", KEY] }),
  });
}
