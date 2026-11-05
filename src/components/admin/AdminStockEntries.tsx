// =====================================================================================
// Admin > Estoque > Entradas e conferência (recurso barcode_stock). Sem janelas:
//   Tipo        entrada de mercadoria (soma), contagem (define), perda ou avaria (tira), outro (com sinal)
//   Leitura     ScanField: leitor USB, câmera ou busca pelo nome; o mesmo código soma na mesma linha
//   Lista       quantidade por linha, estoque agora e como fica, diferença na contagem
//   Gravar      admin_stock_entry numa transação (ConfirmStrip); depois, atalho para imprimir as etiquetas
//   Entradas    lista das gravadas e página de cada uma (?ver=entrada&id=<id>)
// Regras em src/lib/stockEntries.ts e src/lib/productLabels.ts; dados em src/hooks/useBarcodeStock.ts;
// textos em src/i18n/adminBarcodeStock.ts.
// =====================================================================================
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowDownRight, ArrowUpRight, Boxes, CheckCircle2, ChevronRight, ClipboardCheck, History, Loader2, PackageMinus, PackagePlus,
  Printer, Search, SlidersHorizontal, Trash2, X, type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import AdminHelp from "./AdminHelp";
import HelpTip from "./HelpTip";
import AdminSubpage, { useAdminPage } from "./AdminSubpage";
import { AdminPager, FilterChips } from "./AdminListKit";
import { AdminPanel, ConfirmStrip } from "./shell/AdminPageParts";
import { adminHref } from "./shell/adminSections";
import ScanField from "./stock/ScanField";
import { useMessages } from "@/i18n";
import { adminBarcodeStockMessages, type AdminBarcodeStockKey } from "@/i18n/adminBarcodeStock";
import { useAdminFormat } from "@/hooks/useAdminList";
import { useFeature } from "@/hooks/useFeatures";
import {
  useSaveStockEntry, useStockEntries, useStockEntry, useStockEntryLines, useStockUnits, type EntryResult,
} from "@/hooks/useBarcodeStock";
import { stockOwner, type StockUnit } from "@/lib/productLabels";
import {
  addScan, ENTRY_KINDS, labelsHref, entryErrorCode, entryMode, entryTotals, lineResult, lineValue, MAX_ENTRY_LINES, type EntryKind, type EntryLine,
} from "@/lib/stockEntries";
import { cn } from "@/lib/utils";

type T = (k: AdminBarcodeStockKey, v?: Record<string, string | number>) => string;
const PAGE_SIZE = 10;

const KIND_ICON: Record<EntryKind, LucideIcon> = {
  receive: PackagePlus, count: ClipboardCheck, damage: PackageMinus, other: SlidersHorizontal,
};
const KIND_TONE: Record<EntryKind, string> = {
  receive: "bg-emerald-50 text-emerald-700", count: "bg-sky-50 text-sky-700", damage: "bg-red-50 text-red-700", other: "bg-amber-50 text-amber-800",
};

function KindBadge({ kind, t }: { kind: EntryKind; t: T }) {
  const Icon = KIND_ICON[kind];
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", KIND_TONE[kind])}>
      <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />{t(`kind_${kind}` as AdminBarcodeStockKey)}
    </span>
  );
}

function Diff({ n }: { n: number }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5 font-bold tabular-nums", n > 0 ? "text-emerald-700" : n < 0 ? "text-red-700" : "text-muted-foreground")}>
      {n > 0 ? <ArrowUpRight className="h-4 w-4" aria-hidden="true" /> : n < 0 ? <ArrowDownRight className="h-4 w-4" aria-hidden="true" /> : null}
      {n > 0 ? `+${n}` : n}
    </span>
  );
}

/* ---------- uma linha da lista ---------- */

function LineRow({ line, kind, t, onQty, onRemove }: { line: EntryLine; kind: EntryKind; t: T; onQty: (n: number) => void; onRemove: () => void }) {
  const [text, setText] = useState(String(line.qty));
  useEffect(() => { setText(String(line.qty)); }, [line.qty]);
  const next = lineResult(kind, line.stock, line.qty);
  const diff = next == null ? null : next - (line.stock ?? 0);
  const mode = entryMode(kind);
  const qtyLabel = t(mode === "set" ? "qty_count" : mode === "add" ? "qty_add" : mode === "remove" ? "qty_remove" : "qty_signed");
  return (
    <li className="flex flex-wrap items-center gap-3 p-3 animate-in fade-in-0 slide-in-from-top-1 duration-200 sm:flex-nowrap sm:p-4">
      <span className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-muted">
        {line.image ? <img src={line.image} alt="" loading="lazy" className="h-full w-full object-cover" /> : <Boxes className="m-3 h-6 w-6 text-muted-foreground" aria-hidden="true" />}
      </span>
      <div className="min-w-0 flex-1 basis-40">
        <p className="break-words font-semibold leading-snug">{line.name}</p>
        <p className="text-sm text-muted-foreground">{[line.variant, line.code].filter(Boolean).join(" · ")}</p>
        <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
          {t("now")}: {line.stock ?? 0}
          {next != null && <> · {t("after")}: <span className="font-semibold text-foreground">{next}</span></>}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <div className="w-24">
          <label className="sr-only" htmlFor={`qty-${line.key}`}>{qtyLabel}</label>
          <Input
            id={`qty-${line.key}`}
            type="number"
            inputMode="numeric"
            step={1}
            value={text}
            onChange={(e) => { setText(e.target.value); const n = Number(e.target.value); if (e.target.value.trim() !== "" && Number.isFinite(n)) onQty(n); }}
            onBlur={() => setText(String(line.qty))}
            aria-invalid={next == null}
            className={cn("h-11 text-center text-base font-semibold tabular-nums", next == null && "border-destructive")}
          />
        </div>
        <div className="w-16 text-right text-sm">
          {diff == null ? <span className="text-xs text-destructive">{t("invalid_qty")}</span> : <Diff n={diff} />}
        </div>
        <Button type="button" variant="ghost" size="icon" className="h-10 w-10 shrink-0 text-muted-foreground hover:text-destructive" onClick={onRemove} aria-label={t("remove_line")}>
          <Trash2 className="h-4 w-4" strokeWidth={1.8} />
        </Button>
      </div>
    </li>
  );
}

/* ---------- área de trabalho ---------- */

function EntryWorkspace({ t }: { t: T }) {
  const labelsOn = useFeature("barcode_labels");
  const { data: units, isLoading, error } = useStockUnits();
  const save = useSaveStockEntry();
  const [kind, setKind] = useState<EntryKind>("receive");
  const [lines, setLines] = useState<EntryLine[]>([]);
  const [step, setStep] = useState(1);
  const [sound, setSound] = useState(true);
  const [supplier, setSupplier] = useState("");
  const [document, setDocument] = useState("");
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState<"save" | "clear" | null>(null);
  const [done, setDone] = useState<EntryResult | null>(null);

  const totals = entryTotals(kind, lines);
  const mode = entryMode(kind);

  const addUnit = (u: StockUnit) => {
    const owner = stockOwner(units ?? [], u);
    setDone(null);
    setLines((ls) => addScan(ls, {
      productId: owner.productId, variationId: owner.variationId, sizeId: owner.sizeId, name: owner.name, variant: owner.variant,
      image: owner.image, code: u.gtin ?? u.sku ?? owner.sku ?? owner.internalCode, stock: owner.stock ?? 0,
    }, Math.max(1, Math.floor(step) || 1)));
  };

  const reset = () => { setLines([]); setSupplier(""); setDocument(""); setNote(""); setConfirm(null); };

  const submit = async () => {
    try {
      const r = await save.mutateAsync({
        kind, supplier, document, note,
        lines: lines.map((l) => ({ product_id: l.productId, variation_id: l.variationId, size_id: l.sizeId, qty: lineValue(kind, l.qty) })),
      });
      reset();
      setDone(r);
    } catch (e) {
      setConfirm(null);
      toast.error(t(`err_${entryErrorCode((e as { message?: string })?.message)}` as AdminBarcodeStockKey));
    }
  };

  return (
    <div className="space-y-5">
      {/* Tipo */}
      <fieldset className="rounded-[18px] border bg-card p-4 md:p-5">
        <legend className="sr-only">{t("kind_label")}</legend>
        <p className="mb-3 text-base font-semibold" aria-hidden="true">{t("kind_label")}</p>
        <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
          {ENTRY_KINDS.map((k) => {
            const Icon = KIND_ICON[k];
            const on = kind === k;
            return (
              <label key={k} className={cn("flex cursor-pointer items-start gap-2.5 rounded-[14px] border p-2.5 transition-colors duration-150 sm:gap-3 sm:p-3",
                on ? "border-primary bg-accent" : "hover:border-foreground/30")}>
                <input type="radio" name="entry-kind" value={k} checked={on} onChange={() => setKind(k)} className="sr-only" />
                <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", KIND_TONE[k])}><Icon className="h-5 w-5" strokeWidth={1.8} /></span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{t(`kind_${k}` as AdminBarcodeStockKey)}</span>
                  <span className="hidden text-xs text-muted-foreground sm:block">{t(`kind_${k}_d` as AdminBarcodeStockKey)}</span>
                </span>
              </label>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted-foreground sm:hidden">{t(`kind_${kind}_d` as AdminBarcodeStockKey)}</p>
      </fieldset>

      {/* Leitura */}
      <section className="rounded-[18px] border bg-card p-4 md:p-5">
        <div className="flex flex-wrap items-end gap-4">
          <ScanField units={units} loading={isLoading} onUnit={addUnit} sound={sound} onSound={setSound} className="min-w-0 flex-1 basis-80" />
          {mode !== "set" && (
            <div className="w-44 space-y-2 pb-8">
              <div className="flex items-center gap-1"><Label htmlFor="scan-step">{t("step")}</Label><HelpTip label={t("help")} text={t("step_tip")} /></div>
              <Input id="scan-step" type="number" inputMode="numeric" min={1} max={999} step={1} value={step}
                onChange={(e) => setStep(Math.max(1, Math.min(999, Math.floor(Number(e.target.value)) || 1)))} className="h-12 text-center tabular-nums" />
            </div>
          )}
        </div>
        {error && <p className="mt-2 rounded-xl bg-destructive/5 px-3 py-2 text-sm text-destructive">{t("load_error")}</p>}
      </section>

      {/* Gravada */}
      {done && (
        <div role="status" className="flex flex-col gap-3 rounded-[18px] border border-emerald-300 bg-emerald-50 p-4 animate-in fade-in-0 duration-200 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" strokeWidth={1.8} />
            <div>
              <p className="font-semibold text-emerald-900">{t("saved_title", { n: done.number })}</p>
              <p className="text-sm text-emerald-800">{t("saved_desc", { lines: done.lines, in: done.units_in, out: done.units_out })}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {labelsOn && done.units_in > 0 && (
              <Button asChild><Link to={labelsHref({ entry: done.id })}><Printer className="mr-1.5 h-4 w-4" strokeWidth={1.8} />{t("saved_print")}</Link></Button>
            )}
            <Button variant="outline" asChild><Link to={`${adminHref.section("stock-entries")}&ver=entrada&id=${done.id}`}>{t("saved_view")}</Link></Button>
            <Button variant="ghost" onClick={() => setDone(null)}>{t("saved_new")}</Button>
          </div>
        </div>
      )}

      {/* Lista */}
      <section className="rounded-[18px] border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 md:px-5">
          <h3 className="text-base font-semibold">{t("lines_title")}</h3>
          <div className="flex gap-4 text-sm tabular-nums">
            <span><span className="text-muted-foreground">{t("sum_lines")}</span> <b>{totals.lines}</b></span>
            <span className={totals.unitsIn ? "text-emerald-700" : ""}><span className="text-muted-foreground">{t("sum_in")}</span> <b>{totals.unitsIn ? `+${totals.unitsIn}` : 0}</b></span>
            <span className={totals.unitsOut ? "text-red-700" : ""}><span className="text-muted-foreground">{t("sum_out")}</span> <b>{totals.unitsOut ? `-${totals.unitsOut}` : 0}</b></span>
          </div>
        </div>
        {kind === "count" && lines.length > 0 && <p className="border-b bg-sky-50 px-4 py-2 text-sm text-sky-800 md:px-5">{t("count_note")}</p>}
        {lines.length === 0 ? (
          <p className="flex flex-col items-center gap-2 px-4 py-12 text-center text-sm text-muted-foreground">
            <Search className="h-6 w-6" strokeWidth={1.6} aria-hidden="true" />{t("lines_empty")}
          </p>
        ) : (
          <ul className="divide-y">
            {lines.map((l) => (
              <LineRow key={l.key} line={l} kind={kind} t={t}
                onQty={(n) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, qty: Math.trunc(n) } : x)))}
                onRemove={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} />
            ))}
          </ul>
        )}
      </section>

      {/* Dados e gravar */}
      {lines.length > 0 && (
        <section className="space-y-4 rounded-[18px] border bg-card p-4 md:p-5">
          <h3 className="text-base font-semibold">{t("details")}</h3>
          <div className="grid gap-4 md:grid-cols-3">
            {kind === "receive" && (
              <div className="space-y-2">
                <div className="flex items-center gap-1"><Label htmlFor="entry-supplier">{t("supplier")}</Label><HelpTip label={t("help")} text={t("supplier_tip")} /></div>
                <Input id="entry-supplier" value={supplier} maxLength={120} onChange={(e) => setSupplier(e.target.value)} placeholder={t("supplier_ph")} />
              </div>
            )}
            <div className="space-y-2">
              <div className="flex items-center gap-1"><Label htmlFor="entry-doc">{t("document")}</Label><HelpTip label={t("help")} text={t("document_tip")} /></div>
              <Input id="entry-doc" value={document} maxLength={80} onChange={(e) => setDocument(e.target.value)} placeholder={t("document_ph")} />
            </div>
            <div className={cn("space-y-2", kind !== "receive" && "md:col-span-2")}>
              <div className="flex items-center gap-1"><Label htmlFor="entry-note">{t("note")}</Label><HelpTip label={t("help")} text={t("note_tip")} /></div>
              <Input id="entry-note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder={t("note_ph")} />
            </div>
          </div>
          {totals.invalid > 0 && <p className="rounded-xl bg-destructive/5 px-3 py-2 text-sm text-destructive">{t("fix_lines", { n: totals.invalid })}</p>}
          {lines.length > MAX_ENTRY_LINES && <p className="rounded-xl bg-destructive/5 px-3 py-2 text-sm text-destructive">{t("err_too_many_lines")}</p>}
          <div className="flex flex-wrap gap-2">
            <Button size="lg" onClick={() => setConfirm("save")} disabled={totals.invalid > 0 || lines.length > MAX_ENTRY_LINES || save.isPending}>
              {save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{t("save")}
            </Button>
            <Button size="lg" variant="outline" onClick={() => setConfirm("clear")}><X className="mr-1.5 h-4 w-4" />{t("clear")}</Button>
            <ConfirmStrip open={confirm === "save"} tone="warning" title={t("save_title", { n: lines.length })} description={t("save_desc")}
              confirmLabel={t("save_confirm")} onConfirm={submit} onCancel={() => setConfirm(null)} busy={save.isPending} />
            <ConfirmStrip open={confirm === "clear"} title={t("clear_title")} description={t("clear_desc")}
              confirmLabel={t("clear_confirm")} onConfirm={reset} onCancel={() => setConfirm(null)} />
          </div>
        </section>
      )}
    </div>
  );
}

/* ---------- lista de entradas gravadas ---------- */

function EntryList({ t, onOpen }: { t: T; onOpen: (id: string) => void }) {
  const { relative, dateTime } = useAdminFormat();
  const [kind, setKind] = useState<EntryKind | "all">("all");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => { const h = setTimeout(() => setQ(qInput), 300); return () => clearTimeout(h); }, [qInput]);
  useEffect(() => { setPage(1); }, [kind, q]);
  const { data, isLoading, isFetching } = useStockEntries({ kind: kind === "all" ? null : kind, q, page, pageSize: PAGE_SIZE });
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <AdminPanel title={t("recent_title")} icon={History}>
      <div className="mb-3 flex flex-col gap-3">
        <FilterChips<EntryKind | "all"> label={t("kind_label")} value={kind} onChange={setKind}
          options={[{ value: "all", label: t("all") }, ...ENTRY_KINDS.map((k) => ({ value: k, label: t(`kind_${k}` as AdminBarcodeStockKey) }))]} />
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder={t("recent_search")} aria-label={t("recent_search")} className="pl-9" />
        </div>
      </div>
      {isLoading ? (
        <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>
      ) : !data?.rows.length ? (
        <p className="rounded-[14px] border border-dashed p-8 text-center text-sm text-muted-foreground">{t("recent_empty")}</p>
      ) : (
        <ul className={cn("-mx-1 divide-y transition-opacity", isFetching && "opacity-60")}>
          {data.rows.map((e) => (
            <li key={e.id}>
              <button type="button" onClick={() => onOpen(e.id)} className="flex w-full items-center gap-3 rounded-xl px-1 py-3 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{t("entry_n", { n: e.number })}</span>
                    <KindBadge kind={e.kind} t={t} />
                  </div>
                  <p className="break-words text-sm text-muted-foreground">
                    {[e.supplier, e.document_ref, e.note].filter(Boolean).join(" · ") || " "}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <time dateTime={e.created_at} title={dateTime(e.created_at)}>{t("entry_meta", { lines: e.lines, when: relative(e.created_at) })}</time>
                    {e.actor_email ? ` · ${t("entry_by", { who: e.actor_email })}` : ""}
                  </p>
                </div>
                <div className="shrink-0 space-y-0.5 text-right text-sm tabular-nums">
                  {e.units_in > 0 && <p className="font-semibold text-emerald-700">+{e.units_in}</p>}
                  {e.units_out > 0 && <p className="font-semibold text-red-700">-{e.units_out}</p>}
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <AdminPager page={page} pages={pages} total={total} from={total ? (page - 1) * PAGE_SIZE + 1 : 0} to={Math.min(page * PAGE_SIZE, total)} onPage={setPage} />
    </AdminPanel>
  );
}

/* ---------- página de uma entrada ---------- */

function EntryPage({ id, t, onBack }: { id: string; t: T; onBack: () => void }) {
  const labelsOn = useFeature("barcode_labels");
  const historyOn = useFeature("stock_history");
  const { dateTime } = useAdminFormat();
  const { data: entry, isLoading } = useStockEntry(id);
  const { data: lines = [], isLoading: loadingLines } = useStockEntryLines(id);
  if (isLoading) return <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>;
  if (!entry) return <AdminSubpage title={t("load_error")} backLabel={t("back")} onBack={onBack}><span /></AdminSubpage>;
  return (
    <AdminSubpage
      title={t("entry_n", { n: entry.number })}
      subtitle={`${t(`kind_${entry.kind}` as AdminBarcodeStockKey)} · ${dateTime(entry.created_at)}`}
      backLabel={t("back")}
      onBack={onBack}
      actions={<>
        {labelsOn && lines.some((l) => l.change > 0) && (
          <Button asChild><Link to={labelsHref({ entry: entry.id })}><Printer className="mr-1.5 h-4 w-4" strokeWidth={1.8} />{t("print_labels")}</Link></Button>
        )}
        {historyOn && <Button variant="outline" asChild><Link to={adminHref.section("stock-history")}><History className="mr-1.5 h-4 w-4" strokeWidth={1.8} />{t("history_link")}</Link></Button>}
      </>}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        {[[t("sum_lines"), entry.lines], [t("sum_in"), entry.units_in ? `+${entry.units_in}` : 0], [t("sum_out"), entry.units_out ? `-${entry.units_out}` : 0]].map(([k, v]) => (
          <div key={String(k)} className="rounded-[18px] border bg-card p-4">
            <p className="text-2xl font-bold tabular-nums">{v}</p>
            <p className="text-xs font-medium text-muted-foreground">{k}</p>
          </div>
        ))}
      </div>
      {(entry.supplier || entry.document_ref || entry.note) && (
        <dl className="grid gap-3 rounded-[18px] border bg-card p-4 text-sm sm:grid-cols-3">
          {entry.supplier && <div><dt className="text-muted-foreground">{t("supplier")}</dt><dd className="break-words font-medium">{entry.supplier}</dd></div>}
          {entry.document_ref && <div><dt className="text-muted-foreground">{t("document")}</dt><dd className="break-words font-medium">{entry.document_ref}</dd></div>}
          {entry.note && <div><dt className="text-muted-foreground">{t("note")}</dt><dd className="break-words font-medium">{entry.note}</dd></div>}
        </dl>
      )}
      <AdminPanel title={t("entry_lines")}>
        {loadingLines ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : !lines.length ? (
          <p className="text-sm text-muted-foreground">{t("entry_no_moves")}</p>
        ) : (
          <ul className="-mx-1 divide-y">
            {lines.map((l) => (
              <li key={l.id} className="flex items-center gap-3 px-1 py-3">
                <span className="h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-muted">
                  {l.product_image ? <img src={l.product_image} alt="" loading="lazy" className="h-full w-full object-cover" /> : <Boxes className="m-2.5 h-5 w-5 text-muted-foreground" aria-hidden="true" />}
                </span>
                <div className="min-w-0 flex-1">
                  <Link to={adminHref.productStats(l.product_id)} className="break-words font-semibold hover:underline">{l.product_name}</Link>
                  <p className="text-sm text-muted-foreground">
                    {[[l.variation_name, l.size_label].filter(Boolean).join(" / "), l.sku].filter(Boolean).join(" · ")}
                    {" "}{t("from_to", { from: l.quantity_before ?? 0, to: l.quantity_after ?? 0 })}
                  </p>
                </div>
                <Diff n={l.change} />
              </li>
            ))}
          </ul>
        )}
      </AdminPanel>
    </AdminSubpage>
  );
}

/* ---------- seção ---------- */

export default function AdminStockEntries() {
  const { t: tr } = useMessages(adminBarcodeStockMessages);
  const t = tr as T;
  const page = useAdminPage();
  if (page.view === "entrada" && page.id) return <EntryPage id={page.id} t={t} onBack={page.close} />;
  return (
    <div className="space-y-5">
      <AdminHelp id="stock-entries" title={t("help_title")} steps={[t("help_1"), t("help_2"), t("help_3")]} />
      <EntryWorkspace t={t} />
      <EntryList t={t} onOpen={(id) => page.open("entrada", id)} />
    </div>
  );
}

