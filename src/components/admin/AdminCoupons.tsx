// =====================================================================================
// Admin > Cupons: lista com números do topo, busca, filtros por estado e liga/desliga.
// Criar, ver e editar cada cupom é numa página própria (src/pages/admin/AdminCouponPage.tsx,
// /admin/cupons/novo e /admin/cupons/<id>), sem janelas por cima.
// Regras e valor do desconto: servidor (public.coupon_quote). Textos em src/i18n/adminCoupons.ts.
// =====================================================================================
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronRight, Plus, Receipt, Search, ShoppingBag, Ticket, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AdminPager, AdminStatCard, FilterChips } from "./AdminListKit";
import { adminHref } from "./shell/adminSections";
import { useAdminFormat, usePaged } from "@/hooks/useAdminList";
import { useMessages } from "@/i18n";
import { adminCouponsMessages, type AdminCouponsKey } from "@/i18n/adminCoupons";
import { couponState, couponTotals, couponValueLabel, isCountedOrder, useAdminCoupons, useCouponOrders, type AdminCoupon, type CouponState } from "@/hooks/useAdminCoupons";
import { CouponStateBadge } from "./coupons/CouponStateBadge";

type Filter = "all" | "active" | "scheduled" | "ended" | "inactive";
const FILTERS: Record<Filter, (s: CouponState) => boolean> = {
  all: () => true,
  active: (s) => s === "active",
  scheduled: (s) => s === "scheduled",
  ended: (s) => s === "expired" || s === "exhausted",
  inactive: (s) => s === "inactive",
};

const AdminCoupons = () => {
  const { t } = useMessages(adminCouponsMessages);
  const fmt = useAdminFormat();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: coupons = [], isLoading } = useAdminCoupons();
  const { data: orders = [] } = useCouponOrders();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [toggling, setToggling] = useState<string | null>(null);

  const totals = useMemo(() => couponTotals(orders), [orders]);
  const withState = useMemo(() => coupons.map((c) => ({ ...c, state: couponState(c) })), [coupons]);
  const counted = orders.filter(isCountedOrder);

  const q = search.trim().toLowerCase();
  const filtered = withState.filter((c) => FILTERS[filter](c.state) && (!q || c.code.toLowerCase().includes(q) || (c.description || "").toLowerCase().includes(q)));
  const paged = usePaged(filtered, 20);

  const toggle = async (c: AdminCoupon) => {
    setToggling(c.id);
    const { error } = await (supabase as any).from("coupons").update({ active: !c.active }).eq("id", c.id);
    setToggling(null);
    if (error) { toast.error(t("toggle_error")); return; }
    toast.success(t(c.active ? "toggled_off" : "toggled_on", { code: c.code }));
    qc.invalidateQueries({ queryKey: ["admin-coupons"] });
  };

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-80 w-full" /></div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button onClick={() => navigate(adminHref.newCoupon())}>
          <Plus className="h-4 w-4" aria-hidden="true" /> {t("new_coupon")}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <AdminStatCard icon={Ticket} label={t("stat_active")} value={withState.filter((c) => c.state === "active").length} hint={t("stat_active_hint", { n: coupons.length })} />
        <AdminStatCard icon={ShoppingBag} label={t("stat_orders")} value={counted.length} />
        <AdminStatCard icon={Receipt} label={t("stat_discount")} value={fmt.money(counted.reduce((s, o) => s + Number(o.discount_amount || 0), 0))} hint={t("stat_discount_hint")} />
        <AdminStatCard icon={TrendingUp} label={t("stat_sales")} value={fmt.money(counted.reduce((s, o) => s + Number(o.total || 0), 0))} hint={t("stat_sales_hint")} tone="success" />
      </div>

      {coupons.length === 0 ? (
        <div className="rounded-[18px] border bg-card p-10 text-center">
          <Ticket className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" strokeWidth={1.7} aria-hidden="true" />
          <p className="font-semibold">{t("empty_title")}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{t("empty_text")}</p>
          <Button className="mt-4" onClick={() => navigate(adminHref.newCoupon())}><Plus className="h-4 w-4" aria-hidden="true" /> {t("new_coupon")}</Button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input placeholder={t("search")} aria-label={t("search")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 text-base md:text-sm" />
          </div>

          <FilterChips<Filter>
            label={t("filter_label")}
            value={filter}
            onChange={setFilter}
            options={(Object.keys(FILTERS) as Filter[]).map((k) => ({
              value: k,
              label: t(`f_${k}` as AdminCouponsKey),
              count: withState.filter((c) => FILTERS[k](c.state)).length,
            }))}
          />

          <div className="overflow-x-auto rounded-[18px] border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("col_code")}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t("col_discount")}</TableHead>
                  <TableHead className="hidden md:table-cell text-right">{t("col_uses")}</TableHead>
                  <TableHead className="hidden lg:table-cell text-right">{t("usage_discount")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("col_validity")}</TableHead>
                  <TableHead>{t("col_on")}</TableHead>
                  <TableHead className="w-10"><span className="sr-only">{t("open_coupon", { code: "" })}</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.items.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="py-12 text-center text-muted-foreground">{t("none_found")}</TableCell></TableRow>
                ) : paged.items.map((c) => {
                  const tot = totals.get(c.code.toLowerCase());
                  return (
                    <TableRow key={c.id} className="cursor-pointer" onClick={() => navigate(adminHref.coupon(c.id))}>
                      <TableCell>
                        <Link to={adminHref.coupon(c.id)} onClick={(e) => e.stopPropagation()} className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-sm font-bold tracking-wide text-foreground">{c.code}</span>
                            <CouponStateBadge state={c.state} />
                          </span>
                          <span className="block text-xs text-muted-foreground sm:hidden">{couponValueLabel(c, fmt.money, fmt.locale)}</span>
                          {c.description && <span className="block max-w-[260px] truncate text-xs text-muted-foreground">{c.description}</span>}
                        </Link>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <span className="font-semibold tabular-nums">{couponValueLabel(c, fmt.money, fmt.locale)}</span>
                        {Number(c.min_purchase || 0) > 0 && <span className="block text-xs text-muted-foreground">{t("sum_min", { value: fmt.money(c.min_purchase) })}</span>}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-right tabular-nums">
                        {c.max_uses != null ? t("uses_of", { n: c.current_uses ?? 0, max: c.max_uses }) : t("uses_n", { n: c.current_uses ?? 0 })}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-right tabular-nums whitespace-nowrap">{fmt.money(tot?.discount ?? 0)}</TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground whitespace-nowrap">
                        {c.starts_at && new Date(c.starts_at).getTime() > Date.now() ? t("from", { date: fmt.date(c.starts_at) }) : c.expires_at ? t("until", { date: fmt.date(c.expires_at) }) : t("no_end")}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Switch checked={c.active} disabled={toggling === c.id} onCheckedChange={() => toggle(c)} aria-label={t("toggle_coupon", { code: c.code })} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Link to={adminHref.coupon(c.id)} onClick={(e) => e.stopPropagation()} aria-label={t("open_coupon", { code: c.code })}
                          className="inline-grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          <ChevronRight className="h-4 w-4" aria-hidden="true" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <AdminPager page={paged.page} pages={paged.pages} total={paged.total} from={paged.from} to={paged.to} onPage={paged.setPage} />
        </>
      )}
    </div>
  );
};

export default AdminCoupons;
