// =============================================================================================
// Afiliados. Regras em src/lib/affiliates.ts; dados:
//   Loja       useAffiliateSettings, useApplyAffiliate (/afiliados)
//   Parceiro   useMyAffiliate (my_affiliate), useMyAffiliateOrders, useMyAffiliatePayouts, useSavePayoutInfo
//   Admin      useAdminAffiliates (+ admin_affiliate_stats e admin_affiliate_accounts), useSaveAffiliate,
//              useDeleteAffiliate, useLinkAffiliateUser, useAffiliateLedger, useAffiliatePayouts, useSaveAffiliatePayout,
//              useDeleteAffiliatePayout, useDecideAffiliate, useSaveAffiliateSettings
// =============================================================================================
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFeature } from "@/hooks/useFeatures";
import {
  normalizeAffiliateSettings, normalizeAffiliateTotals, type Affiliate, type AffiliateSettings, type AffiliateStatus, type AffiliateTotals,
} from "@/lib/affiliates";

const sb = supabase as any;
const ADMIN_KEYS = ["admin-affiliates", "affiliate-ledger", "affiliate-payouts", "my-affiliate"];
function useInvalidate(keys = ADMIN_KEYS) {
  const qc = useQueryClient();
  return () => { for (const k of keys) qc.invalidateQueries({ queryKey: [k] }); };
}

/* ---------- Loja ---------- */

export const AFFILIATE_SETTINGS_KEY = ["affiliate-settings"] as const;

export function useAffiliateSettings() {
  return useQuery({
    queryKey: AFFILIATE_SETTINGS_KEY,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<AffiliateSettings> => {
      const { data } = await sb.from("store_settings").select("value").eq("key", "affiliates").maybeSingle();
      return normalizeAffiliateSettings(data?.value);
    },
  });
}

export function useApplyAffiliate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { name: string; email: string; phone: string; website: string; message: string }) => {
      const { error } = await sb.rpc("request_affiliate", { _name: a.name, _email: a.email, _phone: a.phone, _website: a.website, _message: a.message });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-affiliate"] }),
  });
}

/* ---------- Parceiro ---------- */

export type MyAffiliate = {
  id: string; code: string; name: string; status: AffiliateStatus; commission_percent: number; payout_info: string | null;
  admin_note: string | null; created_at: string; totals: AffiliateTotals | null;
};

export function useMyAffiliate() {
  const { user } = useAuth();
  const on = useFeature("affiliates");
  return useQuery({
    queryKey: ["my-affiliate", user?.id],
    enabled: on && !!user,
    queryFn: async (): Promise<MyAffiliate | null> => {
      const { data, error } = await sb.rpc("my_affiliate");
      if (error || !data) return null;
      return { ...data, commission_percent: Number(data.commission_percent), totals: data.totals ? normalizeAffiliateTotals(data.totals) : null };
    },
  });
}

export type AffiliateOrder = {
  id: number; created_at: string; order_ref: string; order_status: string; base: number; commission_percent: number; commission: number; status: "active" | "cancelled";
};

export function useMyAffiliateOrders(page: number, pageSize = 10, enabled = true) {
  return useQuery({
    queryKey: ["my-affiliate-orders", page, pageSize],
    enabled,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<{ rows: AffiliateOrder[]; total: number }> => {
      const { data, error } = await sb.rpc("my_affiliate_orders", { _limit: pageSize, _offset: (page - 1) * pageSize });
      if (error) throw error;
      const rows = (data ?? []) as any[];
      return {
        rows: rows.map((r) => ({ ...r, base: Number(r.base), commission: Number(r.commission), commission_percent: Number(r.commission_percent) })),
        total: rows.length ? Number(rows[0].total_count) : 0,
      };
    },
  });
}

export type AffiliatePayout = { id: string; affiliate_id: string; amount: number; paid_at: string; method: string | null; reference: string | null; note: string | null; created_at: string };

export function useAffiliatePayouts(affiliateId: string | null) {
  return useQuery({
    queryKey: ["affiliate-payouts", affiliateId],
    enabled: !!affiliateId,
    queryFn: async (): Promise<AffiliatePayout[]> => {
      const { data, error } = await sb.from("affiliate_payouts").select("*").eq("affiliate_id", affiliateId).order("paid_at", { ascending: false }).limit(50);
      if (error) throw error;
      return (data ?? []).map((p: any) => ({ ...p, amount: Number(p.amount) }));
    },
  });
}

export function useSavePayoutInfo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (info: string) => {
      const { error } = await sb.rpc("my_affiliate_payout_info", { _info: info });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-affiliate"] }),
  });
}

/* ---------- Admin ---------- */

export type AdminAffiliate = Affiliate & { totals: AffiliateTotals; account_email: string | null };

export function useAdminAffiliates() {
  return useQuery({
    queryKey: ["admin-affiliates"],
    queryFn: async (): Promise<AdminAffiliate[]> => {
      const [a, s, acc] = await Promise.all([
        sb.from("affiliates").select("*").order("created_at", { ascending: false }),
        sb.rpc("admin_affiliate_stats"),
        sb.rpc("admin_affiliate_accounts"),
      ]);
      if (a.error) throw a.error;
      const stats = new Map<string, AffiliateTotals>(((s.data ?? []) as any[]).map((r) => [r.affiliate_id, normalizeAffiliateTotals(r.totals)]));
      const emails = new Map<string, string>(((acc.data ?? []) as any[]).map((r) => [r.affiliate_id, r.email]));
      return (a.data ?? []).map((r: any) => ({
        ...r, commission_percent: Number(r.commission_percent), totals: stats.get(r.id) ?? normalizeAffiliateTotals({}), account_email: emails.get(r.id) ?? null,
      }));
    },
  });
}

export type AffiliateDraft = Pick<Affiliate, "code" | "name" | "email" | "phone" | "website" | "commission_percent" | "status" | "payout_info" | "notes">;

export function useSaveAffiliate() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, draft }: { id: string | null; draft: AffiliateDraft }): Promise<string> => {
      if (id) {
        const { error } = await sb.from("affiliates").update(draft).eq("id", id);
        if (error) throw error;
        return id;
      }
      const { data, error } = await sb.from("affiliates").insert(draft).select("id").single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteAffiliate() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("affiliates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useLinkAffiliateUser() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (a: { affiliateId: string; email: string }) => {
      const { error } = await sb.rpc("admin_affiliate_link_user", { _affiliate_id: a.affiliateId, _email: a.email.trim() });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export type AffiliateLedgerRow = {
  id: number; created_at: string; affiliate_id: string; affiliate_name: string; order_id: string; order_status: string; order_total: number;
  base: number; commission_percent: number; commission: number; status: "active" | "cancelled";
};

export function useAffiliateLedger(affiliateId: string | null, page: number, pageSize = 25) {
  return useQuery({
    queryKey: ["affiliate-ledger", affiliateId, page, pageSize],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<{ rows: AffiliateLedgerRow[]; total: number }> => {
      const { data, error } = await sb.rpc("admin_affiliate_ledger", { _affiliate_id: affiliateId, _limit: pageSize, _offset: (page - 1) * pageSize });
      if (error) throw error;
      const rows = (data ?? []) as any[];
      return {
        rows: rows.map((r) => ({ ...r, base: Number(r.base), commission: Number(r.commission), commission_percent: Number(r.commission_percent), order_total: Number(r.order_total) })),
        total: rows.length ? Number(rows[0].total_count) : 0,
      };
    },
  });
}

export function useSaveAffiliatePayout() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (p: { affiliate_id: string; amount: number; paid_at: string; method: string; reference: string; note: string }) => {
      const { error } = await sb.from("affiliate_payouts").insert({
        affiliate_id: p.affiliate_id, amount: p.amount, paid_at: p.paid_at, method: p.method.trim() || null, reference: p.reference.trim() || null, note: p.note.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteAffiliatePayout() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("affiliate_payouts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useDecideAffiliate() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (a: { id: string; approve: boolean; note: string }) => {
      const { error } = await sb.rpc("admin_affiliate_decide", { _id: a.id, _approve: a.approve, _note: a.note.trim() || null });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useSaveAffiliateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (next: AffiliateSettings) => {
      const { error } = await sb.from("store_settings").upsert({ key: "affiliates", value: next }, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: AFFILIATE_SETTINGS_KEY }),
  });
}
