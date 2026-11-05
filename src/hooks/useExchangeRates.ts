// =============================================================================================
// Moedas e câmbio (Admin > Configurações > Moedas e câmbio). Regras puras em src/lib/exchangeRates.ts.
//   useCurrencySettings / useSaveCurrencySettings   store_settings.currency_settings (taxas gravadas à mão = manual)
//   useRefreshRates                                  função update-exchange-rates (taxas do BCE agora)
//   useRateHistory                                   últimas mudanças (exchange_rate_history, escrito pelo servidor)
// =============================================================================================
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrency } from "@/hooks/use-currency";
import { normalizeCurrencySettings, type CurrencySettings, type RateSkip } from "@/lib/exchangeRates";

const sb = supabase as any;
const KEY = ["currency-settings-admin"] as const;

export function useCurrencySettings() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<{ settings: CurrencySettings; raw: Record<string, unknown> }> => {
      const { data, error } = await sb.from("store_settings").select("value").eq("key", "currency_settings").maybeSingle();
      if (error) throw error;
      const raw = data?.value && typeof data.value === "object" ? data.value : {};
      return { settings: normalizeCurrencySettings(raw), raw };
    },
  });
}

/** Recarrega as taxas do site (conversão nos preços) e do Admin depois de uma mudança. */
function useAfterChange() {
  const qc = useQueryClient();
  const fetchRates = useCurrency((s) => s.fetchRates);
  return () => {
    qc.invalidateQueries({ queryKey: KEY });
    qc.invalidateQueries({ queryKey: ["exchange-rate-history"] });
    fetchRates();
  };
}

export function useSaveCurrencySettings() {
  const after = useAfterChange();
  return useMutation({
    mutationFn: async ({ next, raw }: { next: CurrencySettings; raw: Record<string, unknown> }) => {
      // Mantém campos antigos do valor (lidos por outras telas) e marca as taxas como gravadas à mão.
      const value = { ...raw, ...normalizeCurrencySettings(next), rates_source: "manual" };
      const { error } = await sb.from("store_settings").upsert({ key: "currency_settings", value }, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: after,
  });
}

export type RefreshResult = {
  status: "ok" | "partial" | "error" | "skipped";
  rate_date?: string;
  changed?: { code: string; from: number | null; to: number }[];
  skipped?: RateSkip[];
  error?: string;
};

export function useRefreshRates() {
  const after = useAfterChange();
  return useMutation({
    mutationFn: async (force: boolean): Promise<RefreshResult> => {
      const { data, error } = await supabase.functions.invoke("update-exchange-rates", { body: { force } });
      if (error) {
        // A função responde com um código estável no corpo também em erro.
        const body = await (error as any)?.context?.json?.().catch(() => null);
        return { status: "error", error: body?.error ?? "source_unavailable" };
      }
      return data as RefreshResult;
    },
    onSettled: after,
  });
}

export type RateHistoryRow = { id: number; base: string; currency: string; rate: number; previous_rate: number | null; source: "ecb" | "manual"; rate_date: string | null; created_at: string };

export function useRateHistory(limit = 40) {
  return useQuery({
    queryKey: ["exchange-rate-history", limit],
    queryFn: async (): Promise<RateHistoryRow[]> => {
      const { data, error } = await sb.from("exchange_rate_history")
        .select("id,base,currency,rate,previous_rate,source,rate_date,created_at").order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit);
      if (error) return [];
      return (data ?? []).map((r: any) => ({ ...r, rate: Number(r.rate), previous_rate: r.previous_rate == null ? null : Number(r.previous_rate) }));
    },
  });
}
