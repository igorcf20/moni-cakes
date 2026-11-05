// =====================================================================================
// Admin > Vendas > Aluguéis (recurso rentals em Admin > Recursos da loja). Sem janelas:
//   Reservas  números (retiradas hoje e em 7 dias, com o cliente, devoluções atrasadas e de hoje), filtros, busca
//   reserva   (ver=reserva&id=<id>) cliente, produto, pedido, caução, entregar, devolver, cancelar, datas e notas
//   Regras    antecedência mínima, dias livres entre reservas e até quando reservar
// Produto para alugar na aba Aluguel da edição do produto (ProductRentalEditor). Escrita só por admin_rental_update
// e store_settings.rentals (migration 20261007100000_rentals.sql).
// =====================================================================================
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, CalendarCheck, CalendarClock, CalendarRange, ChevronRight, Loader2, PackageCheck, Save, Search, Undo2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AdminHelp from "./AdminHelp";
import AdminSubpage, { useAdminPage } from "./AdminSubpage";
import { AdminPager, AdminStatCard, FilterChips } from "./AdminListKit";
import { adminHref } from "./shell/adminSections";
import { useInlineConfirm } from "./shell/useInlineConfirm";
import { useMessages } from "@/i18n";
import { adminRentalsMessages } from "@/i18n/adminRentals";
import { shortDay } from "@/i18n/rentals";
import { useAdminFormat, usePaged } from "@/hooks/useAdminList";
import { useAdminRentalUpdate, useAdminRentals, useRentalRules, useSaveRentalSettings, type RentalBookingRow } from "@/hooks/useRentals";
import { addDays, normalizeRentalSettings, rentalDays, returnLate, type BookingStatus, type RentalSettings } from "@/lib/rentals";
import { cn } from "@/lib/utils";

type T = ReturnType<typeof useMessages<typeof adminRentalsMessages["pt-BR"]>>["t"];
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const code = (id: string) => id.slice(0, 8).toUpperCase();

const STATUS_CLS: Record<BookingStatus, string> = {
  reserved: "bg-sky-50 text-sky-700",
  out: "bg-amber-50 text-amber-700",
  returned: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-muted text-muted-foreground",
};
function StatusBadge({ b, t }: { b: Pick<RentalBookingRow, "status" | "end_date">; t: T }) {
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold", STATUS_CLS[b.status])}>{t(`st_${b.status}`)}</span>
      {returnLate(b, today()) && <span className="inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">{t("late")}</span>}
    </span>
  );
}
const daysText = (t: T, b: { start_date: string; end_date: string }) => {
  const n = rentalDays(b.start_date, b.end_date);
  return n === 1 ? t("day_one") : t("days", { n });
};

export default function AdminRentals() {
  const { t } = useMessages(adminRentalsMessages);
  const page = useAdminPage();
  const tab = page.tab === "regras" ? "regras" : "lista";
  if (page.view === "reserva" && page.id) return <BookingPage id={page.id} onBack={page.close} />;
  return (
    <div className="space-y-5">
      <AdminHelp id="rentals" title={t("help_title")} steps={[t("help_1"), t("help_2"), t("help_3")]} />
      <Tabs value={tab} onValueChange={page.setTab}>
        <TabsList className="h-11">
          <TabsTrigger value="lista" className="px-4">{t("tab_list")}</TabsTrigger>
          <TabsTrigger value="regras" className="px-4">{t("tab_rules")}</TabsTrigger>
        </TabsList>
        <TabsContent value="lista" className="mt-5"><BookingList onOpen={(id) => page.open("reserva", id)} /></TabsContent>
        <TabsContent value="regras" className="mt-5"><RulesForm /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------- Lista ---------- */

type Filter = "upcoming" | "today" | "week" | "out" | "late" | "returns" | "all" | BookingStatus;

function BookingList({ onOpen }: { onOpen: (id: string) => void }) {
  const { t } = useMessages(adminRentalsMessages);
  const { locale } = useAdminFormat();
  const { data: rows = [], isLoading, error } = useAdminRentals();
  const [filter, setFilter] = useState<Filter>("upcoming");
  const [q, setQ] = useState("");

  const now = today();
  const week = addDays(now, 7);
  const match = (b: RentalBookingRow, f: Filter): boolean => {
    switch (f) {
      case "upcoming": return b.status === "out" || (b.status === "reserved" && b.end_date >= now);
      case "today": return b.status === "reserved" && b.start_date === now;
      case "week": return b.status === "reserved" && b.start_date >= now && b.start_date <= week;
      case "late": return returnLate(b, now);
      case "returns": return b.status === "out" && b.end_date === now;
      case "all": return true;
      default: return b.status === f;
    }
  };
  const count = (f: Filter) => rows.filter((b) => match(b, f)).length;
  const needle = norm(q.trim());
  const filtered = rows.filter((b) => match(b, filter)
    && (!needle || norm([b.customer?.full_name, b.customer?.email, b.products?.name, b.order_id ? code(b.order_id) : ""].filter(Boolean).join(" ")).includes(needle)));
  const paged = usePaged(filtered, 20);

  if (isLoading) return <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>;
  if (error) return <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{t("load_error")}</p>;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <AdminStatCard icon={CalendarCheck} label={t("stat_today")} value={count("today")} active={filter === "today"} onClick={() => setFilter("today")} />
        <AdminStatCard icon={CalendarClock} label={t("stat_week")} value={count("week")} active={filter === "week"} onClick={() => setFilter("week")} />
        <AdminStatCard icon={PackageCheck} label={t("stat_out")} value={count("out")} active={filter === "out"} onClick={() => setFilter("out")} />
        <AdminStatCard icon={Undo2} label={t("stat_returns")} value={count("returns")} active={filter === "returns"} onClick={() => setFilter("returns")} />
        <AdminStatCard icon={AlertTriangle} label={t("stat_late")} value={count("late")} tone={count("late") ? "warning" : "default"} active={filter === "late"} onClick={() => setFilter("late")} />
      </div>

      <div className="flex flex-col gap-3 rounded-[18px] border bg-card p-4">
        <FilterChips<Filter>
          label={t("f_label")}
          value={filter}
          onChange={setFilter}
          options={[
            { value: "upcoming", label: t("f_upcoming"), count: count("upcoming") },
            { value: "late", label: t("f_late"), count: count("late"), tone: "warning" as const },
            ...(["reserved", "out", "returned", "cancelled"] as const).map((s) => ({ value: s as Filter, label: t(`st_${s}`), count: count(s) })),
            { value: "all", label: t("f_all"), count: rows.length },
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
          {paged.items.map((b) => (
            <li key={b.id}>
              <button type="button" onClick={() => onOpen(b.id)} className="flex w-full flex-col gap-2 rounded-[18px] border bg-card p-4 text-left transition-colors duration-150 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center sm:justify-between">
                <span className="flex min-w-0 items-center gap-3">
                  {b.products?.image
                    ? <img src={b.products.image} alt="" className="h-12 w-12 shrink-0 rounded-xl border object-cover" loading="lazy" />
                    : <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-muted"><CalendarRange className="h-5 w-5 text-muted-foreground" strokeWidth={1.8} /></span>}
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold">{b.products?.name ?? t("product_gone")}</span>
                      <StatusBadge b={b} t={t} />
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                      {[b.customer?.full_name || b.customer?.email || t("customer_unknown"), t("qty", { n: b.quantity }), b.order_id ? t("order", { code: code(b.order_id) }) : null].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </span>
                <span className="flex items-center gap-3 self-end sm:self-auto">
                  <span className="text-right">
                    <span className="block font-semibold tabular-nums">{t("range", { from: shortDay(locale, b.start_date), to: shortDay(locale, b.end_date) })}</span>
                    <span className="block text-xs text-muted-foreground">{daysText(t, b)}</span>
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

/* ---------- Página da reserva ---------- */

function BookingPage({ id, onBack }: { id: string; onBack: () => void }) {
  const { t } = useMessages(adminRentalsMessages);
  const { money, dateTime, locale } = useAdminFormat();
  const { data: rows = [], isLoading } = useAdminRentals();
  const b = rows.find((r) => r.id === id);
  const update = useAdminRentalUpdate();
  const { ask, confirmSlot } = useInlineConfirm();
  const [f, setF] = useState<{ start: string; end: string; notes: string } | null>(null);
  useEffect(() => { if (b) setF({ start: b.start_date, end: b.end_date, notes: b.notes ?? "" }); }, [b]);

  if (isLoading) return <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>;
  if (!b || !f) return <AdminSubpage title={t("not_found")} backLabel={t("back")} onBack={onBack}><p className="text-sm text-muted-foreground">{t("not_found_hint")}</p></AdminSubpage>;

  const run = async (status: BookingStatus, extra: { start?: string; end?: string; notes?: string } = {}) => {
    try {
      await update.mutateAsync({ id, status, ...extra });
      toast.success(t("saved"));
    } catch (e) {
      const c = (e as Error).message;
      toast.error(c === "unavailable" ? t("err_unavailable") : c === "invalid_dates" ? t("err_invalid_dates") : t("save_error"));
    }
  };
  const cancel = async () => {
    if (await ask(t("confirm_cancel"), { confirmLabel: t("act_cancel") })) await run("cancelled");
  };
  const long = (v: string) => new Intl.DateTimeFormat(locale, { timeZone: "UTC", weekday: "short", day: "numeric", month: "long" }).format(new Date(`${v}T00:00:00Z`));
  const busy = update.isPending;

  return (
    <AdminSubpage
      title={b.products?.name ?? t("product_gone")}
      subtitle={[b.customer?.full_name || b.customer?.email || t("customer_unknown"), t("range", { from: long(b.start_date), to: long(b.end_date) })].join(" · ")}
      backLabel={t("back")}
      onBack={onBack}
      actions={<>
        {b.order_id && <Button asChild variant="outline" size="sm"><Link to={adminHref.order(b.order_id)}>{t("open_order")}</Link></Button>}
        {b.user_id && <Button asChild variant="outline" size="sm"><Link to={adminHref.customer(b.user_id)}>{t("open_customer")}</Link></Button>}
      </>}
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <AdminStatCard icon={CalendarRange} label={t("status")} value={<StatusBadge b={b} t={t} />}
          hint={b.returned_at ? t("d_returned", { date: dateTime(b.returned_at) }) : b.picked_up_at ? t("d_picked", { date: dateTime(b.picked_up_at) }) : undefined} />
        <AdminStatCard icon={CalendarCheck} label={t("d_dates")} value={daysText(t, b)} hint={t("range", { from: shortDay(locale, b.start_date), to: shortDay(locale, b.end_date) })} />
        <AdminStatCard icon={PackageCheck} label={t("d_product")} value={t("qty", { n: b.quantity })} />
        <AdminStatCard icon={Wallet} label={t("d_deposit")} value={b.deposit > 0 ? money(b.deposit) : t("d_deposit_none")} />
      </div>

      {/* Ações do dia a dia */}
      {(b.status === "reserved" || b.status === "out") && (
        <section className="space-y-3 rounded-[18px] border bg-card p-4 sm:p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {b.status === "reserved" && <Button onClick={() => void run("out")} disabled={busy}><PackageCheck className="mr-1.5 h-4 w-4" strokeWidth={1.8} />{t("act_out")}</Button>}
            {b.status === "out" && <Button onClick={() => void run("returned")} disabled={busy}><Undo2 className="mr-1.5 h-4 w-4" strokeWidth={1.8} />{t("act_returned")}</Button>}
            {b.status === "out" && <Button variant="outline" onClick={() => void run("reserved")} disabled={busy}>{t("act_reserved")}</Button>}
            <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => void cancel()} disabled={busy}>{t("act_cancel")}</Button>
          </div>
          {confirmSlot}
        </section>
      )}

      <section className="space-y-3 rounded-[18px] border bg-card p-4 sm:p-5">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">{t("d_customer")}</dt><dd className="font-medium">{b.customer?.full_name || t("customer_unknown")}{b.customer?.email ? ` · ${b.customer.email}` : ""}</dd></div>
          <div><dt className="text-muted-foreground">{t("d_order")}</dt><dd className="font-medium">{b.order_id ? <Link to={adminHref.order(b.order_id)} className="text-brand-orange-text hover:underline">{t("order", { code: code(b.order_id) })}</Link> : "-"}{b.orders ? ` · ${money(b.orders.total)}` : ""}</dd></div>
        </dl>
      </section>

      {/* Datas e notas */}
      <section className="space-y-4 rounded-[18px] border bg-card p-4 sm:p-5">
        <div>
          <h4 className="font-semibold">{t("edit_title")}</h4>
          <p className="text-sm text-muted-foreground">{t("edit_hint")}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="rb-start">{t("start")}</Label>
            <Input id="rb-start" type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rb-end">{t("end")}</Label>
            <Input id="rb-end" type="date" value={f.end} min={f.start} onChange={(e) => setF({ ...f, end: e.target.value })} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="rb-notes">{t("notes")}</Label>
            <Textarea id="rb-notes" rows={3} maxLength={2000} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
            <p className="text-xs text-muted-foreground">{t("notes_hint")}</p>
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={() => void run(b.status, { start: f.start, end: f.end, notes: f.notes })} disabled={busy}>
            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" strokeWidth={1.8} />}{t("save")}
          </Button>
        </div>
      </section>
    </AdminSubpage>
  );
}

/* ---------- Regras ---------- */

function RulesForm() {
  const { t } = useMessages(adminRentalsMessages);
  const { settings, raw, isLoading } = useRentalRules();
  const save = useSaveRentalSettings();
  const [d, setD] = useState<RentalSettings>(settings);
  useEffect(() => { if (!isLoading) setD(settings); }, [isLoading, settings]);
  const field = (key: keyof RentalSettings, label: "rule_lead" | "rule_buffer" | "rule_ahead") => (
    <div className="space-y-1.5">
      <Label htmlFor={`rr-${key}`}>{t(label)}</Label>
      <Input id={`rr-${key}`} inputMode="numeric" value={String(d[key])} onChange={(e) => setD({ ...d, [key]: Number(e.target.value.replace(/\D/g, "")) || 0 })} />
      <p className="text-xs text-muted-foreground">{t(`${label}_d`)}</p>
    </div>
  );
  const submit = async () => {
    try {
      await save.mutateAsync({ next: normalizeRentalSettings(d), raw });
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
      <div className="grid gap-4 sm:grid-cols-3">
        {field("lead_days", "rule_lead")}
        {field("buffer_days", "rule_buffer")}
        {field("max_days_ahead", "rule_ahead")}
      </div>
      <div className="flex justify-end">
        <Button onClick={() => void submit()} disabled={save.isPending}>
          {save.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" strokeWidth={1.8} />}{t("rules_save")}
        </Button>
      </div>
    </section>
  );
}
