// =============================================================================================
// Prazo de produção e data de entrega (recurso delivery_dates). Regras e contas em src/lib/deliveryDates.ts.
//   useDeliveryRules          { on, settings }: recurso ligado e store_settings.delivery_dates
//   useSaveDeliverySettings   grava as regras (Admin > Prazos e entrega)
//   useLeadTimes(ids)         prazo dos produtos do carrinho (checkout)
// =============================================================================================
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFeature } from "@/hooks/useFeatures";
import { normalizeDeliverySettings, type DeliverySettings } from "@/lib/deliveryDates";

const sb = supabase as any;
const KEY = ["store-settings", "delivery_dates"] as const;

export function useDeliveryRules() {
  const on = useFeature("delivery_dates");
  const q = useQuery({
    queryKey: KEY,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ settings: DeliverySettings; raw: Record<string, unknown> }> => {
      const { data } = await sb.from("store_settings").select("value").eq("key", "delivery_dates").maybeSingle();
      const raw = data?.value && typeof data.value === "object" ? data.value : {};
      return { settings: normalizeDeliverySettings(raw), raw };
    },
  });
  return { on, settings: q.data?.settings ?? normalizeDeliverySettings({}), raw: q.data?.raw ?? {}, isLoading: q.isLoading };
}

export function useSaveDeliverySettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ next, raw }: { next: DeliverySettings; raw: Record<string, unknown> }) => {
      const { error } = await sb.from("store_settings").upsert({ key: "delivery_dates", value: { ...raw, ...next } }, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export type LeadRow = { id: string; lead_time_min_days: number | null; lead_time_max_days: number | null; technical_specs: unknown; specifications: unknown };

export function useLeadTimes(productIds: string[], enabled = true) {
  const ids = [...new Set(productIds.filter(Boolean))].sort();
  return useQuery({
    queryKey: ["lead-times", ids],
    enabled: enabled && ids.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<LeadRow[]> => {
      const { data, error } = await sb.from("products").select("id,lead_time_min_days,lead_time_max_days,technical_specs,specifications").in("id", ids);
      if (error) return [];
      return data ?? [];
    },
  });
}
