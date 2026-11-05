// =====================================================================================
// Admin > Pedidos > Impressão de pedidos (recurso order_printing; regras em src/lib/orderPrint.ts, dados em
// src/hooks/useOrderPrint.ts, textos em src/i18n/orderPrint.ts). Separadores (?aba=):
//   fila         pedidos para imprimir (RPC admin_print_queue), seleção, impressão em lote, regras da fila
//   folha        modelo da folha do pedido (papel, cópias, o que aparece, rodapé) com prévia
//   etiqueta     modelo da etiqueta de envio (tamanho, o que aparece) com prévia
//   declaracao   declaração de conteúdo (o que aparece, texto) com prévia
//   remetente    remetente da etiqueta e da declaração (vazio = dados da loja)
// Imprimir abre a página ?ver=imprimir&id=<ids separados por vírgula>&doc=<sheet|label|declaration> (PrintPage),
// também usada pela página do pedido e pela lista de pedidos. Sem janelas.
// =====================================================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckCheck, FileText, Loader2, Printer, Save, Settings2, Sticker, Tag, Undo2, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AdminHelp from "./AdminHelp";
import HelpTip from "./HelpTip";
import { useAdminPage } from "./AdminSubpage";
import { AdminStatCard } from "./AdminListKit";
import { InlinePanel } from "./shell/AdminPageParts";
import { adminHref } from "./shell/adminSections";
import PrintFrame from "./orderPrint/PrintFrame";
import PrintPage from "./orderPrint/PrintPage";
import { sampleOrder } from "./orderPrint/sampleOrder";
import { printHref } from "./orderPrint/printHref";
import { useMessages } from "@/i18n";
import { orderPrintMessages, type OrderPrintKey } from "@/i18n/orderPrint";
import { useAdminFormat } from "@/hooks/useAdminList";
import {
  useMarkPrinted, useOrderPrintSettings, usePrintContext, usePrintOrders, usePrintQueue, useSaveOrderPrintSettings,
} from "@/hooks/useOrderPrint";
import { orderStatusLabel } from "@/lib/orderStatusStyles";
import {
  DECLARATION_FIELDS, DEFAULT_ORDER_PRINT, LABEL_FIELDS, LABEL_SIZES, PRINT_DOCS, QUEUE_STATUSES, SENDER_KEYS, SHEET_FIELDS, SHEET_PAPERS,
  renderPrintDocument, type OrderPrintSettings, type PrintDoc,
} from "@/lib/orderPrint";
import { cn } from "@/lib/utils";

type T = (k: OrderPrintKey, v?: Record<string, string | number>) => string;
const TABS = ["fila", "folha", "etiqueta", "declaracao", "remetente"] as const;
type Tab = (typeof TABS)[number];

export default function AdminOrderPrinting() {
  const { t: tr } = useMessages(orderPrintMessages);
  const t = tr as T;
  const page = useAdminPage();
  const tab: Tab = (TABS as readonly string[]).includes(page.tab ?? "") ? (page.tab as Tab) : "fila";
  if (page.view === "imprimir") return <PrintPage />;
  return (
    <div className="space-y-5">
      <AdminHelp id="order-printing" title={t("help_title")} steps={[t("help_1"), t("help_2"), t("help_3")]} />
      <Tabs value={tab} onValueChange={page.setTab}>
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <TabsList className="h-11">
            <TabsTrigger value="fila" className="px-4"><Printer className="mr-1.5 h-4 w-4" aria-hidden="true" />{t("tab_queue")}</TabsTrigger>
            <TabsTrigger value="folha" className="px-4"><FileText className="mr-1.5 h-4 w-4" aria-hidden="true" />{t("tab_sheet")}</TabsTrigger>
            <TabsTrigger value="etiqueta" className="px-4"><Sticker className="mr-1.5 h-4 w-4" aria-hidden="true" />{t("tab_label")}</TabsTrigger>
            <TabsTrigger value="declaracao" className="px-4">{t("tab_declaration")}</TabsTrigger>
            <TabsTrigger value="remetente" className="px-4">{t("tab_sender")}</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="fila" className="mt-5"><QueueView t={t} /></TabsContent>
        <TabsContent value="folha" className="mt-5"><ModelEditor doc="sheet" t={t} /></TabsContent>
        <TabsContent value="etiqueta" className="mt-5"><ModelEditor doc="label" t={t} /></TabsContent>
        <TabsContent value="declaracao" className="mt-5"><ModelEditor doc="declaration" t={t} /></TabsContent>
        <TabsContent value="remetente" className="mt-5"><SenderForm t={t} /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------- Formulário com gravar e desfazer, partilhado pelos separadores ---------- */

function useSettingsForm() {
  const { data: saved, isLoading } = useOrderPrintSettings();
  const save = useSaveOrderPrintSettings();
  const [form, setForm] = useState<OrderPrintSettings>(DEFAULT_ORDER_PRINT);
  useEffect(() => { if (saved) setForm(saved); }, [saved]);
  const dirty = !!saved && JSON.stringify(saved) !== JSON.stringify(form);
  return { saved, isLoading, save, form, setForm, dirty };
}

function SaveBar({ f, t }: { f: ReturnType<typeof useSettingsForm>; t: T }) {
  const submit = () => f.save.mutate(f.form, { onSuccess: () => toast.success(t("saved")), onError: () => toast.error(t("save_error")) });
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {f.dirty && <Button variant="ghost" onClick={() => f.saved && f.setForm(f.saved)}><Undo2 className="mr-1.5 h-4 w-4" aria-hidden="true" />{t("undo")}</Button>}
      <Button onClick={submit} disabled={!f.dirty || f.save.isPending}>
        {f.save.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="mr-1.5 h-4 w-4" aria-hidden="true" />}{t("save")}
      </Button>
    </div>
  );
}

function ToggleRow({ id, label, hint, checked, onChange, t }: { id: string; label: string; hint: string; checked: boolean; onChange: (v: boolean) => void; t: T }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-[12px] border p-3">
      <div className="min-w-0">
        <Label htmlFor={id} className="flex items-center text-sm font-semibold">{label}<HelpTip label={t("help")} text={hint} /></Label>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} className="mt-0.5 shrink-0" />
    </div>
  );
}

function ChoiceCards<V extends string>({ name, value, options, onChange }: {
  name: string; value: V; options: { value: V; label: string; hint: string }[]; onChange: (v: V) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
      {options.map((o) => (
        <label key={o.value} className={cn("flex cursor-pointer items-start gap-3 rounded-[12px] border p-3 transition-colors duration-150",
          value === o.value ? "border-primary bg-accent" : "hover:border-foreground/30")}>
          <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]" />
          <span className="min-w-0">
            <span className="block text-sm font-semibold">{o.label}</span>
            <span className="block text-xs text-muted-foreground">{o.hint}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

/* ---------- Fila ---------- */

function QueueView({ t }: { t: T }) {
  const fmt = useAdminFormat();
  const navigate = useNavigate();
  const { data: settings } = useOrderPrintSettings();
  const { data: rows = [], isLoading, error } = usePrintQueue();
  const ids = useMemo(() => rows.map((r) => r.order_id), [rows]);
  const { orders, isLoading: loadingOrders } = usePrintOrders(ids);
  const mark = useMarkPrinted();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rulesOpen, setRulesOpen] = useState(false);

  // Seleção só com pedidos que ainda estão na fila.
  useEffect(() => {
    setSelected((cur) => new Set([...cur].filter((id) => ids.includes(id))));
  }, [ids]);

  // Impressão automática: pedido novo que entra na fila (depois da primeira leitura) abre a impressão da folha.
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (isLoading) return;
    if (seen.current === null) { seen.current = new Set(ids); return; }
    const fresh = rows.filter((r) => !seen.current!.has(r.order_id));
    for (const r of rows) seen.current.add(r.order_id);
    if (!settings?.queue.auto_print || !fresh.length) return;
    const doc: PrintDoc = fresh.some((r) => r.missing.includes("sheet")) ? "sheet" : fresh[0].missing[0] ?? "sheet";
    toast(t("q_auto_new", { code: fresh.map((r) => r.order_id.replace(/-/g, "").slice(0, 8).toUpperCase()).join(", ") }));
    navigate(`${printHref(fresh.map((r) => r.order_id), doc)}&auto=1`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, isLoading]);

  const byId = useMemo(() => new Map(orders.map((o) => [o.id, o])), [orders]);
  const missingCount = (d: PrintDoc) => rows.filter((r) => r.missing.includes(d)).length;
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.order_id));
  const toggle = (id: string) => setSelected((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const chosen = rows.filter((r) => selected.has(r.order_id)).map((r) => r.order_id);
  const docs = settings?.queue.docs ?? DEFAULT_ORDER_PRINT.queue.docs;

  const markAll = () => {
    const all = rows.filter((r) => selected.has(r.order_id));
    Promise.all(PRINT_DOCS.map((d) => {
      const list = all.filter((r) => r.missing.includes(d)).map((r) => r.order_id);
      return list.length ? mark.mutateAsync({ ids: list, kind: d }) : null;
    }))
      .then(() => { toast.success(t("q_marked", { n: all.length })); setSelected(new Set()); })
      .catch(() => toast.error(t("save_error")));
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <AdminStatCard icon={Printer} label={t("q_waiting")} value={rows.length} hint={t("q_waiting_d")} tone={rows.length ? "warning" : "default"} />
        <AdminStatCard icon={FileText} label={t("q_no_sheet")} value={missingCount("sheet")} />
        <AdminStatCard icon={Tag} label={t("q_no_label")} value={missingCount("label")} />
      </div>

      {settings?.queue.auto_print && (
        <p className="flex items-start gap-2 rounded-[14px] border border-primary/30 bg-accent px-3 py-2 text-sm">
          <Zap className="mt-0.5 h-4 w-4 shrink-0 text-brand-orange-text" aria-hidden="true" />{t("q_auto_on")}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="outline" size="sm" onClick={() => setRulesOpen((v) => !v)} aria-expanded={rulesOpen}>
          <Settings2 className="mr-1.5 h-4 w-4" aria-hidden="true" />{t("rules_open")}
        </Button>
      </div>
      <InlinePanel open={rulesOpen} onClose={() => setRulesOpen(false)} title={t("rules_title")} description={t("rules_hint")}>
        <QueueRules t={t} />
      </InlinePanel>

      {chosen.length > 0 && (
        <div className="sticky top-16 z-10 flex flex-wrap items-center gap-2 rounded-[16px] border border-primary/40 bg-card p-3 shadow-sm">
          <span className="mr-auto text-sm font-semibold">{t("q_selected", { n: chosen.length })}</span>
          {PRINT_DOCS.filter((d) => docs.includes(d) || d !== "declaration").map((d) => (
            <Button key={d} size="sm" variant={d === "sheet" ? "default" : "outline"} asChild title={t("q_print_hint")}>
              <Link to={printHref(chosen, d)}><Printer className="mr-1.5 h-4 w-4" aria-hidden="true" />{t("q_print", { doc: t(`doc_short_${d}` as OrderPrintKey) })}</Link>
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={markAll} disabled={mark.isPending} title={t("q_mark_hint")}>
            {mark.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCheck className="mr-1.5 h-4 w-4" aria-hidden="true" />}{t("q_mark")}
          </Button>
        </div>
      )}

      {isLoading ? (
        <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{t("loading")}</p>
      ) : error ? (
        <p className="py-6 text-sm text-destructive">{t("save_error")}</p>
      ) : rows.length === 0 ? (
        <div className="rounded-[18px] border border-dashed bg-card p-8 text-center">
          <Printer className="mx-auto h-8 w-8 text-muted-foreground" strokeWidth={1.7} aria-hidden="true" />
          <p className="mt-2 font-semibold">{t("q_empty")}</p>
          <p className="text-sm text-muted-foreground">{t("q_empty_hint")}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[18px] border bg-card">
          <div className="flex items-center gap-3 border-b bg-muted/40 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            <input type="checkbox" aria-label={t("q_select_all")} checked={allSelected}
              onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.order_id)))} className="h-4 w-4 accent-[hsl(var(--primary))]" />
            <span className="w-28">{t("col_order")}</span>
            <span className="hidden flex-1 md:block">{t("col_customer")}</span>
            <span className="hidden w-48 lg:block">{t("col_destination")}</span>
            <span className="hidden w-24 text-right sm:block">{t("col_total")}</span>
            <span className="ml-auto w-52 text-right md:ml-0">{t("q_missing")}</span>
          </div>
          <ul className="divide-y">
            {rows.map((r) => {
              const o = byId.get(r.order_id);
              const code = r.order_id.replace(/-/g, "").slice(0, 8).toUpperCase();
              const dest = o?.pickup ? t("q_pickup") : o?.shipping ? [o.shipping.city, o.shipping.region].filter(Boolean).join(" / ") : "";
              return (
                <li key={r.order_id} className={cn("flex flex-wrap items-center gap-3 px-4 py-3 transition-colors duration-150", selected.has(r.order_id) && "bg-accent/60")}>
                  <input type="checkbox" aria-label={t("q_select", { code })} checked={selected.has(r.order_id)} onChange={() => toggle(r.order_id)}
                    className="h-4 w-4 accent-[hsl(var(--primary))]" />
                  <span className="w-28 min-w-0">
                    <Link to={adminHref.order(r.order_id)} className="font-mono text-sm font-semibold hover:underline" title={t("q_open")}>#{code}</Link>
                    <span className="block text-xs text-muted-foreground">{fmt.relative(r.created_at)}</span>
                  </span>
                  <span className="min-w-0 flex-1 basis-40">
                    <span className="block truncate text-sm font-medium">{o?.customer.name || (loadingOrders ? "" : "-")}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {orderStatusLabel(r.status, fmt.locale)}{o ? ` · ${t("q_items", { n: o.items.reduce((a, i) => a + i.quantity, 0) })}` : ""}{o?.service ? ` · ${o.service}` : ""}
                    </span>
                  </span>
                  <span className="hidden w-48 truncate text-sm text-muted-foreground lg:block">{dest}</span>
                  <span className="hidden w-24 text-right text-sm font-semibold tabular-nums sm:block">{o ? fmt.money(o.totals.total) : ""}</span>
                  <span className="flex w-full flex-wrap justify-end gap-1.5 md:w-52">
                    {PRINT_DOCS.filter((d) => r.missing.includes(d)).map((d) => (
                      <Link key={d} to={printHref([r.order_id], d)}
                        className="inline-flex min-h-8 items-center gap-1 rounded-full border border-amber-400/60 bg-amber-50 px-2.5 text-xs font-semibold text-amber-800 transition-colors duration-150 hover:bg-amber-100">
                        <Printer className="h-3.5 w-3.5" aria-hidden="true" />{t(`doc_short_${d}` as OrderPrintKey)}
                      </Link>
                    ))}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function QueueRules({ t }: { t: T }) {
  const f = useSettingsForm();
  const fmt = useAdminFormat();
  const q = f.form.queue;
  const setQ = (patch: Partial<OrderPrintSettings["queue"]>) => f.setForm((s) => ({ ...s, queue: { ...s.queue, ...patch } }));
  const flip = <V extends string>(list: V[], v: V) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  if (f.isLoading) return <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />;
  return (
    <div className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="flex items-center text-sm font-semibold">{t("rules_statuses")}<HelpTip label={t("help")} text={t("rules_statuses_d")} /></legend>
        <p className="text-xs text-muted-foreground">{t("rules_statuses_d")}</p>
        <div className="flex flex-wrap gap-2">
          {QUEUE_STATUSES.map((st) => (
            <label key={st} className={cn("inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm transition-colors duration-150",
              q.statuses.includes(st) ? "border-primary bg-accent font-semibold" : "hover:border-foreground/30")}>
              <input type="checkbox" checked={q.statuses.includes(st)} onChange={() => setQ({ statuses: flip(q.statuses, st) })} className="h-4 w-4 accent-[hsl(var(--primary))]" />
              {orderStatusLabel(st, fmt.locale)}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="flex items-center text-sm font-semibold">{t("rules_docs")}<HelpTip label={t("help")} text={t("rules_docs_d")} /></legend>
        <p className="text-xs text-muted-foreground">{t("rules_docs_d")}</p>
        <div className="flex flex-wrap gap-2">
          {PRINT_DOCS.map((d) => (
            <label key={d} className={cn("inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm transition-colors duration-150",
              q.docs.includes(d) ? "border-primary bg-accent font-semibold" : "hover:border-foreground/30")}>
              <input type="checkbox" checked={q.docs.includes(d)} onChange={() => setQ({ docs: flip(q.docs, d) })} className="h-4 w-4 accent-[hsl(var(--primary))]" />
              {t(`doc_name_${d}` as OrderPrintKey)}
            </label>
          ))}
        </div>
      </fieldset>
      {(!q.statuses.length || !q.docs.length) && <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">{t("rules_none")}</p>}
      <div className="grid gap-2 lg:grid-cols-3">
        <ToggleRow id="q-mark" label={t("rules_mark")} hint={t("rules_mark_d")} checked={q.mark_on_print} onChange={(v) => setQ({ mark_on_print: v })} t={t} />
        <ToggleRow id="q-advance" label={t("rules_advance")} hint={t("rules_advance_d")} checked={q.advance_to_preparing} onChange={(v) => setQ({ advance_to_preparing: v })} t={t} />
        <ToggleRow id="q-auto" label={t("rules_auto")} hint={t("rules_auto_d")} checked={q.auto_print} onChange={(v) => setQ({ auto_print: v })} t={t} />
      </div>
      <SaveBar f={f} t={t} />
    </div>
  );
}

/* ---------- Modelos (folha, etiqueta, declaração) ---------- */

function ModelEditor({ doc, t }: { doc: PrintDoc; t: T }) {
  const f = useSettingsForm();
  const ctx = usePrintContext(f.form);
  const sample = useMemo(() => sampleOrder(t), [t]);
  const html = useMemo(() => renderPrintDocument(doc, doc === "label" && f.form.label.size === "a4_4" ? [sample, sample] : [sample], f.form, {
    ...ctx, paymentLabel: () => t("sample_payment"),
  }), [doc, sample, f.form, ctx, t]);
  if (f.isLoading) return <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{t("loading")}</p>;

  const setFields = (key: "sheet" | "label" | "declaration", k: string, v: boolean) =>
    f.setForm((s) => ({ ...s, [key]: { ...s[key], fields: { ...s[key].fields, [k]: v } } }));
  const fieldList = doc === "sheet" ? SHEET_FIELDS : doc === "label" ? LABEL_FIELDS : DECLARATION_FIELDS;
  const prefix = doc === "sheet" ? "sf" : doc === "label" ? "lf" : "df";
  const fields = f.form[doc].fields as Record<string, boolean>;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px] 2xl:grid-cols-[minmax(0,1fr)_460px]">
      <div className="space-y-5">
        {doc === "sheet" && (
          <fieldset className="space-y-3 rounded-[18px] border bg-card p-5">
            <legend className="sr-only">{t("model_paper")}</legend>
            <p className="text-base font-semibold" aria-hidden="true">{t("model_paper")}</p>
            <ChoiceCards name="sheet-paper" value={f.form.sheet.paper}
              options={SHEET_PAPERS.map((p) => ({ value: p, label: t(`paper_${p}` as OrderPrintKey), hint: t(`paper_${p}_d` as OrderPrintKey) }))}
              onChange={(paper) => f.setForm((s) => ({ ...s, sheet: { ...s.sheet, paper } }))} />
            <div className="grid gap-3 sm:grid-cols-[160px_minmax(0,1fr)] sm:items-start">
              <div>
                <Label htmlFor="sheet-copies" className="flex items-center text-sm font-semibold">{t("model_copies")}<HelpTip label={t("help")} text={t("model_copies_d")} /></Label>
                <Input id="sheet-copies" type="number" min={1} max={5} value={f.form.sheet.copies} className="mt-1"
                  onChange={(e) => f.setForm((s) => ({ ...s, sheet: { ...s.sheet, copies: Math.min(5, Math.max(1, Number(e.target.value) || 1)) } }))} />
              </div>
              <p className="text-xs text-muted-foreground sm:pt-7">{t("model_copies_d")}</p>
            </div>
          </fieldset>
        )}
        {doc === "label" && (
          <fieldset className="space-y-3 rounded-[18px] border bg-card p-5">
            <legend className="sr-only">{t("model_size")}</legend>
            <p className="text-base font-semibold" aria-hidden="true">{t("model_size")}</p>
            <ChoiceCards name="label-size" value={f.form.label.size}
              options={LABEL_SIZES.map((p) => ({ value: p, label: t(`size_${p}` as OrderPrintKey), hint: t(`size_${p}_d` as OrderPrintKey) }))}
              onChange={(size) => f.setForm((s) => ({ ...s, label: { ...s.label, size } }))} />
          </fieldset>
        )}
        {doc === "declaration" && <p className="rounded-[14px] bg-amber-50 px-4 py-3 text-sm text-amber-800">{t("decl_note")}</p>}

        <fieldset className="space-y-3 rounded-[18px] border bg-card p-5">
          <legend className="sr-only">{t("model_fields")}</legend>
          <p className="text-base font-semibold" aria-hidden="true">{t("model_fields")}</p>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            {fieldList.map((k) => (
              <ToggleRow key={k} id={`${doc}-${k}`} label={t(`${prefix}_${k}` as OrderPrintKey)} hint={t(`${prefix}_${k}_d` as OrderPrintKey)}
                checked={fields[k]} onChange={(v) => setFields(doc, k, v)} t={t} />
            ))}
          </div>
        </fieldset>

        {doc === "sheet" && f.form.sheet.fields.footer && (
          <div className="space-y-1.5 rounded-[18px] border bg-card p-5">
            <Label htmlFor="sheet-footer" className="flex items-center text-base font-semibold">{t("model_footer")}<HelpTip label={t("help")} text={t("model_footer_d")} /></Label>
            <p className="text-xs text-muted-foreground">{t("model_footer_d")}</p>
            <Textarea id="sheet-footer" rows={3} maxLength={400} value={f.form.sheet.footer_text} placeholder={t("model_footer_ph")}
              onChange={(e) => f.setForm((s) => ({ ...s, sheet: { ...s.sheet, footer_text: e.target.value } }))} />
          </div>
        )}
        {doc === "declaration" && (
          <div className="space-y-1.5 rounded-[18px] border bg-card p-5">
            <Label htmlFor="decl-text" className="flex items-center text-base font-semibold">{t("decl_text")}<HelpTip label={t("help")} text={t("decl_text_d")} /></Label>
            <p className="text-xs text-muted-foreground">{t("decl_text_d")}</p>
            <Textarea id="decl-text" rows={4} maxLength={1200} value={f.form.declaration.text} placeholder={t("doc_decl_default_text")}
              onChange={(e) => f.setForm((s) => ({ ...s, declaration: { ...s.declaration, text: e.target.value } }))} />
          </div>
        )}
        <SaveBar f={f} t={t} />
      </div>
      <aside className="space-y-2 xl:sticky xl:top-24 xl:self-start" aria-label={t("preview")}>
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">{t("preview")}</p>
        <PrintFrame html={html} title={t("preview")} maxHeight={760} />
        <p className="text-xs text-muted-foreground">{t("preview_hint")}</p>
      </aside>
    </div>
  );
}

/* ---------- Remetente ---------- */

function SenderForm({ t }: { t: T }) {
  const f = useSettingsForm();
  const ctx = usePrintContext(undefined);
  if (f.isLoading) return <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{t("loading")}</p>;
  const store = ctx.store;
  const storeLines = [store.name, store.nif, store.address, store.phone, store.email].filter(Boolean);
  const wide = new Set(["name", "street", "email"]);
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4 rounded-[18px] border bg-card p-5">
        <div>
          <p className="text-base font-semibold">{t("sender_title")}</p>
          <p className="text-xs text-muted-foreground">{t("sender_hint")}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {SENDER_KEYS.map((k) => (
            <div key={k} className={cn(wide.has(k) && "sm:col-span-2")}>
              <Label htmlFor={`sender-${k}`} className="text-sm font-medium">{t(`se_${k}` as OrderPrintKey)}</Label>
              <Input id={`sender-${k}`} className="mt-1" value={f.form.sender[k]} maxLength={k === "street" ? 160 : 120}
                autoComplete="off" onChange={(e) => f.setForm((s) => ({ ...s, sender: { ...s.sender, [k]: e.target.value } }))} />
            </div>
          ))}
        </div>
        <SaveBar f={f} t={t} />
      </div>
      <aside className="space-y-2 rounded-[18px] border bg-background p-4 xl:self-start">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">{t("sender_store")}</p>
        {storeLines.length
          ? <address className="space-y-0.5 text-sm not-italic">{storeLines.map((l, i) => <p key={i} className={i === 0 ? "font-semibold" : ""}>{l}</p>)}</address>
          : <p className="text-sm text-muted-foreground">{t("sender_store_none")}</p>}
        <Link to={adminHref.section("settings")} className="inline-block text-sm text-brand-orange-text hover:underline">{t("sender_edit_store")}</Link>
      </aside>
    </div>
  );
}
