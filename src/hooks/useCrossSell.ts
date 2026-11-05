// =============================================================================================
// Venda cruzada (recurso cross_sell): ligações entre produtos (related_products, tipos cross_sell e related) e regras
// (store_settings.cross_sell). Regras puras em src/lib/crossSell.ts.
//   Loja    useCrossSellSettings, fetchCartSuggestionRows (carrinho e carrinho lateral), fetchRelatedIds (página do produto)
//   Admin   useProductLinks + useSetProductLinks (aba do produto), useAllProductLinks, useLinkProductOptions,
//           useSaveCrossSellSettings
// =============================================================================================
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { normalizeCrossSellSettings, rankCrossSells, type CrossSellSettings, type LinkKind, type LinkRow } from "@/lib/crossSell";

const sb = supabase as any;
export const CROSS_SELL_SETTINGS_KEY = ["cross-sell-settings"] as const;

export function useCrossSellSettings() {
  return useQuery({
    queryKey: CROSS_SELL_SETTINGS_KEY,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<CrossSellSettings> => {
      const { data, error } = await supabase.from("store_settings").select("value").eq("key", "cross_sell").maybeSingle();
      if (error) throw error;
      return normalizeCrossSellSettings(data?.value);
    },
  });
}

export function useSaveCrossSellSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (next: CrossSellSettings) => {
      const { error } = await supabase.from("store_settings")
        .upsert({ key: "cross_sell", value: normalizeCrossSellSettings(next) as any }, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CROSS_SELL_SETTINGS_KEY }),
  });
}

/* ---------- Loja ---------- */

/**
 * Linhas de produto para sugerir no carrinho: as ligadas aos itens (Combina com) e, se a regra pedir, destaques.
 * Sem os do carrinho, inativos e esgotados (o estoque geral só conta em produtos sem tamanhos).
 */
export async function fetchCartSuggestionRows(cartIds: string[], settings: CrossSellSettings, limit: number, select = "*"): Promise<any[]> {
  let ids: string[] = [];
  if (cartIds.length) {
    const { data } = await sb.from("related_products").select("product_id,related_product_id,display_order,kind")
      .in("product_id", cartIds).eq("kind", "cross_sell");
    // Pede mais do que o limite: alguns podem estar inativos ou esgotados.
    ids = rankCrossSells((data ?? []) as LinkRow[], cartIds, limit * 3);
  }
  let rows: any[] = [];
  if (ids.length) {
    const { data } = await sb.from("products").select(select).in("id", ids).eq("is_active", true);
    const byId = new Map((data ?? []).map((r: any) => [String(r.id), r]));
    rows = ids.map((id) => byId.get(id)).filter(Boolean);
  }
  if (rows.length < limit && settings.fillWithFeatured) {
    const { data } = await sb.from("products").select(select).eq("is_featured", true).eq("is_active", true).limit(limit * 3);
    const seen = new Set([...rows.map((r) => String(r.id)), ...cartIds]);
    rows = [...rows, ...(data ?? []).filter((d: any) => !seen.has(String(d.id)))];
  }
  if (!rows.length) return [];
  const { data: sized, error } = await sb.from("product_sizes").select("product_id").in("product_id", rows.map((r) => r.id)).eq("is_active", true);
  const withSizes = new Set<string>((sized ?? []).map((r: any) => String(r.product_id)));
  rows = rows.filter((p) => p.customizable || error || withSizes.has(String(p.id)) || p.stock_quantity == null || p.stock_quantity > 0);
  return rows.slice(0, limit);
}

/** Relacionados escolhidos no Admin para a página do produto, na ordem escolhida. */
export async function fetchRelatedIds(productId: string): Promise<string[]> {
  const { data, error } = await sb.from("related_products").select("related_product_id")
    .eq("product_id", productId).eq("kind", "related").order("display_order");
  if (error) return [];
  return (data ?? []).map((r: any) => String(r.related_product_id));
}

/* ---------- Admin ---------- */

export type ProductLinks = Record<LinkKind, string[]>;
export const productLinksKey = (productId: string) => ["product-links", productId] as const;

export function useProductLinks(productId: string) {
  return useQuery({
    queryKey: productLinksKey(productId),
    enabled: !!productId,
    queryFn: async (): Promise<ProductLinks> => {
      const { data, error } = await sb.from("related_products").select("related_product_id,kind,display_order")
        .eq("product_id", productId).order("display_order");
      if (error) throw error;
      const out: ProductLinks = { cross_sell: [], related: [] };
      for (const r of data ?? []) out[r.kind === "related" ? "related" : "cross_sell"].push(String(r.related_product_id));
      return out;
    },
  });
}

export function useSetProductLinks(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ kind, ids, both }: { kind: LinkKind; ids: string[]; both: boolean }) => {
      const { error } = await sb.rpc("admin_set_product_links", { _product_id: productId, _kind: kind, _ids: ids, _both: both });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["product-links"] });
      qc.invalidateQueries({ queryKey: ["all-product-links"] });
    },
  });
}

export function useAllProductLinks() {
  return useQuery({
    queryKey: ["all-product-links"],
    queryFn: async (): Promise<LinkRow[]> => {
      const { data, error } = await sb.from("related_products").select("product_id,related_product_id,display_order,kind").limit(10000);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export type LinkProductOption = { id: string; name: string; image: string | null; is_active: boolean; category: string | null; sku: string | null };

/** Produtos para escolher (nome, foto, categoria, código). */
export function useLinkProductOptions() {
  return useQuery({
    queryKey: ["link-product-options"],
    staleTime: 60_000,
    queryFn: async (): Promise<LinkProductOption[]> => {
      const { data, error } = await sb.from("products").select("id,name,image,is_active,category,sku").order("name").limit(2000);
      if (error) throw error;
      return data ?? [];
    },
  });
}
