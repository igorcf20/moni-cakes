// =============================================================================================
// Feed de produtos para o Google Merchant Center (Google Shopping), Meta, TikTok e Pinterest (recurso product_feed).
// Público, sem JWT (verify_jwt = false em supabase/config.toml): os lojistas colam o endereço no Merchant Center.
//   GET /functions/v1/product-feed?pais=BR   XML (RSS 2.0, espaço de nomes g:) do país pedido (vazio = país padrão)
// Recurso desligado, país inativo ou fora da lista do Admin: 404. Regras puras em _shared/productFeed.ts (cópia de
// src/lib/productFeed.ts); o Admin > Feed de produtos mostra a mesma pré-visualização.
// =============================================================================================
import { supabaseAdmin } from "../_shared/admin.ts";
import { loadStoreBrand } from "../_shared/storeBrand.ts";
import {
  buildFeedItems, categoryKey, feedCountryOn, feedXml, normalizeFeedSettings, normalizeMoney, type FeedCountry,
} from "../_shared/productFeed.ts";

const SITE_URL = (Deno.env.get("SITE_URL") ?? "").trim().replace(/\/+$/, "");
const PAGE = 1000;
const MAX_PRODUCTS = 20000;

const text = (body: string, status: number) =>
  new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Access-Control-Allow-Origin": "*" } });

// deno-lint-ignore no-explicit-any
async function all(query: (from: number, to: number) => any): Promise<any[]> {
  // deno-lint-ignore no-explicit-any
  const out: any[] = [];
  for (let from = 0; from < MAX_PRODUCTS; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if ((data ?? []).length < PAGE) break;
  }
  return out;
}

const chunks = <T,>(list: T[], size = 300) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS" } });
  }
  if (req.method !== "GET" && req.method !== "HEAD") return text("method_not_allowed", 405);
  if (!SITE_URL) return text("site_url_missing", 503);

  try {
    const sb = supabaseAdmin();
    const { data: settingsRows, error: sErr } = await sb.from("store_settings").select("key,value")
      .in("key", ["features", "product_feed", "currency_settings"]);
    if (sErr) throw sErr;
    // deno-lint-ignore no-explicit-any
    const setting = (k: string): any => (settingsRows ?? []).find((r: { key: string }) => r.key === k)?.value ?? null;
    const flags = setting("features") ?? {};
    // Desligado por padrão (src/lib/features.ts).
    if (flags.product_feed !== true) return text("not_found", 404);
    const settings = normalizeFeedSettings(setting("product_feed"));
    const money = normalizeMoney(setting("currency_settings"));
    const colorStock = flags.variants !== false;
    const brandsOn = flags.brands === true;

    const wanted = (new URL(req.url).searchParams.get("pais") ?? "").trim().toUpperCase();
    const { data: countries, error: cErr } = await sb.from("countries").select("code,currency,tax_mode,default_tax_rate,is_default,display_order").eq("is_active", true);
    if (cErr) throw cErr;
    // deno-lint-ignore no-explicit-any
    const list = (countries ?? []) as any[];
    const row = wanted ? list.find((c) => c.code === wanted) : list.find((c) => c.is_default) ?? list[0];
    if (!row || !feedCountryOn(settings, row.code)) return text("country_not_found", 404);
    const country: FeedCountry = { code: row.code, currency: row.currency, taxMode: row.tax_mode === "vat" ? "vat" : "inclusive", taxRate: Number(row.default_tax_rate) || 0 };

    const products = await all((from, to) => sb.from("products")
      .select("id,slug,name,description,short_description,price,promo_active,promo_type,promo_value,promo_starts_at,promo_ends_at,stock_quantity,customizable,image,images,category,brand_id,sku,gtin,mpn,weight")
      .eq("is_active", true).order("id").range(from, to));
    const ids = products.map((p) => String(p.id));
    // deno-lint-ignore no-explicit-any
    const byIds = async (table: string, cols: string, extra?: (q: any) => any) => {
      // deno-lint-ignore no-explicit-any
      const out: any[] = [];
      for (const part of chunks(ids)) {
        out.push(...await all((from, to) => {
          let q = sb.from(table).select(cols).in("product_id", part);
          if (extra) q = extra(q);
          return q.order("display_order").range(from, to);
        }));
      }
      return out;
    };
    const [colors, sizes, tiers] = await Promise.all([
      byIds("product_variations", "id,product_id,name,image_url,price_modifier,sku,gtin,stock_quantity,display_order", (q) => q.eq("is_active", true)),
      byIds("product_sizes", "id,product_id,size_label,price_modifier,sku,gtin,stock_quantity,display_order", (q) => q.eq("is_active", true)),
      (async () => {
        // deno-lint-ignore no-explicit-any
        const out: any[] = [];
        for (const part of chunks(ids)) {
          out.push(...await all((from, to) => sb.from("product_volume_tiers").select("product_id,min_meters,price_per_meter").in("product_id", part).order("id").range(from, to)));
        }
        return out;
      })(),
    ]);
    const colorIds = colors.map((c) => String(c.id));
    // deno-lint-ignore no-explicit-any
    const combos: any[] = [];
    for (const part of chunks(colorIds)) {
      combos.push(...await all((from, to) => sb.from("product_variation_size_availability")
        .select("variation_id,product_size_id,is_available,stock_quantity,price_modifier,sku,gtin,image_url")
        .in("variation_id", part).order("variation_id").range(from, to)));
    }

    const [brandRows, categoryRows, store] = await Promise.all([
      brandsOn ? sb.from("brands").select("id,name").eq("is_active", true) : Promise.resolve({ data: [] }),
      sb.from("categories").select("slug,name"),
      loadStoreBrand(sb),
    ]);
    const brands: Record<string, string> = {};
    for (const b of brandRows.data ?? []) brands[String(b.id)] = String(b.name);
    const categoryNames: Record<string, string> = {};
    for (const c of categoryRows.data ?? []) {
      if (c.slug) categoryNames[categoryKey(c.slug)] = String(c.name);
      if (c.name) categoryNames[categoryKey(c.name)] = String(c.name);
    }

    const { items } = buildFeedItems({ products, colors, sizes, combos, tiers }, {
      siteUrl: SITE_URL, storeName: store.name, country, money, settings, colorStock, brands, categoryNames,
    });
    const xml = feedXml(items, { title: store.name, link: SITE_URL, description: store.tagline || store.name });
    return new Response(req.method === "HEAD" ? null : xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=900",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    console.error("product-feed", e);
    return text("feed_error", 500);
  }
});
