// =============================================================================================
// Marketplace com vendedores. Regras em src/lib/marketplace.ts; dados:
//   Loja       useMarketplaceSettings, usePublicVendors (vista vendors_public), useApplyVendor + useMyApplication (/vender)
//   Vendedor   useMyVendor (my_vendor), useVendorOrders, useVendorProducts, useVendorSetStock, useMyPayouts
//   Admin      useAdminVendors (+ admin_vendor_stats), useAdminVendorProducts, useSaveVendor, useDeleteVendor, useVendorMembers, useAddVendorMember,
//              useRemoveVendorMember, useVendorLedger, useVendorPayouts, useSavePayout, useDeletePayout,
//              useVendorApplications, useDecideApplication, useSaveMarketplaceSettings
// =============================================================================================
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFeature } from "@/hooks/useFeatures";
import {
  normalizeMarketplaceSettings, normalizeTotals, type MarketplaceSettings, type PublicVendor, type Vendor, type VendorTotals,
} from "@/lib/marketplace";

const sb = supabase as any;
const ADMIN_KEYS = ["admin-vendors", "admin-vendor-stats", "vendor-ledger", "vendor-payouts", "vendor-members", "vendor-applications", "public-vendors"];
function useInvalidate(keys = ADMIN_KEYS) {
  const qc = useQueryClient();
  return () => { for (const k of keys) qc.invalidateQueries({ queryKey: [k] }); };
}

/* ---------- Loja ---------- */

export function useMarketplaceSettings() {
  return useQuery({
    queryKey: ["marketplace-settings"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<MarketplaceSettings> => {
      const { data } = await sb.from("store_settings").select("value").eq("key", "marketplace").maybeSingle();
      return normalizeMarketplaceSettings(data?.value);
    },
  });
}

export function usePublicVendors(enabled = true) {
  const on = useFeature("marketplace");
  return useQuery({
    queryKey: ["public-vendors"],
    enabled: on && enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<PublicVendor[]> => {
      const { data, error } = await sb.from("vendors_public").select("id, slug, name, logo_url, description_i18n").order("name");
      if (error) throw error;
      return (data ?? []).map((v: any) => ({ ...v, description_i18n: v.description_i18n ?? {} }));
    },
  });
}

export type VendorApplication = {
  id: string; user_id: string | null; store_name: string; contact_name: string | null; email: string; phone: string | null; website: string | null;
  message: string | null; status: "new" | "approved" | "rejected"; admin_note: string | null; vendor_id: string | null; created_at: string; decided_at: string | null;
};

export function useMyApplication() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-vendor-application", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<VendorApplication | null> => {
      const { data } = await sb.from("vendor_applications").select("*").eq("user_id", user!.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      return data ?? null;
    },
  });
}

export function useApplyVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { store_name: string; contact_name: string; email: string; phone: string; website: string; message: string }) => {
      const { error } = await sb.rpc("request_vendor_application", {
        _store_name: a.store_name, _contact_name: a.contact_name, _email: a.email, _phone: a.phone, _website: a.website, _message: a.message,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-vendor-application"] }),
  });
}

/* ---------- Vendedor ---------- */

export type MyVendor = { id: string; slug: string; name: string; logo_url: string | null; commission_percent: number; totals: VendorTotals };

export function useMyVendor() {
  const { user } = useAuth();
  const on = useFeature("marketplace");
  return useQuery({
    queryKey: ["my-vendor", user?.id],
    enabled: on && !!user,
    queryFn: async (): Promise<MyVendor | null> => {
      const { data, error } = await sb.rpc("my_vendor");
      if (error || !data) return null;
      return { ...data, commission_percent: Number(data.commission_percent), totals: normalizeTotals(data.totals) };
    },
  });
}

export type VendorOrderItem = { name: string | null; quantity: number; gross: number; net: number; status: string; size: string | null; variation: string | null };
export type VendorOrder = {
  order_id: string; created_at: string; status: string; tracking_number: string | null; active: boolean;
  ship_to: Record<string, string> | null; items: VendorOrderItem[]; gross: number; commission: number; net: number;
};

export function useVendorOrders(page: number, pageSize = 10, enabled = true) {
  return useQuery({
    queryKey: ["vendor-orders", page, pageSize],
    enabled,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<{ rows: VendorOrder[]; total: number }> => {
      const { data, error } = await sb.rpc("vendor_orders", { _limit: pageSize, _offset: (page - 1) * pageSize });
      if (error) throw error;
      const rows = (data ?? []) as any[];
      return {
        rows: rows.map((r) => ({ ...r, gross: Number(r.gross), commission: Number(r.commission), net: Number(r.net), items: r.items ?? [] })),
        total: rows.length ? Number(rows[0].total_count) : 0,
      };
    },
  });
}

export type VendorProductPart = { variation_id: string | null; size_id: string | null; label: string; stock: number };
export type VendorProduct = { id: string; name: string; image: string | null; sku: string | null; price: number; is_active: boolean; stock: number | null; parts: VendorProductPart[]; sold_30d: number };

export function useVendorProducts(enabled = true) {
  return useQuery({
    queryKey: ["vendor-products"],
    enabled,
    queryFn: async (): Promise<VendorProduct[]> => {
      const { data, error } = await sb.rpc("vendor_products");
      if (error) throw error;
      return (data ?? []).map((r: any) => ({ ...r, price: Number(r.price), sold_30d: Number(r.sold_30d), parts: r.parts ?? [] }));
    },
  });
}

export function useVendorSetStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { productId: string; variationId: string | null; sizeId: string | null; value: number }) => {
      const { error } = await sb.rpc("vendor_set_stock", { _product_id: a.productId, _variation_id: a.variationId, _size_id: a.sizeId, _value: a.value });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vendor-products"] }),
  });
}

export type VendorPayout = { id: string; vendor_id: string; amount: number; paid_at: string; method: string | null; reference: string | null; note: string | null; created_at: string };

export function useMyPayouts(vendorId: string | null) {
  return useQuery({
    queryKey: ["vendor-payouts", vendorId],
    enabled: !!vendorId,
    queryFn: async (): Promise<VendorPayout[]> => {
      const { data, error } = await sb.from("vendor_payouts").select("*").eq("vendor_id", vendorId).order("paid_at", { ascending: false }).limit(50);
      if (error) throw error;
      return (data ?? []).map((p: any) => ({ ...p, amount: Number(p.amount) }));
    },
  });
}
export const useVendorPayouts = useMyPayouts;

/* ---------- Admin ---------- */

export type AdminVendor = Vendor & { created_at: string; totals: VendorTotals };

export function useAdminVendors() {
  return useQuery({
    queryKey: ["admin-vendors"],
    queryFn: async (): Promise<AdminVendor[]> => {
      const [v, s] = await Promise.all([sb.from("vendors").select("*").order("name"), sb.rpc("admin_vendor_stats")]);
      if (v.error) throw v.error;
      const stats = new Map<string, VendorTotals>(((s.data ?? []) as any[]).map((r) => [r.vendor_id, normalizeTotals(r.totals)]));
      return (v.data ?? []).map((r: any) => ({
        ...r, commission_percent: Number(r.commission_percent), description_i18n: r.description_i18n ?? {}, totals: stats.get(r.id) ?? normalizeTotals({}),
      }));
    },
  });
}

export type VendorDraft = Omit<Vendor, "id">;

export function useSaveVendor() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, draft }: { id: string | null; draft: VendorDraft }): Promise<string> => {
      const row = { ...draft, email: draft.email || null, phone: draft.phone || null, logo_url: draft.logo_url || null, notes: draft.notes || null };
      if (id) {
        const { error } = await sb.from("vendors").update(row).eq("id", id);
        if (error) throw error;
        return id;
      }
      const { data, error } = await sb.from("vendors").insert(row).select("id").single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteVendor() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("vendors").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export type VendorMember = { user_id: string; email: string; full_name: string | null; created_at: string };

export function useVendorMembers(vendorId: string | null) {
  return useQuery({
    queryKey: ["vendor-members", vendorId],
    enabled: !!vendorId,
    queryFn: async (): Promise<VendorMember[]> => {
      const { data, error } = await sb.rpc("admin_vendor_members", { _vendor_id: vendorId });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAddVendorMember() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (a: { vendorId: string; email: string }) => {
      const { error } = await sb.rpc("admin_vendor_add_member", { _vendor_id: a.vendorId, _email: a.email.trim() });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useRemoveVendorMember() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await sb.from("vendor_members").delete().eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export type LedgerRow = {
  id: number; created_at: string; vendor_id: string; vendor_name: string; order_id: string; order_status: string; product_id: string | null;
  product_name: string | null; quantity: number; gross: number; commission_percent: number; commission: number; net: number; status: "active" | "cancelled";
};

export function useVendorLedger(vendorId: string | null, page: number, pageSize = 25) {
  return useQuery({
    queryKey: ["vendor-ledger", vendorId, page, pageSize],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<{ rows: LedgerRow[]; total: number }> => {
      const { data, error } = await sb.rpc("admin_vendor_ledger", { _vendor_id: vendorId, _limit: pageSize, _offset: (page - 1) * pageSize });
      if (error) throw error;
      const rows = (data ?? []) as any[];
      return {
        rows: rows.map((r) => ({ ...r, gross: Number(r.gross), commission: Number(r.commission), net: Number(r.net), commission_percent: Number(r.commission_percent) })),
        total: rows.length ? Number(rows[0].total_count) : 0,
      };
    },
  });
}

export function useSavePayout() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (p: { vendor_id: string; amount: number; paid_at: string; method: string; reference: string; note: string }) => {
      const { error } = await sb.from("vendor_payouts").insert({
        vendor_id: p.vendor_id, amount: p.amount, paid_at: p.paid_at, method: p.method.trim() || null, reference: p.reference.trim() || null, note: p.note.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useDeletePayout() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("vendor_payouts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useVendorApplications() {
  return useQuery({
    queryKey: ["vendor-applications"],
    queryFn: async (): Promise<VendorApplication[]> => {
      const { data, error } = await sb.from("vendor_applications").select("*").order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useDecideApplication() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (a: { id: string; approve: boolean; note: string }): Promise<string | null> => {
      const { data, error } = await sb.rpc("admin_vendor_application_decide", { _id: a.id, _approve: a.approve, _note: a.note.trim() || null });
      if (error) throw error;
      return data ?? null;
    },
    onSuccess: invalidate,
  });
}

export function useSaveMarketplaceSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (next: MarketplaceSettings) => {
      const { error } = await sb.from("store_settings").upsert({ key: "marketplace", value: next }, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["marketplace-settings"] }),
  });
}

export type AdminVendorProduct = { id: string; name: string; image: string | null; price: number; is_active: boolean };

/** Produtos ligados a um vendedor (página do vendedor no Admin). */
export function useAdminVendorProducts(vendorId: string | null) {
  return useQuery({
    queryKey: ["admin-vendor-products", vendorId],
    enabled: !!vendorId,
    queryFn: async (): Promise<AdminVendorProduct[]> => {
      const { data, error } = await sb.from("products").select("id, name, image, price, is_active").eq("vendor_id", vendorId).order("name").limit(200);
      if (error) throw error;
      return (data ?? []).map((p: any) => ({ ...p, price: Number(p.price) }));
    },
  });
}
