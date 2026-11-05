// =============================================================================================
// Vários armazéns (Admin > Armazéns e bloco na página do pedido). Regras em src/lib/warehouses.ts; dados (só admin):
//   useWarehouses          tabela warehouses (criar, editar, apagar: useSaveWarehouse, useDeleteWarehouse)
//   useWarehouseSummary    admin_warehouse_summary (unidades e partes por armazém)
//   useWarehouseSlots      admin_warehouse_slots (grelha: cada parte com unidades por armazém, paginação no servidor)
//   useWarehouseSet        admin_warehouse_set (definir ou somar num armazém; o total da parte acompanha)
//   useWarehouseTransfer   admin_warehouse_transfer (de um armazém para outro)
//   useWarehouseLoad       admin_warehouse_load (põe o estoque ainda fora dos armazéns num armazém)
//   useWarehouseMoves      admin_warehouse_moves (ajustes, transferências e cargas)
//   useOrderAllocations    admin_order_allocations (de onde saiu cada item do pedido)
// =============================================================================================
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { normalizeWarehouse, type Warehouse, type WarehouseDraft, type WarehouseReason } from "@/lib/warehouses";

const sb = supabase as any;

const STOCK_KEYS = ["warehouses", "warehouse-summary", "warehouse-slots", "warehouse-moves", "stock-movements", "stock-summary", "stock-targets", "admin-catalog-index", "adminProducts"];
function useInvalidate() {
  const qc = useQueryClient();
  return () => { for (const k of STOCK_KEYS) qc.invalidateQueries({ queryKey: [k] }); };
}

export function useWarehouses(enabled = true) {
  return useQuery({
    queryKey: ["warehouses"],
    enabled,
    queryFn: async (): Promise<Warehouse[]> => {
      const { data, error } = await sb.from("warehouses").select("*").order("priority").order("name");
      if (error) throw error;
      return (data ?? []).map(normalizeWarehouse);
    },
  });
}

export type WarehouseSummary = { units: number; slots: number; empty: number; products: number };

export function useWarehouseSummary() {
  return useQuery({
    queryKey: ["warehouse-summary"],
    queryFn: async (): Promise<Record<string, WarehouseSummary>> => {
      const { data, error } = await sb.rpc("admin_warehouse_summary");
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((r: any) => [r.warehouse_id, {
        units: Number(r.units), slots: Number(r.slots), empty: Number(r.empty_slots), products: Number(r.products),
      }]));
    },
  });
}

export function useSaveWarehouse() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, draft }: { id: string | null; draft: WarehouseDraft }): Promise<string> => {
      const row = {
        name: draft.name.trim(), code: draft.code?.trim() || null, address: draft.address?.trim() || null, city: draft.city?.trim() || null,
        country: draft.country || null, serves_countries: draft.serves_countries, priority: draft.priority, is_default: draft.is_default,
        is_active: draft.is_active, notes: draft.notes?.trim() || null,
      };
      if (id) {
        const { error } = await sb.from("warehouses").update(row).eq("id", id);
        if (error) throw error;
        return id;
      }
      const { data, error } = await sb.from("warehouses").insert(row).select("id").single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteWarehouse() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("warehouses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export type SlotScope = "all" | "managed" | "unmanaged" | "low" | "warehouse";
export type WarehouseSlot = {
  product_id: string; variation_id: string | null; size_id: string | null; product_name: string | null; product_image: string | null;
  variation_name: string | null; size_label: string | null; sku: string | null; stock: number; managed: boolean; per_warehouse: Record<string, number>;
};
export type SlotFilters = { q: string; scope: SlotScope; warehouseId?: string | null; productId?: string | null; page: number; pageSize: number };

export function useWarehouseSlots(f: SlotFilters) {
  return useQuery({
    queryKey: ["warehouse-slots", f],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<{ rows: WarehouseSlot[]; total: number }> => {
      const { data, error } = await sb.rpc("admin_warehouse_slots", {
        _q: f.q.trim() || null, _scope: f.scope, _warehouse_id: f.warehouseId ?? null, _product_id: f.productId ?? null,
        _limit: f.pageSize, _offset: (f.page - 1) * f.pageSize,
      });
      if (error) throw error;
      const rows = (data ?? []) as any[];
      return {
        rows: rows.map((r) => ({ ...r, stock: Number(r.stock) || 0, per_warehouse: r.per_warehouse ?? {} })),
        total: rows.length ? Number(rows[0].total_count) : 0,
      };
    },
  });
}

type SlotArgs = { productId: string; variationId: string | null; sizeId: string | null };

export function useWarehouseSet() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (a: SlotArgs & { warehouseId: string; mode: "set" | "add"; value: number; reason: WarehouseReason; note: string }) => {
      const { data, error } = await sb.rpc("admin_warehouse_set", {
        _warehouse_id: a.warehouseId, _product_id: a.productId, _variation_id: a.variationId, _size_id: a.sizeId,
        _mode: a.mode, _value: a.value, _reason: a.reason, _note: a.note.trim() || null,
      });
      if (error) throw error;
      return Number(data);
    },
    onSuccess: invalidate,
  });
}

export function useWarehouseTransfer() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (a: SlotArgs & { from: string; to: string; quantity: number; note: string }) => {
      const { error } = await sb.rpc("admin_warehouse_transfer", {
        _from: a.from, _to: a.to, _product_id: a.productId, _variation_id: a.variationId, _size_id: a.sizeId,
        _quantity: a.quantity, _note: a.note.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useWarehouseLoad() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (a: { warehouseId: string; productId?: string | null }) => {
      const { data, error } = await sb.rpc("admin_warehouse_load", { _warehouse_id: a.warehouseId, _product_id: a.productId ?? null });
      if (error) throw error;
      return Number(data);
    },
    onSuccess: invalidate,
  });
}

export type WarehouseMove = {
  id: number; created_at: string; kind: "adjust" | "transfer" | "load"; from_warehouse: string | null; to_warehouse: string | null;
  product_id: string; product_name: string | null; variation_name: string | null; size_label: string | null;
  quantity_before: number | null; quantity_after: number | null; quantity: number; reason: string | null; note: string | null; actor_email: string | null;
};

export function useWarehouseMoves(warehouseId: string | null, page: number, pageSize = 25) {
  return useQuery({
    queryKey: ["warehouse-moves", warehouseId, page, pageSize],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<{ rows: WarehouseMove[]; total: number }> => {
      const { data, error } = await sb.rpc("admin_warehouse_moves", { _warehouse_id: warehouseId, _limit: pageSize, _offset: (page - 1) * pageSize });
      if (error) throw error;
      const rows = (data ?? []) as any[];
      return { rows: rows.map((r) => ({ ...r, quantity: Number(r.quantity) })), total: rows.length ? Number(rows[0].total_count) : 0 };
    },
  });
}

export type OrderAllocation = {
  warehouse_id: string; warehouse_name: string; warehouse_code: string | null; warehouse_city: string | null;
  product_id: string; product_name: string | null; variation_name: string | null; size_label: string | null; quantity: number;
};

export function useOrderAllocations(orderId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["warehouse-allocations", orderId],
    enabled: enabled && !!orderId,
    queryFn: async (): Promise<OrderAllocation[]> => {
      const { data, error } = await sb.rpc("admin_order_allocations", { _order_id: orderId });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({ ...r, quantity: Number(r.quantity) }));
    },
  });
}
