// =============================================================================================
// Assinaturas (recurso subscriptions). Regras e datas em src/lib/subscriptions.ts; escrita do cliente e do Admin só
// pelas funções my_subscription_action / admin_subscription_update (migration 20261007090000_subscriptions.sql).
//   useSubscriptionRules       { on, settings }: recurso ligado e store_settings.subscriptions
//   useProductPlans(id)        planos ativos do produto (página do produto)
//   useMySubscriptions()       assinaturas do cliente, com o produto (conta)
//   useSubscriptionAction()    pausar, retomar, pular, cancelar (conta)
//   Admin: useAdminSubscriptions, useAdminSubscription, useSubscriptionOrders, useAdminSubscriptionUpdate,
//          useSaveSubscriptionSettings, useAdminPlans, useSavePlan, useDeletePlan
// =============================================================================================
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFeature } from "@/hooks/useFeatures";
import { activePlans, normalizePlan, normalizeSubscriptionSettings, type SubscriptionPlan, type SubscriptionSettings, type SubscriptionStatus, type IntervalUnit } from "@/lib/subscriptions";

const sb = supabase as any;
const SETTINGS_KEY = ["store-settings", "subscriptions"] as const;

export type SubscriptionRow = {
  id: string;
  user_id: string;
  product_id: string | null;
  plan_id: string | null;
  quantity: number;
  options: { variation?: string; size?: string };
  interval_unit: IntervalUnit;
  interval_count: number;
  discount_percent: number;
  min_cycles: number;
  status: SubscriptionStatus;
  next_date: string | null;
  cycles_done: number;
  origin_order_id: string | null;
  last_order_id: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  products?: { id: string; name: string; slug: string | null; image: string | null; price: number; vat_rate: number | null } | null;
};

const SUB_COLS = "id,user_id,product_id,plan_id,quantity,options,interval_unit,interval_count,discount_percent,min_cycles,status,next_date,cycles_done,origin_order_id,last_order_id,cancelled_at,cancel_reason,created_at,products(id,name,slug,image,price,vat_rate)";
const toRow = (r: any): SubscriptionRow => ({ ...r, discount_percent: Number(r.discount_percent) || 0, options: r.options && typeof r.options === "object" ? r.options : {} });

export function useSubscriptionRules() {
  const on = useFeature("subscriptions");
  const q = useQuery({
    queryKey: SETTINGS_KEY,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ settings: SubscriptionSettings; raw: Record<string, unknown> }> => {
      const { data } = await sb.from("store_settings").select("value").eq("key", "subscriptions").maybeSingle();
      const raw = data?.value && typeof data.value === "object" ? data.value : {};
      return { settings: normalizeSubscriptionSettings(raw), raw };
    },
  });
  return { on, settings: q.data?.settings ?? normalizeSubscriptionSettings({}), raw: q.data?.raw ?? {}, isLoading: q.isLoading };
}

export function useSaveSubscriptionSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ next, raw }: { next: SubscriptionSettings; raw: Record<string, unknown> }) => {
      const { error } = await sb.from("store_settings").upsert({ key: "subscriptions", value: { ...raw, ...next } }, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: SETTINGS_KEY }),
  });
}

export function useProductPlans(productId: string | null | undefined) {
  const on = useFeature("subscriptions");
  const q = useQuery({
    queryKey: ["subscription-plans", productId ?? ""],
    enabled: on && !!productId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<SubscriptionPlan[]> => {
      const { data, error } = await sb.from("product_subscription_plans").select("*").eq("product_id", productId).eq("is_active", true);
      if (error) return [];
      return activePlans((data ?? []).map(normalizePlan), String(productId));
    },
  });
  return on ? q.data ?? [] : [];
}

export function useMySubscriptions(enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-subscriptions", user?.id ?? ""],
    enabled: enabled && !!user?.id,
    queryFn: async (): Promise<SubscriptionRow[]> => {
      const { data, error } = await sb.from("subscriptions").select(SUB_COLS).eq("user_id", user!.id).order("created_at", { ascending: false });
      if (error) return [];
      return (data ?? []).map(toRow);
    },
  });
}

const CODES = ["not_found", "feature_off", "not_allowed", "min_cycles", "invalid_action", "invalid_quantity"];
const codeOf = (m: unknown) => CODES.find((c) => String(m ?? "").includes(c)) ?? "unknown";

export function useSubscriptionAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "pause" | "resume" | "skip" | "cancel" }) => {
      const { error } = await sb.rpc("my_subscription_action", { _id: id, _action: action });
      if (error) throw new Error(codeOf(error.message));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-subscriptions"] }),
  });
}

/* ---------- Admin ---------- */

export type AdminSubscriptionRow = SubscriptionRow & { customer: { full_name: string | null; email: string | null } | null };

export function useAdminSubscriptions() {
  return useQuery({
    queryKey: ["admin-subscriptions"],
    queryFn: async (): Promise<AdminSubscriptionRow[]> => {
      const { data, error } = await sb.from("subscriptions").select(SUB_COLS).order("created_at", { ascending: false }).limit(2000);
      if (error) throw error;
      const rows = (data ?? []).map(toRow);
      // Nome e e-mail pela mesma RPC da lista de clientes (admin_list_customers, só para administradores).
      const { data: customers } = rows.length ? await sb.rpc("admin_list_customers") : { data: [] };
      const byId = new Map((customers ?? []).map((p: any) => [p.user_id, p]));
      return rows.map((r: SubscriptionRow) => {
        const p: any = byId.get(r.user_id);
        return { ...r, customer: p ? { full_name: p.full_name ?? null, email: p.email ?? null } : null };
      });
    },
  });
}

export type SubscriptionOrderRow = { order_id: string; cycle: number; created_at: string; orders: { id: string; status: string; total: number; created_at: string } | null };

export function useSubscriptionOrders(subscriptionId: string | null | undefined) {
  return useQuery({
    queryKey: ["subscription-orders", subscriptionId ?? ""],
    enabled: !!subscriptionId,
    queryFn: async (): Promise<SubscriptionOrderRow[]> => {
      const { data, error } = await sb.from("subscription_orders").select("order_id,cycle,created_at,orders(id,status,total,created_at)")
        .eq("subscription_id", subscriptionId).order("cycle", { ascending: false });
      if (error) return [];
      return data ?? [];
    },
  });
}

export function useAdminSubscriptionUpdate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; status: SubscriptionStatus; nextDate: string | null; quantity: number; reason?: string | null }) => {
      const { error } = await sb.rpc("admin_subscription_update", { _id: v.id, _status: v.status, _next_date: v.nextDate, _quantity: v.quantity, _reason: v.reason ?? null });
      if (error) throw new Error(codeOf(error.message));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-subscriptions"] }),
  });
}

export function useAdminPlans(productId: string | null | undefined) {
  return useQuery({
    queryKey: ["admin-subscription-plans", productId ?? ""],
    enabled: !!productId,
    queryFn: async (): Promise<SubscriptionPlan[]> => {
      const { data, error } = await sb.from("product_subscription_plans").select("*").eq("product_id", productId).order("display_order").order("created_at");
      if (error) throw error;
      return (data ?? []).map(normalizePlan);
    },
  });
}

export function useSavePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: Omit<SubscriptionPlan, "id"> & { id?: string }) => {
      const row = {
        product_id: p.product_id, interval_unit: p.interval_unit, interval_count: p.interval_count, discount_percent: p.discount_percent,
        min_cycles: p.min_cycles, is_active: p.is_active, display_order: p.display_order, updated_at: new Date().toISOString(),
      };
      const { error } = p.id
        ? await sb.from("product_subscription_plans").update(row).eq("id", p.id)
        : await sb.from("product_subscription_plans").insert(row);
      if (error) throw error;
    },
    onSuccess: (_d, p) => {
      qc.invalidateQueries({ queryKey: ["admin-subscription-plans", p.product_id] });
      qc.invalidateQueries({ queryKey: ["subscription-plans", p.product_id] });
    },
  });
}

export function useDeletePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; productId: string }) => {
      const { error } = await sb.from("product_subscription_plans").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["admin-subscription-plans", v.productId] });
      qc.invalidateQueries({ queryKey: ["subscription-plans", v.productId] });
    },
  });
}
