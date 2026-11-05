// =============================================================================================
// Pedido de orçamento B2B. Regras em src/lib/quotes.ts; dados:
//   Loja      useQuoteSettings, useQuoteMoney (preço como no carrinho), useRequestQuote (/pedido-de-orcamento)
//   Cliente   useMyQuotes (my_quotes), useAcceptQuote, useDeclineQuote
//   Admin     useAdminQuotes, useAdminQuoteSend, useAdminQuoteReject, useSaveQuoteNote, useDeleteQuote,
//             useSaveQuoteSettings
// =============================================================================================
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFeature } from "@/hooks/useFeatures";
import { useCurrency } from "@/hooks/use-currency";
import { useCountry } from "@/lib/countries";
import { normalizeQuoteSettings, quotePayloadItems, type Quote, type QuoteItem, type QuoteSettings, type QuoteStatus } from "@/lib/quotes";
import { formatPrice } from "@/utils/currency";
import { showsTaxSeparately, withVat } from "@/utils/pricing";

const sb = supabase as any;
const KEYS = ["admin-quotes", "my-quotes", "admin-attention"];
function useInvalidate() {
  const qc = useQueryClient();
  return () => { for (const k of KEYS) qc.invalidateQueries({ queryKey: [k] }); };
}
const toItem = (i: any): QuoteItem => ({
  ...i,
  quantity: Number(i.quantity),
  list_price: Number(i.list_price),
  target_price: i.target_price == null ? null : Number(i.target_price),
  unit_price: i.unit_price == null ? null : Number(i.unit_price),
});

/* ---------- Loja ---------- */

export const QUOTE_SETTINGS_KEY = ["quote-settings"] as const;

export function useQuoteSettings() {
  return useQuery({
    queryKey: QUOTE_SETTINGS_KEY,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<QuoteSettings> => {
      const { data } = await sb.from("store_settings").select("value").eq("key", "quotes").maybeSingle();
      return normalizeQuoteSettings(data?.value);
    },
  });
}

/** Valor (moeda base, sem imposto) como o carrinho mostra: com o imposto do país e na moeda escolhida. */
export function useQuoteMoney() {
  useCountry();
  const { currentCurrency, convert } = useCurrency();
  const taxed = showsTaxSeparately();
  return (net: number) => formatPrice(convert(taxed ? withVat(net) : net), currentCurrency);
}

export type QuoteRequestInput = {
  items: ReturnType<typeof quotePayloadItems>;
  company: string; contact: string; phone: string; tax_id: string; country: string; message: string;
};

export function useRequestQuote() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (r: QuoteRequestInput): Promise<string> => {
      const { data, error } = await sb.rpc("request_quote", {
        _items: r.items, _company: r.company.trim() || null, _contact: r.contact.trim(), _phone: r.phone.trim() || null,
        _tax_id: r.tax_id.trim() || null, _country: r.country || null, _message: r.message.trim() || null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: invalidate,
  });
}

/* ---------- Cliente ---------- */

export function useMyQuotes() {
  const { user } = useAuth();
  const on = useFeature("quotes");
  return useQuery({
    queryKey: ["my-quotes", user?.id],
    enabled: on && !!user,
    queryFn: async (): Promise<Quote[]> => {
      const { data, error } = await sb.rpc("my_quotes");
      if (error) throw error;
      return ((data ?? []) as any[]).map((q) => ({ ...q, number: Number(q.number), items: (q.items ?? []).map(toItem) }));
    },
  });
}

export function useAcceptQuote() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.rpc("accept_quote", { _id: id });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useDeclineQuote() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (a: { id: string; reason: string }) => {
      const { error } = await sb.rpc("decline_quote", { _id: a.id, _reason: a.reason.trim() || null });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

/* ---------- Admin ---------- */

export type AdminQuote = Omit<Quote, "items"> & {
  user_id: string; email: string | null; tax_id: string | null; country: string | null; admin_note: string | null;
  updated_at: string; items: QuoteItem[];
};

export function useAdminQuotes() {
  return useQuery({
    queryKey: ["admin-quotes"],
    queryFn: async (): Promise<AdminQuote[]> => {
      const { data, error } = await sb.from("quote_requests")
        .select("*, quote_items(*, products(name, slug, image))")
        .order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return ((data ?? []) as any[]).map(({ quote_items, ...q }) => ({
        ...q,
        number: Number(q.number),
        items: ((quote_items ?? []) as any[])
          .sort((a, b) => a.position - b.position)
          .map(({ products, ...i }) => toItem({ ...i, name: products?.name ?? i.product_id, slug: products?.slug ?? null, image: products?.image ?? null })),
      }));
    },
  });
}

export function useAdminQuoteSend() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (a: { id: string; items: { id: string; quantity: number; unit_price: number; remove?: boolean }[]; validUntil: string | null; message: string }) => {
      const { error } = await sb.rpc("admin_quote_send", { _id: a.id, _items: a.items, _valid_until: a.validUntil, _message: a.message.trim() || null });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useAdminQuoteReject() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (a: { id: string; message: string }) => {
      const { error } = await sb.rpc("admin_quote_reject", { _id: a.id, _message: a.message.trim() || null });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useSaveQuoteNote() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (a: { id: string; note: string }) => {
      const { error } = await sb.from("quote_requests").update({ admin_note: a.note }).eq("id", a.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteQuote() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("quote_requests").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useSaveQuoteSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (next: QuoteSettings) => {
      const { error } = await sb.from("store_settings").upsert({ key: "quotes", value: next }, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUOTE_SETTINGS_KEY }),
  });
}

export type { QuoteStatus };
