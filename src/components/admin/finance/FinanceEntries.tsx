// =====================================================================================
// Admin > Financeiro > Lançamentos: despesas e outras entradas lançadas à mão.
//   Lista      números (pagas no período, entradas, por pagar, vencidas), filtros (tipo, situação, categoria, período,
//              busca), marcar como pago, exportar para planilha; clicar abre a página do lançamento
//   Página     criar ou editar (?ver=lancamento&id=<id> ou ?ver=novo): tipo, descrição, valor e moeda, data, situação
//              e vencimento, categoria, fornecedor ou cliente, forma de pagamento, referência, notas; repetir todo mês
// Valores gravados em centavos com a moeda; outra moeda que não a base usa a taxa de Admin > Moedas e câmbio.
// =====================================================================================
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, ArrowDownToLine, ArrowUpFromLine, CalendarClock, CheckCircle2, Copy, Download, Loader2, Plus, Repeat, Save, Search, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { AdminPager, AdminStatCard, FilterChips } from "@/components/admin/AdminListKit";
import HelpTip from "@/components/admin/HelpTip";
import AdminSubpage, { useAdminPage } from "@/components/admin/AdminSubpage";
import { AdminPanel, InlineConfirm } from "@/components/admin/shell/AdminPageParts";
import { useAdminFormat, usePaged } from "@/hooks/useAdminList";
import { useCurrency } from "@/hooks/use-currency";
import { useCurrencySettings } from "@/hooks/useExchangeRates";
import {
  useDeleteFinanceEntry, useFinanceCategories, useFinanceEntries, useSaveFinanceEntry, useSetEntryStatus, type EntryRow,
} from "@/hooks/useFinance";
import { entryDate, inRange, isOverdue, monthlyDates, presetRange, toBaseAmount, type EntryKind, type EntryStatus, type PeriodPreset } from "@/lib/finance";
import { currencyDigits, formatMoney } from "@/lib/money";
import { csvNumber, downloadCsv } from "@/lib/csv";
import { cn } from "@/lib/utils";
import { useMessages } from "@/i18n";
import { adminFinanceMessages, type AdminFinanceKey } from "@/i18n/adminFinance";
import { CategoryDot } from "./FinanceParts";
import { categoryLabel } from "./FinanceDashboard";

type KindFilter = "all" | EntryKind;
type StateFilter = "all" | "paid" | "pending" | "overdue";
const PERIODS: PeriodPreset[] = ["month", "last_month", "90d", "year", "all"];
const selectCls = "h-10 w-full rounded-[12px] border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function FinanceEntries() {
  const { t } = useMessages(adminFinanceMessages);
  const fmt = useAdminFormat();
  const page = useAdminPage();
  const { toast } = useToast();
  const { entries, isLoading } = useFinanceEntries();
  const { data: categories = [] } = useFinanceCategories();
  const setStatus = useSetEntryStatus();
  const [kind, setKind] = useState<KindFilter>("all");
  const [state, setState] = useState<StateFilter>("all");
  const [period, setPeriod] = useState<PeriodPreset>("month");
  const [cat, setCat] = useState("");
  const [q, setQ] = useState("");
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const range = useMemo(() => presetRange(period, new Date(), undefined, new Date(2000, 0, 1)), [period]);
  // Por pagar aparecem sempre (qualquer data); pagos só no período.
  const scoped = useMemo(() => entries.filter((e) => e.status === "pending" || inRange(e.occurredOn, range)), [entries, range]);
  const visible = useMemo(() => {
    const s = norm(q.trim());
    return scoped.filter((e) =>
      (kind === "all" || e.kind === kind)
      && (state === "all" || (state === "overdue" ? isOverdue(e) : e.status === state))
      && (!cat || e.categoryId === cat)
      && (!s || norm(`${e.description} ${e.row.counterparty ?? ""} ${e.row.reference ?? ""}`).includes(s)))
      .sort((a, b) => (a.status !== b.status ? (a.status === "pending" ? -1 : 1) : (b.dueOn ?? b.occurredOn).localeCompare(a.dueOn ?? a.occurredOn)));
  }, [scoped, kind, state, cat, q]);
  const paged = usePaged(visible, 20);

  const sumOf = (list: typeof entries) => list.reduce((s, e) => s + (e.amount ?? 0), 0);
  const paidInPeriod = scoped.filter((e) => e.status === "paid");
  const pending = entries.filter((e) => e.status === "pending");
  const overdue = pending.filter((e) => isOverdue(e));

  const exportCsv = () => {
    const cols: AdminFinanceKey[] = ["col_date", "col_due", "col_type", "col_category", "col_description", "col_counterparty", "col_status", "col_amount", "col_currency", "col_amount_base"];
    downloadCsv(t("csv_entries"), cols.map((c) => t(c)), visible.map((e) => [
      e.occurredOn, e.dueOn ?? "", t(`kind_${e.kind}` as AdminFinanceKey), categoryLabel(e.categoryId ? catById.get(e.categoryId) : undefined, t), e.description,
      e.row.counterparty ?? "", t(`es_${e.status}` as AdminFinanceKey), csvNumber(e.row.amount_cents / 10 ** currencyDigits(e.row.currency), fmt.locale), e.row.currency,
      e.amount == null ? "" : csvNumber(e.amount, fmt.locale),
    ]));
  };

  if (page.view === "lancamento" || page.view === "novo") return <EntryPage id={page.view === "novo" ? null : page.id} copyOf={page.view === "novo" ? page.id : null} onBack={page.close} onSaved={(id) => page.open("lancamento", id)} onDuplicate={(id) => page.open("novo", id)} />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterChips<PeriodPreset> label={t("period")} value={period} onChange={setPeriod}
          options={PERIODS.map((p) => ({ value: p, label: t(`p_${p}` as AdminFinanceKey) }))} />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" className="min-h-10" onClick={exportCsv} disabled={!visible.length}>
            <Download className="h-4 w-4" aria-hidden="true" />{t("export")}
          </Button>
          <Button type="button" size="sm" className="min-h-10" onClick={() => page.open("novo")}>
            <Plus className="h-4 w-4" aria-hidden="true" />{t("new_entry")}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[76px] rounded-[18px]" />)}</div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <AdminStatCard icon={ArrowUpFromLine} label={t("e_paid_expenses")} value={fmt.money(sumOf(paidInPeriod.filter((e) => e.kind === "expense")))}
            active={kind === "expense" && state === "paid"} onClick={() => { setKind("expense"); setState("paid"); }} />
          <AdminStatCard icon={ArrowDownToLine} label={t("e_paid_income")} value={fmt.money(sumOf(paidInPeriod.filter((e) => e.kind === "income")))} tone="success"
            active={kind === "income" && state === "paid"} onClick={() => { setKind("income"); setState("paid"); }} />
          <AdminStatCard icon={CalendarClock} label={t("e_pending")} value={fmt.money(sumOf(pending.filter((e) => e.kind === "expense")))} tone="warning"
            hint={t("e_pending_hint", { value: fmt.money(sumOf(pending.filter((e) => e.kind === "income"))) })}
            active={state === "pending"} onClick={() => { setKind("all"); setState("pending"); }} />
          <AdminStatCard icon={AlertTriangle} label={t("e_overdue")} value={overdue.length} tone={overdue.length ? "danger" : "default"}
            hint={overdue.length ? fmt.money(sumOf(overdue)) : undefined} active={state === "overdue"} onClick={() => { setKind("all"); setState("overdue"); }} />
        </div>
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          <FilterChips<KindFilter> label={t("col_type")} value={kind} onChange={setKind}
            options={(["all", "expense", "income"] as KindFilter[]).map((k) => ({ value: k, label: t(k === "all" ? "f_all" : `kind_${k}` as AdminFinanceKey) }))} />
          <FilterChips<StateFilter> label={t("col_status")} value={state} onChange={setState}
            options={(["all", "paid", "pending", "overdue"] as StateFilter[]).map((s) => ({ value: s, label: t(s === "all" ? "f_all" : `es_${s}` as AdminFinanceKey), tone: s === "overdue" ? "warning" : undefined, count: s === "overdue" ? overdue.length : undefined }))} />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <select className={cn(selectCls, "sm:w-52")} value={cat} onChange={(e) => setCat(e.target.value)} aria-label={t("col_category")}>
            <option value="">{t("all_categories")}</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{categoryLabel(c, t)}</option>)}
          </select>
          <div className="relative sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search_entries")} aria-label={t("search_entries")} className="pl-9" />
          </div>
        </div>
      </div>

      {isLoading ? <Skeleton className="h-64 w-full rounded-[18px]" /> : (
        <div>
          <ul className="divide-y overflow-hidden rounded-[18px] border bg-card">
            {!paged.items.length && (
              <li className="px-4 py-12 text-center text-sm text-muted-foreground">
                {entries.length ? t("entries_empty_filter") : (
                  <span className="space-y-3">
                    <span className="block">{t("entries_empty")}</span>
                    <Button type="button" size="sm" onClick={() => page.open("novo")}><Plus className="h-4 w-4" aria-hidden="true" />{t("new_entry")}</Button>
                  </span>
                )}
              </li>
            )}
            {paged.items.map((e) => {
              const c = e.categoryId ? catById.get(e.categoryId) : undefined;
              const late = isOverdue(e);
              return (
                <li key={e.id} className="flex flex-col gap-2 p-3 transition-colors hover:bg-muted/30 sm:flex-row sm:items-center sm:gap-4 sm:px-4">
                  <button type="button" onClick={() => page.open("lancamento", e.id)} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full", e.kind === "income" ? "bg-emerald-50 text-emerald-700" : "bg-muted text-foreground")}>
                      {e.kind === "income" ? <ArrowDownToLine className="h-4 w-4" aria-hidden="true" /> : <ArrowUpFromLine className="h-4 w-4" aria-hidden="true" />}
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 font-medium text-foreground">
                        <span className="truncate">{e.description}</span>
                        {e.row.repeat_group && <Repeat className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label={t("repeats")} />}
                      </span>
                      <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1"><CategoryDot color={c?.color} />{categoryLabel(c, t)}</span>
                        {e.row.counterparty && <span>· {e.row.counterparty}</span>}
                        <span>· {e.status === "pending" ? t("due_on", { date: fmt.date(entryDate(e.dueOn ?? e.occurredOn)) }) : fmt.date(entryDate(e.occurredOn))}</span>
                      </span>
                    </span>
                  </button>
                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-xs font-medium",
                      e.status === "paid" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : late ? "border-red-200 bg-red-50 text-red-700" : "border-amber-200 bg-amber-50 text-amber-800")}>
                      {late ? t("es_overdue") : t(`es_${e.status}` as AdminFinanceKey)}
                    </span>
                    <span className="text-right">
                      <span className={cn("block font-semibold tabular-nums", e.kind === "income" ? "text-emerald-700" : "text-foreground")}>
                        {e.kind === "income" ? "+ " : "- "}{formatMoney(e.row.amount_cents / 10 ** currencyDigits(e.row.currency), e.row.currency, fmt.locale)}
                      </span>
                      {e.row.currency !== fmt.currency && <span className="block text-xs text-muted-foreground">{e.amount == null ? t("no_rate") : fmt.money(e.amount)}</span>}
                    </span>
                    {e.status === "pending" && (
                      <Button type="button" variant="outline" size="sm" className="min-h-9" disabled={setStatus.isPending}
                        onClick={() => setStatus.mutate({ id: e.id, status: "paid", on: todayIso() }, {
                          onSuccess: () => toast({ title: t(e.kind === "income" ? "marked_received" : "marked_paid") }),
                          onError: () => toast({ title: t("save_error"), variant: "destructive" }),
                        })}>
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />{t(e.kind === "income" ? "mark_received" : "mark_paid")}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <AdminPager page={paged.page} pages={paged.pages} total={paged.total} from={paged.from} to={paged.to} onPage={paged.setPage} />
        </div>
      )}
    </div>
  );
}

/* ---------- Página do lançamento ---------- */

type Form = {
  kind: EntryKind; description: string; amount: string; currency: string; occurred_on: string; due_on: string; status: EntryStatus;
  category_id: string; counterparty: string; payment_method: string; reference: string; notes: string; repeat: boolean; months: string;
};

const toForm = (r: EntryRow | undefined, base: string): Form => ({
  kind: r?.kind ?? "expense",
  description: r?.description ?? "",
  amount: r ? String(r.amount_cents / 10 ** currencyDigits(r.currency)) : "",
  currency: r?.currency ?? base,
  occurred_on: r ? String(r.occurred_on).slice(0, 10) : todayIso(),
  due_on: r?.due_on ? String(r.due_on).slice(0, 10) : "",
  status: r?.status ?? "paid",
  category_id: r?.category_id ?? "",
  counterparty: r?.counterparty ?? "",
  payment_method: r?.payment_method ?? "",
  reference: r?.reference ?? "",
  notes: r?.notes ?? "",
  repeat: false,
  months: "12",
});

function Field({ label, help, children, className, htmlFor }: { label: string; help?: string; children: React.ReactNode; className?: string; htmlFor?: string }) {
  const Tag = htmlFor ? "label" : "span";
  return (
    <div className={cn("min-w-0 space-y-1.5", className)}>
      <span className="flex items-center gap-1 text-sm font-medium text-foreground"><Tag htmlFor={htmlFor}>{label}</Tag>{help && <HelpTip text={help} label={label} className="h-6 w-6" />}</span>
      {children}
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
    </div>
  );
}

function EntryPage({ id, copyOf, onBack, onSaved, onDuplicate }: {
  id: string | null; copyOf: string | null; onBack: () => void; onSaved: (id: string) => void; onDuplicate: (id: string) => void;
}) {
  const { t } = useMessages(adminFinanceMessages);
  const fmt = useAdminFormat();
  const { toast } = useToast();
  const base = useCurrency((s) => s.baseCurrency);
  const { data: cs } = useCurrencySettings();
  const { rows, isLoading } = useFinanceEntries();
  const { data: categories = [] } = useFinanceCategories();
  const save = useSaveFinanceEntry();
  const del = useDeleteFinanceEntry();
  const existing = rows.find((r) => r.id === (id ?? copyOf ?? ""));
  const [form, setForm] = useState<Form>(() => toForm(undefined, base));
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const key = id ?? copyOf ?? "new";
    if (loadedFor === key || ((id || copyOf) && !existing)) return;
    const f = toForm(existing, base);
    if (copyOf) { f.occurred_on = todayIso(); f.due_on = ""; }
    setForm(f);
    setLoadedFor(key);
  }, [id, copyOf, existing, base, loadedFor]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const currencies = useMemo(() => [...new Set([base, ...(cs?.settings.available ?? []), ...Object.keys(cs?.settings.rates ?? {}), form.currency])].filter(Boolean), [base, cs, form.currency]);
  const cats = categories.filter((c) => c.kind === form.kind && (c.is_active || c.id === form.category_id));
  const digits = currencyDigits(form.currency);
  const amountNum = Number(form.amount.replace(",", "."));
  const cents = Number.isFinite(amountNum) ? Math.round(amountNum * 10 ** digits) : NaN;
  const converted = Number.isFinite(cents) && cents > 0 && form.currency !== base ? toBaseAmount(cents, form.currency, base, cs?.settings.rates ?? {}, digits) : null;
  const dates = !id && form.repeat ? monthlyDates(form.occurred_on, Math.max(2, Math.min(60, Number(form.months) || 2))) : null;

  const submit = async () => {
    setError(null);
    if (!form.description.trim()) return setError(t("err_description"));
    if (!Number.isFinite(cents) || cents <= 0) return setError(t("err_amount"));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.occurred_on)) return setError(t("err_date"));
    try {
      const newId = await save.mutateAsync({
        id: id ?? undefined, kind: form.kind, category_id: form.category_id || null, description: form.description, amount_cents: cents,
        currency: form.currency, occurred_on: form.occurred_on, due_on: form.status === "pending" ? form.due_on || form.occurred_on : form.due_on || null,
        status: form.status, payment_method: form.payment_method || null, counterparty: form.counterparty || null, reference: form.reference || null,
        notes: form.notes || null, dates: dates ?? undefined,
      });
      toast({ title: t(dates ? "saved_repeat" : "saved", { n: dates?.length ?? 1 }) });
      if (!id) onSaved(newId);
    } catch {
      setError(t("save_error"));
    }
  };

  if ((id || copyOf) && isLoading) return <Skeleton className="h-96 w-full rounded-[18px]" />;
  if (id && !existing) {
    return (
      <AdminSubpage title={t("entry_missing")} backLabel={t("back_entries")} onBack={onBack}>
        <p className="text-sm text-muted-foreground">{t("entry_missing_hint")}</p>
      </AdminSubpage>
    );
  }

  return (
    <AdminSubpage
      title={id ? existing!.description : t("new_entry")}
      subtitle={id ? t("entry_created", { date: fmt.dateTime(existing!.created_at) }) : t("new_entry_hint")}
      backLabel={t("back_entries")}
      onBack={onBack}
      actions={id ? (
        <>
          <Button type="button" variant="outline" size="sm" onClick={() => onDuplicate(id)}>
            <Copy className="h-4 w-4" aria-hidden="true" />{t("duplicate")}
          </Button>
          <InlineConfirm label={t("delete")} icon={Trash2} title={t("delete_confirm")} description={existing!.repeat_group ? t("delete_group_hint") : undefined}
            confirmLabel={t("delete")} busy={del.isPending}
            onConfirm={async () => {
              try { await del.mutateAsync({ id: id!, group: existing!.repeat_group }); toast({ title: t("deleted") }); onBack(); } catch { toast({ title: t("save_error"), variant: "destructive" }); }
            }} />
        </>
      ) : undefined}
    >
      <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <AdminPanel title={t("entry_what")}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={t("col_type")} help={t("kind_help")}>
              <FilterChips<EntryKind> label={t("col_type")} value={form.kind} onChange={(k) => setForm((f) => ({ ...f, kind: k, category_id: "" }))}
                options={(["expense", "income"] as EntryKind[]).map((k) => ({ value: k, label: t(`kind_${k}` as AdminFinanceKey) }))} />
            </Field>
            <Field label={t("col_category")} help={t("category_help")} htmlFor="fe-category">
              <select className={selectCls} id="fe-category" value={form.category_id} onChange={(e) => set("category_id", e.target.value)}>
                <option value="">{t("no_category")}</option>
                {cats.map((c) => <option key={c.id} value={c.id}>{categoryLabel(c, t)}</option>)}
              </select>
            </Field>
            <Field label={t("col_description")} help={t("description_help")} className="md:col-span-2" htmlFor="fe-description">
              <Input id="fe-description" value={form.description} maxLength={200} onChange={(e) => set("description", e.target.value)} placeholder={t(form.kind === "income" ? "description_ph_income" : "description_ph")} />
            </Field>
            <Field label={t("col_amount")} help={t("amount_help")} htmlFor="fe-amount">
              <div className="flex gap-2">
                <Input inputMode="decimal" id="fe-amount" value={form.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0,00" className="min-w-0 flex-1" />
                <select className={cn(selectCls, "w-28")} value={form.currency} onChange={(e) => set("currency", e.target.value)} aria-label={t("col_currency")}>
                  {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              {form.currency !== base && Number.isFinite(cents) && cents > 0 && (
                <p className={cn("text-xs", converted == null ? "text-amber-700" : "text-muted-foreground")}>
                  {converted == null ? t("no_rate_long", { code: form.currency }) : t("converted", { value: fmt.money(converted) })}
                </p>
              )}
            </Field>
            <Field label={t("col_counterparty")} help={t("counterparty_help")} htmlFor="fe-counterparty">
              <Input id="fe-counterparty" value={form.counterparty} maxLength={120} onChange={(e) => set("counterparty", e.target.value)} />
            </Field>
          </div>
        </AdminPanel>

        <AdminPanel title={t("entry_when")}>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label={t("col_status")} help={t("status_help")}>
              <FilterChips<EntryStatus> label={t("col_status")} value={form.status} onChange={(s) => set("status", s)}
                options={(["paid", "pending"] as EntryStatus[]).map((s) => ({ value: s, label: t(form.kind === "income" ? `es_${s}_income` as AdminFinanceKey : `es_${s}` as AdminFinanceKey) }))} />
            </Field>
            <Field label={t(form.status === "paid" ? (form.kind === "income" ? "date_received" : "date_paid") : "date_entry")} help={t("date_help")} htmlFor="fe-date">
              <Input type="date" id="fe-date" value={form.occurred_on} onChange={(e) => set("occurred_on", e.target.value)} />
            </Field>
            <Field label={t("col_due")} help={t("due_help")} htmlFor="fe-due">
              <Input type="date" id="fe-due" value={form.due_on} onChange={(e) => set("due_on", e.target.value)} />
            </Field>
          </div>
          {!id && (
            <div className="mt-4 rounded-[14px] border bg-muted/30 p-3">
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" className="mt-1 h-4 w-4 accent-[hsl(var(--primary))]" checked={form.repeat} onChange={(e) => set("repeat", e.target.checked)} />
                <span>
                  <span className="flex items-center gap-1 font-medium"><Repeat className="h-4 w-4" aria-hidden="true" />{t("repeat_label")}</span>
                  <span className="block text-xs text-muted-foreground">{t("repeat_help")}</span>
                </span>
              </label>
              {form.repeat && (
                <div className="mt-3 flex flex-wrap items-center gap-2 pl-7 text-sm">
                  <span>{t("repeat_for")}</span>
                  <Input type="number" min={2} max={60} value={form.months} onChange={(e) => set("months", e.target.value)} className="w-20" aria-label={t("repeat_months")} />
                  <span>{t("repeat_months")}</span>
                  {dates && <span className="text-xs text-muted-foreground">{t("repeat_until", { date: fmt.date(entryDate(dates[dates.length - 1])) })}</span>}
                </div>
              )}
            </div>
          )}
        </AdminPanel>

        <AdminPanel title={t("entry_more")}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={t("col_payment_method")} help={t("payment_method_help")} htmlFor="fe-method">
              <Input id="fe-method" value={form.payment_method} maxLength={60} onChange={(e) => set("payment_method", e.target.value)} />
            </Field>
            <Field label={t("col_reference")} help={t("reference_help")} htmlFor="fe-reference">
              <Input id="fe-reference" value={form.reference} maxLength={120} onChange={(e) => set("reference", e.target.value)} />
            </Field>
            <Field label={t("col_notes")} className="md:col-span-2" htmlFor="fe-notes">
              <Textarea id="fe-notes" value={form.notes} maxLength={2000} rows={3} onChange={(e) => set("notes", e.target.value)} />
            </Field>
          </div>
        </AdminPanel>

        {error && <p role="alert" className="rounded-[12px] border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={save.isPending} className="min-h-11">
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
            {dates ? t("save_repeat", { n: dates.length }) : t("save")}
          </Button>
          <Button type="button" variant="outline" className="min-h-11" onClick={onBack}>{t("cancel")}</Button>
        </div>
      </form>
    </AdminSubpage>
  );
}
