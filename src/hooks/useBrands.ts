// =============================================================================================
// Marcas (recurso brands). Regras puras em src/lib/brands.ts.
//   Loja    useBrands (ativas, para o filtro, a página /marcas e a página do produto)
//   Admin   useAdminBrands (todas, com quantos produtos cada uma tem), useSaveBrand, useDeleteBrand,
//           useBrandProducts (produtos de uma marca), brandErrorCode
// =============================================================================================
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Brand } from "@/lib/brands";

const sb = supabase as any;
const BRAND_COLS = "id,slug,name,logo_url,website,description_i18n,is_active,display_order";

const clean = (r: any): Brand => ({
  id: String(r.id),
  slug: String(r.slug),
  name: String(r.name ?? ""),
  logo_url: r.logo_url ?? null,
  website: r.website ?? null,
  description_i18n: r.description_i18n && typeof r.description_i18n === "object" ? r.description_i18n : {},
  is_active: r.is_active !== false,
  display_order: Number(r.display_order) || 0,
});

/* ---------- Loja ---------- */

export function useBrands(enabled = true) {
  return useQuery({
    queryKey: ["brands"],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Brand[]> => {
      const { data, error } = await sb.from("brands").select(BRAND_COLS).eq("is_active", true).order("display_order").order("name");
      if (error) return [];
      return (data ?? []).map(clean);
    },
  });
}

/* ---------- Admin ---------- */

export type AdminBrand = Brand & { products: number };

export function useAdminBrands() {
  return useQuery({
    queryKey: ["admin-brands"],
    queryFn: async (): Promise<AdminBrand[]> => {
      const [brands, products] = await Promise.all([
        sb.from("brands").select(BRAND_COLS).order("display_order").order("name"),
        sb.from("products").select("brand_id").not("brand_id", "is", null).limit(20000),
      ]);
      if (brands.error) throw brands.error;
      const counts = new Map<string, number>();
      for (const p of products.data ?? []) counts.set(String(p.brand_id), (counts.get(String(p.brand_id)) ?? 0) + 1);
      return (brands.data ?? []).map((b: any) => ({ ...clean(b), products: counts.get(String(b.id)) ?? 0 }));
    },
  });
}

/** Código estável do erro ao gravar uma marca. */
export function brandErrorCode(error: unknown): "slug_taken" | "invalid" | "unknown" {
  const e = error as { code?: string } | null;
  if (e?.code === "23505") return "slug_taken";
  if (e?.code === "23514") return "invalid";
  return "unknown";
}

export type BrandInput = Omit<Brand, "id"> & { id?: string };

export function useSaveBrand() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: BrandInput): Promise<string> => {
      const { id, ...row } = input;
      if (id) {
        const { error } = await sb.from("brands").update(row).eq("id", id);
        if (error) throw error;
        return id;
      }
      const { data, error } = await sb.from("brands").insert(row).select("id").single();
      if (error) throw error;
      return String(data.id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-brands"] });
      qc.invalidateQueries({ queryKey: ["brands"] });
    },
  });
}

export function useDeleteBrand() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("brands").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-brands"] });
      qc.invalidateQueries({ queryKey: ["brands"] });
    },
  });
}

export function useBrandProducts(brandId: string | null) {
  return useQuery({
    queryKey: ["brand-products", brandId],
    enabled: !!brandId,
    queryFn: async (): Promise<{ id: string; name: string; image: string | null; is_active: boolean }[]> => {
      const { data, error } = await sb.from("products").select("id,name,image,is_active").eq("brand_id", brandId).order("name").limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });
}
