// Cupons no Admin: lista, um cupom e os pedidos que usaram cada código (números da lista e da página do cupom).
// As regras valem no servidor (public.coupon_quote, migration 20261006120000_coupon_rules.sql); aqui só se lê e grava.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AdminCoupon = {
  id: string;
  code: string;
  description: string | null;
  discount_type: "percentage" | "fixed" | string;
  discount_value: number;
  max_discount: number | null;
  min_purchase: number | null;
  max_uses: number | null;
  max_uses_per_customer: number | null;
  current_uses: number | null;
  first_order_only: boolean | null;
  /** Só para clientes destes grupos (vazio = todos). */
  customer_group_ids?: string[] | null;
  starts_at: string | null;
  expires_at: string | null;
  active: boolean;
  created_at: string;
};

export type CouponState = "active" | "inactive" | "scheduled" | "expired" | "exhausted";

/** Estado que o cliente encontra agora (a mesma ordem de regras do servidor). */
export function couponState(c: Pick<AdminCoupon, "active" | "starts_at" | "expires_at" | "max_uses" | "current_uses">, now = Date.now()): CouponState {
  if (!c.active) return "inactive";
  if (c.expires_at && new Date(c.expires_at).getTime() <= now) return "expired";
  if (c.max_uses != null && (c.current_uses ?? 0) >= c.max_uses) return "exhausted";
  if (c.starts_at && new Date(c.starts_at).getTime() > now) return "scheduled";
  return "active";
}

const db = supabase as any;

export function useAdminCoupons() {
  return useQuery({
    queryKey: ["admin-coupons"],
    queryFn: async () => {
      const { data, error } = await db.from("coupons").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AdminCoupon[];
    },
  });
}

export function useAdminCoupon(id: string | undefined) {
  return useQuery({
    queryKey: ["admin-coupons", "one", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await db.from("coupons").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as AdminCoupon | null;
    },
  });
}

export type CouponOrder = {
  id: string;
  created_at: string;
  coupon_code: string;
  total: number;
  discount_amount: number | null;
  status: string;
  payment_status: string | null;
  user_id: string | null;
  guest_name: string | null;
  shipping_address: any;
};

/** Pedidos com cupom (todos ou só os de um código). Cancelados e reembolsados contam à parte. */
export function useCouponOrders(code?: string | null) {
  return useQuery({
    queryKey: ["admin-coupons", "orders", code ?? "*"],
    queryFn: async () => {
      let q = db.from("orders")
        .select("id, created_at, coupon_code, total, discount_amount, status, payment_status, user_id, guest_name, shipping_address")
        .not("coupon_code", "is", null)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (code) q = q.ilike("coupon_code", code.replace(/[%_\\]/g, "\\$&"));
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as CouponOrder[];
    },
  });
}

export const isCountedOrder = (o: Pick<CouponOrder, "status">) => !["cancelled", "refunded"].includes(o.status);

/** Números por código: pedidos válidos, desconto e vendas (chave em minúsculas). */
export function couponTotals(orders: CouponOrder[]) {
  const by = new Map<string, { orders: number; discount: number; sales: number }>();
  for (const o of orders) {
    if (!isCountedOrder(o)) continue;
    const k = o.coupon_code.toLowerCase();
    const cur = by.get(k) ?? { orders: 0, discount: 0, sales: 0 };
    cur.orders += 1;
    cur.discount += Number(o.discount_amount || 0);
    cur.sales += Number(o.total || 0);
    by.set(k, cur);
  }
  return by;
}

/** "10%" ou "R$ 20,00" (valor fixo na moeda base da loja). */
export function couponValueLabel(c: Pick<AdminCoupon, "discount_type" | "discount_value">, money: (v: number) => string, locale?: string) {
  return c.discount_type === "percentage"
    ? `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(Number(c.discount_value || 0))}%`
    : money(Number(c.discount_value || 0));
}
