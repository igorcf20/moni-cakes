// =============================================================================================
// PunchOut. Regras em src/lib/punchout.ts; dados:
//   Loja    usePunchoutSession (sessão desta aba), punchoutCall (Edge Function punchout: open, return, cancel),
//           usePunchoutSend (envia ou cancela o carrinho: formulário para o sistema de compras, ou /punchout/teste)
//   Admin   usePunchoutStats, usePunchoutBuyers, useSavePunchoutBuyer, useDeletePunchoutBuyer, usePunchoutSessions,
//           usePunchoutOrders, useTestPunchoutSession
// =============================================================================================
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFeature } from "@/hooks/useFeatures";
import { useAuth } from "@/hooks/useAuth";
import { useCart } from "@/hooks/useCart";
import { useMessages } from "@/i18n";
import { punchoutMessages } from "@/i18n/punchout";
import {
  EMPTY_PUNCHOUT_STATS, PUNCHOUT_EVENT, punchoutErrorOf, readPunchout, buyerPayload, clearPunchout, submitToProcurement,
  type BuyerDraft, type PunchoutBuyer, type PunchoutError, type PunchoutSession, type PunchoutStats,
} from "@/lib/punchout";

const sb = supabase as any;

/* ---------- Loja ---------- */

/** Sessão PunchOut desta aba (null sem PunchOut ou com o recurso desligado). */
export function usePunchoutSession(): PunchoutSession | null {
  const on = useFeature("punchout");
  const [session, setSession] = useState<PunchoutSession | null>(() => readPunchout());
  useEffect(() => {
    const sync = () => setSession(readPunchout());
    window.addEventListener(PUNCHOUT_EVENT, sync);
    const timer = window.setInterval(sync, 60_000);
    return () => { window.removeEventListener(PUNCHOUT_EVENT, sync); window.clearInterval(timer); };
  }, []);
  return on ? session : null;
}

export type PunchoutOpen = {
  buyer: string; protocol: "cxml" | "oci"; operation: "create" | "edit" | "inspect"; test: boolean; expires_at: string; contact: string | null;
  items: { product_id: string; quantity: number; design_data?: Record<string, unknown> }[];
};

export type PunchoutReturn = {
  test: boolean; protocol: "cxml" | "oci"; url: string | null; fields: Record<string, string> | null;
  preview: string | Record<string, string> | null;
  summary: { lines: { name: string; sku: string; quantity: number; unit: number }[]; subtotal: number; tax: number; total: number; currency: string } | null;
};

/** Chama a função punchout; erro = Error(<código estável>). */
export async function punchoutCall<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("punchout", { body });
  if (error) {
    let code: PunchoutError = "server";
    try { code = punchoutErrorOf((await (error as any).context?.json?.())?.error); } catch { /* sem corpo */ }
    throw new Error(code);
  }
  if (data?.error) throw new Error(punchoutErrorOf(data.error));
  return data as T;
}

/**
 * Envia o carrinho ao sistema de compras (send) ou volta sem ele (cancel). O servidor calcula os preços da empresa;
 * aqui só se monta o formulário. Sessão de teste: mostra em /punchout/teste o que seria enviado.
 */
export function usePunchoutSend(session: PunchoutSession | null) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { cartItems, clearCart } = useCart(user?.id);
  const { t } = useMessages(punchoutMessages);
  const [busy, setBusy] = useState<null | "send" | "cancel">(null);

  const run = async (action: "return" | "cancel") => {
    if (!session || busy) return;
    setBusy(action === "return" ? "send" : "cancel");
    try {
      const items = (cartItems as any[]).filter((i) => !i._invalidReason).map((i) => ({ product_id: i.product_id, quantity: i.quantity, design_data: i.design_data ?? {} }));
      const res = await punchoutCall<PunchoutReturn>({ action, token: session.token, items: action === "return" ? items : [] });
      clearPunchout();
      clearCart();
      if (res.test) {
        if (action === "cancel") navigate("/admin?tab=punchout");
        else navigate("/punchout/teste", { state: { result: res, buyer: session.buyer } });
        setBusy(null);
        return;
      }
      if (res.url && res.fields) submitToProcurement(res.url, res.fields);
    } catch (e) {
      toast.error(t(`err_${punchoutErrorOf((e as Error)?.message)}`));
      setBusy(null);
    }
  };
  return { busy, send: () => run("return"), cancel: () => run("cancel") };
}

/* ---------- Admin ---------- */

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    for (const k of ["admin-punchout-stats", "admin-punchout-buyers", "admin-punchout-sessions", "admin-punchout-orders"]) qc.invalidateQueries({ queryKey: [k] });
  };
}

export function usePunchoutStats() {
  return useQuery({
    queryKey: ["admin-punchout-stats"],
    queryFn: async (): Promise<PunchoutStats> => {
      const { data, error } = await sb.rpc("admin_punchout_stats");
      if (error) throw error;
      const out = { ...EMPTY_PUNCHOUT_STATS };
      for (const k of Object.keys(out) as (keyof PunchoutStats)[]) out[k] = Number(data?.[k] ?? 0);
      return out;
    },
  });
}

const BUYER_COLS = "id,name,protocol,cxml_domain,cxml_identity,oci_username,has_secret,user_id,country_code,return_hosts,unspsc,accept_orders,shipping_fee,session_minutes,is_active,notes,last_used_at,created_at";

export function usePunchoutBuyers() {
  return useQuery({
    queryKey: ["admin-punchout-buyers"],
    queryFn: async (): Promise<PunchoutBuyer[]> => {
      const { data, error } = await sb.from("punchout_buyers").select(BUYER_COLS).order("name");
      if (error) throw error;
      return ((data ?? []) as any[]).map((b) => ({ ...b, shipping_fee: Number(b.shipping_fee ?? 0), return_hosts: b.return_hosts ?? [] }));
    },
  });
}

export function useSavePunchoutBuyer() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (a: { id: string | null; draft: BuyerDraft; secret: string }): Promise<string> => {
      const { data, error } = await sb.rpc("admin_save_punchout_buyer", { _id: a.id, _data: buyerPayload(a.draft), _secret: a.secret || null });
      if (error) throw error;
      return String(data);
    },
    onSuccess: invalidate,
  });
}

export function useDeletePunchoutBuyer() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("punchout_buyers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export type AdminPunchoutSession = {
  id: string; buyer_id: string; protocol: "cxml" | "oci"; operation: string; return_url: string | null; test: boolean; contact_name: string | null;
  contact_email: string | null; cart: { lines?: { name: string; sku: string; quantity: number; unit: number }[]; subtotal?: number; tax?: number } | null;
  cart_total: number | null; currency: string | null; status: string; created_at: string; opened_at: string | null; returned_at: string | null; expires_at: string;
};

export function usePunchoutSessions(buyerId?: string | null) {
  return useQuery({
    queryKey: ["admin-punchout-sessions", buyerId ?? null],
    queryFn: async (): Promise<AdminPunchoutSession[]> => {
      let q = sb.from("punchout_sessions")
        .select("id,buyer_id,protocol,operation,return_url,test,contact_name,contact_email,cart,cart_total,currency,status,created_at,opened_at,returned_at,expires_at");
      if (buyerId) q = q.eq("buyer_id", buyerId);
      const { data, error } = await q.order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return ((data ?? []) as any[]).map((s) => ({ ...s, cart_total: s.cart_total == null ? null : Number(s.cart_total) }));
    },
  });
}

export type AdminPunchoutOrder = {
  id: string; buyer_id: string; po_number: string; order_id: string | null; status: "created" | "rejected"; reason: string | null;
  po_total: number | null; store_total: number | null; currency: string | null; mismatch: boolean; lines: number; created_at: string;
};

export function usePunchoutOrders(buyerId?: string | null) {
  return useQuery({
    queryKey: ["admin-punchout-orders", buyerId ?? null],
    queryFn: async (): Promise<AdminPunchoutOrder[]> => {
      let q = sb.from("punchout_orders").select("*");
      if (buyerId) q = q.eq("buyer_id", buyerId);
      const { data, error } = await q.order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return ((data ?? []) as any[]).map((o) => ({
        ...o, po_total: o.po_total == null ? null : Number(o.po_total), store_total: o.store_total == null ? null : Number(o.store_total),
      }));
    },
  });
}

/** Sessão de teste: devolve o token para abrir /punchout/entrar?s=<token>. */
export function useTestPunchoutSession() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (buyerId: string): Promise<string> => {
      const { data, error } = await sb.rpc("admin_punchout_test_session", { _buyer: buyerId });
      if (error) throw error;
      return String(data);
    },
    onSuccess: invalidate,
  });
}
