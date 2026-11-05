// =============================================================================================
// Histórico de estoque (Admin > Histórico de estoque e página de números do produto). Regras puras em
// src/lib/stockHistory.ts; dados do servidor (só admin):
//   useStockMovements   admin_stock_movements (filtros, paginação no servidor)
//   useStockSummary     admin_stock_summary (entradas e saídas por motivo no período)
//   useStockTargets     onde o estoque de um produto vive: produto, cores, tamanhos e cor x tamanho
//   useAdjustStock      admin_adjust_stock (definir ou somar, com motivo e nota; o trigger grava o histórico)
// =============================================================================================
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AdjustMode, AdjustReason, StockReason, SummaryRow } from "@/lib/stockHistory";

const sb = supabase as any;

export type StockMovement = {
  id: number; created_at: string; product_id: string; product_name: string | null; product_image: string | null;
  variation_name: string | null; size_label: string | null; sku: string | null;
  quantity_before: number | null; quantity_after: number | null; change: number; reason: StockReason;
  order_id: string | null; actor_email: string | null; note: string | null;
  /** Entrada em lote que gravou o movimento (Entradas e conferência). */
  entry_id?: string | null; entry_number?: number | null;
};

export type MovementFilters = { since: string | null; reasons: StockReason[] | null; q: string; productId?: string | null; page: number; pageSize: number };

export function useStockMovements(f: MovementFilters, enabled = true) {
  return useQuery({
    queryKey: ["stock-movements", f],
    enabled,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<{ rows: StockMovement[]; total: number }> => {
      const { data, error } = await sb.rpc("admin_stock_movements", {
        _since: f.since, _reasons: f.reasons, _q: f.q.trim() || null, _product_id: f.productId ?? null,
        _limit: f.pageSize, _offset: (f.page - 1) * f.pageSize,
      });
      if (error) throw error;
      const rows = (data ?? []) as (StockMovement & { total_count: number })[];
      return { rows, total: rows.length ? Number(rows[0].total_count) : 0 };
    },
  });
}

export function useStockSummary(since: string | null, productId?: string | null) {
  return useQuery({
    queryKey: ["stock-summary", since, productId ?? null],
    queryFn: async (): Promise<SummaryRow[]> => {
      const { data, error } = await sb.rpc("admin_stock_summary", { _since: since, _product_id: productId ?? null });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({ reason: r.reason, units_in: Number(r.units_in), units_out: Number(r.units_out), movements: Number(r.movements) }));
    },
  });
}

export type StockTarget = { key: string; variationId: string | null; sizeId: string | null; label: string | null; stock: number | null; sku: string | null };

/** Partes do produto com estoque próprio. A primeira é sempre o produto. */
export function useStockTargets(productId: string | null) {
  return useQuery({
    queryKey: ["stock-targets", productId],
    enabled: !!productId,
    queryFn: async (): Promise<{ name: string; targets: StockTarget[] }> => {
      const [p, v, s] = await Promise.all([
        sb.from("products").select("name, stock_quantity, sku").eq("id", productId).maybeSingle(),
        sb.from("product_variations").select("id, name, stock_quantity, sku").eq("product_id", productId).order("display_order"),
        sb.from("product_sizes").select("id, size_label, stock_quantity, sku").eq("product_id", productId).order("display_order"),
      ]);
      if (p.error) throw p.error;
      const vars: any[] = v.data ?? [];
      const sizes: any[] = s.data ?? [];
      const m = vars.length && sizes.length
        ? await sb.from("product_variation_size_availability").select("variation_id, product_size_id, stock_quantity, sku").in("variation_id", vars.map((x) => x.id))
        : { data: [] };
      const targets: StockTarget[] = [{ key: "p", variationId: null, sizeId: null, label: null, stock: p.data?.stock_quantity ?? null, sku: p.data?.sku ?? null }];
      for (const x of vars) targets.push({ key: `v:${x.id}`, variationId: x.id, sizeId: null, label: x.name, stock: x.stock_quantity, sku: x.sku });
      for (const x of sizes) targets.push({ key: `s:${x.id}`, variationId: null, sizeId: x.id, label: x.size_label, stock: x.stock_quantity, sku: x.sku });
      // Combinações cor x tamanho só quando a matriz já tem estoque (as outras seguem a cor ou o tamanho).
      for (const r of (m.data ?? []) as any[]) {
        if (r.stock_quantity == null) continue;
        const vn = vars.find((x) => x.id === r.variation_id)?.name;
        const sn = sizes.find((x) => x.id === r.product_size_id)?.size_label;
        targets.push({ key: `m:${r.variation_id}:${r.product_size_id}`, variationId: r.variation_id, sizeId: r.product_size_id, label: [vn, sn].filter(Boolean).join(" / "), stock: r.stock_quantity, sku: r.sku });
      }
      return { name: p.data?.name ?? "", targets };
    },
  });
}

export function useAdjustStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { productId: string; variationId: string | null; sizeId: string | null; mode: AdjustMode; value: number; reason: AdjustReason; note: string }) => {
      const { data, error } = await sb.rpc("admin_adjust_stock", {
        _product_id: a.productId, _variation_id: a.variationId, _size_id: a.sizeId, _mode: a.mode, _value: a.value, _reason: a.reason, _note: a.note.trim() || null,
      });
      if (error) throw error;
      return Number(data);
    },
    onSuccess: () => {
      for (const k of ["stock-movements", "stock-summary", "stock-targets", "admin-catalog-index", "adminProducts"]) qc.invalidateQueries({ queryKey: [k] });
    },
  });
}
