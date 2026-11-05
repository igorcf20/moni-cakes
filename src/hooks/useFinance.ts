// =============================================================================================
// Consultas do Admin > Financeiro (recurso finance). Contas em src/lib/finance.ts.
//   useFinanceData        pedidos (sem os de teste) com itens, custo dos produtos, categorias, reembolsos e comissões
//   useFinanceEntries     lançamentos manuais (finance_entries), valor já na moeda base
//   useFinanceCategories  categorias dos lançamentos (finance_categories)
//   useFinanceSettings    regras das contas (finance_settings, uma linha)
// Migration 20261008163000_finance.sql. Só leitura de pedidos: nada aqui muda pedidos nem estoque.
// =============================================================================================
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAdminCustomers } from "@/hooks/useAdminRecords";
import { useCatalogIndex, type CatalogProduct, type CategoryRow } from "@/hooks/useSalesStats";
import { useCurrencySettings } from "@/hooks/useExchangeRates";
import { useCurrency } from "@/hooks/use-currency";
import { addressCountryCode } from "@/lib/addressFormats";
import { currencyDigits } from "@/lib/money";
import {
  normalizeFinanceSettings, toBaseAmount, type EntryKind, type EntryStatus, type FinanceSettings, type FinEntry, type FinOrder,
} from "@/lib/finance";

const db = supabase as any;
const MAX_ROWS = 50000;

const norm = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/** Categorias (e as categorias-mãe) de cada produto: ligações em product_categories ou products.category = nome ou slug. */
export function productCategoryMap(index: { products: CatalogProduct[]; categories: CategoryRow[]; links: { product_id: string; category_id: string }[] } | undefined) {
  const out = new Map<string, string[]>();
  if (!index) return out;
  const byId = new Map(index.categories.map((c) => [c.id, c]));
  const byLabel = new Map<string, string>();
  for (const c of index.categories) { byLabel.set(norm(c.name), c.id); byLabel.set(norm(c.slug), c.id); }
  const add = (pid: string, cid: string) => {
    const list = out.get(pid) ?? [];
    for (let c = byId.get(cid); c; c = c.parent_id ? byId.get(c.parent_id) : undefined) {
      if (!list.includes(c.id)) list.push(c.id);
      if (list.length > 20) break;
    }
    out.set(pid, list);
  };
  for (const l of index.links) add(l.product_id, l.category_id);
  for (const p of index.products) {
    const cid = p.category ? byLabel.get(norm(p.category)) : undefined;
    if (cid) add(p.id, cid);
  }
  return out;
}

type RawOrder = {
  id: string; created_at: string; paid_at: string | null; status: string; payment_status: string | null; payment_method: string | null;
  total: number | null; vat_total: number | null; shipping_cost: number | null; discount_amount: number | null; payment_discount: number | null;
  gift_card_amount: number | null; reward_points_amount: number | null; user_id: string | null; guest_name: string | null; guest_email: string | null;
  shipping_address: any; is_test: boolean | null;
};

export function useFinanceData() {
  const { data: customers = [] } = useAdminCustomers();
  const { data: index, isLoading: indexLoading } = useCatalogIndex();
  const q = useQuery({
    queryKey: ["admin-finance-orders"],
    queryFn: async () => {
      const [orders, items, refunds, ledger] = await Promise.all([
        db.from("orders")
          .select("id, created_at, paid_at, status, payment_status, payment_method, total, vat_total, shipping_cost, discount_amount, payment_discount, gift_card_amount, reward_points_amount, user_id, guest_name, guest_email, shipping_address, is_test")
          .order("created_at", { ascending: false }).limit(MAX_ROWS),
        db.from("order_items").select("order_id, product_id, quantity, price").limit(MAX_ROWS * 4),
        db.from("payment_refunds").select("order_id, amount").limit(MAX_ROWS),
        db.from("affiliate_ledger").select("order_id, commission, status").eq("status", "active").limit(MAX_ROWS),
      ]);
      if (orders.error) throw orders.error;
      if (items.error) throw items.error;
      return {
        orders: (orders.data ?? []) as RawOrder[],
        items: (items.data ?? []) as { order_id: string; product_id: string | null; quantity: number; price: number }[],
        // Reembolsos e comissões são extra: sem acesso (tabela ou recurso ausente) as contas seguem sem eles.
        refunds: (refunds.error ? [] : refunds.data ?? []) as { order_id: string; amount: number }[],
        ledger: (ledger.error ? [] : ledger.data ?? []) as { order_id: string; commission: number }[],
      };
    },
  });

  const categoriesOf = useMemo(() => productCategoryMap(index), [index]);
  const orders = useMemo<FinOrder[]>(() => {
    if (!q.data) return [];
    const costs = new Map((index?.products ?? []).map((p) => [p.id, p.cost_price != null && Number(p.cost_price) > 0 ? Number(p.cost_price) : null]));
    const names = new Map(customers.map((c) => [c.user_id, c.full_name || c.email || ""]));
    const itemsBy = new Map<string, FinOrder["items"]>();
    for (const i of q.data.items) {
      if (!i.product_id) continue;
      const list = itemsBy.get(i.order_id) ?? [];
      list.push({
        productId: i.product_id, quantity: Number(i.quantity || 0), price: Number(i.price || 0),
        unitCost: costs.get(i.product_id) ?? null, categoryIds: categoriesOf.get(i.product_id) ?? [],
      });
      itemsBy.set(i.order_id, list);
    }
    const sumBy = (rows: { order_id: string }[], f: (r: any) => number) => {
      const m = new Map<string, number>();
      for (const r of rows) m.set(r.order_id, (m.get(r.order_id) ?? 0) + f(r));
      return m;
    };
    const refunds = sumBy(q.data.refunds, (r) => Number(r.amount || 0));
    const commissions = sumBy(q.data.ledger, (r) => Number(r.commission || 0));
    return q.data.orders.filter((o) => !o.is_test).map((o) => {
      const name = (o.user_id && names.get(o.user_id)) || o.guest_name || o.shipping_address?.recipient_name || o.guest_email || "";
      return {
        id: o.id,
        createdAt: o.created_at,
        paidAt: o.paid_at,
        status: o.status,
        paymentStatus: o.payment_status,
        paymentMethod: o.payment_method || null,
        country: o.shipping_address?.country ? addressCountryCode(o.shipping_address.country, "") || null : null,
        customerKey: o.user_id ? `u:${o.user_id}` : `g:${norm(o.guest_email || name) || o.id}`,
        customerName: name,
        userId: o.user_id,
        total: Number(o.total || 0),
        vat: Number(o.vat_total || 0),
        shipping: Number(o.shipping_cost || 0),
        couponDiscount: Number(o.discount_amount || 0),
        paymentDiscount: Number(o.payment_discount || 0),
        giftCard: Number(o.gift_card_amount || 0),
        points: Number(o.reward_points_amount || 0),
        refunded: refunds.get(o.id) ?? 0,
        commission: commissions.get(o.id) ?? 0,
        items: itemsBy.get(o.id) ?? [],
      };
    });
  }, [q.data, index, customers, categoriesOf]);

  return { orders, index, isLoading: q.isLoading || indexLoading, error: q.error };
}

/* ---------- Lançamentos ---------- */

export type EntryRow = {
  id: string; kind: EntryKind; category_id: string | null; description: string; amount_cents: number; currency: string;
  occurred_on: string; due_on: string | null; status: EntryStatus; payment_method: string | null; counterparty: string | null;
  reference: string | null; notes: string | null; repeat_group: string | null; created_at: string; updated_at: string;
};

const ENTRIES = ["admin-finance-entries"];

export function useFinanceEntries() {
  const base = useCurrency((s) => s.baseCurrency);
  const { data: cs } = useCurrencySettings();
  const q = useQuery({
    queryKey: ENTRIES,
    queryFn: async (): Promise<EntryRow[]> => {
      const { data, error } = await db.from("finance_entries").select("*").order("occurred_on", { ascending: false }).order("created_at", { ascending: false }).limit(MAX_ROWS);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({ ...r, amount_cents: Number(r.amount_cents || 0) }));
    },
  });
  const rates = cs?.settings.rates;
  const entries = useMemo<(FinEntry & { row: EntryRow })[]>(() => (q.data ?? []).map((r) => ({
    id: r.id,
    kind: r.kind,
    categoryId: r.category_id,
    description: r.description,
    amount: toBaseAmount(r.amount_cents, r.currency, base, rates ?? {}, currencyDigits(r.currency)),
    occurredOn: String(r.occurred_on).slice(0, 10),
    dueOn: r.due_on ? String(r.due_on).slice(0, 10) : null,
    status: r.status,
    row: r,
  })), [q.data, base, rates]);
  return { entries, rows: q.data ?? [], isLoading: q.isLoading, error: q.error };
}

export type EntryInput = Omit<EntryRow, "id" | "created_at" | "updated_at" | "repeat_group"> & { id?: string; repeatMonths?: number; dates?: string[] };

export function useSaveFinanceEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (e: EntryInput): Promise<string> => {
      const row = {
        kind: e.kind, category_id: e.category_id, description: e.description.trim(), amount_cents: e.amount_cents,
        currency: e.currency.toUpperCase(), occurred_on: e.occurred_on, due_on: e.due_on || null, status: e.status,
        payment_method: e.payment_method, counterparty: e.counterparty, reference: e.reference, notes: e.notes,
      };
      if (e.id) {
        const { error } = await db.from("finance_entries").update(row).eq("id", e.id);
        if (error) throw error;
        return e.id;
      }
      // Repetir todo mês: uma linha por mês, ligadas pelo mesmo repeat_group; só a primeira mantém a situação escolhida
      // se estiver paga, as seguintes ficam por pagar.
      const dates = e.dates && e.dates.length > 1 ? e.dates : null;
      if (dates) {
        const group = crypto.randomUUID();
        const rows = dates.map((d, i) => ({
          ...row, occurred_on: d, due_on: d, status: i === 0 ? row.status : "pending", repeat_group: group,
        }));
        const { data, error } = await db.from("finance_entries").insert(rows).select("id");
        if (error) throw error;
        return data[0].id as string;
      }
      const { data, error } = await db.from("finance_entries").insert(row).select("id").single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ENTRIES }),
  });
}

export function useSetEntryStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, on }: { id: string; status: EntryStatus; on?: string }) => {
      const patch: Record<string, unknown> = { status };
      if (on) patch.occurred_on = on;
      const { error } = await db.from("finance_entries").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ENTRIES }),
  });
}

export function useDeleteFinanceEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, group }: { id: string; group?: string | null }) => {
      // group = apagar também as próximas repetições ainda por pagar.
      const { error } = await db.from("finance_entries").delete().eq("id", id);
      if (error) throw error;
      if (group) {
        const { error: e2 } = await db.from("finance_entries").delete().eq("repeat_group", group).eq("status", "pending");
        if (e2) throw e2;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ENTRIES }),
  });
}

/* ---------- Categorias ---------- */

export type FinanceCategory = {
  id: string; kind: EntryKind; code: string | null; name: string | null; color: string; display_order: number; is_active: boolean;
};

const CATS = ["admin-finance-categories"];

export function useFinanceCategories() {
  return useQuery({
    queryKey: CATS,
    queryFn: async (): Promise<FinanceCategory[]> => {
      const { data, error } = await db.from("finance_categories").select("id, kind, code, name, color, display_order, is_active")
        .order("kind").order("display_order").order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveFinanceCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: Partial<FinanceCategory> & { kind: EntryKind }) => {
      const row = { name: c.name ?? null, color: c.color ?? "orange", is_active: c.is_active ?? true, display_order: c.display_order ?? 500 };
      const { error } = c.id
        ? await db.from("finance_categories").update(row).eq("id", c.id)
        : await db.from("finance_categories").insert({ ...row, kind: c.kind });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CATS }),
  });
}

export function useDeleteFinanceCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("finance_categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CATS });
      qc.invalidateQueries({ queryKey: ENTRIES });
    },
  });
}

/* ---------- Regras ---------- */

const SETTINGS = ["admin-finance-settings"];

export function useFinanceSettings() {
  return useQuery({
    queryKey: SETTINGS,
    queryFn: async (): Promise<FinanceSettings> => {
      const { data, error } = await db.from("finance_settings").select("value").eq("id", true).maybeSingle();
      if (error) throw error;
      return normalizeFinanceSettings(data?.value);
    },
  });
}

export function useSaveFinanceSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (s: FinanceSettings) => {
      const { error } = await db.from("finance_settings").upsert({ id: true, value: normalizeFinanceSettings(s) }, { onConflict: "id" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: SETTINGS }),
  });
}

/** Meios de pagamento configurados na loja (para as taxas e o filtro). */
export function usePaymentTypes() {
  return useQuery({
    queryKey: ["admin-finance-payment-types"],
    queryFn: async (): Promise<{ type: string; name: string; is_active: boolean }[]> => {
      const { data, error } = await db.from("payment_config").select("type, name, is_active").order("display_order");
      if (error) throw error;
      return data ?? [];
    },
  });
}
