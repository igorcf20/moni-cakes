import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PrintMethod = { id?: string; key: string; label: string; display_order: number; is_active: boolean };

// Used until the print_methods migration is applied (or if the table can't be read): FDM printing in the
// materials of the 3D quote (src/lib/print3d.ts MATERIALS). Technical names, the same in every language.
export const DEFAULT_METHODS: PrintMethod[] = [
  ["fdm_pla", "FDM PLA"], ["fdm_petg", "FDM PETG"], ["fdm_abs", "FDM ABS"], ["fdm_tpu", "FDM TPU"],
].map(([key, label], display_order) => ({ key, label, display_order, is_active: true }));

export function usePrintMethods() {
  const query = useQuery({
    queryKey: ["print-methods"],
    staleTime: 60_000,
    queryFn: async (): Promise<PrintMethod[]> => {
      const { data, error } = await (supabase as any).from("print_methods").select("*").order("display_order").order("label");
      if (error) throw error;
      return data ?? [];
    },
  });
  const methods = query.data ?? DEFAULT_METHODS;
  // Labels of the fallback keys stay available for items saved while the table could not be read.
  const labels: Record<string, string> = Object.fromEntries([...DEFAULT_METHODS, ...methods].map((m) => [m.key, m.label]));
  return { methods, labels, tableMissing: !!query.error, isLoading: query.isLoading };
}
