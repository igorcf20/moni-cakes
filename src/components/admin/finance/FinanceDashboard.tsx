// =====================================================================================
// Admin > Financeiro > Painel: números, gráficos e tabelas do período com os filtros (estado no endereço, para
// poder voltar e partilhar o link).
//   Filtros      período (este mês, mês passado, 30 / 90 dias, este ano, 12 meses, tudo, datas), comparação
//                (período anterior, mesmo período do ano passado, nenhuma), situação do pedido, meio de pagamento,
//                país, produto, categoria e cliente
//   Números      faturamento, lucro líquido, margem, ticket médio, pedidos, custos, despesas, a pagar e a receber,
//                com variação e minigráfico; meta do mês
//   Gráficos     faturamento x custos x lucro no tempo (com o período de comparação), do faturamento ao lucro
//   Divisões     meios de pagamento, países, categorias, despesas por categoria, produtos, clientes
//   Tabelas      fluxo de caixa por mês e pedidos do filtro (exportar para planilha)
// Contas em src/lib/finance.ts; dados em src/hooks/useFinance.ts.
// =====================================================================================
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertTriangle, ArrowDownToLine, ArrowUpFromLine, CalendarClock, CircleDollarSign, Coins, CreditCard, Download, FolderTree, Globe2,
  Info, Package, Percent, Receipt, RotateCcw, ShoppingBag, SlidersHorizontal, Target, TrendingUp, Users, Wallet, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminPager, FilterChips } from "@/components/admin/AdminListKit";
import HelpTip from "@/components/admin/HelpTip";
import { AdminPanel } from "@/components/admin/shell/AdminPageParts";
import { adminHref } from "@/components/admin/shell/adminSections";
import { useAdminFormat, usePaged } from "@/hooks/useAdminList";
import { useFinanceCategories, useFinanceData, useFinanceEntries, useFinanceSettings, usePaymentTypes, type FinanceCategory } from "@/hooks/useFinance";
import {
  autoGrain, cashFlow, compareRange, delta, entrySplit, financeSeries, goalProgress, inRange, inStatusGroup, isOverdue, orderFinance,
  presetRange, productSplit, splitBy, summarize, waterfall, PERIOD_PRESETS,
  type CompareMode, type FinItem, type FinRow, type PeriodPreset, type StatusGroup,
} from "@/lib/finance";
import { paymentMethodLabel } from "@/lib/orderStatusStyles";
import { csvNumber, downloadCsv } from "@/lib/csv";
import { cn } from "@/lib/utils";
import { useMessages } from "@/i18n";
import { adminFinanceMessages, type AdminFinanceKey } from "@/i18n/adminFinance";
import { FinanceKpi, MoneyWaterfall, SplitPanel, TrendChart, useGrainLabel, usePercent } from "./FinanceParts";

const STATUS: StatusGroup[] = ["paid", "pending", "cancelled", "all"];
const COMPARE: CompareMode[] = ["previous", "year", "none"];
const FILTER_KEYS = ["pg", "pais", "prod", "cat", "cli"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

export function categoryLabel(c: Pick<FinanceCategory, "code" | "name"> | undefined, t: (k: AdminFinanceKey) => string) {
  if (!c) return t("no_category");
  return c.name || (c.code ? t(`cat_${c.code}` as AdminFinanceKey) : t("no_category"));
}

const selectCls = "h-10 w-full rounded-[12px] border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export default function FinanceDashboard({ onEntries }: { onEntries: () => void }) {
  const { t, locale } = useMessages(adminFinanceMessages);
  const fmt = useAdminFormat();
  const { pct } = usePercent();
  const grainLabel = useGrainLabel();
  const [params, setParams] = useSearchParams();
  const [moreOpen, setMoreOpen] = useState(false);

  const preset = (PERIOD_PRESETS as string[]).includes(params.get("p") ?? "") ? (params.get("p") as PeriodPreset) : "month";
  const cmp = (COMPARE as string[]).includes(params.get("cmp") ?? "") ? (params.get("cmp") as CompareMode) : "previous";
  const status = (STATUS as string[]).includes(params.get("st") ?? "") ? (params.get("st") as StatusGroup) : "paid";
  const f = Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) || ""])) as Record<FilterKey, string>;
  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); }
    setParams(next, { replace: true });
  };

  const { orders, index, isLoading, error } = useFinanceData();
  const { entries, isLoading: entriesLoading } = useFinanceEntries();
  const { data: settings, isLoading: settingsLoading } = useFinanceSettings();
  const { data: categories = [] } = useFinanceCategories();
  const loading = isLoading || entriesLoading || settingsLoading || !settings;

  const first = useMemo(() => {
    const d = orders.reduce<number | null>((m, o) => (m == null || +new Date(o.createdAt) < m ? +new Date(o.createdAt) : m), null);
    return d == null ? null : new Date(d);
  }, [orders]);
  const range = useMemo(() => presetRange(preset, new Date(), { from: params.get("de"), to: params.get("ate") }, first), [preset, params, first]);
  const prevRange = useMemo(() => (preset === "all" ? null : compareRange(range, cmp)), [preset, range, cmp]);
  const grain = autoGrain(range);

  const itemFilter = useMemo<((i: FinItem) => boolean) | undefined>(() =>
    f.prod || f.cat ? (i) => (!f.prod || i.productId === f.prod) && (!f.cat || i.categoryIds.includes(f.cat)) : undefined, [f.prod, f.cat]);
  const orderFilters = !!(f.pg || f.pais || f.cli || f.prod || f.cat);

  // Pedidos do filtro (todas as datas), já com as contas; depois cortados por período.
  const allRows = useMemo<FinRow[]>(() => {
    if (!settings) return [];
    return orders
      .filter((o) => inStatusGroup(o, status) && (!f.pg || o.paymentMethod === f.pg) && (!f.pais || o.country === f.pais) && (!f.cli || o.customerKey === f.cli))
      .map((o) => orderFinance(o, settings, itemFilter))
      .filter((r) => r.share > 0);
  }, [orders, settings, status, f.pg, f.pais, f.cli, itemFilter]);
  // Lançamentos só entram sem filtros de pedido e com a situação "pagos" ou "todos" (não pertencem a um pedido).
  const useEntries = !orderFilters && (status === "paid" || status === "all");
  const rows = useMemo(() => allRows.filter((r) => inRange(r.date, range)), [allRows, range]);
  const prevRows = useMemo(() => (prevRange ? allRows.filter((r) => inRange(r.date, prevRange)) : []), [allRows, prevRange]);
  const ents = useMemo(() => (useEntries ? entries.filter((e) => inRange(e.occurredOn, range)) : []), [entries, range, useEntries]);
  const prevEnts = useMemo(() => (useEntries && prevRange ? entries.filter((e) => inRange(e.occurredOn, prevRange)) : []), [entries, prevRange, useEntries]);

  const sum = useMemo(() => summarize(rows, ents), [rows, ents]);
  const prev = useMemo(() => (prevRange ? summarize(prevRows, prevEnts) : null), [prevRange, prevRows, prevEnts]);
  const series = useMemo(() => financeSeries(rows, ents, range, grain), [rows, ents, range, grain]);
  const prevSeries = useMemo(() => (prevRange ? financeSeries(prevRows, prevEnts, prevRange, grain) : null), [prevRange, prevRows, prevEnts, grain]);
  const flow = useMemo(() => cashFlow(rows, ents, range), [rows, ents, range]);
  const steps = useMemo(() => waterfall(sum), [sum]);

  const pendingAll = useMemo(() => entries.filter((e) => e.status === "pending"), [entries]);
  const toPay = pendingAll.filter((e) => e.kind === "expense").reduce((s, e) => s + (e.amount ?? 0), 0);
  const toReceive = pendingAll.filter((e) => e.kind === "income").reduce((s, e) => s + (e.amount ?? 0), 0);
  const overdue = pendingAll.filter((e) => isOverdue(e)).length;
  const missingRate = entries.filter((e) => e.amount == null).length;

  // Meta do mês corrente (sempre o mês de hoje, com os mesmos filtros).
  const goal = useMemo(() => {
    if (!settings?.monthlyGoal) return null;
    const m = presetRange("month", new Date());
    return goalProgress(settings.monthlyGoal, allRows.filter((r) => inRange(r.date, m) && inStatusGroup(r.order, "paid")).reduce((s, r) => s + r.gross, 0));
  }, [settings, allRows]);

  const productName = (id: string) => index?.products.find((p) => p.id === id)?.name ?? t("removed_product");
  const catName = (id: string) => index?.categories.find((c) => c.id === id)?.name ?? id;
  const regionNames = useMemo(() => { try { return new Intl.DisplayNames([locale], { type: "region" }); } catch { return null; } }, [locale]);
  const country = (k: string) => (k ? regionNames?.of(k) ?? k : t("unknown"));
  const { data: payTypes = [] } = usePaymentTypes();
  // Nome que a loja deu ao meio em Pagamentos; senão o nome do catálogo.
  const method = (k: string) => (k ? payTypes.find((p) => p.type === k)?.name || paymentMethodLabel(k, locale) : t("unknown"));

  // Opções dos filtros: só o que aparece nos pedidos.
  const options = useMemo(() => {
    const pg = new Set<string>(), pais = new Set<string>(), prods = new Set<string>(), cats = new Set<string>();
    const clis = new Map<string, string>();
    for (const o of orders) {
      if (o.paymentMethod) pg.add(o.paymentMethod);
      if (o.country) pais.add(o.country);
      for (const i of o.items) { prods.add(i.productId); i.categoryIds.forEach((c) => cats.add(c)); }
      if (o.customerName || o.customerKey) clis.set(o.customerKey, o.customerName || t("guest"));
    }
    const byLabel = (a: [string, string], b: [string, string]) => a[1].localeCompare(b[1], locale);
    return {
      pg: [...pg].map((k) => [k, method(k)] as [string, string]).sort(byLabel),
      pais: [...pais].map((k) => [k, country(k)] as [string, string]).sort(byLabel),
      prod: [...prods].map((k) => [k, productName(k)] as [string, string]).sort(byLabel),
      cat: [...cats].map((k) => [k, catName(k)] as [string, string]).sort(byLabel),
      cli: [...clis.entries()].sort(byLabel),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, index, locale, payTypes]);
  const optionLabel = (k: FilterKey, v: string) => options[k].find(([id]) => id === v)?.[1] ?? v;
  const activeFilters = FILTER_KEYS.filter((k) => f[k]);

  // Divisões.
  const byMethod = useMemo(() => splitBy(rows, (r) => r.order.paymentMethod), [rows]);
  const byCountry = useMemo(() => splitBy(rows, (r) => r.order.country), [rows]);
  const byCustomer = useMemo(() => splitBy(rows, (r) => r.order.customerKey), [rows]);
  const products = useMemo(() => productSplit(rows, itemFilter), [rows, itemFilter]);
  const byCategory = useMemo(() => {
    if (!index) return [];
    const tops = new Set(index.categories.filter((c) => !c.parent_id).map((c) => c.id));
    const map = new Map<string, number>();
    let total = 0;
    for (const r of rows) for (const i of r.order.items) {
      if (itemFilter && !itemFilter(i)) continue;
      const v = i.price * i.quantity;
      total += v;
      const top = i.categoryIds.find((c) => tops.has(c)) ?? "";
      map.set(top, (map.get(top) ?? 0) + v);
    }
    return [...map.entries()].map(([key, v]) => ({ key, value: Math.round(v * 100) / 100, share: total ? v / total : 0 })).sort((a, b) => b.value - a.value);
  }, [rows, index, itemFilter]);
  const expenseSplit = useMemo(() => entrySplit(ents, "expense"), [ents]);
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const orderRows = useMemo(() => [...rows].sort((a, b) => b.date.localeCompare(a.date)), [rows]);
  const paged = usePaged(orderRows, 15);

  const sparkOf = (k: "revenue" | "profit" | "costs") => series.map((p) => p[k]);

  const exportOrders = () => {
    const cols: AdminFinanceKey[] = ["col_date", "col_order", "col_customer", "col_method", "col_country", "s_revenue", "w_taxes", "w_refunds",
      "col_shipping_charged", "w_shippingCost", "w_fees", "w_productCost", "w_commission", "col_discounts", "s_profit"];
    downloadCsv(t("csv_orders"), cols.map((c) => t(c)), orderRows.map((r) => [
      fmt.date(r.date), r.order.id.slice(0, 8), r.order.customerName, method(r.order.paymentMethod ?? ""), r.order.country ?? "",
      ...[r.gross, r.taxes, r.refunds, r.shippingCharged, r.shippingCost, r.fees, r.productCost, r.commission, r.discounts, r.profit].map((v) => csvNumber(v, fmt.locale)),
    ]));
  };
  const exportFlow = () => {
    downloadCsv(t("csv_cashflow"), [t("col_month"), t("col_inflow"), t("col_outflow"), t("col_balance"), t("col_cumulative")],
      flow.map((m) => [grainLabel.long(m.month, "month"), ...[m.inflow, m.outflow, m.balance, m.cumulative].map((v) => csvNumber(v, fmt.locale))]));
  };

  const wLabels: Record<string, string> = {
    gross: t("s_revenue"), taxes: t("w_taxes"), refunds: t("w_refunds"), productCost: t("w_productCost"), shippingCost: t("w_shippingCost"),
    fees: t("w_fees"), commission: t("w_commission"), expenses: t("w_expenses"), otherIncome: t("w_otherIncome"), profit: t("k_profit"),
  };
  const wHelps: Record<string, string> = {
    taxes: t("w_taxes_help"), shippingCost: t("w_shippingCost_help"), fees: t("w_fees_help"), productCost: t("w_productCost_help"),
    commission: t("w_commission_help"), expenses: t("w_expenses_help"),
  };

  const rangeText = `${fmt.date(range.from)} ${t("to")} ${fmt.date(new Date(+range.to - 86_400_000))}`;
  const prevText = prevRange ? `${fmt.date(prevRange.from)} ${t("to")} ${fmt.date(new Date(+prevRange.to - 86_400_000))}` : null;

  if (error) return <p role="alert" className="rounded-[14px] border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{t("load_error")}</p>;

  return (
    <div className="space-y-5">
      {/* Filtros */}
      <AdminPanel>
        <div className="space-y-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <FilterChips<PeriodPreset> label={t("period")} value={preset}
              onChange={(p) => set({ p: p === "month" ? null : p, ...(p !== "custom" ? { de: null, ate: null } : {}) })}
              options={PERIOD_PRESETS.map((p) => ({ value: p, label: t(`p_${p}` as AdminFinanceKey) }))} />
            <label className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1">{t("compare")}<HelpTip text={t("compare_help")} label={t("compare")} className="h-6 w-6" /></span>
              <select className={cn(selectCls, "w-auto min-w-[180px]")} value={cmp} disabled={preset === "all"} onChange={(e) => set({ cmp: e.target.value === "previous" ? null : e.target.value })}>
                {COMPARE.map((c) => <option key={c} value={c}>{t(`cmp_${c}` as AdminFinanceKey)}</option>)}
              </select>
            </label>
          </div>
          {preset === "custom" && (
            <div className="flex flex-wrap items-end gap-3">
              <label className="space-y-1 text-sm"><span className="block text-xs font-medium text-muted-foreground">{t("from")}</span>
                <Input type="date" className="w-auto" value={params.get("de") ?? ""} onChange={(e) => set({ de: e.target.value })} /></label>
              <label className="space-y-1 text-sm"><span className="block text-xs font-medium text-muted-foreground">{t("until")}</span>
                <Input type="date" className="w-auto" value={params.get("ate") ?? ""} onChange={(e) => set({ ate: e.target.value })} /></label>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <FilterChips<StatusGroup> label={t("status")} value={status} onChange={(s) => set({ st: s === "paid" ? null : s })}
              options={STATUS.map((s) => ({ value: s, label: t(`st_${s}` as AdminFinanceKey) }))} />
            <Button type="button" variant="outline" size="sm" className="min-h-9 md:hidden" aria-expanded={moreOpen} onClick={() => setMoreOpen((v) => !v)}>
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />{t("more_filters")}{activeFilters.length > 0 && ` (${activeFilters.length})`}
            </Button>
          </div>
          <div className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-5", !moreOpen && "hidden md:grid")}>
            {FILTER_KEYS.map((k) => (
              <label key={k} className="min-w-0 space-y-1">
                <span className="block text-xs font-medium text-muted-foreground">{t(`f_${k}` as AdminFinanceKey)}</span>
                <select className={selectCls} value={f[k]} onChange={(e) => set({ [k]: e.target.value || null })}>
                  <option value="">{t("f_all")}</option>
                  {options[k].map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <CalendarClock className="h-4 w-4" aria-hidden="true" />
            <span>{rangeText}{prevText && <> <span className="mx-1">·</span>{t("compared_with", { range: prevText })}</>}</span>
            {activeFilters.map((k) => (
              <button key={k} type="button" onClick={() => set({ [k]: null })}
                className="inline-flex min-h-7 items-center gap-1 rounded-full border bg-muted/40 px-2.5 font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={t("remove_filter", { name: optionLabel(k, f[k]) })}>
                {optionLabel(k, f[k])}<X className="h-3 w-3" aria-hidden="true" />
              </button>
            ))}
            {activeFilters.length > 1 && (
              <button type="button" className="font-medium text-brand-orange-text underline-offset-2 hover:underline" onClick={() => set(Object.fromEntries(FILTER_KEYS.map((k) => [k, null])))}>{t("clear_filters")}</button>
            )}
          </div>
        </div>
      </AdminPanel>

      {status !== "paid" && (
        <p role="status" className="flex items-start gap-2 rounded-[14px] border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{t(`st_${status}_note` as AdminFinanceKey)}
        </p>
      )}
      {!useEntries && (status === "paid" || status === "all") && (
        <p role="status" className="flex items-start gap-2 rounded-[14px] border bg-muted/40 p-3 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{t("entries_off_note")}
        </p>
      )}

      {loading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-[132px] rounded-[18px]" />)}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <FinanceKpi icon={Wallet} label={t("k_gross")} value={fmt.money(sum.gross)} help={t("k_gross_help")} delta={prev ? delta(sum.gross, prev.gross) : undefined} spark={sparkOf("revenue")}
              hint={t("k_gross_hint", { value: fmt.money(sum.net) })} />
            <FinanceKpi icon={TrendingUp} label={t("k_profit")} value={fmt.money(sum.profit)} help={t("k_profit_help")} delta={prev ? delta(sum.profit, prev.profit) : undefined}
              spark={sparkOf("profit")} tone={sum.profit < 0 ? "danger" : "default"} />
            <FinanceKpi icon={Percent} label={t("k_margin")} value={sum.margin == null ? "-" : pct(sum.margin)} help={t("k_margin_help")}
              hint={prev?.margin != null ? t("k_margin_hint", { value: pct(prev.margin) }) : undefined} tone={sum.margin != null && sum.margin < 0 ? "danger" : "default"} />
            <FinanceKpi icon={Receipt} label={t("k_ticket")} value={fmt.money(sum.avgTicket)} help={t("k_ticket_help")} delta={prev ? delta(sum.avgTicket, prev.avgTicket) : undefined} />
            <FinanceKpi icon={ShoppingBag} label={t("k_orders")} value={sum.orders} help={t("k_orders_help")} delta={prev ? delta(sum.orders, prev.orders) : undefined}
              hint={t("k_orders_hint", { n: sum.units })} />
            <FinanceKpi icon={Coins} label={t("k_costs")} value={fmt.money(sum.costs)} help={t("k_costs_help")} delta={prev ? delta(sum.costs, prev.costs) : undefined}
              goodWhenUp={false} spark={sparkOf("costs")} hint={sum.gross > 0 ? t("k_costs_hint", { pct: pct(sum.costs / sum.gross) }) : undefined} />
            <FinanceKpi icon={ArrowUpFromLine} label={t("k_expenses")} value={fmt.money(sum.expenses)} help={t("k_expenses_help")} delta={prev ? delta(sum.expenses, prev.expenses) : undefined}
              goodWhenUp={false} hint={sum.otherIncome ? t("k_expenses_hint", { value: fmt.money(sum.otherIncome) }) : undefined} />
            <FinanceKpi icon={ArrowDownToLine} label={t("k_open")} value={fmt.money(toPay)} help={t("k_open_help")} tone={overdue ? "danger" : "default"}
              hint={<>{t("k_open_hint", { value: fmt.money(toReceive) })}{overdue > 0 && <span className="block font-semibold text-destructive">{t("k_overdue", { n: overdue })}</span>}</>} />
          </div>

          {goal && (
            <AdminPanel>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <span className="flex items-center gap-2 text-sm font-semibold"><Target className="h-4 w-4 text-brand-orange-text" aria-hidden="true" />{t("goal_title")}</span>
                <div className="min-w-0 flex-1">
                  <div className="h-3 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(1, goal.ratio) * 100)} aria-label={t("goal_title")}>
                    <div className="h-full rounded-full bg-[image:var(--gradient-primary)] transition-[width] duration-200" style={{ width: `${Math.min(100, goal.ratio * 100)}%` }} />
                  </div>
                </div>
                <p className="text-sm tabular-nums text-muted-foreground">
                  {t("goal_line", { done: fmt.money(goal.done), goal: fmt.money(goal.goal), pct: pct(goal.ratio) })}{" "}
                  <span className={cn("font-medium", goal.onTrack ? "text-emerald-700" : "text-amber-700")}>{t(goal.onTrack ? "goal_on_track" : "goal_behind", { value: fmt.money(goal.projected) })}</span>
                </p>
              </div>
            </AdminPanel>
          )}

          {sum.missingCostValue > 0 && (
            <div role="status" className="flex items-start gap-3 rounded-[14px] border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p>{t("missing_cost", { value: fmt.money(sum.missingCostValue) })}{" "}
                <Link to={adminHref.section("profit")} className="font-semibold underline underline-offset-2 hover:no-underline">{t("missing_cost_link")}</Link></p>
            </div>
          )}
          {missingRate > 0 && (
            <p role="status" className="flex items-start gap-2 rounded-[14px] border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{t("missing_rate", { n: missingRate })} <Link to={adminHref.section("currencies")} className="font-semibold underline underline-offset-2">{t("missing_rate_link")}</Link></span>
            </p>
          )}

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <div className="min-w-0 xl:col-span-2"><TrendChart points={series} prev={prevSeries} grain={grain} /></div>
            <MoneyWaterfall steps={steps} labels={wLabels} helps={wHelps} />
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3">
            <SplitPanel title={t("by_method")} icon={CreditCard} empty={t("no_sales")}
              items={byMethod.map((r) => ({ key: r.key, label: method(r.key), value: r.gross, share: r.share, sub: t("split_sub", { n: r.orders, profit: fmt.money(r.profit) }) }))} />
            <SplitPanel title={t("by_country")} icon={Globe2} empty={t("no_sales")}
              items={byCountry.map((r) => ({ key: r.key, label: country(r.key), value: r.gross, share: r.share, sub: t("split_sub", { n: r.orders, profit: fmt.money(r.profit) }) }))} />
            <SplitPanel title={t("by_category")} icon={FolderTree} empty={t("no_sales")} help={t("by_category_help")}
              items={byCategory.map((r) => ({ key: r.key || "none", label: r.key ? catName(r.key) : t("no_category"), value: r.value, share: r.share, href: r.key ? adminHref.category(r.key) : null }))} />
            <SplitPanel title={t("by_expense")} icon={ArrowUpFromLine} empty={useEntries ? t("no_expenses") : t("entries_off_short")} help={t("by_expense_help")}
              actions={<Button type="button" variant="ghost" size="sm" onClick={onEntries}>{t("see_entries")}</Button>}
              items={expenseSplit.map((r) => {
                const c = r.key ? catById.get(r.key) : undefined;
                return { key: r.key || "none", label: categoryLabel(c, t), value: r.amount, share: r.share, dot: c?.color ?? null, sub: t("n_entries", { n: r.count }) };
              })} />
            <SplitPanel title={t("by_customer")} icon={Users} empty={t("no_sales")}
              items={byCustomer.map((r) => {
                const o = rows.find((x) => x.order.customerKey === r.key)?.order;
                return { key: r.key, label: o?.customerName || t("guest"), value: r.gross, share: r.share, href: o?.userId ? adminHref.customer(o.userId) : null, sub: t("split_sub", { n: r.orders, profit: fmt.money(r.profit) }) };
              })} />
            <AdminPanel title={t("top_products")} icon={Package}
              actions={<Button asChild variant="ghost" size="sm"><Link to={adminHref.section("profit")}>{t("see_profit")}</Link></Button>}>
              {!products.length ? <p className="py-6 text-sm text-muted-foreground">{t("no_sales")}</p> : (
                <ul className="divide-y">
                  {products.slice(0, 8).map((p) => (
                    <li key={p.productId} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span className="min-w-0">
                        <Link to={adminHref.productStats(p.productId)} className="block truncate font-medium hover:underline">{productName(p.productId)}</Link>
                        <span className="text-xs text-muted-foreground">{t("units", { n: p.units })} · {fmt.money(p.revenue)}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className={cn("block font-semibold tabular-nums", p.profit != null && p.profit < 0 && "text-destructive")}>{p.profit == null ? t("no_cost") : fmt.money(p.profit)}</span>
                        {p.profit != null && p.revenue > 0 && <span className="text-xs text-muted-foreground">{t("margin_short", { pct: pct(p.profit / p.revenue) })}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </AdminPanel>
          </div>

          <AdminPanel title={<span className="inline-flex items-center gap-1">{t("cashflow_title")}<HelpTip text={t("cashflow_help")} label={t("cashflow_title")} className="h-6 w-6" /></span>} icon={CircleDollarSign}
            actions={<Button type="button" variant="outline" size="sm" onClick={exportFlow} disabled={!flow.length}><Download className="h-4 w-4" aria-hidden="true" />{t("export")}</Button>}>
            <CashFlowTable flow={flow} />
          </AdminPanel>

          <AdminPanel title={t("orders_title")} icon={ShoppingBag}
            actions={<Button type="button" variant="outline" size="sm" onClick={exportOrders} disabled={!orderRows.length}><Download className="h-4 w-4" aria-hidden="true" />{t("export")}</Button>}>
            <div className="overflow-x-auto rounded-[14px] border">
              <table className="w-full min-w-[760px] text-sm" aria-label={t("orders_title")}>
                <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">{t("col_order")}</th>
                    <th className="px-3 py-2 font-medium">{t("col_customer")}</th>
                    <th className="px-3 py-2 font-medium">{t("col_method")}</th>
                    <th className="px-3 py-2 text-right font-medium">{t("s_revenue")}</th>
                    <th className="px-3 py-2 text-right font-medium">{t("col_deductions")}</th>
                    <th className="px-3 py-2 text-right font-medium">{t("w_productCost")}</th>
                    <th className="px-3 py-2 text-right font-medium">{t("s_profit")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {!paged.items.length && <tr><td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">{t("no_sales")}</td></tr>}
                  {paged.items.map((r) => (
                    <tr key={r.order.id} className="transition-colors hover:bg-muted/30">
                      <td className="px-3 py-2">
                        <Link to={adminHref.order(r.order.id)} className="font-mono text-xs font-bold hover:underline">#{r.order.id.slice(0, 8)}</Link>
                        <span className="block text-xs text-muted-foreground">{fmt.date(r.date)}</span>
                      </td>
                      <td className="max-w-[180px] truncate px-3 py-2">{r.order.customerName || t("guest")}</td>
                      <td className="px-3 py-2 text-muted-foreground">{method(r.order.paymentMethod ?? "")}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums">{fmt.money(r.gross)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-muted-foreground"
                        title={`${t("w_taxes")} ${fmt.money(r.taxes)} · ${t("w_shippingCost")} ${fmt.money(r.shippingCost)} · ${t("w_fees")} ${fmt.money(r.fees)} · ${t("w_commission")} ${fmt.money(r.commission)} · ${t("w_refunds")} ${fmt.money(r.refunds)}`}>
                        {fmt.money(r.taxes + r.shippingCost + r.fees + r.commission + r.refunds)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {fmt.money(r.productCost)}{r.missingCostValue > 0 && <span className="ml-1 text-amber-700" title={t("row_missing_cost")}>*</span>}
                      </td>
                      <td className={cn("whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums", r.profit < 0 && "text-destructive")}>{fmt.money(r.profit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <AdminPager page={paged.page} pages={paged.pages} total={paged.total} from={paged.from} to={paged.to} onPage={paged.setPage} />
          </AdminPanel>

          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <RotateCcw className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{t(settings.dateBasis === "payment" ? "note_payment" : "note_order")} {t("note")}</span>
          </p>
        </>
      )}
    </div>
  );
}

function CashFlowTable({ flow }: { flow: { month: string; inflow: number; outflow: number; balance: number; cumulative: number }[] }) {
  const { t } = useMessages(adminFinanceMessages);
  const fmt = useAdminFormat();
  const label = useGrainLabel();
  const max = Math.max(1, ...flow.map((m) => Math.abs(m.balance)));
  if (!flow.length) return <p className="py-6 text-sm text-muted-foreground">{t("no_sales")}</p>;
  return (
    <div className="max-h-96 overflow-auto rounded-[14px] border">
      <table className="w-full min-w-[620px] text-sm">
        <thead className="sticky top-0 border-b bg-card text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">{t("col_month")}</th>
            <th className="px-3 py-2 text-right font-medium">{t("col_inflow")}</th>
            <th className="px-3 py-2 text-right font-medium">{t("col_outflow")}</th>
            <th className="px-3 py-2 text-right font-medium">{t("col_balance")}</th>
            <th className="hidden w-40 px-3 py-2 font-medium sm:table-cell"><span className="sr-only">{t("col_balance")}</span></th>
            <th className="px-3 py-2 text-right font-medium">{t("col_cumulative")}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {[...flow].reverse().map((m) => (
            <tr key={m.month}>
              <td className="px-3 py-2 first-letter:uppercase">{label.long(m.month, "month")}</td>
              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{fmt.money(m.inflow)}</td>
              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-muted-foreground">{fmt.money(m.outflow)}</td>
              <td className={cn("whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums", m.balance < 0 && "text-destructive")}>{fmt.money(m.balance)}</td>
              <td className="hidden px-3 py-2 sm:table-cell" aria-hidden="true">
                <div className="relative h-2 rounded-full bg-muted">
                  <span className="absolute inset-y-0 left-1/2 w-px bg-border" />
                  <span className={cn("absolute inset-y-0 rounded-full", m.balance < 0 ? "bg-destructive" : "bg-primary")}
                    style={m.balance < 0 ? { right: "50%", width: `${(Math.abs(m.balance) / max) * 50}%` } : { left: "50%", width: `${(m.balance / max) * 50}%` }} />
                </div>
              </td>
              <td className={cn("whitespace-nowrap px-3 py-2 text-right tabular-nums", m.cumulative < 0 && "text-destructive")}>{fmt.money(m.cumulative)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
