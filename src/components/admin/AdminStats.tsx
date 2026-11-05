// =====================================================================================
// Admin > Estatísticas: a página inicial do painel (/admin).
//   Topo          hoje (pedidos e valor pago), período (30 dias, 90 dias, 12 meses, tudo), Primeiros passos
//   Números       receita paga (com comparação com o período anterior), pedidos pagos, ticket médio, clientes
//                 (e quantos compraram pela primeira vez), visitas e conversão, aguardando pagamento, cancelados,
//                 descontos dados
//   Precisa de você   o que está à espera do dono (mesmos contadores do menu, useAdminAttention)
//   Gráfico       receita paga por dia / semana / mês
//   Detalhe       produtos e categorias que mais vendem (abrem as páginas de números), pedidos por situação,
//                 vendas por país, melhores clientes, pedidos recentes
// Receita aqui = total dos pedidos pagos (com frete e descontos). Nas páginas de produto e categoria é o valor
// dos itens. Contas em src/lib/salesStats.ts; consultas em src/hooks/useSalesStats.ts.
// Textos: src/i18n/adminDashboard.ts e src/i18n/adminStats.ts.
// =====================================================================================
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, Ban, CalendarDays, Clock, Eye, FolderTree, Globe2, Hammer, Inbox, Package, PackageX, Receipt, Rocket,
  ShoppingBag, Star, Tag, Truck, Users, Wallet, type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminPanel } from "@/components/admin/shell/AdminPageParts";
import { adminHref } from "@/components/admin/shell/adminSections";
import { AdminStatCard } from "@/components/admin/AdminListKit";
import { BreakdownPanel, PeriodChips, RecentOrdersPanel, SalesChart, TopCustomersPanel } from "@/components/admin/stats/StatsParts";
import { reopenSetupHelper, useSetupHelperMode, useSetupProgress } from "@/components/admin/AdminSetupHelper";
import { useAdminAttention } from "@/hooks/useAdminAttention";
import { useAdminFormat } from "@/hooks/useAdminList";
import { categoryProductIds, useCatalogIndex, useProductViewCount, useSalesLines, useStoreOrders, type StoreOrder } from "@/hooks/useSalesStats";
import { breakdown, inPeriod, isCancelled, isPending, isSold, periodStart, type BreakdownRow, type SalePeriod } from "@/lib/salesStats";
import { getOrderStatusStyle, orderStatusLabel } from "@/lib/orderStatusStyles";
import { cn } from "@/lib/utils";
import { useMessages } from "@/i18n";
import { adminStatsMessages } from "@/i18n/adminStats";
import { adminDashboardMessages } from "@/i18n/adminDashboard";
import { adminMessages } from "@/i18n/admin";

const DAY = 86_400_000;
const PERIOD_DAYS: Record<SalePeriod, number | null> = { "30d": 30, "90d": 90, "12m": 365, all: null };
const sum = (rows: StoreOrder[], f: (o: StoreOrder) => number) => Math.round(rows.reduce((s, o) => s + f(o), 0) * 100) / 100;
const who = (o: StoreOrder) => o.userId ?? (o.customerName ? `n:${o.customerName.trim().toLowerCase()}` : `o:${o.orderId}`);

export default function AdminStats() {
  const { t } = useMessages(adminDashboardMessages);
  const { t: ts } = useMessages(adminStatsMessages);
  const { t: ta } = useMessages(adminMessages);
  const fmt = useAdminFormat();
  const [period, setPeriod] = useState<SalePeriod>("30d");
  const { orders, isLoading } = useStoreOrders();
  const { lines: items } = useSalesLines("all");
  const { data: index } = useCatalogIndex();
  const attention = useAdminAttention();
  const setup = useSetupProgress();
  const setupMode = useSetupHelperMode();

  const since = useMemo(() => periodStart(period), [period]);
  const { data: views } = useProductViewCount(since);

  const scoped = useMemo(() => inPeriod(orders, period), [orders, period]);
  const sold = useMemo(() => scoped.filter(isSold), [scoped]);
  const revenue = sum(sold, (o) => o.total);
  const pending = scoped.filter(isPending);
  const cancelled = scoped.filter(isCancelled);
  const discounts = sum(sold, (o) => o.discount);

  // Comparação com o período anterior do mesmo tamanho (não existe em "tudo").
  const delta = useMemo(() => {
    const days = PERIOD_DAYS[period];
    if (!days) return undefined;
    const now = Date.now();
    const prev = sum(orders.filter((o) => isSold(o) && +new Date(o.createdAt) <= now - days * DAY && +new Date(o.createdAt) > now - 2 * days * DAY), (o) => o.total);
    if (prev <= 0) return t("vs_prev_period_none");
    const pct = new Intl.NumberFormat(fmt.locale, { style: "percent", maximumFractionDigits: 0, signDisplay: "exceptZero" }).format((revenue - prev) / prev);
    return t("vs_prev_period", { pct });
  }, [orders, period, revenue, fmt.locale, t]);

  // Clientes do período e quantos compraram pela primeira vez (primeiro pedido pago dentro do período).
  const buyers = useMemo(() => {
    const first = new Map<string, number>();
    for (const o of orders) if (isSold(o)) {
      const k = who(o); const at = +new Date(o.createdAt);
      if (!first.has(k) || at < first.get(k)!) first.set(k, at);
    }
    const inScope = new Set(sold.map(who));
    const start = since ? +since : -Infinity;
    return { total: inScope.size, fresh: [...inScope].filter((k) => (first.get(k) ?? 0) >= start).length };
  }, [orders, sold, since]);

  const today = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    const rows = orders.filter((o) => +new Date(o.createdAt) >= +d);
    return { orders: rows.length, revenue: sum(rows.filter(isSold), (o) => o.total) };
  }, [orders]);

  const itemsScoped = useMemo(() => inPeriod(items, period), [items, period]);
  const topProducts = useMemo(() => breakdown(itemsScoped, (l) => l.productId), [itemsScoped]);
  const productName = (id: string) => index?.products.find((p) => p.id === id)?.name ?? id;
  const topCategories = useMemo<BreakdownRow[]>(() => {
    if (!index) return [];
    const soldItems = itemsScoped.filter(isSold);
    const total = soldItems.reduce((s, l) => s + l.price * l.quantity, 0);
    return index.categories.filter((c) => !c.parent_id).map((c) => {
      const ids = categoryProductIds(c.id, index);
      const mine = soldItems.filter((l) => ids.has(l.productId));
      const rev = mine.reduce((s, l) => s + l.price * l.quantity, 0);
      return { key: c.id, units: mine.reduce((s, l) => s + l.quantity, 0), revenue: rev, orders: new Set(mine.map((l) => l.orderId)).size, share: total ? rev / total : 0 };
    }).filter((r) => r.units > 0).sort((a, b) => b.revenue - a.revenue);
  }, [itemsScoped, index]);
  const byCountry = useMemo(() => breakdown(scoped, (o) => o.country), [scoped]);
  const regionNames = useMemo(() => { try { return new Intl.DisplayNames([fmt.locale], { type: "region" }); } catch { return null; } }, [fmt.locale]);
  const byStatus = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of scoped) m.set(o.status, (m.get(o.status) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [scoped]);

  const pct = (v: number) => new Intl.NumberFormat(fmt.locale, { style: "percent", maximumFractionDigits: 1 }).format(v);
  const nOrders = (n: number) => t("n_orders", { n });

  type Todo = { key: string; label: string; n: number; icon: LucideIcon; to: string; tone?: "warning" | "danger" };
  const todo = ([
    { key: "cancel", label: t("todo_cancel"), n: attention.cancelRequests, icon: AlertTriangle, to: adminHref.section("orders"), tone: "danger" },
    { key: "proofs", label: t("todo_proofs"), n: attention.proofsToConfirm, icon: Receipt, to: adminHref.section("orders"), tone: "warning" },
    { key: "produce", label: t("todo_produce"), n: attention.toProduce, icon: Hammer, to: adminHref.section("orders"), tone: "warning" },
    { key: "ship", label: t("todo_ship"), n: attention.toShip, icon: Truck, to: adminHref.section("orders") },
    { key: "reviews", label: t("todo_reviews"), n: attention.reviews, icon: Star, to: adminHref.section("reviews") },
    { key: "stock", label: t("todo_stock"), n: attention.outOfStock, icon: PackageX, to: adminHref.section("products"), tone: "danger" },
  ] as Todo[]).filter((x) => x.n > 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <PeriodChips value={period} onChange={setPeriod} />
          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            <span><strong className="font-semibold text-foreground">{t("today")}:</strong> {t("today_line", { orders: today.orders, revenue: fmt.money(today.revenue) })}</span>
          </span>
        </div>
        {setup.status && !setup.complete && setupMode === "hidden" && (
          <Button type="button" variant="outline" size="sm" onClick={reopenSetupHelper}>
            <Rocket className="h-4 w-4" aria-hidden="true" />{ta("setup_reopen", { done: setup.done, total: setup.total })}
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-24 rounded-[18px]" />)}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <AdminStatCard icon={Wallet} label={ts("revenue")} value={fmt.money(revenue)} hint={delta ?? t("revenue_hint")} tone="success" />
            <AdminStatCard icon={ShoppingBag} label={t("paid_orders")} value={sold.length} hint={t("paid_orders_hint", { n: scoped.length })} />
            <AdminStatCard icon={Receipt} label={t("avg_ticket")} value={fmt.money(sold.length ? revenue / sold.length : 0)} hint={t("avg_ticket_hint")} />
            <AdminStatCard icon={Users} label={t("buyers")} value={buyers.total} hint={t("buyers_hint", { n: buyers.fresh })} />
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <AdminStatCard icon={Eye} label={t("visits")} value={views ?? "-"} hint={views ? t("visits_hint", { pct: pct(sold.length / views) }) : undefined} />
            <AdminStatCard icon={Clock} label={t("pending_orders")} value={pending.length}
              hint={t("pending_orders_hint", { n: pending.length, value: fmt.money(sum(pending, (o) => o.total)) })} tone={pending.length ? "warning" : "default"} />
            <AdminStatCard icon={Ban} label={t("cancelled_orders")} value={cancelled.length}
              hint={t("cancelled_orders_hint", { pct: pct(scoped.length ? cancelled.length / scoped.length : 0) })} />
            <AdminStatCard icon={Tag} label={t("discounts")} value={fmt.money(discounts)} hint={t("discounts_hint")} />
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <SalesChart lines={scoped} period={period} countLabel={nOrders} countCol={ts("col_orders")} />
            </div>
            <AdminPanel title={t("todo_title")} icon={Inbox}>
              {!todo.length ? <p className="text-sm text-muted-foreground">{t("todo_none")}</p> : (
                <ul className="space-y-1.5">
                  {todo.map((x) => (
                    <li key={x.key}>
                      <Link to={x.to} className="flex items-center gap-3 rounded-[14px] border p-3 text-sm transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full",
                          x.tone === "danger" ? "bg-red-50 text-red-700" : x.tone === "warning" ? "bg-amber-50 text-amber-700" : "bg-muted text-foreground")}>
                          <x.icon className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1 font-medium">{x.label}</span>
                        <span className="text-base font-bold tabular-nums">{x.n}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </AdminPanel>
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <BreakdownPanel title={t("top_products")} icon={Package} rows={topProducts} firstCol={t("col_product")}
              labelOf={productName} href={(id) => adminHref.productStats(id)} emptyText={ts("no_sales")} />
            <BreakdownPanel title={t("top_categories")} icon={FolderTree} rows={topCategories} firstCol={t("col_category")}
              labelOf={(id) => index?.categories.find((c) => c.id === id)?.name ?? id} href={(id) => adminHref.category(id)}
              emptyText={index && !index.categories.length ? t("no_categories") : ts("no_sales")} />
            <AdminPanel title={t("by_status")} icon={ShoppingBag}
              actions={<Button asChild variant="ghost" size="sm"><Link to={adminHref.section("orders")}>{t("see_all")}</Link></Button>}>
              {!byStatus.length ? <p className="text-sm text-muted-foreground">{ts("no_sales")}</p> : (
                <ul className="divide-y">
                  {byStatus.map(([status, n]) => (
                    <li key={status} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <Badge className={cn("border", getOrderStatusStyle(status).badge)}>{orderStatusLabel(status, fmt.locale)}</Badge>
                      <span className="font-semibold tabular-nums">{n}</span>
                    </li>
                  ))}
                </ul>
              )}
            </AdminPanel>
            <BreakdownPanel title={ts("by_country")} icon={Globe2} rows={byCountry} labelOf={(k) => regionNames?.of(k) ?? k} emptyText={ts("no_sales")} unitsCol={ts("col_orders")} />
            <TopCustomersPanel lines={scoped} countLabel={nOrders} />
            <RecentOrdersPanel lines={orders} showUnits={false} limit={6}
              actions={<Button asChild variant="ghost" size="sm"><Link to={adminHref.section("orders")}>{t("see_all")}</Link></Button>} />
          </div>
        </>
      )}
    </div>
  );
}
