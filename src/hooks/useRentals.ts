// =============================================================================================
// Aluguel (recurso rentals). Regras e contas em src/lib/rentals.ts; reservas só nascem do pedido (trigger
// order_items_rental) e só mudam no Admin pela função admin_rental_update (migration 20261007100000_rentals.sql).
//   useRentalRules            { on, settings }: recurso ligado e store_settings.rentals
//   useProductRental(id)      configuração ativa do produto (página do produto); null = venda normal
//   useRentalFree(...)        unidades livres entre duas datas (rental_free_units)
//   Admin: useAdminRentals, useAdminRentalUpdate, useSaveRentalSettings, useAdminProductRental, useSaveProductRental,
//          useDeleteProductRental
// =============================================================================================
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFeature } from "@/hooks/useFeatures";
import { normalizeRentalProduct, normalizeRentalSettings, type BookingStatus, type RentalProduct, type RentalSettings } from "@/lib/rentals";

const sb = supabase as any;
const SETTINGS_KEY = ["store-settings", "rentals"] as const;

export function useRentalRules() {
  const on = useFeature("rentals");
  const q = useQuery({
    queryKey: SETTINGS_KEY,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ settings: RentalSettings; raw: Record<string, unknown> }> => {
      const { data } = await sb.from("store_settings").select("value").eq("key", "rentals").maybeSingle();
      const raw = data?.value && typeof data.value === "object" ? data.value : {};
      return { settings: normalizeRentalSettings(raw), raw };
    },
  });
  return { on, settings: q.data?.settings ?? normalizeRentalSettings({}), raw: q.data?.raw ?? {}, isLoading: q.isLoading };
}

export function useSaveRentalSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ next, raw }: { next: RentalSettings; raw: Record<string, unknown> }) => {
      const { error } = await sb.from("store_settings").upsert({ key: "rentals", value: { ...raw, ...next } }, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: SETTINGS_KEY }),
  });
}

export function useProductRental(productId: string | null | undefined): RentalProduct | null {
  const on = useFeature("rentals");
  const q = useQuery({
    queryKey: ["product-rental", productId ?? ""],
    enabled: on && !!productId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<RentalProduct | null> => {
      const { data, error } = await sb.from("product_rentals").select("*").eq("product_id", productId).eq("is_active", true).maybeSingle();
      if (error || !data) return null;
      return normalizeRentalProduct(data);
    },
  });
  return on ? q.data ?? null : null;
}

export function useRentalFree(productId: string | null | undefined, start: string, end: string, enabled: boolean) {
  return useQuery({
    queryKey: ["rental-free", productId ?? "", start, end],
    enabled: enabled && !!productId && !!start && !!end,
    staleTime: 30_000,
    queryFn: async (): Promise<number> => {
      const { data, error } = await sb.rpc("rental_free_units", { _product_id: productId, _start: start, _end: end });
      if (error) throw error;
      return Number(data) || 0;
    },
  });
}

/* ---------- Admin ---------- */

export type RentalBookingRow = {
  id: string;
  order_id: string | null;
  product_id: string | null;
  user_id: string | null;
  start_date: string;
  end_date: string;
  quantity: number;
  status: BookingStatus;
  deposit: number;
  picked_up_at: string | null;
  returned_at: string | null;
  notes: string | null;
  created_at: string;
  products: { id: string; name: string; image: string | null } | null;
  orders: { id: string; status: string; total: number; manual_customer_name: string | null; shipping_address: any } | null;
  customer: { full_name: string | null; email: string | null } | null;
};

export function useAdminRentals() {
  return useQuery({
    queryKey: ["admin-rentals"],
    queryFn: async (): Promise<RentalBookingRow[]> => {
      const { data, error } = await sb.from("rental_bookings")
        .select("id,order_id,product_id,user_id,start_date,end_date,quantity,status,deposit,picked_up_at,returned_at,notes,created_at,products(id,name,image),orders(id,status,total,manual_customer_name,shipping_address)")
        .order("start_date", { ascending: true }).limit(3000);
      if (error) throw error;
      const rows = data ?? [];
      // Nome e e-mail pela mesma RPC da lista de clientes (admin_list_customers, só para administradores).
      const { data: customers } = rows.length ? await sb.rpc("admin_list_customers") : { data: [] };
      const byId = new Map((customers ?? []).map((p: any) => [p.user_id, p]));
      return rows.map((r: any) => {
        const p: any = r.user_id ? byId.get(r.user_id) : null;
        const fallback = r.orders?.manual_customer_name || r.orders?.shipping_address?.name || null;
        return { ...r, deposit: Number(r.deposit) || 0, customer: p ? { full_name: p.full_name ?? fallback, email: p.email ?? null } : fallback ? { full_name: fallback, email: null } : null };
      });
    },
  });
}

const CODES = ["not_allowed", "not_found", "invalid_status", "invalid_dates", "unavailable"];
const codeOf = (m: unknown) => CODES.find((c) => String(m ?? "").includes(c)) ?? "unknown";

export function useAdminRentalUpdate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; status: BookingStatus; start?: string | null; end?: string | null; notes?: string | null }) => {
      const { error } = await sb.rpc("admin_rental_update", { _id: v.id, _status: v.status, _start: v.start || null, _end: v.end || null, _notes: v.notes ?? null });
      if (error) throw new Error(codeOf(error.message));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-rentals"] });
      qc.invalidateQueries({ queryKey: ["rental-free"] });
    },
  });
}

export function useAdminProductRental(productId: string | null | undefined) {
  return useQuery({
    queryKey: ["admin-product-rental", productId ?? ""],
    enabled: !!productId,
    queryFn: async (): Promise<RentalProduct | null> => {
      const { data, error } = await sb.from("product_rentals").select("*").eq("product_id", productId).maybeSingle();
      if (error) throw error;
      return data ? normalizeRentalProduct(data) : null;
    },
  });
}

export function useSaveProductRental() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (r: RentalProduct) => {
      const { error } = await sb.from("product_rentals").upsert({
        product_id: r.product_id, is_active: r.is_active, unit: r.unit, min_periods: r.min_periods, max_periods: r.max_periods,
        units: r.units, deposit: r.deposit, updated_at: new Date().toISOString(),
      }, { onConflict: "product_id" });
      if (error) throw error;
    },
    onSuccess: (_d, r) => {
      qc.invalidateQueries({ queryKey: ["admin-product-rental", r.product_id] });
      qc.invalidateQueries({ queryKey: ["product-rental", r.product_id] });
    },
  });
}

export function useDeleteProductRental() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (productId: string) => {
      const { error } = await sb.from("product_rentals").delete().eq("product_id", productId);
      if (error) throw error;
    },
    onSuccess: (_d, productId) => {
      qc.invalidateQueries({ queryKey: ["admin-product-rental", productId] });
      qc.invalidateQueries({ queryKey: ["product-rental", productId] });
    },
  });
}
