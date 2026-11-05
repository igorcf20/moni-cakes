// =====================================================================================
// Peças das páginas de detalhe com estatísticas (produto e categoria):
//   PeriodChips      30 dias, 90 dias, 12 meses, tudo
//   SalesChart       receita por dia / semana / mês (uma série, cor da marca), dica ao passar e vista em tabela
//   BreakdownPanel   vendido por chave (variação, tamanho, país, subcategoria) com barra da parte
//   TopCustomersPanel, RecentOrdersPanel  listas com links para as páginas de cliente e pedido
// Contas em src/lib/salesStats.ts. Textos em src/i18n/adminStats.ts.
// =====================================================================================
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, ShoppingBag, Users, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilterChips } from "@/components/admin/AdminListKit";
import { AdminPanel } from "@/components/admin/shell/AdminPageParts";
import { adminHref } from "@/components/admin/shell/adminSections";
import { useAdminFormat } from "@/hooks/useAdminList";
import { getOrderStatusStyle, orderStatusLabel } from "@/lib/orderStatusStyles";
import { recentOrders, timeSeries, topCustomers, type BreakdownRow, type Bucket, type SaleLine, type SalePeriod } from "@/lib/salesStats";
import { useMessages } from "@/i18n";
import { adminStatsMessages, type AdminStatsKey } from "@/i18n/adminStats";
import { cn } from "@/lib/utils";

const PERIODS: SalePeriod[] = ["30d", "90d", "12m", "all"];

export function PeriodChips({ value, onChange }: { value: SalePeriod; onChange: (p: SalePeriod) => void }) {
  const { t } = useMessages(adminStatsMessages);
  return (
    <FilterChips<SalePeriod>
      label={t("period")}
      value={value}
      onChange={onChange}
      options={PERIODS.map((p) => ({ value: p, label: t(`p_${p}` as AdminStatsKey) }))}
    />
  );
}

function useBucketLabel() {
  const { t } = useMessages(adminStatsMessages);
  const fmt = useAdminFormat();
  return useMemo(() => {
    const day = new Intl.DateTimeFormat(fmt.locale, { day: "2-digit", month: "2-digit" });
    const month = new Intl.DateTimeFormat(fmt.locale, { month: "short", year: "2-digit" });
    const monthLong = new Intl.DateTimeFormat(fmt.locale, { month: "long", year: "numeric" });
    return {
      short: (b: Bucket) => (b.unit === "month" ? month.format(new Date(b.start)) : day.format(new Date(b.start))),
      long: (b: Bucket) => (b.unit === "month" ? monthLong.format(new Date(b.start)) : b.unit === "week" ? t("week_of", { date: fmt.date(b.start) }) : fmt.date(b.start)),
    };
  }, [fmt, t]);
}

/** Receita vendida no período, uma barra por dia (30 dias), semana (90 dias) ou mês. */
/** countLabel/countCol: o que a 2.ª medida conta (unidades nas páginas de produto; pedidos na página inicial). */
export function SalesChart({ lines, period, countLabel, countCol }: { lines: SaleLine[]; period: SalePeriod; countLabel?: (n: number) => string; countCol?: string }) {
  const { t } = useMessages(adminStatsMessages);
  const fmt = useAdminFormat();
  const label = useBucketLabel();
  const [asTable, setAsTable] = useState(false);
  const data = useMemo(() => timeSeries(lines, period), [lines, period]);
  const empty = data.every((b) => b.revenue === 0);
  const unitLabel = data[0]?.unit === "day" ? t("chart_day") : data[0]?.unit === "week" ? t("chart_week") : t("chart_month");
  const compact = useMemo(() => new Intl.NumberFormat(fmt.locale, { notation: "compact", maximumFractionDigits: 1 }), [fmt.locale]);

  return (
    <AdminPanel
      title={<span>{t("chart_title")} <span className="text-sm font-normal text-muted-foreground">{unitLabel}</span></span>}
      icon={BarChart3}
      actions={!empty ? <Button type="button" variant="ghost" size="sm" onClick={() => setAsTable((v) => !v)}>{asTable ? t("chart_hide_table") : t("chart_table")}</Button> : undefined}
    >
      {empty ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{t("chart_empty")}</p>
      ) : asTable ? (
        <div className="max-h-80 overflow-y-auto rounded-[14px] border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
              <tr><th className="px-3 py-2 font-medium">{t("col_period")}</th><th className="px-3 py-2 text-right font-medium">{t("col_revenue")}</th><th className="px-3 py-2 text-right font-medium">{countCol ?? t("col_units")}</th></tr>
            </thead>
            <tbody className="divide-y">
              {[...data].reverse().map((b) => (
                <tr key={b.key}><td className="px-3 py-2">{label.long(b)}</td><td className="px-3 py-2 text-right tabular-nums">{fmt.money(b.revenue)}</td><td className="px-3 py-2 text-right tabular-nums">{b.units}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="h-64 w-full" role="img" aria-label={`${t("chart_title")} ${unitLabel}`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap={data.length > 20 ? 2 : "18%"}>
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="key" tickFormatter={(key) => { const b = data.find((x) => x.key === key); return b ? label.short(b) : ""; }} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} interval="preserveStartEnd" minTickGap={16} />
              <YAxis tickFormatter={(v) => compact.format(Number(v))} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={44} />
              <Tooltip
                cursor={{ fill: "hsl(var(--muted))", opacity: 0.6 }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const b = payload[0].payload as Bucket;
                  return (
                    <div className="rounded-xl border bg-card px-3 py-2 text-xs shadow-sm">
                      <p className="font-medium text-foreground">{label.long(b)}</p>
                      <p className="mt-0.5 font-semibold tabular-nums text-foreground">{fmt.money(b.revenue)}</p>
                      <p className="text-muted-foreground">{countLabel ? countLabel(b.units) : t("chart_units", { n: b.units })}</p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </AdminPanel>
  );
}

/** Vendido por chave, com a parte da receita em barra (texto sempre em tinta normal, a barra só acompanha). */
export function BreakdownPanel({ title, icon, rows, labelOf, firstCol, href, limit = 8, emptyText, unitsCol }: {
  title: string; icon?: LucideIcon; rows: BreakdownRow[]; labelOf?: (key: string) => string; firstCol?: string;
  href?: (key: string) => string | null; limit?: number; emptyText?: string; unitsCol?: string;
}) {
  const { t } = useMessages(adminStatsMessages);
  const fmt = useAdminFormat();
  const pct = useMemo(() => new Intl.NumberFormat(fmt.locale, { style: "percent", maximumFractionDigits: 0 }), [fmt.locale]);
  if (!rows.length && !emptyText) return null;
  return (
    <AdminPanel title={title} icon={icon}>
      {!rows.length ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="pb-2 font-medium">{firstCol ?? ""}</th>
                <th className="pb-2 text-right font-medium">{unitsCol ?? t("col_units")}</th>
                <th className="pb-2 pl-3 text-right font-medium">{t("col_revenue")}</th>
                <th className="hidden pb-2 pl-4 font-medium sm:table-cell">{t("col_share")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.slice(0, limit).map((r) => {
                const name = labelOf ? labelOf(r.key) : r.key;
                const to = href?.(r.key);
                return (
                  <tr key={r.key}>
                    <td className="max-w-[150px] truncate py-2 pr-3 sm:max-w-[220px]">{to ? <Link to={to} className="font-medium hover:underline">{name}</Link> : name}</td>
                    <td className="py-2 text-right tabular-nums">{r.units}</td>
                    <td className="py-2 pl-3 text-right tabular-nums whitespace-nowrap">{fmt.money(r.revenue)}</td>
                    <td className="hidden py-2 pl-4 sm:table-cell">
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-24 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                          <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(2, r.share * 100)}%` }} />
                        </span>
                        <span className="text-xs tabular-nums text-muted-foreground">{pct.format(r.share)}</span>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AdminPanel>
  );
}

export function TopCustomersPanel({ lines, countLabel }: { lines: SaleLine[]; countLabel?: (n: number) => string }) {
  const { t } = useMessages(adminStatsMessages);
  const fmt = useAdminFormat();
  const rows = useMemo(() => topCustomers(lines, 5), [lines]);
  return (
    <AdminPanel title={t("top_customers")} icon={Users}>
      {!rows.length ? <p className="text-sm text-muted-foreground">{t("no_sales")}</p> : (
        <ul className="divide-y">
          {rows.map((c) => {
            const body = (
              <>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{c.name || t("guest")}</span>
                  <span className="block text-xs text-muted-foreground">{countLabel ? countLabel(c.units) : t("chart_units", { n: c.units })} · {fmt.relative(c.lastAt)}</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums">{fmt.money(c.revenue)}</span>
              </>
            );
            return (
              <li key={(c.userId ?? "") + c.name}>
                {c.userId
                  ? <Link to={adminHref.customer(c.userId)} className="flex items-center justify-between gap-3 py-2.5 text-sm hover:underline">{body}</Link>
                  : <div className="flex items-center justify-between gap-3 py-2.5 text-sm">{body}</div>}
              </li>
            );
          })}
        </ul>
      )}
    </AdminPanel>
  );
}

export function RecentOrdersPanel({ lines, limit = 8, showUnits = true, actions }: { lines: SaleLine[]; limit?: number; showUnits?: boolean; actions?: React.ReactNode }) {
  const { t } = useMessages(adminStatsMessages);
  const fmt = useAdminFormat();
  const rows = useMemo(() => recentOrders(lines, limit), [lines, limit]);
  return (
    <AdminPanel title={t("recent_orders")} icon={ShoppingBag} actions={actions}>
      {!rows.length ? <p className="text-sm text-muted-foreground">{t("no_sales")}</p> : (
        <ul className="divide-y rounded-[14px] border">
          {rows.map((o) => (
            <li key={o.orderId}>
              <Link to={adminHref.order(o.orderId)} className={cn("flex items-center justify-between gap-3 p-3 text-sm hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}>
                <span className="min-w-0">
                  <span className="block font-mono text-xs font-bold">#{o.orderId.slice(0, 8)}</span>
                  <span className="block truncate text-xs text-muted-foreground">{o.customerName || t("guest")} · {fmt.date(o.createdAt)}{showUnits ? ` · ${t("chart_units", { n: o.units })}` : ""}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-semibold tabular-nums">{fmt.money(o.value)}</span>
                  <Badge className={cn("border text-[10px]", getOrderStatusStyle(o.status).badge)}>{orderStatusLabel(o.status, fmt.locale)}</Badge>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AdminPanel>
  );
}
