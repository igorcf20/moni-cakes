// =====================================================================================
// Impressão de pedidos (recurso order_printing): regras (store_settings.order_print), fila (RPC admin_print_queue),
// registos de impressão (order_prints) e os pedidos já prontos para os documentos de src/lib/orderPrint.ts.
// =====================================================================================
import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/hooks/useBrand";
import { useStoreInfo } from "@/hooks/useStoreInfo";
import { useAdminFormat } from "@/hooks/useAdminList";
import { useAdminCustomers } from "@/hooks/useAdminRecords";
import { useMessages } from "@/i18n";
import { orderPrintMessages } from "@/i18n/orderPrint";
import { checkoutFieldsMessages } from "@/i18n/checkoutFields";
import { paymentMethodLabel, paymentStatusLabel } from "@/lib/orderStatusStyles";
import { localText, orderAnswerLines, answerText } from "@/lib/checkoutFields";
import {
  normalizeOrderPrint, orderCode, printAddress, resolveSender,
  type OrderPrintSettings, type PrintContext, type PrintDoc, type PrintOrder,
} from "@/lib/orderPrint";

const SETTINGS_KEY = ["store-setting", "order_print"] as const;

export function useOrderPrintSettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    staleTime: 60_000,
    queryFn: async (): Promise<OrderPrintSettings> => {
      const { data, error } = await supabase.from("store_settings").select("value").eq("key", "order_print").maybeSingle();
      if (error) throw error;
      return normalizeOrderPrint(data?.value);
    },
  });
}

export function useSaveOrderPrintSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (next: OrderPrintSettings) => {
      const { error } = await supabase.from("store_settings")
        .upsert({ key: "order_print", value: normalizeOrderPrint(next) as any }, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: SETTINGS_KEY });
      void qc.invalidateQueries({ queryKey: ["print-queue"] });
      void qc.invalidateQueries({ queryKey: ["admin-attention"] });
    },
  });
}

export type PrintQueueRow = { order_id: string; created_at: string; status: string; missing: PrintDoc[] };

/** Fila "para imprimir" (só administradores). Recarrega a cada 30 s para a impressão automática ver pedidos novos. */
export function usePrintQueue(enabled = true) {
  return useQuery({
    queryKey: ["print-queue"],
    enabled,
    refetchInterval: 30_000,
    queryFn: async (): Promise<PrintQueueRow[]> => {
      const { data, error } = await (supabase as any).rpc("admin_print_queue", { _limit: 300 });
      if (error) throw error;
      return (data ?? []) as PrintQueueRow[];
    },
  });
}

export type OrderPrintRow = { order_id: string; kind: PrintDoc; printed_at: string };

/** Últimas impressões de cada pedido (página do pedido e fila). */
export function useOrderPrints(orderIds: string[]) {
  const key = [...orderIds].sort().join(",");
  return useQuery({
    queryKey: ["order-prints", key],
    enabled: orderIds.length > 0,
    queryFn: async (): Promise<OrderPrintRow[]> => {
      const { data, error } = await (supabase as any).from("order_prints").select("order_id, kind, printed_at")
        .in("order_id", orderIds).order("printed_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as OrderPrintRow[];
    },
  });
}

/** Regista o documento como impresso; com advance, pedidos pagos passam para Em preparação (só a folha). */
export function useMarkPrinted() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, kind, advance }: { ids: string[]; kind: PrintDoc; advance?: boolean }) => {
      if (!ids.length) return { advanced: 0 };
      const { error } = await (supabase as any).from("order_prints").insert(ids.map((order_id) => ({ order_id, kind })));
      if (error) throw error;
      let advanced = 0;
      if (advance && kind === "sheet") {
        const { data } = await supabase.from("orders").update({ status: "preparing" } as any)
          .in("id", ids).eq("status", "paid").select("id");
        const moved = (data ?? []).map((r: any) => r.id as string);
        advanced = moved.length;
        if (moved.length) {
          await supabase.from("order_status_history").insert(moved.map((order_id) => ({ order_id, status: "preparing" })) as any);
          try {
            const { notifyOrderStatusChange } = await import("@/lib/notifyOrderEmail");
            for (const id of moved) notifyOrderStatusChange(id, "preparing").catch(() => {});
          } catch { /* e-mails desligados */ }
        }
      }
      return { advanced };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["print-queue"] });
      void qc.invalidateQueries({ queryKey: ["order-prints"] });
      void qc.invalidateQueries({ queryKey: ["admin-attention"] });
      void qc.invalidateQueries({ queryKey: ["allOrders"] });
    },
  });
}

const PRINT_SELECT = `
  *,
  delivery_methods:delivery_method_id ( id, name, type ),
  order_items ( id, product_id, quantity, price, custom_name, design_data, sku, products:product_id (name, image) )
`;

type Raw = Record<string, any>;

/** Pedido do banco -> pedido para imprimir. */
export function toPrintOrder(o: Raw, extra: { profile?: Raw | null; email?: string; locale: string; yes: string }): PrintOrder {
  const addr = o.shipping_address ?? null;
  const profile = extra.profile ?? null;
  const name = s(profile?.full_name) || s(o.guest_name) || s(addr?.recipient_name) || s(addr?.name);
  const pickup = o.delivery_methods?.type === "pickup";
  const items = (o.order_items ?? []) as Raw[];
  const subtotal = items.reduce((a, i) => a + Number(i.price || 0) * Number(i.quantity || 0), 0);
  const other = Number(o.payment_discount || 0) + Number(o.gift_card_amount || 0) + Number(o.reward_points_amount || 0);
  const taxes = Number(o.vat_total || 0) + Number(o.extras_vat || 0);
  const notes = s(o.notes);
  return {
    id: o.id,
    code: orderCode(o.id),
    createdAt: o.created_at,
    status: o.status,
    paymentStatus: o.payment_status || "pending",
    paymentMethod: o.payment_method || "",
    customer: {
      name,
      email: s(extra.email) || s(o.guest_email),
      phone: s(profile?.phone) || s(o.guest_phone) || s(addr?.phone),
      taxId: s(o.billing_address?.tax_id) || s(o.billing_address?.nif) || s(addr?.tax_id) || s(addr?.nif) || s(profile?.tax_id),
    },
    shipping: pickup ? null : printAddress(addr, name),
    billing: printAddress(o.billing_address, name),
    pickup,
    service: s(o.shipping_details?.name) || s(o.delivery_methods?.name),
    tracking: s(o.tracking_number),
    weightKg: Number(o.shipping_details?.weight_kg) > 0 ? Number(o.shipping_details.weight_kg) : null,
    shipBy: o.estimated_ship_by ?? null,
    items: items.map((i) => ({
      name: s(i.products?.name) || s(i.custom_name) || s(i.design_data?.product_name) || "",
      options: [i.design_data?.variation, typeof i.design_data?.size === "string" ? i.design_data.size : null]
        .filter((v) => typeof v === "string" && v.trim()).join(" / "),
      sku: s(i.sku),
      quantity: Number(i.quantity || 0),
      unitPrice: Number(i.price || 0),
      image: s(i.products?.image),
    })),
    totals: {
      subtotal,
      shipping: Number(o.shipping_cost || 0),
      discount: Number(o.discount_amount || 0),
      extras: Number(o.extras_amount || 0),
      other,
      taxes,
      total: Number(o.total || 0),
    },
    checkoutFields: orderAnswerLines(o.checkout_fields).map((l) => ({
      label: localText(l.label, extra.locale, l.name),
      value: answerText(l, extra.locale, extra.yes),
    })),
    notes,
  };
}
const s = (v: unknown) => (v == null ? "" : String(v).trim());

/** Pedidos (por id, na ordem dada) prontos para imprimir. */
export function usePrintOrders(ids: string[]) {
  const { locale } = useMessages(orderPrintMessages);
  const { t: tcf } = useMessages(checkoutFieldsMessages);
  const yes = tcf("yes");
  const { data: customers = [] } = useAdminCustomers();
  const key = ids.join(",");
  const q = useQuery({
    queryKey: ["print-orders", key],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select(PRINT_SELECT).in("id", ids);
      if (error) throw error;
      const rows = (data ?? []) as Raw[];
      const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))] as string[];
      let profiles: Raw[] = [];
      if (userIds.length) {
        const { data: p } = await supabase.from("user_profiles").select("user_id, full_name, phone, tax_id").in("user_id", userIds);
        profiles = (p ?? []) as Raw[];
      }
      return { rows, profiles };
    },
  });
  const orders = useMemo(() => {
    if (!q.data) return [];
    const byId = new Map(q.data.rows.map((r) => [r.id as string, r]));
    return ids.map((id) => byId.get(id)).filter(Boolean).map((o) => toPrintOrder(o as Raw, {
      profile: q.data.profiles.find((p) => p.user_id === (o as Raw).user_id) ?? null,
      email: (o as Raw).user_id ? customers.find((c) => c.user_id === (o as Raw).user_id)?.email ?? "" : "",
      locale,
      yes,
    }));
  }, [q.data, ids, customers, locale, yes]);
  return { ...q, orders };
}

/** Contexto dos documentos: textos no idioma do Admin, moeda base, marca e remetente. */
export function usePrintContext(settings: OrderPrintSettings | undefined): PrintContext {
  const { t, locale } = useMessages(orderPrintMessages);
  const fmt = useAdminFormat();
  const brand = useBrand();
  const { data: info } = useStoreInfo();
  const countryNames = useMemo(() => {
    try { return new Intl.DisplayNames([locale], { type: "region" }); } catch { return null; }
  }, [locale]);
  const countryName = useCallback((code: string) => {
    const c = code.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(c)) return code;
    try { return countryNames?.of(c) ?? c; } catch { return c; }
  }, [countryNames]);
  const logo = brand.logos.full || brand.logos.wordmark || "";
  const logoUrl = logo && logo.startsWith("/") && typeof window !== "undefined" ? `${window.location.origin}${logo}` : logo;
  return useMemo<PrintContext>(() => ({
    t: (k, v) => t(k as any, v),
    money: fmt.money,
    dateTime: fmt.dateTime,
    date: fmt.date,
    countryName,
    store: { name: info?.name || brand.name, logoUrl, footer: info?.footer_text || "", nif: info?.nif, address: info?.address, phone: info?.phone, email: info?.email },
    sender: resolveSender(settings?.sender ?? normalizeOrderPrint(null).sender, { name: info?.name || brand.name, address: info?.address, phone: info?.phone, email: info?.email, nif: info?.nif }),
    paymentLabel: (o) => [paymentMethodLabel(o.paymentMethod, fmt.locale), paymentStatusLabel(o.paymentStatus, fmt.locale)].filter(Boolean).join(" · "),
  }), [t, fmt, countryName, info, brand.name, logoUrl, settings]);
}
