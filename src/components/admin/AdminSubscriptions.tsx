// =====================================================================================
// Admin > Vendas > Assinaturas (recurso subscriptions em Admin > Recursos da loja). Sem janelas:
//   Assinaturas  números (ativas, pausadas, renovam em 7 dias, atrasadas, receita mensal estimada), filtros, busca
//   assinatura   (ver=assinatura&id=<id>) cliente, produto, plano, pedidos de cada ciclo, alterar estado, data e quantidade
//   Regras       o que o cliente pode fazer pela conta e quantos dias antes a renovação é liberada
// Planos por produto na aba Assinatura da edição do produto (ProductSubscriptionPlans). Escrita só pelas funções
// admin_subscription_update e store_settings.subscriptions (migration 20261007090000_subscriptions.sql).
// =====================================================================================
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, CalendarClock, ChevronRight, Loader2, PauseCircle, Repeat, Save, Search, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import AdminHelp from "./AdminHelp";
import AdminSubpage, { useAdminPage } from "./AdminSubpage";
import { AdminPager, AdminStatCard, FilterChips } from "./AdminListKit";
import { adminHref } from "./shell/adminSections";
import { useInlineConfirm } from "./shell/useInlineConfirm";
import { useMessages } from "@/i18n";
import { adminSubscriptionsMessages } from "@/i18n/adminSubscriptions";
import { everyText, subscriptionsMessages } from "@/i18n/subscriptions";
import { useAdminFormat, usePaged } from "@/hooks/useAdminList";
import {
  useAdminSubscriptionUpdate, useAdminSubscriptions, useSaveSubscriptionSettings, useSubscriptionOrders, useSubscriptionRules,
  type AdminSubscriptionRow,
} from "@/hooks/useSubscriptions";
import { addDays, monthlyValue, normalizeSubscriptionSettings, renewalLate, subscriptionUnit, SUBSCRIPTION_STATUSES, type SubscriptionSettings, type SubscriptionStatus } from "@/lib/subscriptions";
import { orderStatusLabel } from "@/lib/orderStatusStyles";
import { cn } from "@/lib/utils";

type T = ReturnType<typeof useMessages<typeof adminSubscriptionsMessages["pt-BR"]>>["t"];
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const dayDate = (s: string) => new Date(`${s}T12:00:00`);
/** Valor de um ciclo: preço do produto x quantidade com o desconto da assinatura (estimativa, sem frete nem opções). */
const cycleValue = (s: AdminSubscriptionRow) => subscriptionUnit(Number(s.products?.price ?? 0), s.discount_percent) * s.quantity;

const STATUS_CLS: Record<SubscriptionStatus, string> = {
  active: "bg-emerald-50 text-emerald-700",
  paused: "bg-amber-50 text-amber-700",
  cancelled: "bg-muted text-muted-foreground",
};
function StatusBadge({ s, t }: { s: Pick<AdminSubscriptionRow, "status" | "next_date">; t: T }) {
  const late = renewalLate(s, today());
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold", STATUS_CLS[s.status])}>{t(`st_${s.status}`)}</span>
      {late && <span className="inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">{t("late")}</span>}
    </span>
  );
}

export default function AdminSubscriptions() {
  const { t } = useMessages(adminSubscriptionsMessages);
  const page = useAdminPage();
  const tab = page.tab === "regras" ? "regras" : "lista";
  if (page.view === "assinatura" && page.id) return <SubscriptionPage id={page.id} onBack={page.close} />;
  return (
    <div className="space-y-5">
      <AdminHelp id="subscriptions" title={t("help_title")} steps={[t("help_1"), t("help_2"), t("help_3")]} />
      <Tabs value={tab} onValueChange={page.setTab}>
        <TabsList className="h-11">
          <TabsTrigger value="lista" className="px-4">{t("tab_list")}</TabsTrigger>
          <TabsTrigger value="regras" className="px-4">{t("tab_rules")}</TabsTrigger>
        </TabsList>
        <TabsContent value="lista" className="mt-5"><SubscriptionList onOpen={(id) => page.open("assinatura", id)} /></TabsContent>
        <TabsContent value="regras" className="mt-5"><RulesForm /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------- Lista ---------- */

type Filter = "all" | SubscriptionStatus | "due" | "late";

function SubscriptionList({ onOpen }: { onOpen: (id: string) => void }) {
  const { t } = useMessages(adminSubscriptionsMessages);
  const { t: ts } = useMessages(subscriptionsMessages);
  const { money, date } = useAdminFormat();
  const { data: rows = [], isLoading, error } = useAdminSubscriptions();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");

  const now = today();
  const week = addDays(now, 7);
  const isDue = (s: AdminSubscriptionRow) => s.status === "active" && !!s.next_date && s.next_date >= now && s.next_date <= week;
  const isLate = (s: AdminSubscriptionRow) => renewalLate(s, now);
  const match = (s: AdminSubscriptionRow, f: Filter) =>
    f === "all" || (f === "due" ? isDue(s) : f === "late" ? isLate(s) : s.status === f);
  const count = (f: Filter) => rows.filter((s) => match(s, f)).length;
  const mrr = rows.filter((s) => s.status === "active").reduce((sum, s) => sum + monthlyValue(cycleValue(s), s.interval_unit, s.interval_count), 0);

  const needle = norm(q.trim());
  const filtered = rows.filter((s) => match(s, filter)
    && (!needle || norm([s.customer?.full_name, s.customer?.email, s.products?.name].filter(Boolean).join(" ")).includes(needle)));
  const paged = usePaged(filtered, 20);

  if (isLoading) return <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>;
  if (error) return <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{t("load_error")}</p>;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <AdminStatCard icon={Repeat} label={t("stat_active")} value={count("active")} active={filter === "active"} onClick={() => setFilter("active")} />
        <AdminStatCard icon={PauseCircle} label={t("stat_paused")} value={count("paused")} active={filter === "paused"} onClick={() => setFilter("paused")} />
        <AdminStatCard icon={CalendarClock} label={t("stat_due")} value={count("due")} active={filter === "due"} onClick={() => setFilter("due")} />
        <AdminStatCard icon={AlertTriangle} label={t("stat_late")} value={count("late")} tone={count("late") ? "warning" : "default"} active={filter === "late"} onClick={() => setFilter("late")} />
        <AdminStatCard icon={TrendingUp} label={t("stat_mrr")} value={money(mrr)} hint={t("stat_mrr_hint")} tone="success" />
      </div>

      <div className="flex flex-col gap-3 rounded-[18px] border bg-card p-4">
        <FilterChips<Filter>
          label={t("f_label")}
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: t("f_all"), count: rows.length },
            ...SUBSCRIPTION_STATUSES.map((s) => ({ value: s as Filter, label: t(`st_${s}`), count: count(s) })),
            { value: "due", label: t("f_due"), count: count("due") },
            { value: "late", label: t("f_late"), count: count("late"), tone: "warning" as const },
          ]}
        />
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("f_search")} aria-label={t("f_search")} className="pl-9" />
        </div>
      </div>

      {paged.items.length === 0 ? (
        <p className="rounded-[18px] border border-dashed p-10 text-center text-sm text-muted-foreground">{rows.length ? t("empty") : t("empty_all")}</p>
      ) : (
        <ul className="space-y-3">
          {paged.items.map((s) => (
            <li key={s.id}>
              <button type="button" onClick={() => onOpen(s.id)} className="flex w-full flex-col gap-2 rounded-[18px] border bg-card p-4 text-left transition-colors duration-150 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center sm:justify-between">
                <span className="flex min-w-0 items-center gap-3">
                  {s.products?.image
                    ? <img src={s.products.image} alt="" className="h-12 w-12 shrink-0 rounded-xl border object-cover" loading="lazy" />
                    : <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-muted"><Repeat className="h-5 w-5 text-muted-foreground" strokeWidth={1.8} /></span>}
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold">{s.customer?.full_name || s.customer?.email || t("customer_unknown")}</span>
                      <StatusBadge s={s} t={t} />
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                      {[`${s.quantity} x ${s.products?.name ?? t("product_gone")}`, everyText(ts, s.interval_unit, s.interval_count), `-${s.discount_percent}%`].join(" · ")}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {[s.status !== "cancelled" ? (s.next_date ? t("next", { date: date(dayDate(s.next_date)) }) : t("next_none")) : null, t("cycles", { n: s.cycles_done })].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </span>
                <span className="flex items-center gap-3 self-end sm:self-auto">
                  <span className="text-right">
                    <span className="block text-lg font-bold tabular-nums">{money(cycleValue(s))}</span>
                    <span className="block text-xs text-muted-foreground">{t("per_cycle")}</span>
                  </span>
                  <ChevronRight className="hidden h-4 w-4 text-brand-orange-text sm:block" />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <AdminPager page={paged.page} pages={paged.pages} total={paged.total} from={paged.from} to={paged.to} onPage={paged.setPage} />
    </div>
  );
}

/* ---------- Página da assinatura ---------- */

function SubscriptionPage({ id, onBack }: { id: string; onBack: () => void }) {
  const { t } = useMessages(adminSubscriptionsMessages);
  const { t: ts } = useMessages(subscriptionsMessages);
  const { money, date, dateTime, locale } = useAdminFormat();
  const { data: rows = [], isLoading } = useAdminSubscriptions();
  const s = rows.find((r) => r.id === id);
  const { data: orders = [] } = useSubscriptionOrders(id);
  const update = useAdminSubscriptionUpdate();
  const { ask, confirmSlot } = useInlineConfirm();
  const [f, setF] = useState<{ status: SubscriptionStatus; next: string; qty: string; reason: string } | null>(null);

  useEffect(() => {
    if (s) setF({ status: s.status, next: s.next_date ?? "", qty: String(s.quantity), reason: "" });
  }, [s]);

  if (isLoading) return <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>;
  if (!s || !f) return <AdminSubpage title={t("not_found")} backLabel={t("back")} onBack={onBack}><p className="text-sm text-muted-foreground">{t("not_found_hint")}</p></AdminSubpage>;

  const reasonText = (r: string | null) => (r === "order_cancelled" ? t("reason_order_cancelled") : r === "customer" ? t("reason_customer") : r === "admin" ? t("reason_admin") : r);
  const qty = Math.floor(Number(f.qty));
  const submit = async () => {
    if (!(qty >= 1 && qty <= 999)) { toast.error(t("err_invalid_quantity")); return; }
    if (f.status === "cancelled" && s.status !== "cancelled" && !(await ask(t("confirm_cancel"), { confirmLabel: t("confirm_yes") }))) return;
    try {
      await update.mutateAsync({ id, status: f.status, nextDate: f.next || null, quantity: qty, reason: f.status === "cancelled" ? f.reason || "admin" : null });
      toast.success(t("saved"));
    } catch (e) {
      toast.error((e as Error).message === "invalid_quantity" ? t("err_invalid_quantity") : t("save_error"));
    }
  };
  const options = [s.options.variation, s.options.size].filter(Boolean).join(" · ");
  const longDate = (v: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(dayDate(v));

  return (
    <AdminSubpage
      title={`${s.products?.name ?? t("product_gone")} · ${everyText(ts, s.interval_unit, s.interval_count)}`}
      subtitle={[s.customer?.full_name || s.customer?.email || t("customer_unknown"), t("started_on", { date: date(s.created_at) })].join(" · ")}
      backLabel={t("back")}
      onBack={onBack}
      actions={<>
        <Button asChild variant="outline" size="sm"><Link to={adminHref.customer(s.user_id)}>{t("open_customer")}</Link></Button>
        {s.product_id && <Button asChild variant="outline" size="sm"><Link to={adminHref.productStats(s.product_id)}>{t("open_product")}</Link></Button>}
      </>}
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <AdminStatCard icon={Repeat} label={t("status")} value={<StatusBadge s={s} t={t} />} hint={s.cancelled_at ? `${t("d_cancelled", { date: date(s.cancelled_at) })}${s.cancel_reason ? `, ${reasonText(s.cancel_reason)}` : ""}` : undefined} />
        <AdminStatCard icon={CalendarClock} label={t("next_date")} value={s.next_date && s.status !== "cancelled" ? date(dayDate(s.next_date)) : "-"} tone={renewalLate(s, today()) ? "warning" : "default"} />
        <AdminStatCard icon={TrendingUp} label={t("d_value")} value={money(cycleValue(s))} hint={`${s.quantity} x -${s.discount_percent}%`} />
        <AdminStatCard icon={Repeat} label={t("history")} value={s.cycles_done} hint={s.min_cycles ? t("d_min", { n: s.min_cycles }) : t("d_min_none")} />
      </div>

      <section className="space-y-3 rounded-[18px] border bg-card p-4 sm:p-5">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">{t("d_customer")}</dt><dd className="font-medium">{s.customer?.full_name || t("customer_unknown")}{s.customer?.email ? ` · ${s.customer.email}` : ""}</dd></div>
          <div><dt className="text-muted-foreground">{t("d_product")}</dt><dd className="font-medium">{s.products?.name ?? t("product_gone")}</dd></div>
          <div><dt className="text-muted-foreground">{t("d_plan")}</dt><dd className="font-medium">{[everyText(ts, s.interval_unit, s.interval_count), t("d_discount", { pct: s.discount_percent }), s.min_cycles ? t("d_min", { n: s.min_cycles }) : t("d_min_none")].join(" · ")}</dd></div>
          {options && <div><dt className="text-muted-foreground">{t("d_options")}</dt><dd className="font-medium">{options}</dd></div>}
        </dl>
      </section>

      {/* Alterar */}
      <section className="space-y-4 rounded-[18px] border bg-card p-4 sm:p-5">
        <div>
          <h4 className="font-semibold">{t("edit_title")}</h4>
          <p className="text-sm text-muted-foreground">{t("edit_hint")}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="sub-status">{t("status")}</Label>
            <Select value={f.status} onValueChange={(v) => setF({ ...f, status: v as SubscriptionStatus })}>
              <SelectTrigger id="sub-status"><SelectValue /></SelectTrigger>
              <SelectContent>{SUBSCRIPTION_STATUSES.map((st) => <SelectItem key={st} value={st}>{t(`st_${st}`)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sub-next">{t("next_date")}</Label>
            <Input id="sub-next" type="date" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} />
            {f.next && <p className="text-xs text-muted-foreground">{longDate(f.next)}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sub-qty">{t("quantity")}</Label>
            <Input id="sub-qty" inputMode="numeric" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value.replace(/\D/g, "") })} />
          </div>
          {f.status === "cancelled" && s.status !== "cancelled" && (
            <div className="space-y-1.5 sm:col-span-3">
              <Label htmlFor="sub-reason">{t("reason")}</Label>
              <Textarea id="sub-reason" rows={2} maxLength={500} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
              <p className="text-xs text-muted-foreground">{t("reason_hint")}</p>
            </div>
          )}
        </div>
        {confirmSlot}
        <div className="flex justify-end">
          <Button onClick={() => void submit()} disabled={update.isPending}>
            {update.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" strokeWidth={1.8} />}{t("save")}
          </Button>
        </div>
      </section>

      {/* Pedidos de cada ciclo */}
      <section className="space-y-3 rounded-[18px] border bg-card p-4 sm:p-5">
        <h4 className="font-semibold">{t("history")}</h4>
        {orders.length === 0 ? <p className="text-sm text-muted-foreground">{t("history_empty")}</p> : (
          <ul className="divide-y">
            {orders.map((o) => (
              <li key={o.order_id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {t("cycle", { n: o.cycle })} · <Link to={adminHref.order(o.order_id)} className="text-brand-orange-text hover:underline">{t("order", { code: o.order_id.slice(0, 8).toUpperCase() })}</Link>
                  </p>
                  <p className="text-xs text-muted-foreground">{dateTime(o.orders?.created_at ?? o.created_at)}{o.orders ? ` · ${orderStatusLabel(o.orders.status, locale)}` : ""}</p>
                </div>
                {o.orders && <span className="text-sm font-semibold tabular-nums">{money(o.orders.total)}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </AdminSubpage>
  );
}

/* ---------- Regras ---------- */

function RulesForm() {
  const { t } = useMessages(adminSubscriptionsMessages);
  const { settings, raw, isLoading } = useSubscriptionRules();
  const save = useSaveSubscriptionSettings();
  const [d, setD] = useState<SubscriptionSettings>(settings);
  useEffect(() => { if (!isLoading) setD(settings); }, [isLoading, settings]);
  const set = (patch: Partial<SubscriptionSettings>) => setD((cur) => ({ ...cur, ...patch }));

  const submit = async () => {
    try {
      await save.mutateAsync({ next: normalizeSubscriptionSettings(d), raw });
      toast.success(t("rules_saved"));
    } catch {
      toast.error(t("save_error"));
    }
  };

  return (
    <section className="space-y-4 rounded-[18px] border bg-card p-4 sm:p-5">
      <div>
        <h4 className="font-semibold">{t("rules_title")}</h4>
        <p className="text-sm text-muted-foreground">{t("rules_hint")}</p>
      </div>
      {([["customer_pause", "rule_pause"], ["customer_cancel", "rule_cancel"]] as const).map(([key, label]) => (
        <div key={key} className="flex items-start justify-between gap-3 rounded-xl border p-3">
          <div>
            <Label htmlFor={`sub-${key}`} className="text-sm font-semibold">{t(label)}</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">{t(`${label}_d`)}</p>
          </div>
          <Switch id={`sub-${key}`} checked={d[key]} onCheckedChange={(v) => set({ [key]: v })} />
        </div>
      ))}
      <div className="max-w-sm space-y-1.5">
        <Label htmlFor="sub-days">{t("rule_days")}</Label>
        <Input id="sub-days" inputMode="numeric" value={String(d.renew_days_before)} onChange={(e) => set({ renew_days_before: Number(e.target.value.replace(/\D/g, "")) || 0 })} />
        <p className="text-xs text-muted-foreground">{t("rule_days_d")}</p>
      </div>
      <div className="flex justify-end">
        <Button onClick={() => void submit()} disabled={save.isPending}>
          {save.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" strokeWidth={1.8} />}{t("rules_save")}
        </Button>
      </div>
    </section>
  );
}
