// =====================================================================================
// Detalhes e números de uma categoria no Admin: /admin/categorias/<id> (editar em /admin/categorias/<id>/editar).
//   Cabeçalho     foto, nome, categoria principal ou "Subcategoria de", no menu / desativada; Editar e Ver na loja
//   Números       receita (com comparação dos 30 dias), unidades, pedidos, clientes, produtos (e visíveis),
//                 parte da receita da loja, por pedido, pendentes e cancelados
//   Gráfico       receita da categoria por dia / semana / mês
//   Produtos      tabela dos produtos da categoria (e das subcategorias) com vendas, parte, estoque e estado;
//                 ordenar por receita, unidades, nome ou menos estoque; cada linha abre os números do produto
//   Detalhe       vendas por subcategoria e por país, clientes que mais compraram, pedidos recentes
// Produtos da categoria = ligados em product_categories ou com products.category igual ao nome/slug
// (categoryProductIds em src/hooks/useSalesStats.ts). Contas em src/lib/salesStats.ts.
// =====================================================================================
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Ban, Boxes, Clock, ExternalLink, FolderTree, Globe2, LayoutGrid, Package, Pencil, PieChart, Receipt, ShoppingBag, Users, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import AdminShell from "@/components/admin/shell/AdminShell";
import { AdminPageHeader, AdminPanel } from "@/components/admin/shell/AdminPageParts";
import { adminHref } from "@/components/admin/shell/adminSections";
import { AdminPager, AdminStatCard, FilterChips } from "@/components/admin/AdminListKit";
import { BreakdownPanel, PeriodChips, RecentOrdersPanel, SalesChart, TopCustomersPanel } from "@/components/admin/stats/StatsParts";
import { useAdminFormat, usePaged } from "@/hooks/useAdminList";
import { categoryProductIds, useCatalogIndex, useSalesLines, type CatalogProduct } from "@/hooks/useSalesStats";
import { breakdown, compareWindows, inPeriod, isSold, summarize, type BreakdownRow, type SalePeriod } from "@/lib/salesStats";
import { subSlugOf } from "@/lib/catalogMenu";
import { useMessages } from "@/i18n";
import { adminStatsMessages } from "@/i18n/adminStats";

type Index = NonNullable<ReturnType<typeof useCatalogIndex>["data"]>;
type Sort = "revenue" | "units" | "name" | "stock";

export default function AdminCategoryPage() {
  const { id } = useParams();
  const { t } = useMessages(adminStatsMessages);
  const { data: index, isLoading } = useCatalogIndex();
  const category = index?.categories.find((c) => c.id === id) ?? null;
  const back = { to: adminHref.section("categories"), label: t("back_categories") };

  return (
    <AdminShell active="categories">
      {isLoading ? (
        <div className="space-y-4"><Skeleton className="h-12 w-72" /><Skeleton className="h-28 w-full" /><Skeleton className="h-72 w-full" /></div>
      ) : !category || !index ? (
        <>
          <AdminPageHeader back={back} title={t("category_not_found")} />
          <p className="text-muted-foreground">{t("category_not_found_hint")}</p>
        </>
      ) : (
        <CategoryStats key={category.id} categoryId={category.id} index={index} back={back} />
      )}
    </AdminShell>
  );
}

function CategoryStats({ categoryId, index, back }: { categoryId: string; index: Index; back: { to: string; label: string } }) {
  const { t } = useMessages(adminStatsMessages);
  const fmt = useAdminFormat();
  const [period, setPeriod] = useState<SalePeriod>("90d");
  const [sort, setSort] = useState<Sort>("revenue");
  const category = index.categories.find((c) => c.id === categoryId)!;
  const parent = category.parent_id ? index.categories.find((c) => c.id === category.parent_id) ?? null : null;
  const children = useMemo(() => index.categories.filter((c) => c.parent_id === categoryId), [index, categoryId]);

  const productIds = useMemo(() => [...categoryProductIds(categoryId, index)], [categoryId, index]);
  const products = useMemo(() => index.products.filter((p) => productIds.includes(p.id)), [index, productIds]);
  const { lines, isLoading } = useSalesLines(productIds.length ? productIds : undefined);
  const { lines: storeLines } = useSalesLines("all");

  const scoped = useMemo(() => inPeriod(lines, period), [lines, period]);
  const s = useMemo(() => summarize(scoped), [scoped]);
  const all = useMemo(() => summarize(lines), [lines]);
  const cmp = useMemo(() => compareWindows(lines, 30), [lines]);
  const storeRevenue = useMemo(() => summarize(inPeriod(storeLines, period)).revenue, [storeLines, period]);
  const byCountry = useMemo(() => breakdown(scoped, (l) => l.country), [scoped]);
  const byProduct = useMemo(() => new Map(breakdown(scoped, (l) => l.productId).map((r) => [r.key, r])), [scoped]);

  // Subcategorias: o que foi vendido dos produtos de cada filha (um produto pode estar em mais de uma).
  const bySub = useMemo<BreakdownRow[]>(() => {
    const sold = scoped.filter(isSold);
    const total = sold.reduce((sum, l) => sum + l.price * l.quantity, 0);
    return children.map((c) => {
      const ids = categoryProductIds(c.id, index);
      const mine = sold.filter((l) => ids.has(l.productId));
      const revenue = mine.reduce((sum, l) => sum + l.price * l.quantity, 0);
      return { key: c.id, units: mine.reduce((sum, l) => sum + l.quantity, 0), revenue, orders: new Set(mine.map((l) => l.orderId)).size, share: total ? revenue / total : 0 };
    }).sort((a, b) => b.revenue - a.revenue || a.units - b.units);
  }, [scoped, children, index]);

  const rows = useMemo(() => {
    const list = products.map((p) => ({ p, r: byProduct.get(p.id) ?? null }));
    const stock = (p: CatalogProduct) => (p.customizable || p.stock_quantity == null ? Number.POSITIVE_INFINITY : p.stock_quantity);
    const byName = (a: { p: CatalogProduct }, b: { p: CatalogProduct }) => a.p.name.localeCompare(b.p.name, fmt.locale);
    return list.sort((a, b) =>
      sort === "name" ? byName(a, b)
        : sort === "stock" ? stock(a.p) - stock(b.p) || byName(a, b)
          : sort === "units" ? (b.r?.units ?? 0) - (a.r?.units ?? 0) || byName(a, b)
            : (b.r?.revenue ?? 0) - (a.r?.revenue ?? 0) || byName(a, b));
  }, [products, byProduct, sort, fmt.locale]);
  const paged = usePaged(rows, 15);

  const pct = (v: number, digits = 1) => new Intl.NumberFormat(fmt.locale, { style: "percent", maximumFractionDigits: digits }).format(v);
  const delta = cmp.deltaPct == null ? t("vs_prev_none")
    : t("vs_prev", { pct: new Intl.NumberFormat(fmt.locale, { style: "percent", maximumFractionDigits: 0, signDisplay: "exceptZero" }).format(cmp.deltaPct) });
  const regionNames = useMemo(() => { try { return new Intl.DisplayNames([fmt.locale], { type: "region" }); } catch { return null; } }, [fmt.locale]);
  const activeCount = products.filter((p) => p.is_active).length;
  const storeUrl = parent ? `/categoria/${parent.slug}?sub=${encodeURIComponent(subSlugOf(parent.slug, category.slug))}` : `/categoria/${category.slug}`;
  const childName = (key: string) => children.find((c) => c.id === key)?.name ?? key;

  return (
    <>
      <AdminPageHeader
        back={back}
        title={
          <span className="flex items-center gap-3">
            {category.image_url
              ? <img src={category.image_url} alt="" className="h-14 w-14 shrink-0 rounded-[14px] border object-cover" />
              : <span className="grid h-14 w-14 shrink-0 place-items-center rounded-[14px] bg-muted"><LayoutGrid className="h-6 w-6 text-muted-foreground" aria-hidden="true" /></span>}
            <span className="min-w-0 break-words">{category.name}</span>
          </span>
        }
        subtitle={parent
          ? <Link to={adminHref.category(parent.id)} className="font-medium text-foreground hover:underline">{t("sub_of", { name: parent.name })}</Link>
          : t("main_category")}
        badges={
          <>
            {category.is_active === false
              ? <Badge variant="outline">{t("inactive")}</Badge>
              : category.show_in_menu === false
                ? <Badge variant="outline">{t("not_in_menu")}</Badge>
                : <Badge variant="outline" className="border-emerald-600/40 bg-emerald-50 text-emerald-700">{t("in_menu")}</Badge>}
          </>
        }
        actions={
          <>
            <Button asChild><Link to={adminHref.editCategory(category.id)}><Pencil className="h-4 w-4" aria-hidden="true" />{t("edit_category")}</Link></Button>
            <Button asChild variant="outline"><a href={storeUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" aria-hidden="true" />{t("view_in_store")}</a></Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <PeriodChips value={period} onChange={setPeriod} />
        {all.firstSale && <p className="text-xs text-muted-foreground">{t("first_last", { first: fmt.date(all.firstSale), last: fmt.relative(all.lastSale) })}</p>}
      </div>

      {isLoading && productIds.length > 0 ? <Skeleton className="h-64 w-full" /> : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <AdminStatCard icon={Wallet} label={t("revenue")} value={fmt.money(s.revenue)} hint={period === "30d" ? delta : t("revenue_hint")} tone="success" />
            <AdminStatCard icon={ShoppingBag} label={t("units")} value={s.units} hint={`${t("avg_price")}: ${fmt.money(s.avgPrice)}`} />
            <AdminStatCard icon={Receipt} label={t("orders")} value={s.orders} hint={`${t("avg_per_order")}: ${fmt.money(s.avgPerOrder)}`} />
            <AdminStatCard icon={Users} label={t("customers")} value={s.customers} />
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <AdminStatCard icon={Boxes} label={t("products_n")} value={products.length} hint={t("products_active", { n: activeCount })} />
            <AdminStatCard icon={PieChart} label={t("share_store")} value={storeRevenue > 0 ? pct(s.revenue / storeRevenue) : "-"} hint={t("share_store_hint")} />
            <AdminStatCard icon={Clock} label={t("pending")} value={s.pendingUnits} hint={t("pending_hint", { n: s.pendingUnits, value: fmt.money(s.pendingRevenue) })} tone={s.pendingUnits ? "warning" : "default"} />
            <AdminStatCard icon={Ban} label={t("cancelled")} value={s.cancelledUnits} hint={t("cancelled_hint", { pct: pct(s.cancelRate) })} />
          </div>

          <SalesChart lines={scoped} period={period} />

          <AdminPanel title={t("products_title", { n: products.length })} icon={Package}>
            {!products.length ? (
              <p className="text-sm text-muted-foreground">{t("products_empty")}</p>
            ) : (
              <>
                <div className="mb-3">
                  <FilterChips<Sort> label={t("sort_label")} value={sort} onChange={setSort}
                    options={(["revenue", "units", "name", "stock"] as Sort[]).map((v) => ({ value: v, label: t(`sort_${v}`) }))} />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="pb-2 font-medium">{t("col_product")}</th>
                        <th className="pb-2 text-right font-medium">{t("col_units")}</th>
                        <th className="pb-2 text-right font-medium">{t("col_revenue")}</th>
                        <th className="hidden pb-2 pl-4 font-medium md:table-cell">{t("col_share")}</th>
                        <th className="hidden pb-2 text-right font-medium sm:table-cell">{t("col_stock")}</th>
                        <th className="hidden pb-2 pl-4 font-medium sm:table-cell">{t("col_status")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {paged.items.map(({ p, r }) => (
                        <tr key={p.id}>
                          <td className="py-2 pr-3">
                            <Link to={adminHref.productStats(p.id)} className="flex min-w-0 items-center gap-2.5 font-medium hover:underline" aria-label={t("open_product", { name: p.name })}>
                              {p.image
                                ? <img src={p.image} alt="" className="h-9 w-9 shrink-0 rounded-[10px] border object-cover" loading="lazy" />
                                : <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-muted"><Boxes className="h-4 w-4 text-muted-foreground" aria-hidden="true" /></span>}
                              <span className="max-w-[120px] truncate sm:max-w-[240px]">{p.name}</span>
                            </Link>
                          </td>
                          <td className="py-2 text-right tabular-nums">{r?.units ?? 0}</td>
                          <td className="py-2 text-right tabular-nums whitespace-nowrap">{r ? fmt.money(r.revenue) : <span className="text-muted-foreground">{t("no_sales_short")}</span>}</td>
                          <td className="hidden py-2 pl-4 md:table-cell">
                            {r && (
                              <span className="flex items-center gap-2">
                                <span className="h-2 w-20 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                                  <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(2, r.share * 100)}%` }} />
                                </span>
                                <span className="text-xs tabular-nums text-muted-foreground">{pct(r.share, 0)}</span>
                              </span>
                            )}
                          </td>
                          <td className="hidden py-2 text-right tabular-nums sm:table-cell">
                            {p.customizable || p.stock_quantity == null ? "-" : p.stock_quantity <= 0
                              ? <span className="font-medium text-destructive">{t("stock_out")}</span> : p.stock_quantity}
                          </td>
                          <td className="hidden py-2 pl-4 sm:table-cell">
                            {p.is_active
                              ? <Badge variant="outline" className="border-emerald-600/40 bg-emerald-50 text-emerald-700">{t("active")}</Badge>
                              : <Badge variant="outline">{t("hidden")}</Badge>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <AdminPager page={paged.page} pages={paged.pages} total={paged.total} from={paged.from} to={paged.to} onPage={paged.setPage} />
              </>
            )}
          </AdminPanel>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            {children.length > 0 && (
              <BreakdownPanel title={t("subcategories")} icon={FolderTree} rows={bySub} firstCol={t("col_subcategory")}
                labelOf={childName} href={(key) => adminHref.category(key)} limit={50} />
            )}
            <BreakdownPanel title={t("by_country")} icon={Globe2} rows={byCountry} labelOf={(k) => regionNames?.of(k) ?? k} />
            <TopCustomersPanel lines={scoped} />
          </div>

          <RecentOrdersPanel lines={lines} />
        </div>
      )}
    </>
  );
}
