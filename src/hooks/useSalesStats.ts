// Consultas das páginas de detalhe do Admin (produto e categoria): linhas de pedido dos produtos, números extra do
// produto (avaliações, favoritos, visitas) e a ligação categoria -> produtos. As contas ficam em src/lib/salesStats.ts.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAdminCustomers } from "@/hooks/useAdminRecords";
import { addressCountryCode } from "@/lib/addressFormats";
import type { SaleLine } from "@/lib/salesStats";

const db = supabase as any;
const CHUNK = 100;
const MAX_ROWS = 20000;

type RawItem = {
  order_id: string;
  product_id: string;
  quantity: number;
  price: number;
  design_data: any;
  orders: { id: string; created_at: string; status: string; payment_status: string | null; user_id: string | null; guest_name: string | null; shipping_address: any; coupon_code: string | null } | null;
};

/** Linhas de pedido de um conjunto de produtos (ou de todos, com "all"). */
export function useSalesLines(productIds: string[] | "all" | undefined) {
  const { data: customers = [] } = useAdminCustomers();
  const key = productIds === "all" ? "all" : (productIds ?? []).slice().sort().join(",");
  const q = useQuery({
    queryKey: ["admin-sales-lines", key],
    enabled: productIds === "all" || (productIds?.length ?? 0) > 0,
    queryFn: async (): Promise<RawItem[]> => {
      const select = "order_id, product_id, quantity, price, design_data, orders!inner(id, created_at, status, payment_status, user_id, guest_name, shipping_address, coupon_code)";
      if (productIds === "all") {
        const { data, error } = await db.from("order_items").select(select).not("product_id", "is", null).limit(MAX_ROWS);
        if (error) throw error;
        return data ?? [];
      }
      const out: RawItem[] = [];
      for (let i = 0; i < productIds!.length; i += CHUNK) {
        const { data, error } = await db.from("order_items").select(select).in("product_id", productIds!.slice(i, i + CHUNK)).limit(MAX_ROWS);
        if (error) throw error;
        out.push(...(data ?? []));
      }
      return out;
    },
  });

  const names = useMemo(() => new Map(customers.map((c) => [c.user_id, c.full_name || c.email || ""])), [customers]);
  const lines = useMemo<SaleLine[]>(() => (q.data ?? []).filter((r) => r.orders).map((r) => {
    const o = r.orders!;
    const dd = r.design_data && typeof r.design_data === "object" ? r.design_data : {};
    return {
      orderId: o.id,
      createdAt: o.created_at,
      status: o.status,
      paymentStatus: o.payment_status,
      userId: o.user_id,
      customerName: (o.user_id && names.get(o.user_id)) || o.guest_name || o.shipping_address?.recipient_name || "",
      country: o.shipping_address?.country ? addressCountryCode(o.shipping_address.country, "") || null : null,
      productId: r.product_id,
      quantity: Number(r.quantity || 0),
      price: Number(r.price || 0),
      variation: typeof dd.variation === "string" && dd.variation.trim() ? dd.variation.trim() : null,
      size: typeof dd.size === "string" && dd.size.trim() ? dd.size.trim() : null,
      couponCode: o.coupon_code,
    };
  }), [q.data, names]);

  return { lines, isLoading: q.isLoading, error: q.error };
}

/** Avaliações aprovadas, avaliações por aprovar, favoritos e visitas (total e últimos 30 dias) de um produto. */
export function useProductExtras(productId: string | undefined) {
  return useQuery({
    queryKey: ["admin-product-extras", productId],
    enabled: !!productId,
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const [reviews, wish, views, views30] = await Promise.all([
        db.from("product_reviews").select("rating, approved").eq("product_id", productId),
        db.from("wishlist").select("id", { count: "exact", head: true }).eq("product_id", productId),
        db.from("product_views").select("id", { count: "exact", head: true }).eq("product_id", productId),
        db.from("product_views").select("id", { count: "exact", head: true }).eq("product_id", productId).gte("viewed_at", since),
      ]);
      const rows: { rating: number; approved: boolean | null }[] = reviews.data ?? [];
      const approved = rows.filter((r) => r.approved);
      return {
        rating: approved.length ? approved.reduce((s, r) => s + Number(r.rating || 0), 0) / approved.length : null,
        reviews: approved.length,
        reviewsPending: rows.length - approved.length,
        favorites: wish.count ?? 0,
        views: views.count ?? 0,
        views30: views30.count ?? 0,
      };
    },
  });
}

export type CatalogProduct = {
  id: string; name: string; slug: string | null; image: string | null; price: number; category: string | null;
  stock_quantity: number | null; is_active: boolean; customizable: boolean | null; cost_price: number | null; created_at: string | null;
};

export type CategoryRow = { id: string; name: string; slug: string; parent_id: string | null; image_url: string | null; is_active: boolean | null; show_in_menu?: boolean | null; description: string | null; link_url?: string | null; icon?: string | null; created_at: string | null };

/** Produtos, categorias e ligações (product_categories) para as páginas de produto e categoria. */
export function useCatalogIndex() {
  return useQuery({
    queryKey: ["admin-catalog-index"],
    queryFn: async () => {
      const [p, c, l] = await Promise.all([
        db.from("products").select("id, name, slug, image, price, category, stock_quantity, is_active, customizable, cost_price, created_at").order("name"),
        db.from("categories").select("*").order("display_order"),
        db.from("product_categories").select("product_id, category_id"),
      ]);
      if (p.error) throw p.error;
      if (c.error) throw c.error;
      return {
        products: (p.data ?? []) as CatalogProduct[],
        categories: (c.data ?? []) as CategoryRow[],
        links: (l.data ?? []) as { product_id: string; category_id: string }[],
      };
    },
  });
}

const norm = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/**
 * Produtos de uma categoria e das suas subcategorias: ligados em product_categories, ou com products.category igual
 * ao nome ou ao endereço (slug) da categoria (como o site faz nas listagens).
 */
export function categoryProductIds(categoryId: string, index: { products: CatalogProduct[]; categories: CategoryRow[]; links: { product_id: string; category_id: string }[] }) {
  const family = index.categories.filter((c) => c.id === categoryId || c.parent_id === categoryId);
  const ids = new Set(family.map((c) => c.id));
  const labels = new Set(family.flatMap((c) => [norm(c.name), norm(c.slug)]).filter(Boolean));
  const out = new Set(index.links.filter((l) => ids.has(l.category_id)).map((l) => l.product_id));
  for (const p of index.products) if (labels.has(norm(p.category))) out.add(p.id);
  return out;
}

/** Categorias (principal e sub) de um produto. */
export function productCategories(productId: string, index: { products: CatalogProduct[]; categories: CategoryRow[]; links: { product_id: string; category_id: string }[] }) {
  const p = index.products.find((x) => x.id === productId);
  const linked = new Set(index.links.filter((l) => l.product_id === productId).map((l) => l.category_id));
  return index.categories.filter((c) => linked.has(c.id) || (p && norm(p.category) && (norm(c.name) === norm(p.category) || norm(c.slug) === norm(p.category))));
}

export type StoreOrder = SaleLine & { total: number; shipping: number; discount: number };

/**
 * Pedidos da loja para a página inicial do Admin, um por linha (quantity 1, price = total do pedido), para usar as
 * mesmas contas de src/lib/salesStats.ts: "unidades" passam a ser pedidos e a receita é o total pago (com frete).
 */
export function useStoreOrders() {
  const { data: customers = [] } = useAdminCustomers();
  const q = useQuery({
    queryKey: ["admin-store-orders"],
    queryFn: async () => {
      const { data, error } = await db.from("orders")
        .select("id, created_at, status, payment_status, total, shipping_cost, discount_amount, payment_discount, user_id, guest_name, shipping_address, coupon_code")
        .order("created_at", { ascending: false })
        .limit(MAX_ROWS);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const names = useMemo(() => new Map(customers.map((c) => [c.user_id, c.full_name || c.email || ""])), [customers]);
  const orders = useMemo<StoreOrder[]>(() => (q.data ?? []).map((o) => ({
    orderId: o.id,
    createdAt: o.created_at,
    status: o.status,
    paymentStatus: o.payment_status,
    userId: o.user_id,
    customerName: (o.user_id && names.get(o.user_id)) || o.guest_name || o.shipping_address?.recipient_name || "",
    country: o.shipping_address?.country ? addressCountryCode(o.shipping_address.country, "") || null : null,
    productId: "",
    quantity: 1,
    price: Number(o.total || 0),
    variation: null,
    size: null,
    couponCode: o.coupon_code,
    total: Number(o.total || 0),
    shipping: Number(o.shipping_cost || 0),
    discount: Number(o.discount_amount || 0) + Number(o.payment_discount || 0),
  })), [q.data, names]);
  return { orders, isLoading: q.isLoading };
}

/** Visitas a produtos desde uma data (null = todas). */
export function useProductViewCount(since: Date | null) {
  const key = since ? since.toISOString().slice(0, 10) : "all";
  return useQuery({
    queryKey: ["admin-product-views", key],
    queryFn: async () => {
      let q = db.from("product_views").select("id", { count: "exact", head: true });
      if (since) q = q.gte("viewed_at", since.toISOString());
      const { count } = await q;
      return count ?? 0;
    },
  });
}
