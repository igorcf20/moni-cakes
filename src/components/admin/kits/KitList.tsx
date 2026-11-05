// Admin > Kits, lista: período dos números, cartões (kits vendidos, receita, desconto dado, kits ativos), filtros,
// busca e a tabela de kits com estado, peças, desconto e vendas. Clicar numa linha abre a página do kit.
import { useMemo, useState } from "react";
import { BadgePercent, ChevronRight, ExternalLink, Gift, Loader2, Plus, Search, ShoppingBag, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AdminStatCard, FilterChips } from "../AdminListKit";
import HelpTip from "../HelpTip";
import { useMessages } from "@/i18n";
import { adminLegacyMessages, type AdminLegacyT as T } from "@/i18n/adminLegacy";
import { useAdminFormat } from "@/hooks/useAdminList";
import { siteUrl } from "@/lib/siteUrl";
import { cn } from "@/lib/utils";
import { KitStatusChip } from "./KitParts";
import { kitStatus, statusHint, useAdminKits, useKitProducts, useKitStats, type KitPeriod, type KitStatus } from "./kitAdmin";

type Filter = "all" | KitStatus;
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function KitList({ onOpen, onNew }: { onOpen: (id: string) => void; onNew: () => void }) {
  const { t } = useMessages(adminLegacyMessages);
  const fmt = useAdminFormat();
  const [period, setPeriod] = useState<KitPeriod>("30");
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const { data: kits = [], isLoading, error } = useAdminKits();
  const { data: products = [] } = useKitProducts();
  const stats = useKitStats(period);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const rows = useMemo(() => kits.map((k) => ({ kit: k, status: kitStatus(k, byId), stat: stats.data?.[k.id] })), [kits, byId, stats.data]);
  const totals = useMemo(() => {
    const all = Object.values(stats.data ?? {});
    return {
      sold: all.reduce((s, r) => s + r.kits_sold, 0),
      revenue: all.reduce((s, r) => s + r.revenue, 0),
      discount: all.reduce((s, r) => s + r.discount, 0),
    };
  }, [stats.data]);
  const count = (s: KitStatus) => rows.filter((r) => r.status === s).length;
  const shown = rows.filter((r) => (filter === "all" || r.status === filter) && (!q.trim() || norm(`${r.kit.name} ${r.kit.slug ?? ""}`).includes(norm(q.trim()))));

  if (isLoading) return <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("kits_loading")}</p>;
  if (error) return <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{t("kits_load_error")}</p>;

  const statValue = (v: string | number) => (stats.isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : v);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center text-sm font-medium">{t("kits_period")}<HelpTip label={t("help")} text={t("kits_period_h")} /></span>
          <FilterChips<KitPeriod> label={t("kits_period")} value={period} onChange={setPeriod} options={[
            { value: "30", label: t("kits_period_30") },
            { value: "90", label: t("kits_period_90") },
            { value: "all", label: t("kits_period_all") },
          ]} />
        </div>
        <div className="flex flex-wrap gap-2">
          {kits.length > 0 && <Button variant="outline" asChild><a href="/kits" target="_blank" rel="noreferrer"><ExternalLink className="mr-1.5 h-4 w-4" />{t("kits_view_all")}</a></Button>}
          <Button onClick={onNew}><Plus className="mr-1.5 h-4 w-4" strokeWidth={1.8} />{t("kits_new")}</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <AdminStatCard icon={ShoppingBag} label={t("kits_st_sold")} value={statValue(totals.sold)} hint={t("kits_st_sold_h")} />
        <AdminStatCard icon={Wallet} label={t("kits_st_revenue")} value={statValue(fmt.money(totals.revenue))} hint={t("kits_st_revenue_h")} tone="success" />
        <AdminStatCard icon={BadgePercent} label={t("kits_st_discount")} value={statValue(fmt.money(totals.discount))} hint={t("kits_st_discount_h")} />
        <AdminStatCard icon={Gift} label={t("kits_st_active")} value={count("active")} hint={t("kits_st_active_h", { n: kits.length })}
          active={filter === "active"} onClick={() => setFilter(filter === "active" ? "all" : "active")} />
      </div>
      {stats.error && <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{t("kits_stats_error")}</p>}

      <div className="flex flex-col gap-3 rounded-[18px] border bg-card p-4">
        <FilterChips<Filter> label={t("kits_filter_label")} value={filter} onChange={setFilter} options={[
          { value: "all", label: t("kits_f_all"), count: rows.length },
          { value: "active", label: t("kits_status_active"), count: count("active") },
          { value: "unavailable", label: t("kits_status_unavailable"), count: count("unavailable"), tone: "warning" },
          { value: "scheduled", label: t("kits_status_scheduled"), count: count("scheduled") },
          { value: "ended", label: t("kits_status_ended"), count: count("ended") },
          { value: "inactive", label: t("kits_status_inactive"), count: count("inactive") },
        ].filter((o) => o.value === "all" || o.value === "active" || o.count > 0) as { value: Filter; label: string; count: number; tone?: "warning" }[]} />
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("kits_search")} aria-label={t("kits_search")} className="pl-9" />
        </div>
      </div>

      {kits.length === 0 ? (
        <div className="rounded-[18px] border border-dashed p-10 text-center">
          <Gift className="mx-auto h-8 w-8 text-muted-foreground" strokeWidth={1.6} />
          <p className="mt-3 text-sm text-muted-foreground">{t("kits_empty")}</p>
          <Button className="mt-4" onClick={onNew}><Plus className="mr-1.5 h-4 w-4" />{t("kits_new")}</Button>
        </div>
      ) : shown.length === 0 ? (
        <p className="rounded-[18px] border border-dashed p-10 text-center text-sm text-muted-foreground">{t("kits_no_match")}</p>
      ) : (
        <>
          {/* Celular: cartões */}
          <ul className="grid gap-3 md:hidden">
            {shown.map(({ kit, status, stat }) => (
              <li key={kit.id}>
                <button type="button" onClick={() => onOpen(kit.id)} className="flex w-full items-start gap-3 rounded-[18px] border bg-card p-3 text-left transition-colors duration-150 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Thumb src={kit.image_url} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold">{kit.name}</span>
                      <KitStatusChip t={t} status={status} />
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {pieces(t, kit.items.length)} · {discountLabel(t, kit, fmt.money)}
                    </span>
                    <span className="mt-1 block text-xs tabular-nums text-foreground">
                      {t("kits_card_sales", { n: stat?.kits_sold ?? 0, money: fmt.money(stat?.revenue ?? 0) })}
                    </span>
                  </span>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>

          {/* Computador: tabela */}
          <div className="hidden overflow-hidden rounded-[18px] border bg-card md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("kits_col_name")}</TableHead>
                  <TableHead>{t("kits_col_status")}</TableHead>
                  <TableHead>{t("kits_col_discount")}</TableHead>
                  <TableHead className="whitespace-nowrap text-right">{t("kits_col_orders")}</TableHead>
                  <TableHead className="whitespace-nowrap text-right">{t("kits_col_sold")}</TableHead>
                  <TableHead className="whitespace-nowrap text-right">{t("kits_col_revenue")}</TableHead>
                  <TableHead className="whitespace-nowrap text-right">{t("kits_col_given")}</TableHead>
                  <TableHead className="w-[1%]"><span className="sr-only">{t("kits_col_actions")}</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map(({ kit, status, stat }) => (
                  <TableRow key={kit.id} className="cursor-pointer" onClick={() => onOpen(kit.id)}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Thumb src={kit.image_url} />
                        <div className="min-w-0">
                          <button type="button" className="block max-w-[260px] truncate text-left font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            aria-label={t("kits_edit_aria", { name: kit.name })} onClick={(e) => { e.stopPropagation(); onOpen(kit.id); }}>{kit.name}</button>
                          <span className="block text-xs text-muted-foreground">{pieces(t, kit.items.length)} · /kit/{kit.slug}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell><KitStatusChip t={t} status={status} title={statusHint(t, status, kit, fmt.dateTime)} /></TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{discountLabel(t, kit, fmt.money)}</TableCell>
                    <TableCell className="text-right tabular-nums">{stat?.orders ?? 0}</TableCell>
                    <TableCell className="text-right tabular-nums">{stat?.kits_sold ?? 0}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt.money(stat?.revenue ?? 0)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{fmt.money(stat?.discount ?? 0)}</TableCell>
                    <TableCell className="text-right">
                      {kit.slug && (
                        <a href={`${siteUrl()}/kit/${kit.slug}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                          className={cn("inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-sm font-medium text-brand-orange-text hover:bg-muted", status !== "active" && "text-muted-foreground")}
                          title={status !== "active" ? t("kits_view_site_hidden") : undefined}>
                          {t("kits_view_site")}<ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground">{t("kits_stats_note")}</p>
        </>
      )}
    </div>
  );
}

const pieces = (t: T, n: number) => (n === 1 ? t("kits_pieces_one") : t("kits_pieces", { n }));

function discountLabel(t: T, kit: { discount_type: string; discount_value: number }, money: (v: number) => string) {
  return t("kits_off", { value: kit.discount_type === "percentage" ? `${kit.discount_value}%` : money(kit.discount_value) });
}

function Thumb({ src }: { src: string | null }) {
  return src
    ? <img src={src} alt="" className="h-12 w-12 shrink-0 rounded-xl border bg-muted object-cover" loading="lazy" />
    : <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border bg-muted"><Gift className="h-5 w-5 text-muted-foreground" strokeWidth={1.7} /></span>;
}
