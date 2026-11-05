// =====================================================================================
// Peças do Admin > Financeiro:
//   FinanceKpi       cartão com número, variação contra o período de comparação, minigráfico e dica
//   TrendChart       faturamento e custos (barras) e lucro (linha) por dia / semana / mês, com o período de
//                    comparação em linha tracejada; dica ao passar e vista em tabela
//   MoneyWaterfall   do faturamento ao lucro, passo a passo (barras flutuantes em HTML)
//   SplitPanel       faturamento por chave (meio de pagamento, país, categoria) com barra da parte
//   CategoryDot      bolinha da cor da categoria do lançamento
// Cores: laranja da marca = faturamento; cinza = custos; tinta = lucro (um só eixo, todos em dinheiro).
// Textos em src/i18n/adminFinance.ts.
// =====================================================================================
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import HelpTip from "@/components/admin/HelpTip";
import { AdminPanel } from "@/components/admin/shell/AdminPageParts";
import { useAdminFormat } from "@/hooks/useAdminList";
import type { Grain, SeriesPoint, WaterfallStep } from "@/lib/finance";
import { useMessages } from "@/i18n";
import { adminFinanceMessages, type AdminFinanceKey } from "@/i18n/adminFinance";
import { cn } from "@/lib/utils";

export const CATEGORY_COLORS = ["orange", "amber", "blue", "magenta", "violet", "aqua", "green", "red", "gray"] as const;
const DOT: Record<string, string> = {
  orange: "bg-orange-500", amber: "bg-amber-400", blue: "bg-blue-600", magenta: "bg-pink-500", violet: "bg-violet-600",
  aqua: "bg-teal-500", green: "bg-green-700", red: "bg-red-600", gray: "bg-neutral-400",
};
export function CategoryDot({ color, className }: { color: string | null | undefined; className?: string }) {
  return <span aria-hidden="true" className={cn("inline-block h-2.5 w-2.5 shrink-0 rounded-full", DOT[color ?? ""] ?? DOT.gray, className)} />;
}

export function usePercent() {
  const fmt = useAdminFormat();
  return useMemo(() => {
    const p = new Intl.NumberFormat(fmt.locale, { style: "percent", maximumFractionDigits: 1 });
    const s = new Intl.NumberFormat(fmt.locale, { style: "percent", maximumFractionDigits: 0, signDisplay: "exceptZero" });
    return { pct: (v: number) => p.format(v), signed: (v: number) => s.format(v) };
  }, [fmt.locale]);
}

/** Cartão de número com variação. goodWhenUp = false para custos (subir é ruim). */
export function FinanceKpi({
  icon: Icon, label, value, help, delta, goodWhenUp = true, hint, spark, tone = "default",
}: {
  icon: LucideIcon; label: string; value: ReactNode; help: string; delta?: number | null; goodWhenUp?: boolean; hint?: ReactNode;
  spark?: number[]; tone?: "default" | "danger" | "success";
}) {
  const { t } = useMessages(adminFinanceMessages);
  const { signed } = usePercent();
  const up = delta != null && delta > 0.0005;
  const down = delta != null && delta < -0.0005;
  const good = (up && goodWhenUp) || (down && !goodWhenUp);
  const bad = (up && !goodWhenUp) || (down && goodWhenUp);
  const DIcon = up ? ArrowUpRight : down ? ArrowDownRight : Minus;
  return (
    <div className="flex min-h-[132px] flex-col justify-between gap-2 rounded-[18px] border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground">
          <Icon className="h-4 w-4 shrink-0 text-brand-orange-text" strokeWidth={1.8} aria-hidden="true" />
          <span className="truncate">{label}</span>
        </span>
        <HelpTip text={help} label={label} className="-mr-1.5 -mt-1.5" />
      </div>
      <div className={cn("text-xl font-bold leading-tight tabular-nums sm:text-2xl", tone === "danger" ? "text-destructive" : "text-foreground")}>{value}</div>
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0 text-[11px] leading-snug text-muted-foreground">
          {delta !== undefined && (
            <span className={cn("mr-1 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold",
              good ? "bg-emerald-50 text-emerald-700" : bad ? "bg-red-50 text-red-700" : "bg-muted text-muted-foreground")}>
              <DIcon className="h-3 w-3" aria-hidden="true" />
              {delta == null ? t("no_base") : signed(delta)}
              <span className="sr-only"> {t("vs_compare")}</span>
            </span>
          )}
          {hint}
        </div>
        {spark && spark.length > 1 && <Sparkline values={spark} />}
      </div>
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const w = 64, h = 22;
  const min = Math.min(0, ...values), max = Math.max(...values, 0);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / span) * (h - 2) - 1}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="shrink-0 overflow-visible">
      <polyline points={pts} fill="none" stroke="hsl(var(--primary))" strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function useGrainLabel() {
  const { t } = useMessages(adminFinanceMessages);
  const fmt = useAdminFormat();
  return useMemo(() => {
    const day = new Intl.DateTimeFormat(fmt.locale, { day: "2-digit", month: "2-digit" });
    const month = new Intl.DateTimeFormat(fmt.locale, { month: "short", year: "2-digit" });
    const monthLong = new Intl.DateTimeFormat(fmt.locale, { month: "long", year: "numeric" });
    return {
      short: (iso: string, g: Grain) => (g === "month" ? month.format(new Date(iso)) : day.format(new Date(iso))),
      long: (iso: string, g: Grain) => (g === "month" ? monthLong.format(new Date(iso)) : g === "week" ? t("week_of", { date: fmt.date(iso) }) : fmt.date(iso)),
    };
  }, [fmt, t]);
}

type TrendDatum = SeriesPoint & { prevProfit?: number; prevRevenue?: number; prevStart?: string };

/** Faturamento, custos e lucro no tempo, com o lucro do período de comparação. */
export function TrendChart({ points, prev, grain }: { points: SeriesPoint[]; prev: SeriesPoint[] | null; grain: Grain }) {
  const { t } = useMessages(adminFinanceMessages);
  const fmt = useAdminFormat();
  const label = useGrainLabel();
  const [asTable, setAsTable] = useState(false);
  const data: TrendDatum[] = points.map((p, i) => ({ ...p, prevProfit: prev?.[i]?.profit, prevRevenue: prev?.[i]?.revenue, prevStart: prev?.[i]?.start }));
  const empty = points.every((p) => !p.revenue && !p.costs);
  const compact = useMemo(() => new Intl.NumberFormat(fmt.locale, { notation: "compact", maximumFractionDigits: 1 }), [fmt.locale]);
  const grainLabel = t(`grain_${grain}` as AdminFinanceKey);

  const legend = [
    { key: "revenue", label: t("s_revenue"), swatch: <span className="h-2.5 w-2.5 rounded-[3px] bg-primary" /> },
    { key: "costs", label: t("s_costs"), swatch: <span className="h-2.5 w-2.5 rounded-[3px] bg-foreground/30" /> },
    { key: "profit", label: t("s_profit"), swatch: <span className="h-0.5 w-4 rounded bg-foreground" /> },
    ...(prev ? [{ key: "prev", label: t("s_prev_profit"), swatch: <span className="h-0 w-4 border-t-2 border-dashed border-muted-foreground" /> }] : []),
  ];

  return (
    <AdminPanel
      title={<span>{t("trend_title")} <span className="text-sm font-normal text-muted-foreground">{grainLabel}</span></span>}
      actions={!empty ? <Button type="button" variant="ghost" size="sm" onClick={() => setAsTable((v) => !v)}>{asTable ? t("chart_hide_table") : t("chart_table")}</Button> : undefined}
    >
      {empty ? (
        <p className="py-12 text-center text-sm text-muted-foreground">{t("chart_empty")}</p>
      ) : asTable ? (
        <div className="max-h-80 overflow-auto rounded-[14px] border">
          <table className="w-full min-w-[420px] text-sm">
            <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">{t("col_period")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("s_revenue")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("s_costs")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("s_profit")}</th>
                {prev && <th className="px-3 py-2 text-right font-medium">{t("s_prev_profit")}</th>}
              </tr>
            </thead>
            <tbody className="divide-y">
              {[...data].reverse().map((d) => (
                <tr key={d.start}>
                  <td className="px-3 py-2">{label.long(d.start, grain)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt.money(d.revenue)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt.money(d.costs)}</td>
                  <td className={cn("px-3 py-2 text-right font-semibold tabular-nums", d.profit < 0 && "text-destructive")}>{fmt.money(d.profit)}</td>
                  {prev && <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{d.prevProfit == null ? "-" : fmt.money(d.prevProfit)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label={t("legend")}>
            {legend.map((l) => <li key={l.key} className="inline-flex items-center gap-1.5">{l.swatch}{l.label}</li>)}
          </ul>
          <div className="h-72 w-full" role="img" aria-label={`${t("trend_title")} ${grainLabel}`}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barGap={2} barCategoryGap={data.length > 20 ? 2 : "20%"}>
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="start" tickFormatter={(s) => label.short(String(s), grain)} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} interval="preserveStartEnd" minTickGap={18} />
                <YAxis tickFormatter={(v) => compact.format(Number(v))} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={48} />
                <Tooltip
                  cursor={{ fill: "hsl(var(--muted))", opacity: 0.6 }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as TrendDatum;
                    return (
                      <div className="min-w-[180px] rounded-xl border bg-card px-3 py-2 text-xs shadow-sm">
                        <p className="mb-1 font-medium text-foreground">{label.long(d.start, grain)}</p>
                        <TipRow swatch="bg-primary" label={t("s_revenue")} value={fmt.money(d.revenue)} />
                        <TipRow swatch="bg-foreground/30" label={t("s_costs")} value={fmt.money(d.costs)} />
                        <TipRow swatch="bg-foreground" label={t("s_profit")} value={fmt.money(d.profit)} strong />
                        <p className="mt-1 text-muted-foreground">{t("n_orders", { n: d.orders })}</p>
                        {d.prevStart && d.prevProfit != null && (
                          <p className="mt-1 border-t pt-1 text-muted-foreground">{t("tip_prev", { period: label.long(d.prevStart, grain), value: fmt.money(d.prevProfit) })}</p>
                        )}
                      </div>
                    );
                  }}
                />
                <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
                <Bar dataKey="costs" fill="hsl(var(--foreground) / 0.28)" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
                <Line type="monotone" dataKey="profit" stroke="hsl(var(--foreground))" strokeWidth={2} dot={data.length <= 16 ? { r: 3, strokeWidth: 0, fill: "hsl(var(--foreground))" } : false} isAnimationActive={false} />
                {prev && <Line type="monotone" dataKey="prevProfit" stroke="hsl(var(--muted-foreground))" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </AdminPanel>
  );
}

function TipRow({ swatch, label, value, strong }: { swatch: string; label: string; value: string; strong?: boolean }) {
  return (
    <p className="flex items-center justify-between gap-3">
      <span className="inline-flex items-center gap-1.5 text-muted-foreground"><span className={cn("h-2 w-2 rounded-sm", swatch)} />{label}</span>
      <span className={cn("tabular-nums text-foreground", strong && "font-semibold")}>{value}</span>
    </p>
  );
}

/** Do faturamento ao lucro: cada linha mostra o que sai (ou entra) e a barra fica entre o antes e o depois. */
export function MoneyWaterfall({ steps, labels, helps }: { steps: WaterfallStep[]; labels: Record<string, string>; helps?: Record<string, string> }) {
  const { t } = useMessages(adminFinanceMessages);
  const fmt = useAdminFormat();
  const { pct } = usePercent();
  const gross = steps[0]?.value ?? 0;
  const lo = Math.min(0, ...steps.map((s) => Math.min(s.start, s.end)));
  const hi = Math.max(0, ...steps.map((s) => Math.max(s.start, s.end))) || 1;
  const pos = (v: number) => ((v - lo) / (hi - lo)) * 100;
  return (
    <AdminPanel title={t("waterfall_title")}>
      {!gross && steps.length <= 2 ? <p className="py-10 text-center text-sm text-muted-foreground">{t("chart_empty")}</p> : (
        <ol className="space-y-2.5">
          {steps.map((s) => {
            const a = pos(Math.min(s.start, s.end)), b = pos(Math.max(s.start, s.end));
            const bar = s.kind === "total" ? "bg-primary" : s.kind === "result" ? (s.value < 0 ? "bg-destructive" : "bg-foreground") : s.kind === "plus" ? "bg-emerald-600" : "bg-foreground/25";
            return (
              <li key={s.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-sm">
                <span className={cn("flex min-w-0 items-center gap-0.5", (s.kind === "total" || s.kind === "result") && "font-semibold text-foreground")}>
                  <span className="min-w-0 leading-snug">{labels[s.key] ?? s.key}</span>
                  {helps?.[s.key] && <HelpTip text={helps[s.key]} label={labels[s.key] ?? s.key} className="h-6 w-6" />}
                </span>
                <span className={cn("text-right tabular-nums", s.kind === "minus" && "text-muted-foreground", (s.kind === "total" || s.kind === "result") && "font-semibold", s.kind === "result" && s.value < 0 && "text-destructive")}>
                  {s.kind === "minus" ? `- ${fmt.money(-s.value)}` : s.kind === "plus" ? `+ ${fmt.money(s.value)}` : fmt.money(s.value)}
                  {gross > 0 && s.kind !== "total" && <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">{pct(Math.abs(s.value) / gross)}</span>}
                </span>
                <span className="relative col-span-2 h-2.5 rounded-full bg-muted" aria-hidden="true">
                  <span className={cn("absolute inset-y-0 rounded-full", bar)} style={{ left: `${a}%`, width: `${Math.max(0.8, b - a)}%` }} />
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </AdminPanel>
  );
}

export type SplitItem = { key: string; label: ReactNode; value: number; share: number; sub?: ReactNode; href?: string | null; dot?: string | null };

/** Lista com barra da parte de cada linha (texto em tinta normal; a barra só acompanha). */
export function SplitPanel({ title, icon, items, empty, limit = 8, help, actions }: {
  title: string; icon?: LucideIcon; items: SplitItem[]; empty: string; limit?: number; help?: string; actions?: ReactNode;
}) {
  const fmt = useAdminFormat();
  const { pct } = usePercent();
  const shown = items.slice(0, limit);
  const max = Math.max(...shown.map((i) => i.share), 0) || 1;
  return (
    <AdminPanel title={<span className="inline-flex items-center gap-1">{title}{help && <HelpTip text={help} label={title} className="h-6 w-6" />}</span>} icon={icon} actions={actions}>
      {!shown.length ? <p className="py-6 text-sm text-muted-foreground">{empty}</p> : (
        <ul className="space-y-3">
          {shown.map((i) => (
            <li key={i.key} className="space-y-1">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  {i.dot !== undefined && <CategoryDot color={i.dot} />}
                  {i.href ? <Link to={i.href} className="line-clamp-2 font-medium text-foreground hover:underline">{i.label}</Link> : <span className="line-clamp-2 font-medium text-foreground">{i.label}</span>}
                </span>
                <span className="shrink-0 tabular-nums">
                  <span className="font-semibold">{fmt.money(i.value)}</span>
                  <span className="ml-1.5 text-xs text-muted-foreground">{pct(i.share)}</span>
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted" aria-hidden="true">
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, (i.share / max) * 100)}%` }} />
              </div>
              {i.sub && <p className="text-xs text-muted-foreground">{i.sub}</p>}
            </li>
          ))}
        </ul>
      )}
    </AdminPanel>
  );
}
