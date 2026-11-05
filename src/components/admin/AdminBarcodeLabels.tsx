// =====================================================================================
// Admin > Estoque > Etiquetas de código de barras (recurso barcode_labels). Sem janelas:
//   Peças       busca, leitor, "todas com estoque", ?entrada=<id> (peças que chegaram numa entrada) e
//               ?produto=<id> (peças de um produto); cópias por peça
//   Modelo      tamanho (rolo térmico, folhas A4 e Carta, medidas próprias), o que aparece, código usado nas barras,
//               texto, alinhamento, contorno; "Guardar como padrão" grava store_settings.barcode_labels
//   Prévia      a primeira página do que vai ser impresso (o mesmo HTML da impressão, num iframe)
//   Imprimir    printHtml (src/lib/printWindow.ts), começando na posição escolhida da folha
// Regras em src/lib/productLabels.ts; dados em src/hooks/useBarcodeStock.ts; textos em src/i18n/adminBarcodeStock.ts.
// =====================================================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, Boxes, Eye, Loader2, PackageCheck, Printer, Save, Settings2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import AdminHelp from "./AdminHelp";
import HelpTip from "./HelpTip";
import { AdminPanel } from "./shell/AdminPageParts";
import ScanField from "./stock/ScanField";
import { useMessages } from "@/i18n";
import { adminBarcodeStockMessages, type AdminBarcodeStockKey } from "@/i18n/adminBarcodeStock";
import { useAdminFormat } from "@/hooks/useAdminList";
import { useStoreName } from "@/hooks/useBrand";
import { useLabelSettings, useSaveLabelSettings, useStockEntry, useStockEntryLines, useStockUnits } from "@/hooks/useBarcodeStock";
import {
  barcodeReadable, CODE_SOURCES, DEFAULT_LABEL_SETTINGS, LABEL_FIELDS, LABEL_PRESETS, labelCode, labelGeometry, labelsPerPage, leafUnits,
  normalizeLabelSettings, PAPER_MM, productLabelsHtml, sheetFits, totalCopies, usesProductId,
  type LabelPresetId, type LabelSettings, type SheetLayout, type StockUnit,
} from "@/lib/productLabels";
import { printHtml } from "@/lib/printWindow";
import { withVat } from "@/utils/pricing";
import { cn } from "@/lib/utils";

type T = (k: AdminBarcodeStockKey, v?: Record<string, string | number>) => string;
type Item = { unit: StockUnit; copies: number };
const MAX_LABELS = 2000;
const PX_PER_MM = 96 / 25.4;

/* ---------- prévia ---------- */

function Preview({ html, w, h }: { html: string; w: number; h: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const pxW = w * PX_PER_MM;
  const pxH = h * PX_PER_MM;
  // Etiqueta de rolo pequena aparece maior (até 2x) para ler; folha inteira encolhe para caber.
  const scale = Math.min(2, width / pxW);
  return (
    <div ref={box} className="w-full">
      <div className="mx-auto overflow-hidden rounded-[10px] border bg-white shadow-sm" style={{ width: pxW * scale, height: pxH * scale }}>
        <iframe
          title="preview"
          srcDoc={`<!doctype html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`}
          sandbox=""
          style={{ width: pxW, height: pxH, transform: `scale(${scale})`, transformOrigin: "0 0", border: 0, display: "block" }}
        />
      </div>
    </div>
  );
}

/* ---------- campos do modelo ---------- */

function NumField({ id, label, value, onChange, min, max, step = 0.1 }: { id: string; label: string; value: number; onChange: (n: number) => void; min: number; max: number; step?: number }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">{label}</Label>
      <Input id={id} type="number" inputMode="decimal" min={min} max={max} step={step} value={value}
        onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) onChange(n); }} className="h-10 tabular-nums" />
    </div>
  );
}

function Chips<V extends string>({ value, options, onChange, label }: { value: V; options: { value: V; label: string }[]; onChange: (v: V) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={cn("min-h-9 rounded-full border px-3.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === o.value ? "border-foreground bg-foreground text-background" : "bg-card hover:border-foreground/40")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function SettingsPanel({ t, form, setForm }: { t: T; form: LabelSettings; setForm: (f: LabelSettings) => void }) {
  const set = (patch: Partial<LabelSettings>) => setForm({ ...form, ...patch });
  const sheet = form.custom.sheet;
  const setSheet = (patch: Partial<SheetLayout>) => set({ custom: { ...form.custom, sheet: { ...sheet, ...patch } } });
  const rolls = LABEL_PRESETS.filter((p) => p.kind === "roll" && !p.id.startsWith("custom"));
  const sheets = LABEL_PRESETS.filter((p) => p.kind === "sheet" && !p.id.startsWith("custom"));
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex items-center gap-1"><Label htmlFor="label-size">{t("l_size")}</Label><HelpTip label={t("help")} text={t("l_size_tip")} /></div>
        <select id="label-size" value={form.preset} onChange={(e) => set({ preset: e.target.value as LabelPresetId })}
          className="h-11 w-full rounded-[14px] border border-input bg-background px-3 text-sm">
          <optgroup label={t("l_group_roll")}>
            {rolls.map((p) => <option key={p.id} value={p.id}>{t(`p_${p.id}` as AdminBarcodeStockKey)}</option>)}
            <option value="custom_roll">{t("p_custom_roll")}</option>
          </optgroup>
          <optgroup label={t("l_group_sheet")}>
            {sheets.map((p) => <option key={p.id} value={p.id}>{t(`p_${p.id}` as AdminBarcodeStockKey)}</option>)}
            <option value="custom_sheet">{t("p_custom_sheet")}</option>
          </optgroup>
        </select>
        {form.preset === "custom_roll" && (
          <div className="grid grid-cols-2 gap-3 pt-1">
            <NumField id="cw" label={t("l_width")} value={form.custom.w} min={15} max={210} onChange={(w) => set({ custom: { ...form.custom, w } })} />
            <NumField id="ch" label={t("l_height")} value={form.custom.h} min={10} max={280} onChange={(h) => set({ custom: { ...form.custom, h } })} />
          </div>
        )}
        {form.preset === "custom_sheet" && (
          <div className="space-y-3 rounded-[14px] border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">{t("l_sheet_tip")}</p>
            <Chips label={t("l_paper")} value={sheet.paper} onChange={(paper) => setSheet({ paper })}
              options={[{ value: "a4", label: t("l_paper_a4") }, { value: "letter", label: t("l_paper_letter") }]} />
            <div className="grid grid-cols-2 gap-3">
              <NumField id="sc" label={t("l_cols")} value={sheet.cols} min={1} max={10} step={1} onChange={(cols) => setSheet({ cols: Math.round(cols) })} />
              <NumField id="sr" label={t("l_rows")} value={sheet.rows} min={1} max={30} step={1} onChange={(rows) => setSheet({ rows: Math.round(rows) })} />
              <NumField id="sw" label={t("l_width")} value={sheet.w} min={15} max={210} onChange={(w) => setSheet({ w })} />
              <NumField id="sh" label={t("l_height")} value={sheet.h} min={10} max={280} onChange={(h) => setSheet({ h })} />
              <NumField id="st" label={t("l_top")} value={sheet.top} min={0} max={100} onChange={(top) => setSheet({ top })} />
              <NumField id="sl" label={t("l_left")} value={sheet.left} min={0} max={100} onChange={(left) => setSheet({ left })} />
              <NumField id="sgx" label={t("l_gap_x")} value={sheet.gapX} min={0} max={30} onChange={(gapX) => setSheet({ gapX })} />
              <NumField id="sgy" label={t("l_gap_y")} value={sheet.gapY} min={0} max={30} onChange={(gapY) => setSheet({ gapY })} />
            </div>
            {!sheetFits(sheet) && <p className="flex items-start gap-2 text-xs text-destructive"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{t("l_sheet_no_fit")}</p>}
          </div>
        )}
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">{t("l_fields")}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {LABEL_FIELDS.map((f) => (
            <label key={f} className={cn("flex cursor-pointer items-start gap-3 rounded-[12px] border p-3 transition-colors duration-150",
              form.fields[f] ? "border-primary bg-accent" : "hover:border-foreground/30")}>
              <input type="checkbox" checked={form.fields[f]} onChange={(e) => set({ fields: { ...form.fields, [f]: e.target.checked } })}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{t(`f_${f}` as AdminBarcodeStockKey)}</span>
                <span className="block text-xs text-muted-foreground">{t(`f_${f}_d` as AdminBarcodeStockKey)}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="mb-2 flex items-center gap-1 text-sm font-medium">{t("l_code_source")}<HelpTip label={t("help")} text={t("l_code_source_tip")} /></legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {CODE_SOURCES.map((c) => (
            <label key={c} className={cn("flex cursor-pointer items-start gap-3 rounded-[12px] border p-3 transition-colors duration-150",
              form.codeSource === c ? "border-primary bg-accent" : "hover:border-foreground/30")}>
              <input type="radio" name="code-source" checked={form.codeSource === c} onChange={() => set({ codeSource: c })}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{t(`cs_${c}` as AdminBarcodeStockKey)}</span>
                <span className="block text-xs text-muted-foreground">{t(`cs_${c}_d` as AdminBarcodeStockKey)}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <p className="text-sm font-medium">{t("l_text_size")}</p>
          <Chips label={t("l_text_size")} value={form.textSize} onChange={(textSize) => set({ textSize })}
            options={(["sm", "md", "lg"] as const).map((v) => ({ value: v, label: t(`ts_${v}`) }))} />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">{t("l_align")}</p>
          <Chips label={t("l_align")} value={form.align} onChange={(align) => set({ align })}
            options={[{ value: "center", label: t("al_center") }, { value: "left", label: t("al_left") }]} />
        </div>
      </div>
      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" checked={form.outline} onChange={(e) => set({ outline: e.target.checked })} className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]" />
        <span className="flex items-center gap-1 text-sm font-medium">{t("l_outline")}<HelpTip label={t("help")} text={t("l_outline_tip")} /></span>
      </label>
    </div>
  );
}

/* ---------- seção ---------- */

export default function AdminBarcodeLabels() {
  const { t: tr } = useMessages(adminBarcodeStockMessages);
  const t = tr as T;
  const { money } = useAdminFormat();
  const storeName = useStoreName();
  const [params, setParams] = useSearchParams();
  const entryId = params.get("entrada");
  const productId = params.get("produto");
  const { data: units, isLoading } = useStockUnits();
  const { data: saved } = useLabelSettings();
  const saveSettings = useSaveLabelSettings();
  const { data: entry } = useStockEntry(entryId);
  const { data: entryLines } = useStockEntryLines(entryId);
  const [form, setForm] = useState<LabelSettings>(DEFAULT_LABEL_SETTINGS);
  const [items, setItems] = useState<Item[]>([]);
  const [sound, setSound] = useState(true);
  const [skip, setSkip] = useState(1);
  const [printing, setPrinting] = useState(false);
  const loaded = useRef<string | null>(null);

  useEffect(() => { if (saved) setForm(saved); }, [saved]);
  const dirty = !!saved && JSON.stringify(normalizeLabelSettings(form)) !== JSON.stringify(saved);

  // Peças vindas de uma entrada ou de um produto (uma vez por endereço).
  useEffect(() => {
    if (!units) return;
    const sig = `${entryId ?? ""}|${productId ?? ""}`;
    if (loaded.current === sig || (!entryId && !productId)) return;
    if (entryId) {
      if (!entryLines || !entry) return;
      const next: Item[] = [];
      for (const l of entryLines) {
        if (l.change <= 0) continue;
        const u = units.find((x) => x.productId === l.product_id && x.variationId === l.variation_id && x.sizeId === l.size_id);
        if (u) next.push({ unit: u, copies: l.change });
      }
      setItems((cur) => merge(cur, next));
      toast.success(t("l_entry_loaded", { n: entry.number }));
    } else if (productId) {
      setItems((cur) => merge(cur, leafUnits(units, productId).map((u) => ({ unit: u, copies: 1 }))));
      toast.success(t("l_product_loaded"));
    }
    loaded.current = sig;
  }, [units, entryId, productId, entryLines, entry, t]);

  const geo = labelGeometry(form);
  const copies = totalCopies(items);
  const tx = useMemo(() => ({ storeName, price: (n: number) => money(withVat(n)) }), [storeName, money]);

  const sample: StockUnit = useMemo(() => items[0]?.unit ?? {
    key: "sample", productId: "sample", variationId: null, sizeId: null, name: t("l_sample"), variant: t("l_sample_variant"), price: 49.9,
    stock: 1, image: null, sku: "SKU-0001", skuInherited: false, gtin: "7891234567895", internalCode: null, mpn: null,
  }, [items, t]);
  const previewHtml = useMemo(() => {
    const list = items.length ? items : [{ unit: sample, copies: labelsPerPage(geo) }];
    return productLabelsHtml(list, form, tx, { skip: geo.sheet ? skip - 1 : 0, preview: true, maxPages: 1 });
  }, [items, sample, form, tx, geo, skip]);
  const paper = geo.sheet ? PAPER_MM[geo.sheet.paper] : { w: geo.w, h: geo.h };

  const addUnit = (u: StockUnit) => setItems((cur) => {
    const found = cur.find((i) => i.unit.key === u.key);
    return found ? [{ ...found, copies: found.copies + 1 }, ...cur.filter((i) => i.unit.key !== u.key)] : [{ unit: u, copies: 1 }, ...cur];
  });
  const addStocked = () => {
    if (!units) return;
    setItems((cur) => merge(cur, leafUnits(units).filter((u) => (u.stock ?? 0) > 0).map((u) => ({ unit: u, copies: u.stock ?? 0 }))));
  };
  const clearAll = () => {
    setItems([]);
    loaded.current = null;
    const p = new URLSearchParams(params); p.delete("entrada"); p.delete("produto"); setParams(p, { replace: true });
  };

  const print = async () => {
    if (!copies || copies > MAX_LABELS) return;
    setPrinting(true);
    try {
      await printHtml(productLabelsHtml(items, form, tx, { skip: geo.sheet ? skip - 1 : 0 }));
    } catch {
      toast.error(t("l_print_error"));
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="space-y-5">
      <AdminHelp id="barcode-labels" title={t("l_help_title")} steps={[t("l_help_1"), t("l_help_2"), t("l_help_3")]} />
      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 space-y-5">
          <AdminPanel title={t("l_items")} icon={PackageCheck}>
            <ScanField units={units} loading={isLoading} onUnit={addUnit} sound={sound} onSound={setSound} placeholder={t("l_search_ph")} autoFocus={false} />
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={addStocked} disabled={!units}><Boxes className="mr-1.5 h-4 w-4" strokeWidth={1.8} />{t("l_add_stock")}</Button>
              <HelpTip label={t("help")} text={t("l_add_stock_tip")} />
              {items.length > 0 && <>
                <Button size="sm" variant="ghost" onClick={() => setItems((cur) => cur.map((i) => ({ ...i, copies: Math.max(0, i.unit.stock ?? 0) })))} title={t("l_copies_stock_tip")}>{t("l_copies_stock")}</Button>
                <Button size="sm" variant="ghost" onClick={() => setItems((cur) => cur.map((i) => ({ ...i, copies: 1 })))}>{t("l_copies_one")}</Button>
                <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={clearAll}><X className="mr-1 h-4 w-4" />{t("l_clear")}</Button>
              </>}
            </div>
            {items.length === 0 ? (
              <p className="mt-4 rounded-[14px] border border-dashed p-8 text-center text-sm text-muted-foreground">{t("l_empty")}</p>
            ) : (
              <ul className="-mx-1 mt-3 divide-y">
                {items.map((it) => {
                  const code = labelCode(it.unit, form.codeSource);
                  const noCode = usesProductId(it.unit, form.codeSource);
                  const long = form.fields.barcode && !barcodeReadable(code, geo);
                  return (
                    <li key={it.unit.key} className="flex flex-wrap items-center gap-3 px-1 py-3 animate-in fade-in-0 duration-200 sm:flex-nowrap">
                      <span className="h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-muted">
                        {it.unit.image ? <img src={it.unit.image} alt="" loading="lazy" className="h-full w-full object-cover" /> : <Boxes className="m-3 h-5 w-5 text-muted-foreground" aria-hidden="true" />}
                      </span>
                      <div className="min-w-0 flex-1 basis-40">
                        <p className="break-words font-semibold leading-snug">{it.unit.name}</p>
                        <p className="break-words text-sm text-muted-foreground">{[it.unit.variant, code].filter(Boolean).join(" · ")}</p>
                        {(noCode || long) && (
                          <p className="mt-1 flex items-start gap-1.5 text-xs text-amber-800"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{noCode ? t("l_no_code") : t("l_long_code")}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`copies-${it.unit.key}`} className="text-xs text-muted-foreground">{t("l_copies")}</Label>
                        <Input id={`copies-${it.unit.key}`} type="number" inputMode="numeric" min={0} max={999} step={1} value={it.copies}
                          onChange={(e) => { const n = Math.max(0, Math.min(999, Math.floor(Number(e.target.value)) || 0)); setItems((cur) => cur.map((x) => (x.unit.key === it.unit.key ? { ...x, copies: n } : x))); }}
                          className="h-10 w-20 text-center tabular-nums" />
                        <Button type="button" variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground hover:text-destructive" aria-label={t("remove_line")}
                          onClick={() => setItems((cur) => cur.filter((x) => x.unit.key !== it.unit.key))}><Trash2 className="h-4 w-4" strokeWidth={1.8} /></Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </AdminPanel>
        </div>

        <div className="grid min-w-0 gap-5 lg:grid-cols-2 2xl:sticky 2xl:top-20 2xl:grid-cols-1 2xl:self-start">
          <AdminPanel title={t("l_preview")} icon={Eye}>
            <p className="mb-3 text-xs text-muted-foreground">{t("l_preview_hint")}</p>
            <Preview html={previewHtml} w={paper.w} h={paper.h} />
            <div className="mt-4 space-y-3">
              {geo.sheet && (
                <div className="flex items-center gap-2">
                  <Label htmlFor="label-skip" className="text-sm">{t("l_skip")}</Label>
                  <Input id="label-skip" type="number" inputMode="numeric" min={1} max={labelsPerPage(geo)} value={skip}
                    onChange={(e) => setSkip(Math.max(1, Math.min(labelsPerPage(geo), Math.floor(Number(e.target.value)) || 1)))} className="h-10 w-20 text-center tabular-nums" />
                  <HelpTip label={t("help")} text={t("l_skip_tip")} />
                </div>
              )}
              {copies > MAX_LABELS && <p className="text-sm text-destructive">{t("l_too_many")}</p>}
              <div className="flex items-center gap-1">
                <Button size="lg" className="flex-1" onClick={print} disabled={!copies || copies > MAX_LABELS || printing || (geo.sheet ? !sheetFits(geo.sheet) : false)}>
                  {printing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Printer className="mr-1.5 h-4 w-4" strokeWidth={1.8} />}
                  {t("l_print", { n: copies })}
                </Button>
                <HelpTip label={t("help")} text={t("l_print_tip")} />
              </div>
            </div>
          </AdminPanel>
          <AdminPanel title={t("l_settings")} icon={Settings2}
            actions={<Button size="sm" variant={dirty ? "default" : "outline"} disabled={!dirty || saveSettings.isPending}
              onClick={() => saveSettings.mutate(form, { onSuccess: () => toast.success(t("l_saved")), onError: () => toast.error(t("l_save_error")) })}>
              {saveSettings.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" strokeWidth={1.8} />}{t("l_save")}
            </Button>}>
            {dirty && <p className="mb-3 text-xs text-amber-800">{t("l_unsaved")}</p>}
            <SettingsPanel t={t} form={form} setForm={setForm} />
          </AdminPanel>
        </div>
      </div>
    </div>
  );
}

/** Junta peças novas à lista: a mesma peça soma as cópias. */
function merge(cur: Item[], add: Item[]): Item[] {
  const out = [...cur];
  for (const a of add) {
    const i = out.findIndex((x) => x.unit.key === a.unit.key);
    if (i >= 0) out[i] = { ...out[i], copies: out[i].copies + a.copies };
    else out.push(a);
  }
  return out;
}
