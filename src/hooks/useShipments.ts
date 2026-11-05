// =============================================================================================
// Envios parciais (recurso partial_shipments). Regras e contas em src/lib/shipments.ts; escrita só pelas funções
// admin_save_shipment / admin_delete_shipment (migration 20261007080000_order_shipments.sql).
//   useOrderShipments(orderId)   remessas do pedido com os itens (Admin e conta do cliente, pela RLS)
//   useSaveShipment / useDeleteShipment   Admin
// =============================================================================================
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { normalizeShipments, type Shipment, type ShipmentItem, type ShipmentStatus } from "@/lib/shipments";

const sb = supabase as any;
const key = (orderId: string | null | undefined) => ["order-shipments", orderId ?? ""] as const;

export function useOrderShipments(orderId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: key(orderId),
    enabled: enabled && !!orderId,
    staleTime: 30_000,
    queryFn: async (): Promise<Shipment[]> => {
      const { data, error } = await sb
        .from("order_shipments")
        .select("id,order_id,number,status,carrier,tracking_code,tracking_url,note,shipped_at,delivered_at,created_at,order_shipment_items(order_item_id,quantity)")
        .eq("order_id", orderId)
        .order("number");
      // Tabela ainda não criada (migration por aplicar) = sem remessas.
      if (error) return [];
      return normalizeShipments(data);
    },
  });
}

export type SaveShipmentInput = {
  orderId: string;
  shipmentId?: string | null;
  /** null ao alterar = mantém os itens. */
  items: ShipmentItem[] | null;
  status: ShipmentStatus;
  carrier?: string | null;
  trackingCode?: string | null;
  trackingUrl?: string | null;
  note?: string | null;
};

const CODES = ["not_allowed", "feature_off", "order_not_found", "order_closed", "shipment_not_found", "no_items", "invalid_item", "too_many", "invalid_status"];
const codeOf = (message: string | undefined) => CODES.find((c) => String(message ?? "").includes(c)) ?? "unknown";

export function useSaveShipment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: SaveShipmentInput) => {
      const { data, error } = await sb.rpc("admin_save_shipment", {
        _order_id: v.orderId,
        _shipment_id: v.shipmentId ?? null,
        _items: v.items,
        _status: v.status,
        _carrier: v.carrier ?? null,
        _tracking_code: v.trackingCode ?? null,
        _tracking_url: v.trackingUrl ?? null,
        _note: v.note ?? null,
      });
      if (error) throw new Error(codeOf(error.message));
      return data as string;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: key(v.orderId) });
      qc.invalidateQueries({ queryKey: ["allOrders"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}

export function useDeleteShipment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; orderId: string }) => {
      const { error } = await sb.rpc("admin_delete_shipment", { _shipment_id: id });
      if (error) throw new Error(codeOf(error.message));
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: key(v.orderId) });
      qc.invalidateQueries({ queryKey: ["allOrders"] });
    },
  });
}
