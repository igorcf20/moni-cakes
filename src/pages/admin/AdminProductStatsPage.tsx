// =====================================================================================
// Detalhes e números de um produto no Admin: /admin/produtos/<id> (editar continua em /admin/produto/<id>).
//   Cabeçalho     foto, nome, estado no site, preço atual, categorias; Editar produto e Ver na loja
//   Números       receita, unidades, pedidos, clientes, preço médio, por pedido, comparação com os 30 dias anteriores
//   Loja          estoque e quantos dias dura, visitas e conversão, avaliação, favoritos, lucro estimado (com custo)
//   Gráfico       receita por dia / semana / mês no período escolhido (com vista em tabela)
//   Detalhe       vendas por variação, tamanho e país; clientes que mais compraram; pedidos recentes
//   Estoque       últimas mudanças de estoque e atalho para ajustar (recurso stock_history, AdminStockHistory)
//   Alterações    quem mudou o produto no Admin (recurso activity_log, EntityActivity)
// Contas em src/lib/salesStats.ts; consultas em src/hooks/useSalesStats.ts; textos em src/i18n/adminStats.ts.
// =====================================================================================
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Ban, Boxes, Clock, ExternalLink, Eye, Globe2, Heart, Palette, Pencil, Percent, Receipt, Ruler, ShoppingBag, Star, Tag, TrendingUp, Users, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import AdminShell from "@/components/admin/shell/AdminShell";
import { AdminPageHeader, AdminPanel } from "@/components/admin/shell/AdminPageParts";
import { adminHref } from "@/components/admin/shell/adminSections";
import { AdminStatCard } from "@/components/admin/AdminListKit";
import { BreakdownPanel, PeriodChips, RecentOrdersPanel, SalesChart, TopCustomersPanel } from "@/components/admin/stats/StatsParts";
import { useAdminFormat } from "@/hooks/useAdminList";
import { productCategories, useCatalogIndex, useProductExtras, useSalesLines } from "@/hooks/useSalesStats";
import { breakdown, compareWindows, inPeriod, stockCoverage, summarize, type SalePeriod } from "@/lib/salesStats";
import { ProductStockHistory } from "@/components/admin/AdminStockHistory";
import { EntityActivity } from "@/components/admin/AdminActivityLog";
import { useFeature } from "@/hooks/useFeatures";
import { useMessages } from "@/i18n";
import { adminStatsMessages } from "@/i18n/adminStats";

export default function AdminProductStatsPage() {
  const { id } = useParams();
  const { t } = useMessages(adminStatsMessages);
  const { data: index, isLoading } = useCatalogIndex();
  const product = index?.products.find((p) => p.id === id) ?? null;
  const back = { to: adminHref.section("products"), label: t("back_products") };

  return (
    <AdminShell active="products">
      {isLoading ? (
        <div className="space-y-4"><Skeleton className="h-12 w-72" /><Skeleton className="h-28 w-full" /><Skeleton className="h-72 w-full" /></div>
      ) : !product || !index ? (
        <>
          <AdminPageHeader back={back} title={t("product_not_found")} />
          <p className="text-muted-foreground">{t("product_not_found_hint")}</p>
        </>
      ) : (
        <ProductStats productId={product.id} index={index} back={back} />
      )}
    </AdminShell>
  );
}

function ProductStats({ productId, index, back }: { productId: string; index: NonNullable<ReturnType<typeof useCatalogIndex>["data"]>; back: { to: string; label: string } }) {
  const { t } = useMessages(adminStatsMessages);
  const fmt = useAdminFormat();
  const [period, setPeriod] = useState<SalePeriod>("90d");
  const product = index.products.find((p) => p.id === productId)!;
  const cats = productCategories(productId, index);
  const ids = useMemo(() => [productId], [productId]);
  const { lines, isLoading } = useSalesLines(ids);
  const { data: extras } = useProductExtras(productId);
  const stockHistoryOn = useFeature("stock_history");
  const activityOn = useFeature("activity_log");

  const scoped = useMemo(() => inPeriod(lines, period), [lines, period]);
  const s = useMemo(() => summarize(scoped), [scoped]);
  const all = useMemo(() => summarize(lines), [lines]);
  const cmp = useMemo(() => compareWindows(lines, 30), [lines]);
  const last30 = useMemo(() => summarize(inPeriod(lines, "30d")), [lines]);
  const cov = useMemo(() => stockCoverage(lines, product.stock_quantity), [lines, product.stock_quantity]);
  const byVariation = useMemo(() => breakdown(scoped, (l) => l.variation), [scoped]);
  const bySize = useMemo(() => breakdown(scoped, (l) => l.size), [scoped]);
  const byCountry = useMemo(() => breakdown(scoped, (l) => l.country), [scoped]);

  const pct = (v: number) => new Intl.NumberFormat(fmt.locale, { style: "percent", maximumFractionDigits: 1 }).format(v);
  const delta = cmp.deltaPct == null ? t("vs_prev_none")
    : t("vs_prev", { pct: new Intl.NumberFormat(fmt.locale, { style: "percent", maximumFractionDigits: 0, signDisplay: "exceptZero" }).format(cmp.deltaPct) });
  const regionNames = useMemo(() => { try { return new Intl.DisplayNames([fmt.locale], { type: "region" }); } catch { return null; } }, [fmt.locale]);
  const cost = Number(product.cost_price || 0);
  const tracksStock = !product.customizable && product.stock_quantity != null;
  const storeUrl = `/produto/${product.slug || product.id}`;

  return (
    <>
      <AdminPageHeader
        back={back}
        title={
          <span className="flex items-center gap-3">
            {product.image
              ? <img src={product.image} alt="" className="h-14 w-14 shrink-0 rounded-[14px] border object-cover" />
              : <span className="grid h-14 w-14 shrink-0 place-items-center rounded-[14px] bg-muted"><Boxes className="h-6 w-6 text-muted-foreground" aria-hidden="true" /></span>}
            <span className="min-w-0 break-words">{product.name}</span>
          </span>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{t("price_now", { price: fmt.money(product.price) })}</span>
            <span aria-hidden="true">·</span>
            {cats.length ? cats.map((c) => (
              <Link key={c.id} to={adminHref.category(c.id)} className="inline-flex items-center gap-1 font-medium text-foreground hover:underline"><Tag className="h-3.5 w-3.5" aria-hidden="true" />{c.name}</Link>
            )) : <span>{t("no_category")}</span>}
          </span>
        }
        badges={product.is_active
          ? <Badge variant="outline" className="border-emerald-600/40 bg-emerald-50 text-emerald-700">{t("active")}</Badge>
          : <Badge variant="outline">{t("hidden")}</Badge>}
        actions={
          <>
            <Button asChild><Link to={adminHref.product(product.id)}><Pencil className="h-4 w-4" aria-hidden="true" />{t("edit_product")}</Link></Button>
            <Button asChild variant="outline"><a href={storeUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" aria-hidden="true" />{t("view_in_store")}</a></Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <PeriodChips value={period} onChange={setPeriod} />
        {all.firstSale && <p className="text-xs text-muted-foreground">{t("first_last", { first: fmt.date(all.firstSale), last: fmt.relative(all.lastSale) })}</p>}
      </div>

      {isLoading ? <Skeleton className="h-64 w-full" /> : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <AdminStatCard icon={Wallet} label={t("revenue")} value={fmt.money(s.revenue)} hint={period === "30d" ? delta : t("revenue_hint")} tone="success" />
            <AdminStatCard icon={ShoppingBag} label={t("units")} value={s.units} hint={t("chart_units", { n: last30.units }) + " · " + t("last_30")} />
            <AdminStatCard icon={Receipt} label={t("orders")} value={s.orders} hint={`${t("avg_per_order")}: ${fmt.money(s.avgPerOrder)}`} />
            <AdminStatCard icon={Users} label={t("customers")} value={s.customers} hint={`${t("avg_price")}: ${fmt.money(s.avgPrice)}`} />
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <AdminStatCard icon={Boxes} label={t("stock")}
              value={tracksStock ? (product.stock_quantity! <= 0 ? t("stock_out") : product.stock_quantity!) : "-"}
              hint={!tracksStock ? t("stock_none") : cov.days != null && product.stock_quantity! > 0 ? t("stock_days", { n: cov.days }) : t("stock_rate", { n: cov.perDay.toFixed(1) })}
              tone={tracksStock && product.stock_quantity! <= 0 ? "danger" : tracksStock && cov.days != null && cov.days < 14 ? "warning" : "default"} />
            <AdminStatCard icon={Eye} label={t("views")} value={extras?.views ?? "-"} hint={extras ? t("views_hint", { n: extras.views30 }) : undefined} />
            <AdminStatCard icon={Percent} label={t("conversion")}
              value={extras && extras.views30 > 0 ? pct(last30.orders / extras.views30) : "-"} hint={t("conversion_hint")} />
            <AdminStatCard icon={Star} label={t("rating")}
              value={extras?.rating != null ? new Intl.NumberFormat(fmt.locale, { maximumFractionDigits: 1 }).format(extras.rating) + " / 5" : t("rating_none")}
              hint={extras ? [t("rating_hint", { n: extras.reviews }), extras.reviewsPending ? t("rating_pending", { n: extras.reviewsPending }) : ""].filter(Boolean).join(" · ") : undefined} />
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <AdminStatCard icon={TrendingUp} label={t("margin")}
              value={cost > 0 ? fmt.money(s.revenue - cost * s.units) : "-"}
              hint={cost > 0 ? t("margin_hint", { cost: fmt.money(cost) }) : t("margin_none")} />
            <AdminStatCard icon={Heart} label={t("favorites")} value={extras?.favorites ?? "-"} hint={t("favorites_hint")} />
            <AdminStatCard icon={Clock} label={t("pending")} value={s.pendingUnits} hint={t("pending_hint", { n: s.pendingUnits, value: fmt.money(s.pendingRevenue) })} tone={s.pendingUnits ? "warning" : "default"} />
            <AdminStatCard icon={Ban} label={t("cancelled")} value={s.cancelledUnits} hint={t("cancelled_hint", { pct: pct(s.cancelRate) })} />
          </div>

          <SalesChart lines={scoped} period={period} />

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <BreakdownPanel title={t("by_variation")} icon={Palette} rows={byVariation} />
            <BreakdownPanel title={t("by_size")} icon={Ruler} rows={bySize} />
            <BreakdownPanel title={t("by_country")} icon={Globe2} rows={byCountry} labelOf={(k) => regionNames?.of(k) ?? k} />
            <TopCustomersPanel lines={scoped} />
          </div>

          <RecentOrdersPanel lines={lines} />

          {stockHistoryOn && <ProductStockHistory productId={productId} />}

          {activityOn && <EntityActivity refId={productId} />}

          {cats.length > 0 && (
            <AdminPanel title={t("categories")} icon={Tag}>
              <div className="flex flex-wrap gap-2">
                {cats.map((c) => (
                  <Link key={c.id} to={adminHref.category(c.id)} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border bg-card px-3.5 text-sm font-medium hover:border-primary/50">
                    <Tag className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />{c.name}
                  </Link>
                ))}
              </div>
            </AdminPanel>
          )}
        </div>
      )}
    </>
  );
}
