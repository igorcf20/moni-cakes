// Regras da área do cliente (store_settings.account_page, src/lib/accountPage.ts): leitura pública, escrita só Admin.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { normalizeAccountPage, type AccountPageSettings } from "@/lib/accountPage";

const KEY = "account_page";

export function useAccountPageSettings() {
  return useQuery({
    queryKey: ["store-setting", KEY],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<AccountPageSettings> => {
      const { data, error } = await supabase.from("store_settings").select("value").eq("key", KEY).maybeSingle();
      if (error) throw error;
      return normalizeAccountPage(data?.value);
    },
  });
}

/** Regras já com o padrão enquanto carregam (a conta nunca espera por elas). */
export function useAccountPage(): AccountPageSettings {
  return useAccountPageSettings().data ?? normalizeAccountPage(undefined);
}

export function useSaveAccountPageSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (next: AccountPageSettings) => {
      const { error } = await supabase.from("store_settings")
        .upsert({ key: KEY, value: normalizeAccountPage(next) as any }, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["store-setting", KEY] }),
  });
}
