// Pré-venda (recurso preorders): produtos em pré-venda agora (site) e regras por produto (Admin).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFeature } from "@/hooks/useFeatures";
import { normalizeProductPreorder, normalizePublicPreorder, type ProductPreorder, type PublicPreorder } from "@/lib/preorders";

const sb = supabase as any;
const PUBLIC_KEY = ["preorders-public"] as const;
const ADMIN_KEY = ["admin-preorders"] as const;

/** Mapa produto -> pré-venda de agora (uma consulta para a loja toda). */
export function usePreorders() {
  const on = useFeature("preorders");
  const query = useQuery({
    queryKey: PUBLIC_KEY,
    enabled: on,
    staleTime: 60_000,
    queryFn: async (): Promise<Map<string, PublicPreorder>> => {
      const { data, error } = await sb.rpc("preorders_public");
      if (error) return new Map();
      const map = new Map<string, PublicPreorder>();
      for (const row of (data ?? []) as unknown[]) {
        const p = normalizePublicPreorder(row);
        if (p) map.set(p.product_id, p);
      }
      return map;
    },
  });
  return on ? query.data ?? new Map<string, PublicPreorder>() : new Map<string, PublicPreorder>();
}

export function usePreorder(productId: string | null | undefined): PublicPreorder | null {
  const map = usePreorders();
  return productId ? map.get(String(productId)) ?? null : null;
}

export type AdminPreorderRow = {
  product_id: string; product_name: string; product_image: string | null; is_active: boolean; release_date: string | null;
  max_units: number | null; running: boolean; sold: number; orders: number; updated_at: string;
};

export function useAdminPreorders() {
  return useQuery({
    queryKey: ADMIN_KEY,
    queryFn: async (): Promise<AdminPreorderRow[]> => {
      const { data, error } = await sb.rpc("admin_preorders");
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({ ...r, sold: Number(r.sold) || 0, orders: Number(r.orders) || 0, running: !!r.running }));
    },
  });
}

export function useAdminProductPreorder(productId: string) {
  return useQuery({
    queryKey: [...ADMIN_KEY, productId],
    queryFn: async (): Promise<ProductPreorder | null> => {
      const { data, error } = await sb.from("product_preorders").select("product_id,is_active,release_date,max_units,note_i18n")
        .eq("product_id", productId).maybeSingle();
      if (error) throw error;
      return data ? normalizeProductPreorder(data) : null;
    },
  });
}

export function useSaveProductPreorder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: ProductPreorder) => {
      const v = normalizeProductPreorder(p);
      const { error } = await sb.from("product_preorders").upsert(v, { onConflict: "product_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ADMIN_KEY });
      void qc.invalidateQueries({ queryKey: PUBLIC_KEY });
    },
  });
}

export function useDeleteProductPreorder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (productId: string) => {
      const { error } = await sb.from("product_preorders").delete().eq("product_id", productId);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ADMIN_KEY });
      void qc.invalidateQueries({ queryKey: PUBLIC_KEY });
    },
  });
}
