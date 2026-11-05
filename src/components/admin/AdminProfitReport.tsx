// =====================================================================================
// Admin > Custo x Venda: quanto os produtos vendidos custaram e quanto deram de lucro.
//   Topo        período (30 dias, 90 dias, 12 meses, tudo) e exportar CSV
//   Números     receita dos itens vendidos (sem frete), custo total, lucro bruto, margem
//   Aviso       produtos vendidos sem custo preenchido (o lucro deles não entra), com link para editar
//   Tabela      por produto: unidades, receita, custo, lucro, margem; ordena ao clicar no título da coluna,
//               busca, filtros rápidos (sem custo, com prejuízo), 20 por página
// Vendido = pago e não cancelado nem reembolsado (mesma regra de src/lib/salesStats.ts); receita = preço do item x
// quantidade. Custo = products.cost_price x unidades. Consultas em src/hooks/useSalesStats.ts.
// Textos: src/i18n/adminProfit.ts (período em src/i18n/adminStats.ts).
// =====================================================================================
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Coins, Download, Info, Percent, Search, TrendingUp, Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminPager, AdminStatCard, FilterChips } from "@/components/admin/AdminListKit";
import { PeriodChips } from "@/components/admin/stats/StatsParts";
import { adminHref } from "@/components/admin/shell/adminSections";
import { useAdminFormat, usePaged } from "@/hooks/useAdminList";
import { useCatalogIndex, useSalesLines } from "@/hooks/useSalesStats";
import { inPeriod, isSold, type SalePeriod } from "@/lib/salesStats";
import { csvNumber, downloadCsv } from "@/lib/csv";
import { cn } from "@/lib/utils";
import { useMessages } from "@/i18n";
import { adminProfitMessages, type AdminProfitKey } from "@/i18n/adminProfit";

type Row = {
  id: string;
  name: string;
  known: boolean;
  unitCost: number | null;
  units: number;
  revenue: number;
  cost: number | null;
  profit: number | null;
  margin: number | null;
};
type SortKey = "name" | "units" | "revenue" | "cost" | "profit" | "margin";
type Filter = "all" | "no_cost" | "loss";

const round2 = (n: number) => Math.round(n * 100) / 100;
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const MISSING_SHOWN = 5;

export default function AdminProfitReport() {
  const { t } = useMessages(adminProfitMessages);
  const fmt = useAdminFormat();
  const [period, setPeriod] = useState<SalePeriod>("30d");
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "revenue", dir: "desc" });
  const { lines, isLoading: linesLoading } = useSalesLines("all");
  const { data: index, isLoading: indexLoading } = useCatalogIndex();
  const loading = linesLoading || indexLoading;

  // Uma linha por produto vendido no período.
  const rows = useMemo<Row[]>(() => {
    const products = new Map((index?.products ?? []).map((p) => [p.id, p]));
    const map = new Map<string, { units: number; revenue: number }>();
    for (const l of inPeriod(lines, period)) {
      if (!isSold(l) || !l.productId) continue;
      const cur = map.get(l.productId) ?? { units: 0, revenue: 0 };
      cur.units += l.quantity;
      cur.revenue += l.price * l.quantity;
      map.set(l.productId, cur);
    }
    return [...map.entries()].map(([id, s]) => {
      const p = products.get(id);
      const unitCost = p && p.cost_price != null && Number(p.cost_price) > 0 ? Number(p.cost_price) : null;
      const revenue = round2(s.revenue);
      const cost = unitCost == null ? null : round2(unitCost * s.units);
      const profit = cost == null ? null : round2(revenue - cost);
      return {
        id, name: p?.name ?? t("removed_product"), known: !!p, unitCost, units: s.units, revenue, cost, profit,
        margin: profit != null && revenue > 0 ? profit / revenue : null,
      };
    });
  }, [lines, index, period, t]);

  const totals = useMemo(() => {
    const withCost = rows.filter((r) => r.cost != null);
    const revenue = round2(rows.reduce((s, r) => s + r.revenue, 0));
    const costedRevenue = withCost.reduce((s, r) => s + r.revenue, 0);
    const cost = round2(withCost.reduce((s, r) => s + (r.cost ?? 0), 0));
    const profit = round2(costedRevenue - cost);
    return {
      revenue, cost, profit,
      units: rows.reduce((s, r) => s + r.units, 0),
      margin: costedRevenue > 0 ? profit / costedRevenue : null,
    };
  }, [rows]);

  const missing = useMemo(() => rows.filter((r) => r.cost == null).sort((a, b) => b.revenue - a.revenue), [rows]);
  const losses = rows.filter((r) => (r.profit ?? 0) < 0).length;

  const visible = useMemo(() => {
    const q = norm(search.trim());
    const list = rows.filter((r) =>
      (filter === "all" || (filter === "no_cost" ? r.cost == null : (r.profit ?? 0) < 0)) && (!q || norm(r.name).includes(q)));
    const sign = sort.dir === "asc" ? 1 : -1;
    return list.sort((a, b) => {
      if (sort.key === "name") return sign * a.name.localeCompare(b.name, fmt.locale);
      const av = a[sort.key], bv = b[sort.key];
      // Sem custo fica sempre no fim, nos dois sentidos.
      if (av == null || bv == null) return av == null && bv == null ? 0 : av == null ? 1 : -1;
      return sign * (av - bv) || b.revenue - a.revenue;
    });
  }, [rows, filter, search, sort, fmt.locale]);
  const paged = usePaged(visible, 20);

  const pct = useMemo(() => new Intl.NumberFormat(fmt.locale, { style: "percent", maximumFractionDigits: 1 }), [fmt.locale]);
  const num = useMemo(() => new Intl.NumberFormat(fmt.locale), [fmt.locale]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" ? "asc" : "desc" }));

  const exportCsv = () => {
    const cols: AdminProfitKey[] = ["col_product", "col_units", "col_revenue", "col_cost", "col_profit", "col_margin"];
    downloadCsv(t("csv_name"), cols.map((c) => t(c)), visible.map((r) => [
      r.name, r.units, csvNumber(r.revenue, fmt.locale),
      r.cost == null ? "" : csvNumber(r.cost, fmt.locale),
      r.profit == null ? "" : csvNumber(r.profit, fmt.locale),
      r.margin == null ? "" : csvNumber(r.margin * 100, fmt.locale),
    ]));
  };

  // Função (não componente) para o botão não ser recriado e não perder o foco ao ordenar.
  const sortHead = (k: SortKey, label: string, right = true, className?: string) => {
    const on = sort.key === k;
    const Icon = !on ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
    return (
      <th key={k} scope="col" aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
        className={cn("px-3 py-2.5 font-medium", right ? "text-right" : "text-left", className)}>
        <button type="button" onClick={() => toggleSort(k)} aria-label={t("sort_by", { col: label })}
          className={cn("inline-flex min-h-8 items-center gap-1 rounded-md hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            right && "flex-row-reverse", on && "text-foreground")}>
          <Icon className={cn("h-3.5 w-3.5 shrink-0", !on && "opacity-50")} aria-hidden="true" />
          <span>{label}</span>
        </button>
      </th>
    );
  };

  const money = (v: number | null) => (v == null ? "-" : fmt.money(v));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PeriodChips value={period} onChange={(p) => { setPeriod(p); paged.setPage(1); }} />
        <Button type="button" variant="outline" size="sm" className="min-h-10" onClick={exportCsv} disabled={!visible.length}>
          <Download className="h-4 w-4" aria-hidden="true" /> {t("export_csv")}
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24 rounded-[18px]" />)}</div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <AdminStatCard icon={Wallet} label={t("revenue")} value={fmt.money(totals.revenue)} hint={t("revenue_hint", { units: num.format(totals.units) })} />
          <AdminStatCard icon={Coins} label={t("cost")} value={fmt.money(totals.cost)} hint={t("cost_hint")} />
          <AdminStatCard icon={TrendingUp} label={t("profit")} value={fmt.money(totals.profit)} hint={t("profit_hint")}
            tone={totals.profit < 0 ? "danger" : "success"} />
          <AdminStatCard icon={Percent} label={t("margin")} value={totals.margin == null ? "-" : pct.format(totals.margin)} hint={t("margin_hint")}
            tone={totals.margin != null && totals.margin < 0 ? "danger" : "default"} />
        </div>
      )}

      {!loading && missing.length > 0 && (
        <div role="status" className="flex items-start gap-3 rounded-[14px] border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div className="min-w-0 space-y-1">
            <p className="font-semibold">{t("missing_title", { n: missing.length })}</p>
            <p>
              {t("missing_action")}{" "}
              {missing.slice(0, MISSING_SHOWN).map((r, i) => (
                <span key={r.id}>
                  {i > 0 && ", "}
                  {r.known ? <Link to={adminHref.product(r.id)} className="font-medium underline underline-offset-2 hover:no-underline">{r.name}</Link> : r.name}
                </span>
              ))}
              {missing.length > MISSING_SHOWN && <> {t("missing_more", { n: missing.length - MISSING_SHOWN })}</>}
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterChips<Filter>
          label={t("filter_label")}
          value={filter}
          onChange={(f) => setFilter(f)}
          options={[
            { value: "all", label: t("f_all"), count: rows.length },
            { value: "no_cost", label: t("f_no_cost"), count: missing.length, tone: "warning" },
            { value: "loss", label: t("f_loss"), count: losses, tone: "warning" },
          ]}
        />
        <div className="relative lg:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("search")} aria-label={t("search")} className="pl-9" />
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-64 w-full rounded-[18px]" />
      ) : (
        <div>
          <div className="overflow-x-auto rounded-[18px] border bg-card">
            <table className="w-full min-w-[620px] text-sm" aria-label={t("table_label")}>
              <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  {sortHead("name", t("col_product"), false, "pl-4")}
                  {sortHead("units", t("col_units"))}
                  {sortHead("revenue", t("col_revenue"))}
                  {sortHead("cost", t("col_cost"))}
                  {sortHead("profit", t("col_profit"))}
                  {sortHead("margin", t("col_margin"), true, "pr-4")}
                </tr>
              </thead>
              <tbody className="divide-y">
                {!paged.items.length && (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">{rows.length ? t("empty_filter") : t("empty")}</td></tr>
                )}
                {paged.items.map((r) => {
                  const loss = r.profit != null && r.profit < 0;
                  return (
                    <tr key={r.id} className="transition-colors hover:bg-muted/30">
                      <td className="max-w-[170px] py-2.5 pl-4 pr-3 sm:max-w-[280px]">
                        {r.known
                          ? <Link to={adminHref.productStats(r.id)} className="block truncate font-medium text-foreground hover:underline">{r.name}</Link>
                          : <span className="block truncate font-medium text-muted-foreground">{r.name}</span>}
                        {r.unitCost != null && <span className="block text-xs text-muted-foreground">{t("unit_cost", { value: fmt.money(r.unitCost) })}</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{num.format(r.units)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right font-medium tabular-nums">{fmt.money(r.revenue)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                        {r.cost != null ? fmt.money(r.cost) : r.known ? (
                          <Link to={adminHref.product(r.id)}
                            className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900 hover:bg-amber-100">
                            {t("set_cost")}
                          </Link>
                        ) : "-"}
                      </td>
                      <td className={cn("whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums", loss && "text-destructive")}>{money(r.profit)}</td>
                      <td className={cn("whitespace-nowrap py-2.5 pl-3 pr-4 text-right tabular-nums", loss ? "text-destructive" : "text-muted-foreground")}>
                        {r.margin == null ? "-" : pct.format(r.margin)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <AdminPager page={paged.page} pages={paged.pages} total={paged.total} from={paged.from} to={paged.to} onPage={paged.setPage} />
        </div>
      )}

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{t("note")}</span>
      </p>
    </div>
  );
}
