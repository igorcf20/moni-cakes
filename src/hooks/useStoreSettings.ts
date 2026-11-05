import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useStoreSettings = () => {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["store_settings_kv"],
    queryFn: async () => {
      const { data, error } = await supabase.from("store_settings").select("key,value");
      if (error) throw error;
      return data as { key: string; value: any }[];
    },
    staleTime: 5 * 60 * 1000,
  });
  const settings = rows.reduce<Record<string, any>>((acc, r) => {
    acc[r.key] = r.value;
    return acc;
  }, {});
  return { settings, isLoading };
};
