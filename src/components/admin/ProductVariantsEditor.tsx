// =====================================================================================
// Aba Variantes da página do produto no Admin (/admin/produto/<id>?tab=variants, recurso variants).
// Todas as combinações vendáveis numa lista só: código (SKU), código de barras, estoque, à venda e foto.
// As variantes nascem nas abas Cores e Tamanhos; aqui só se completam. Cada campo grava ao sair dele.
// Regras puras em src/lib/variants.ts; leitura e gravação em src/hooks/useProductVariants.ts.
// =====================================================================================
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Barcode, Boxes, Download, ImagePlus, Layers, Loader2, PackageX, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import AdminHelp from "./AdminHelp";
import { AdminStatCard, FilterChips } from "./AdminListKit";
import { useInlineConfirm } from "./shell/useInlineConfirm";
import { useMessages } from "@/i18n";
import { adminVariantsMessages, type AdminVariantsKey } from "@/i18n/adminVariants";
import { supabase } from "@/integrations/supabase/client";
import { fetchTakenSkus, saveVariant, useProductVariantData, useSaveVariant, variantErrorCode, type VariantPatch } from "@/hooks/useProductVariants";
import {
  fillMissingSkus, gtinChecksumOk, isValidGtin, isValidSku, normalizeGtin, normalizeSku, rowStock, skuBase,
  variantCsvRows, variantLabel, variantRows, variantSummary, type VariantRow,
} from "@/lib/variants";
import { downloadCsv } from "@/lib/csv";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

type Filter = "all" | "soldout" | "low" | "nosku";
const LOW_AT = 5;

export default function ProductVariantsEditor({ productId }: { productId: string }) {
  const { t, locale } = useMessages(adminVariantsMessages);
  const { data, isLoading, isError } = useProductVariantData(productId);
  const save = useSaveVariant(productId);
  const qc = useQueryClient();
  const { ask, confirmSlot } = useInlineConfirm();
  const [filter, setFilter] = useState<Filter>("all");
  const [filling, setFilling] = useState(false);
  const nf = useMemo(() => new Intl.NumberFormat(locale), [locale]);

  const rows = useMemo(() => (data ? variantRows(data.product, data.colors, data.sizes, data.combos) : []), [data]);
  const productStock = data?.product.stock_quantity ?? null;
  const sum = useMemo(() => variantSummary(rows, productStock, LOW_AT), [rows, productStock]);

  if (isLoading) return <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>;
  if (isError || !data) return <p role="alert" className="py-6 text-sm text-destructive">{t("load_error")}</p>;

  const stockOf = (r: VariantRow) => rowStock(r, productStock);
  const shown = rows.filter((r) => {
    if (filter === "nosku") return !r.sku;
    const s = stockOf(r);
    if (filter === "soldout") return r.available && s != null && s <= 0;
    if (filter === "low") return r.available && s != null && s > 0 && s <= LOW_AT;
    return true;
  });

  const errText = (e: unknown) => {
    const code = variantErrorCode(e);
    return code ? t(`err_${code}` as AdminVariantsKey) : t("save_error");
  };
  const commit = (row: VariantRow, patch: VariantPatch) =>
    save.mutate({ row, patch }, { onSuccess: () => toast.success(t("saved")), onError: (e) => toast.error(errText(e)) });

  const fill = async () => {
    const taken = await fetchTakenSkus().catch(() => [] as string[]);
    const codes = fillMissingSkus(rows, skuBase(data.product), taken);
    if (!codes.size) { toast.info(t("fill_none")); return; }
    if (!(await ask(t("fill_confirm", { n: codes.size }), { confirmLabel: t("fill_ok") }))) return;
    setFilling(true);
    let done = 0;
    let failed: unknown = null;
    for (const r of rows) {
      const sku = codes.get(r.key);
      if (!sku) continue;
      try { await saveVariant(r, { sku }, productId); done += 1; } catch (e) { failed = e; }
    }
    setFilling(false);
    qc.invalidateQueries({ queryKey: ["productVariants", productId] });
    qc.invalidateQueries({ queryKey: ["adminVariations", productId] });
    qc.invalidateQueries({ queryKey: ["varSizeAvailability", productId] });
    if (done) toast.success(t("fill_done", { n: done }));
    if (failed) toast.error(errText(failed));
  };

  const csv = () => {
    const list = variantCsvRows(rows, productStock, data.product.name || productId);
    downloadCsv(`variantes-${productId}`, [t("csv_variant"), t("csv_sku"), t("csv_gtin"), t("csv_stock"), t("csv_available")],
      list.map((r) => [r.variant, r.sku, r.gtin, r.stock, r.available]));
  };

  const simple = rows.length === 1 && rows[0].kind === "product";

  return (
    <div className="space-y-5">
      {confirmSlot}
      <AdminHelp id="product-variants" title={t("help_title")} steps={[t("help_1"), t("help_2"), t("help_3")]} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <AdminStatCard icon={Layers} label={t("st_total")} value={nf.format(sum.total)} active={filter === "all"} onClick={() => setFilter("all")} />
        <AdminStatCard icon={Boxes} label={t("st_stock")} value={nf.format(sum.stock)} hint={t("st_stock_hint")} tone="success" />
        <AdminStatCard icon={PackageX} label={t("st_soldout")} value={nf.format(sum.soldOut)} tone={sum.soldOut ? "danger" : "default"} active={filter === "soldout"} onClick={() => setFilter("soldout")} />
        <AdminStatCard icon={AlertTriangle} label={t("st_low")} value={nf.format(sum.low)} hint={t("st_low_hint")} tone={sum.low ? "warning" : "default"} active={filter === "low"} onClick={() => setFilter("low")} />
        <AdminStatCard icon={Barcode} label={t("st_nosku")} value={nf.format(sum.missingSku)} tone={sum.missingSku ? "warning" : "default"} active={filter === "nosku"} onClick={() => setFilter("nosku")} />
      </div>

      {simple && <p className="rounded-[14px] border border-dashed p-4 text-sm text-muted-foreground">{t("simple_hint")}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterChips<Filter>
          label={t("f_label")}
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: t("f_all"), count: sum.total },
            { value: "soldout", label: t("f_soldout"), count: sum.soldOut, tone: "warning" },
            { value: "low", label: t("f_low"), count: sum.low, tone: "warning" },
            { value: "nosku", label: t("f_nosku"), count: sum.missingSku, tone: "warning" },
          ]}
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={fill} disabled={filling || !sum.missingSku}>
            {filling ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Wand2 className="mr-1.5 h-4 w-4" />}{t("fill")}
          </Button>
          <Button variant="outline" size="sm" onClick={csv}><Download className="mr-1.5 h-4 w-4" />{t("csv")}</Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-[18px] border bg-card">
        {shown.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">{t("empty_filter")}</p>
        ) : shown.map((r) => (
          <VariantLine key={r.key} row={r} productStock={productStock} productName={data.product.name || ""} onCommit={commit} t={t} />
        ))}
      </div>
    </div>
  );
}

/* ---------- Uma variante ---------- */

type T = (key: AdminVariantsKey, vars?: Record<string, string | number>) => string;

function VariantLine({ row, productStock, productName, onCommit, t }: {
  row: VariantRow; productStock: number | null; productName: string; onCommit: (r: VariantRow, p: VariantPatch) => void; t: T;
}) {
  const stock = rowStock(row, productStock);
  const sold = row.available && stock != null && stock <= 0;
  const label = variantLabel(row) || productName || t("product_row");

  const onSku = (e: React.FocusEvent<HTMLInputElement>) => {
    const v = normalizeSku(e.target.value);
    if (v === row.sku) return;
    if (!isValidSku(v)) { toast.error(t("err_sku_invalid")); e.target.value = row.sku ?? ""; return; }
    onCommit(row, { sku: v });
  };
  const onGtin = (e: React.FocusEvent<HTMLInputElement>) => {
    const v = normalizeGtin(e.target.value);
    if (v === row.gtin) return;
    if (!isValidGtin(v)) { toast.error(t("err_gtin_invalid")); e.target.value = row.gtin ?? ""; return; }
    if (v && !gtinChecksumOk(v)) toast.warning(t("gtin_check_warn"));
    onCommit(row, { gtin: v });
  };
  const onStock = (e: React.FocusEvent<HTMLInputElement>) => {
    const raw = e.target.value.trim();
    // Cor sem estoque próprio: vazio = usa o do produto.
    const v = raw === "" ? (row.kind === "color" || row.kind === "product" ? null : 0) : Math.max(0, Math.floor(Number(raw) || 0));
    if (v === row.stock) return;
    onCommit(row, { stock: v });
  };

  return (
    <div className={cn("space-y-3 border-b px-4 py-4 last:border-b-0", !row.available && "bg-muted/30")}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          {row.colorHex && <span className="h-6 w-6 shrink-0 rounded-full border" style={{ backgroundColor: row.colorHex }} aria-hidden="true" />}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{label}</p>
            {!row.available ? <p className="text-xs text-muted-foreground">{t("unavailable")}</p>
              : sold ? <p className="text-xs font-medium text-destructive">{t("sold_out")}</p> : null}
          </div>
        </div>
        <VariantPhoto row={row} onCommit={onCommit} t={t} />
        {row.kind === "combo" && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            {t("col_available")}
            <Switch checked={row.available} onCheckedChange={(v) => onCommit(row, { available: v })} />
          </label>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("col_sku")}</span>
          <Input key={`sku-${row.sku}`} defaultValue={row.sku ?? ""} onBlur={onSku} maxLength={64} className="h-9 font-mono text-[13px]" aria-label={`${t("col_sku")}: ${label}`} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("col_gtin")}</span>
          <Input key={`gtin-${row.gtin}`} defaultValue={row.gtin ?? ""} onBlur={onGtin} inputMode="numeric" maxLength={18} className="h-9 font-mono text-[13px]" aria-label={`${t("col_gtin")}: ${label}`} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("col_stock")}</span>
          <Input key={`stk-${row.stock}`} type="number" min={0} step={1} inputMode="numeric" defaultValue={row.stock ?? ""} onBlur={onStock}
            placeholder={row.kind === "color" && productStock != null ? String(productStock) : row.kind === "product" ? t("stock_untracked") : "0"}
            disabled={!row.available} className="h-9 tabular-nums" aria-label={`${t("col_stock")}: ${label}`}
            title={row.kind === "color" ? t("shared_stock_hint", { n: productStock ?? 0 }) : undefined} />
          {row.kind === "color" && row.stock == null && <span className="mt-1 block text-[11px] text-muted-foreground">{t("shared_stock")}</span>}
        </label>
      </div>
    </div>
  );
}

function VariantPhoto({ row, onCommit, t }: { row: VariantRow; onCommit: (r: VariantRow, p: VariantPatch) => void; t: T }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  if (row.kind === "size" || row.kind === "product") return null;

  const thumb = row.image
    ? <img src={row.image} alt="" className="h-10 w-10 shrink-0 rounded-lg border object-cover" loading="lazy" />
    : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-dashed text-muted-foreground"><ImagePlus className="h-4 w-4" aria-hidden="true" /></span>;

  if (row.kind === "color") {
    return <div className="flex items-center gap-2">{thumb}<span className="text-[11px] text-muted-foreground">{t("photo_color_tab")}</span></div>;
  }

  // Combinação: foto própria (ou a da cor, como reserva).
  const own = row.ownImage;
  const upload = async (file: File) => {
    if (!file.type.startsWith("image/")) { toast.error(t("photo_invalid")); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error(t("photo_too_big")); return; }
    setBusy(true);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `variations/${row.variationId}-${row.sizeId}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("product-images").upload(path, file);
      if (error) throw error;
      onCommit(row, { image: supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl });
    } catch {
      toast.error(t("save_error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <span className={cn(!own && row.image && "opacity-60")} title={!own && row.image ? t("photo_from_color") : undefined}>{thumb}</span>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} />
      <Button type="button" variant="outline" size="sm" className="h-8 px-2.5 text-xs" disabled={busy} onClick={() => ref.current?.click()}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : own ? t("photo_change") : t("photo_add")}
      </Button>
      {own && (
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={t("photo_remove")} onClick={() => onCommit(row, { image: null })}>
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
