// =============================================================================================
// Feed de produtos (recurso product_feed): regras (store_settings.product_feed) e os dados que o Admin usa para a
// pré-visualização e os avisos, iguais aos que a função product-feed lê. Regras puras em src/lib/productFeed.ts.
// =============================================================================================
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  categoryKey, normalizeFeedSettings, normalizeMoney, type FeedData, type FeedMoney, type FeedSettings,
} from "@/lib/productFeed";

const sb = supabase as any;
const PAGE = 1000;

async function all(query: (from: number, to: number) => any): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; from < 20000; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if ((data ?? []).length < PAGE) break;
  }
  return out;
}

const chunks = <T,>(list: T[], size = 200) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

/* ---------- Regras ---------- */

export function useFeedSettings() {
  return useQuery({
    queryKey: ["product-feed-settings"],
    queryFn: async (): Promise<FeedSettings> => {
      const { data, error } = await sb.from("store_settings").select("value").eq("key", "product_feed").maybeSingle();
      if (error) throw error;
      return normalizeFeedSettings(data?.value);
    },
  });
}

export function useSaveFeedSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (next: FeedSettings) => {
      const value = normalizeFeedSettings(next);
      const { error } = await sb.from("store_settings").upsert({ key: "product_feed", value }, { onConflict: "key" });
      if (error) throw error;
      return value;
    },
    onSuccess: (value) => qc.setQueryData(["product-feed-settings"], value),
  });
}

/* ---------- Dados do catálogo (como a função product-feed) ---------- */

export type FeedSource = {
  data: FeedData;
  money: FeedMoney;
  /** marcas ativas: id -> nome */
  brands: Record<string, string>;
  /** nome da categoria por categoryKey */
  categoryNames: Record<string, string>;
  /** categorias usadas pelos produtos ativos, com quantos produtos cada uma tem */
  categories: { key: string; name: string; count: number }[];
};

export function useFeedSource(brandsOn: boolean) {
  return useQuery({
    queryKey: ["product-feed-source", brandsOn],
    staleTime: 60_000,
    queryFn: async (): Promise<FeedSource> => {
      const products = await all((from, to) => sb.from("products")
        .select("id,slug,name,description,short_description,price,promo_active,promo_type,promo_value,promo_starts_at,promo_ends_at,stock_quantity,customizable,image,images,category,brand_id,sku,gtin,mpn,weight")
        .eq("is_active", true).order("name").range(from, to));
      const ids = products.map((p) => String(p.id));
      const byIds = async (table: string, cols: string, active: boolean) => {
        const out: any[] = [];
        for (const part of chunks(ids)) {
          out.push(...await all((from, to) => {
            let q = sb.from(table).select(cols).in("product_id", part);
            if (active) q = q.eq("is_active", true);
            return q.order("display_order").range(from, to);
          }));
        }
        return out;
      };
      const [colors, sizes, tiers, settings, brandRows, categoryRows] = await Promise.all([
        byIds("product_variations", "id,product_id,name,image_url,price_modifier,sku,gtin,stock_quantity,display_order", true),
        byIds("product_sizes", "id,product_id,size_label,price_modifier,sku,gtin,stock_quantity,display_order", true),
        (async () => {
          const out: any[] = [];
          for (const part of chunks(ids)) out.push(...await all((from, to) => sb.from("product_volume_tiers").select("product_id,min_meters,price_per_meter").in("product_id", part).order("id").range(from, to)));
          return out;
        })(),
        sb.from("store_settings").select("value").eq("key", "currency_settings").maybeSingle(),
        brandsOn ? sb.from("brands").select("id,name").eq("is_active", true) : Promise.resolve({ data: [] }),
        sb.from("categories").select("slug,name"),
      ]);
      const combos: any[] = [];
      for (const part of chunks(colors.map((c) => String(c.id)))) {
        combos.push(...await all((from, to) => sb.from("product_variation_size_availability")
          .select("variation_id,product_size_id,is_available,stock_quantity,price_modifier,sku,gtin,image_url")
          .in("variation_id", part).order("variation_id").range(from, to)));
      }
      const brands: Record<string, string> = {};
      for (const b of brandRows.data ?? []) brands[String(b.id)] = String(b.name);
      const categoryNames: Record<string, string> = {};
      for (const c of categoryRows.data ?? []) {
        if (c.slug) categoryNames[categoryKey(c.slug)] = String(c.name);
        if (c.name) categoryNames[categoryKey(c.name)] = String(c.name);
      }
      const counts = new Map<string, { name: string; count: number }>();
      for (const p of products) {
        const key = categoryKey(p.category);
        if (!key) continue;
        const prev = counts.get(key);
        counts.set(key, { name: categoryNames[key] ?? String(p.category).trim(), count: (prev?.count ?? 0) + 1 });
      }
      return {
        data: { products, colors, sizes, combos, tiers },
        money: normalizeMoney(settings.data?.value),
        brands,
        categoryNames,
        categories: [...counts.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => a.name.localeCompare(b.name)),
      };
    },
  });
}
