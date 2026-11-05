// =====================================================================================
// Admin > Kits: dados e contas da lista e da página do kit (sem desenho).
//   useAdminKits       todos os kits (o Admin vê também os inativos e fora do período) + peças
//   useKitProducts     produtos para escolher as peças, com estoque e se têm cores ou tamanhos
//   useKitStats        vendas por kit (RPC admin_kit_stats, pedidos pagos e não cancelados)
//   useSaveKit / useDeleteKit
// kit_items.product_id não tem chave estrangeira para products: nunca juntar products no select de kit_items;
// os produtos vêm à parte com .in('id', ids). Migration 20261008020000_kit_pages.sql.
// =====================================================================================
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { kitPct } from "@/lib/kitPricing";
import type { AdminLegacyT } from "@/i18n/adminLegacy";

const sb = supabase as any;

export const KIT_LOCALES = ["pt-PT", "en", "es"] as const;
export type KitLocale = (typeof KIT_LOCALES)[number];
export type I18nMap = Partial<Record<KitLocale, string>>;

export type AdminKitItem = { product_id: string; quantity: number; note: string | null; display_order: number };

export type AdminKit = {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  image_url: string | null;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  is_active: boolean;
  display_order: number;
  name_i18n: I18nMap;
  description_i18n: I18nMap;
  long_description: string | null;
  long_description_i18n: I18nMap;
  highlights: string | null;
  highlights_i18n: I18nMap;
  gallery: string[];
  show_on_home: boolean;
  starts_at: string | null;
  ends_at: string | null;
  seo_title: string | null;
  seo_description: string | null;
  updated_at?: string;
  items: AdminKitItem[];
};

export type KitDraft = Omit<AdminKit, "id" | "updated_at">;

export const EMPTY_KIT: KitDraft = {
  name: "",
  slug: "",
  description: "",
  image_url: "",
  discount_type: "percentage",
  discount_value: 10,
  is_active: true,
  display_order: 0,
  name_i18n: {},
  description_i18n: {},
  long_description: "",
  long_description_i18n: {},
  highlights: "",
  highlights_i18n: {},
  gallery: [],
  show_on_home: true,
  starts_at: null,
  ends_at: null,
  seo_title: "",
  seo_description: "",
  items: [],
};

export type KitProductOption = {
  id: string;
  name: string;
  price: number;
  image: string | null;
  category: string | null;
  is_active: boolean;
  /** null = sem controle de estoque (ilimitado). */
  stock: number | null;
  hasColors: boolean;
  hasSizes: boolean;
};

export type KitStat = {
  kit_id: string;
  orders: number;
  kits_sold: number;
  units: number;
  revenue: number;
  discount: number;
  last_order_at: string | null;
};

export type KitPeriod = "30" | "90" | "all";

const obj = (v: unknown): I18nMap => (v && typeof v === "object" && !Array.isArray(v) ? (v as I18nMap) : {});
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()) : []);

export function useAdminKits() {
  return useQuery({
    queryKey: ["admin-kits"],
    queryFn: async (): Promise<AdminKit[]> => {
      const { data, error } = await sb.from("kits").select("*").order("display_order", { ascending: true }).order("name");
      if (error) throw error;
      const ids = (data ?? []).map((k: { id: string }) => k.id);
      const { data: items, error: iErr } = ids.length
        ? await sb.from("kit_items").select("kit_id, product_id, quantity, note, display_order").in("kit_id", ids)
        : { data: [], error: null };
      if (iErr) throw iErr;
      const byKit: Record<string, AdminKitItem[]> = {};
      for (const i of items ?? []) {
        (byKit[i.kit_id] ||= []).push({ product_id: String(i.product_id), quantity: Number(i.quantity) || 1, note: i.note ?? null, display_order: Number(i.display_order) || 0 });
      }
      for (const list of Object.values(byKit)) list.sort((a, b) => a.display_order - b.display_order);
      return (data ?? []).map((k: any) => ({
        ...k,
        discount_type: k.discount_type === "fixed" ? "fixed" : "percentage",
        discount_value: Number(k.discount_value) || 0,
        display_order: Number(k.display_order) || 0,
        name_i18n: obj(k.name_i18n),
        description_i18n: obj(k.description_i18n),
        long_description_i18n: obj(k.long_description_i18n),
        highlights_i18n: obj(k.highlights_i18n),
        gallery: arr(k.gallery),
        items: byKit[k.id] ?? [],
      }));
    },
  });
}

/** Estoque de uma lista de opções: null em alguma = ilimitado; senão a soma. */
const sumStock = (rows: { stock_quantity: number | null }[]) =>
  rows.some((r) => r.stock_quantity == null) ? null : rows.reduce((s, r) => s + (Number(r.stock_quantity) || 0), 0);

export function useKitProducts() {
  return useQuery({
    queryKey: ["admin-kit-products"],
    staleTime: 30_000,
    queryFn: async (): Promise<KitProductOption[]> => {
      const [p, s, v] = await Promise.all([
        sb.from("products").select("id, name, price, image, category, is_active, stock_quantity").order("name"),
        sb.from("product_sizes").select("product_id, stock_quantity, is_active"),
        sb.from("product_variations").select("product_id, is_active"),
      ]);
      if (p.error) throw p.error;
      const sizes: Record<string, { stock_quantity: number | null }[]> = {};
      for (const r of s.data ?? []) if (r.is_active !== false) (sizes[String(r.product_id)] ||= []).push(r);
      const colors = new Set<string>((v.data ?? []).filter((r: any) => r.is_active !== false).map((r: any) => String(r.product_id)));
      return (p.data ?? []).map((r: any) => {
        const id = String(r.id);
        const sz = sizes[id] ?? [];
        return {
          id,
          name: r.name,
          price: Number(r.price) || 0,
          image: r.image ?? null,
          category: r.category ?? null,
          is_active: r.is_active !== false,
          stock: sz.length ? sumStock(sz) : r.stock_quantity == null ? null : Number(r.stock_quantity),
          hasColors: colors.has(id),
          hasSizes: sz.length > 0,
        };
      });
    },
  });
}

export function periodStart(period: KitPeriod): string | null {
  if (period === "all") return null;
  return new Date(Date.now() - Number(period) * 86_400_000).toISOString();
}

export function useKitStats(period: KitPeriod) {
  return useQuery({
    queryKey: ["admin-kit-stats", period],
    queryFn: async (): Promise<Record<string, KitStat>> => {
      const { data, error } = await sb.rpc("admin_kit_stats", { _from: periodStart(period) });
      if (error) throw error;
      const out: Record<string, KitStat> = {};
      for (const r of data ?? []) {
        out[r.kit_id] = {
          kit_id: r.kit_id,
          orders: Number(r.orders) || 0,
          kits_sold: Number(r.kits_sold) || 0,
          units: Number(r.units) || 0,
          revenue: Number(r.revenue) || 0,
          discount: Number(r.discount) || 0,
          last_order_at: r.last_order_at ?? null,
        };
      }
      return out;
    },
  });
}

/* ---------- Contas ---------- */

export type PieceProblem = "missing" | "inactive" | "out_of_stock";

export function pieceProblem(p: KitProductOption | undefined): PieceProblem | null {
  if (!p) return "missing";
  if (!p.is_active) return "inactive";
  if (p.stock != null && p.stock <= 0) return "out_of_stock";
  return null;
}

export type KitStatus = "active" | "inactive" | "scheduled" | "ended" | "unavailable";

export function kitStatus(kit: Pick<AdminKit, "is_active" | "starts_at" | "ends_at" | "items">, products: Map<string, KitProductOption>, now = Date.now()): KitStatus {
  if (!kit.is_active) return "inactive";
  if (kit.ends_at && new Date(kit.ends_at).getTime() <= now) return "ended";
  if (kit.starts_at && new Date(kit.starts_at).getTime() > now) return "scheduled";
  if (products.size && (kit.items.length === 0 || kit.items.some((i) => pieceProblem(products.get(i.product_id))))) return "unavailable";
  return "active";
}

/** Preço de tabela das peças, desconto e preço do kit (mesma regra de src/lib/kitPricing.ts). */
export function kitPreview(kit: Pick<KitDraft, "discount_type" | "discount_value" | "items">, products: Map<string, KitProductOption>) {
  const list = kit.items.reduce((s, i) => s + (products.get(i.product_id)?.price ?? 0) * (Number(i.quantity) || 0), 0);
  const pct = kitPct(kit.discount_type, kit.discount_value, list);
  const discount = Math.round(list * pct * 100) / 100;
  return { list, pct, discount, total: Math.max(0, list - discount) };
}

/** Explicação do estado (para o title do selo e a página do kit). */
export function statusHint(t: AdminLegacyT, status: KitStatus, kit: { starts_at: string | null; ends_at: string | null }, dateTime: (v: string) => string) {
  if (status === "scheduled" && kit.starts_at) return t("kits_status_scheduled_d", { date: dateTime(kit.starts_at) });
  if (status === "ended" && kit.ends_at) return t("kits_status_ended_d", { date: dateTime(kit.ends_at) });
  return t(`kits_status_${status}_d`);
}

/** ISO para o campo datetime-local (hora local) e de volta. */
export const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
export const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

/** Mesmo endereço que o trigger kits_slug_fill gera (sem acentos, letras, números e hífens). */
export const kitSlug = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

/* ---------- Gravar e apagar ---------- */

const cleanMap = (m: I18nMap) => {
  const out: I18nMap = {};
  for (const l of KIT_LOCALES) {
    const v = (m[l] ?? "").trim();
    if (v && v !== "<p></p>") out[l] = v;
  }
  return out;
};
const textOrNull = (v: string | null | undefined) => {
  const s = (v ?? "").trim();
  return s && s !== "<p></p>" ? s : null;
};

export function useSaveKit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, draft }: { id: string | null; draft: KitDraft }): Promise<string> => {
      const row = {
        name: draft.name.trim(),
        slug: kitSlug(draft.slug ?? "") || null,
        description: textOrNull(draft.description),
        image_url: textOrNull(draft.image_url),
        discount_type: draft.discount_type,
        discount_value: Math.max(0, Number(draft.discount_value) || 0),
        is_active: draft.is_active,
        display_order: Number(draft.display_order) || 0,
        name_i18n: cleanMap(draft.name_i18n),
        description_i18n: cleanMap(draft.description_i18n),
        long_description: textOrNull(draft.long_description),
        long_description_i18n: cleanMap(draft.long_description_i18n),
        highlights: textOrNull(draft.highlights),
        highlights_i18n: cleanMap(draft.highlights_i18n),
        gallery: draft.gallery.filter((u) => !!u.trim()),
        show_on_home: draft.show_on_home,
        starts_at: draft.starts_at,
        ends_at: draft.ends_at,
        seo_title: textOrNull(draft.seo_title),
        seo_description: textOrNull(draft.seo_description),
      };
      let kitId = id;
      if (kitId) {
        const { error } = await sb.from("kits").update(row).eq("id", kitId);
        if (error) throw error;
      } else {
        const { data, error } = await sb.from("kits").insert([row]).select("id").single();
        if (error) throw error;
        kitId = data.id as string;
      }
      const { error: dErr } = await sb.from("kit_items").delete().eq("kit_id", kitId);
      if (dErr) throw dErr;
      const items = draft.items
        .filter((i) => !!i.product_id)
        .map((i, n) => ({ kit_id: kitId, product_id: i.product_id, quantity: Math.max(1, Number(i.quantity) || 1), note: textOrNull(i.note), display_order: n }));
      if (items.length) {
        const { error } = await sb.from("kit_items").insert(items);
        if (error) throw error;
      }
      return kitId!;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-kits"] });
      qc.invalidateQueries({ queryKey: ["site-kits"] });
      qc.invalidateQueries({ queryKey: ["site-kit"] });
    },
  });
}

export function useDeleteKit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("kits").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-kits"] });
      qc.invalidateQueries({ queryKey: ["site-kits"] });
    },
  });
}

export const isSlugTaken = (e: unknown) => /kits_slug_key|duplicate key/i.test(String((e as { message?: string })?.message ?? ""));
