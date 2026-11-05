import { STORE_DEFAULTS } from "@/config/store";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface StoreInfo {
  name: string;
  email: string;
  phone: string;
  nif: string;
  address: string;
  footer_text: string;
}

export const useStoreInfo = () => {
  return useQuery({
    queryKey: ["storeInfo"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_settings")
        .select("value")
        .eq("key", "store_info")
        .maybeSingle();

      if (error) throw error;
      
      // Valores de reserva enquanto o Admin não preencher os dados da loja.
      const defaultInfo: StoreInfo = {
        name: STORE_DEFAULTS.name,
        email: "",
        phone: "",
        nif: "",
        address: "",
        footer_text: "",
      };

      if (!data || !data.value) return defaultInfo;
      
      return {
        ...defaultInfo,
        ...(data.value as any)
      } as StoreInfo;
    },
  });
};
