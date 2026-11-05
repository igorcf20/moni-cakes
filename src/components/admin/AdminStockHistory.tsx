// =====================================================================================
// Admin > Catálogo > Histórico de estoque (recurso stock_history). Sem janelas:
//   Números     entradas, saídas, vendidas e ajustes manuais no período
//   Ajustar     painel na página: produto, parte (cor, tamanho, cor x tamanho), definir ou somar, motivo e nota
//   Lista       cada mudança com antes e depois, motivo, pedido, quem fez e nota; filtros, busca, CSV
//   ?produto=<id> filtra por um produto (link da página de números do produto); &ajustar=1 abre o painel.
// Também exporta ProductStockHistory (bloco da página de números do produto).
// Regras em src/lib/stockHistory.ts; dados em src/hooks/useStockHistory.ts; textos em src/i18n/adminStockHistory.ts.
// =====================================================================================
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowDownRight, ArrowUpRight, Boxes, ChevronRight, ClipboardList, Download, History, Loader2, PackageMinus, PackagePlus, Search,
  Printer, ShoppingBag, SlidersHorizontal, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import AdminHelp from "./AdminHelp";
import { AdminPager, AdminStatCard, FilterChips } from "./AdminListKit";
import { AdminPanel, InlinePanel } from "./shell/AdminPageParts";
import { adminHref } from "./shell/adminSections";
import { useMessages } from "@/i18n";
import { adminStockHistoryMessages } from "@/i18n/adminStockHistory";
import { adminBarcodeStockMessages } from "@/i18n/adminBarcodeStock";
import { useFeature } from "@/hooks/useFeatures";
import { labelsHref } from "@/lib/stockEntries";
import { useAdminFormat } from "@/hooks/useAdminList";
import { useCatalogIndex } from "@/hooks/useSalesStats";
import { useAdjustStock, useStockMovements, useStockSummary, useStockTargets, type StockMovement } from "@/hooks/useStockHistory";
import {
  ADJUST_REASONS, adjustErrorCode, adjustResult, movementTarget, periodSince, reasonsOf, summaryTotals,
  type AdjustMode, type AdjustReason, type ReasonGroup, type StockPeriod, type StockReason,
} from "@/lib/stockHistory";
import { downloadCsv } from "@/lib/csv";
import { cn } from "@/lib/utils";

type T = ReturnType<typeof useMessages<typeof adminStockHistoryMessages["pt-BR"]>>["t"];
const PAGE_SIZE = 25;
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/* ---------- peças ---------- */

function ReasonBadge({ reason, t }: { reason: StockReason; t: T }) {
  const tone = reason === "sale" || reason === "order_edit" ? "bg-sky-50 text-sky-700"
    : reason === "order_restock" || reason === "receive" ? "bg-emerald-50 text-emerald-700"
    : reason === "damage" ? "bg-red-50 text-red-700"
    : reason === "system" ? "bg-muted text-muted-foreground"
    : "bg-amber-50 text-amber-800";
  return <span className={cn("inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold", tone)}>{t(`r_${reason}`)}</span>;
}

function Change({ n }: { n: number }) {
  const up = n > 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5 font-bold tabular-nums", up ? "text-emerald-700" : n < 0 ? "text-red-700" : "text-muted-foreground")}>
      {up ? <ArrowUpRight className="h-4 w-4" aria-hidden="true" /> : n < 0 ? <ArrowDownRight className="h-4 w-4" aria-hidden="true" /> : null}
      {up ? `+${n}` : n}
    </span>
  );
}

/** Uma mudança de estoque (lista do Admin e bloco do produto). */
function MovementRow({ m, t, showProduct = true }: { m: StockMovement; t: T; showProduct?: boolean }) {
  const { dateTime, relative } = useAdminFormat();
  const { t: tb } = useMessages(adminBarcodeStockMessages);
  const target = movementTarget(m);
  return (
    <li className="flex gap-3 p-3 sm:p-4">
      {showProduct && (
        <span className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-muted">
          {m.product_image ? <img src={m.product_image} alt="" loading="lazy" className="h-full w-full object-cover" /> : <Boxes className="m-3 h-6 w-6 text-muted-foreground" aria-hidden="true" />}
        </span>
      )}
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {showProduct && <Link to={adminHref.productStats(m.product_id)} className="min-w-0 break-words font-semibold hover:underline">{m.product_name}</Link>}
          {target && <span className="text-sm text-muted-foreground">{target}</span>}
          <ReasonBadge reason={m.reason} t={t} />
        </div>
        <p className="text-sm text-muted-foreground">
          {t("from_to", { from: m.quantity_before ?? 0, to: m.quantity_after ?? 0 })}
          {m.sku && <> · {t("sku", { sku: m.sku })}</>}
          {m.order_id && <> · <Link to={adminHref.order(m.order_id)} className="font-medium text-foreground hover:underline">{t("order_n", { n: m.order_id.slice(0, 8).toUpperCase() })}</Link></>}
          {m.entry_id && m.entry_number != null && <> · <Link to={`${adminHref.section("stock-entries")}&ver=entrada&id=${m.entry_id}`} className="font-medium text-foreground hover:underline">{tb("entry_n", { n: m.entry_number })}</Link></>}
        </p>
        {m.note && <p className="break-words text-sm">{m.note}</p>}
        <p className="text-xs text-muted-foreground"><time dateTime={m.created_at} title={dateTime(m.created_at)}>{relative(m.created_at)}</time>{m.actor_email ? ` · ${m.actor_email}` : ""}</p>
      </div>
      <div className="shrink-0 pt-0.5 text-right"><Change n={m.change} /></div>
    </li>
  );
}

function PeriodPicker({ value, onChange, t }: { value: StockPeriod; onChange: (p: StockPeriod) => void; t: T }) {
  return (
    <FilterChips<StockPeriod>
      label={t("period")}
      value={value}
      onChange={onChange}
      options={(["7d", "30d", "90d", "365d", "all"] as const).map((p) => ({ value: p, label: t(`p_${p}`) }))}
    />
  );
}

/* ---------- ajustar estoque ---------- */

function AdjustPanel({ open, onClose, initialProduct }: { open: boolean; onClose: () => void; initialProduct: string | null }) {
  const { t } = useMessages(adminStockHistoryMessages);
  const { data: index } = useCatalogIndex();
  const [productId, setProductId] = useState<string | null>(initialProduct);
  const [pq, setPq] = useState("");
  const { data: info, isLoading: loadingTargets } = useStockTargets(productId);
  const [targetKey, setTargetKey] = useState("p");
  const [mode, setMode] = useState<AdjustMode>("add");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState<AdjustReason>("receive");
  const [note, setNote] = useState("");
  const adjust = useAdjustStock();

  useEffect(() => { if (initialProduct) setProductId(initialProduct); }, [initialProduct]);
  useEffect(() => { setTargetKey("p"); }, [productId]);

  const matches = useMemo(() => {
    const needle = norm(pq.trim());
    if (!needle) return [];
    return (index?.products ?? []).filter((p) => norm(p.name).includes(needle) || p.id.includes(needle)).slice(0, 8);
  }, [index, pq]);

  const target = info?.targets.find((x) => x.key === targetKey) ?? info?.targets[0];
  const n = value.trim() === "" ? NaN : Number(value);
  const next = target && Number.isFinite(n) ? adjustResult(mode, target.stock, n) : null;

  const save = async () => {
    if (!productId || !target || next == null) return;
    try {
      const res = await adjust.mutateAsync({ productId, variationId: target.variationId, sizeId: target.sizeId, mode, value: n, reason, note });
      toast.success(t("adjusted", { n: res }));
      setValue(""); setNote("");
    } catch (e) {
      toast.error(t(`err_${adjustErrorCode((e as { message?: string })?.message)}`));
    }
  };

  return (
    <InlinePanel open={open} onClose={onClose} title={t("adjust_title")} description={t("adjust_hint")}>
      <div className="space-y-4">
        {/* Produto */}
        <div className="space-y-2">
          <Label>{t("a_product")}</Label>
          {productId && info ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/40 px-3 py-2">
              <span className="min-w-0 flex-1 break-words font-medium">{info.name}</span>
              <Button size="sm" variant="ghost" onClick={() => { setProductId(null); setPq(""); }}>{t("a_change_product")}</Button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={pq} onChange={(e) => setPq(e.target.value)} placeholder={t("a_product_search")} aria-label={t("a_product_search")} className="pl-9" />
              </div>
              {matches.length > 0 && (
                <ul className="divide-y rounded-xl border">
                  {matches.map((p) => (
                    <li key={p.id}>
                      <button type="button" onClick={() => setProductId(p.id)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted/60">
                        <span className="min-w-0 break-words">{p.name}</span>
                        <span className="shrink-0 text-muted-foreground tabular-nums">{t("in_stock", { n: p.stock_quantity ?? 0 })}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {pq.trim() && !matches.length && <p className="text-sm text-muted-foreground">{t("a_no_product")}</p>}
            </>
          )}
        </div>

        {productId && (loadingTargets ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>
        ) : info && target && (
          <>
            {/* Parte do produto */}
            {info.targets.length > 1 && (
              <div className="space-y-2">
                <Label htmlFor="stock-target">{t("a_target")}</Label>
                <select id="stock-target" value={target.key} onChange={(e) => setTargetKey(e.target.value)}
                  className="h-11 w-full rounded-[14px] border border-input bg-background px-3 text-sm">
                  {info.targets.map((x) => (
                    <option key={x.key} value={x.key}>{(x.label ?? t("a_whole_product")) + " · " + t("in_stock", { n: x.stock ?? 0 })}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">{t("a_target_hint")}</p>
              </div>
            )}

            {/* Quantidade */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("a_mode")}</Label>
                <FilterChips<AdjustMode> label={t("a_mode")} value={mode} onChange={setMode}
                  options={[{ value: "add", label: t("a_mode_add") }, { value: "set", label: t("a_mode_set") }]} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="stock-value">{mode === "add" ? t("a_value_add") : t("a_value_set")}</Label>
                <Input id="stock-value" type="number" inputMode="numeric" step={1} value={value} onChange={(e) => setValue(e.target.value)}
                  placeholder={mode === "add" ? t("a_value_add_ph") : String(target.stock ?? 0)} />
              </div>
            </div>
            <p className={cn("rounded-xl px-3 py-2 text-sm", next == null && value.trim() ? "bg-destructive/5 text-destructive" : "bg-muted/50 text-muted-foreground")}>
              {next != null ? t("a_preview", { from: target.stock ?? 0, to: next }) : value.trim() ? t("err_invalid_value") : t("a_now", { n: target.stock ?? 0 })}
            </p>

            {/* Motivo e nota */}
            <div className="space-y-2">
              <Label>{t("a_reason")}</Label>
              <FilterChips<AdjustReason> label={t("a_reason")} value={reason} onChange={setReason}
                options={ADJUST_REASONS.map((r) => ({ value: r, label: t(`r_${r}`) }))} />
              <p className="text-xs text-muted-foreground">{t(`r_${reason}_hint`)}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="stock-note">{t("a_note")}</Label>
              <Textarea id="stock-note" value={note} onChange={(e) => setNote(e.target.value.slice(0, 500))} placeholder={t("a_note_ph")} rows={2} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={save} disabled={next == null || adjust.isPending}>
                {adjust.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{t("a_save")}
              </Button>
              <Button variant="outline" onClick={onClose}>{t("a_close")}</Button>
            </div>
          </>
        ))}
      </div>
    </InlinePanel>
  );
}

/* ---------- seção do Admin ---------- */

export default function AdminStockHistory() {
  const { t } = useMessages(adminStockHistoryMessages);
  const { dateTime } = useAdminFormat();
  const [params, setParams] = useSearchParams();
  const productId = params.get("produto");
  const [adjustOpen, setAdjustOpen] = useState(params.get("ajustar") === "1");
  const [period, setPeriod] = useState<StockPeriod>("30d");
  const [group, setGroup] = useState<ReasonGroup>("all");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const { data: index } = useCatalogIndex();
  const productName = productId ? index?.products.find((p) => p.id === productId)?.name ?? productId : null;

  useEffect(() => { const h = setTimeout(() => setQ(qInput), 300); return () => clearTimeout(h); }, [qInput]);
  useEffect(() => { setPage(1); }, [period, group, q, productId]);

  const since = useMemo(() => periodSince(period), [period]);
  const filters = { since, reasons: reasonsOf(group), q, productId, page, pageSize: PAGE_SIZE };
  const { data, isLoading, error, isFetching } = useStockMovements(filters);
  const { data: summary = [] } = useStockSummary(since, productId);
  const tot = summaryTotals(summary);
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total ? (page - 1) * PAGE_SIZE + 1 : 0;
  const to = Math.min(page * PAGE_SIZE, total);

  const clearProduct = () => { const p = new URLSearchParams(params); p.delete("produto"); p.delete("ajustar"); setParams(p, { replace: true }); };
  const exportCsv = async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data: rows, error: e } = await (supabase as any).rpc("admin_stock_movements", {
      _since: since, _reasons: reasonsOf(group), _q: q.trim() || null, _product_id: productId, _limit: 500, _offset: 0,
    });
    if (e) { toast.error(t("load_error")); return; }
    downloadCsv("historico-de-estoque", [t("c_date"), t("c_product"), t("c_target"), t("c_sku"), t("c_before"), t("c_after"), t("c_change"), t("c_reason"), t("c_order"), t("c_who"), t("c_note")],
      (rows as StockMovement[]).map((m) => [dateTime(m.created_at), m.product_name, movementTarget(m), m.sku, m.quantity_before, m.quantity_after, m.change, t(`r_${m.reason}`), m.order_id, m.actor_email, m.note]));
  };

  return (
    <div className="space-y-5">
      <AdminHelp id="stock-history" title={t("help_title")} steps={[t("help_1"), t("help_2"), t("help_3")]} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <PeriodPicker value={period} onChange={setPeriod} t={t} />
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setAdjustOpen(true)}><SlidersHorizontal className="mr-1.5 h-4 w-4" strokeWidth={1.8} />{t("adjust")}</Button>
          <Button variant="outline" onClick={exportCsv} disabled={!total}><Download className="mr-1.5 h-4 w-4" strokeWidth={1.8} />CSV</Button>
        </div>
      </div>

      <AdjustPanel open={adjustOpen} onClose={() => setAdjustOpen(false)} initialProduct={productId} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <AdminStatCard icon={PackagePlus} label={t("stat_in")} value={tot.unitsIn} hint={t("stat_in_hint")} tone="success" />
        <AdminStatCard icon={PackageMinus} label={t("stat_out")} value={tot.unitsOut} hint={t("stat_out_hint")} />
        <AdminStatCard icon={ShoppingBag} label={t("stat_sold")} value={tot.sold} hint={t("stat_sold_hint", { n: tot.restocked })} active={group === "sales"} onClick={() => setGroup(group === "sales" ? "all" : "sales")} />
        <AdminStatCard icon={ClipboardList} label={t("stat_manual")} value={tot.manual} hint={t("stat_manual_hint")} active={group === "manual"} onClick={() => setGroup(group === "manual" ? "all" : "manual")} />
      </div>

      <div className="flex flex-col gap-3 rounded-[18px] border bg-card p-4">
        <FilterChips<ReasonGroup>
          label={t("f_label")}
          value={group}
          onChange={setGroup}
          options={(["all", "sales", "restock", "manual", "system"] as const).map((g) => ({ value: g, label: t(`g_${g}`) }))}
        />
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder={t("f_search")} aria-label={t("f_search")} className="pl-9" />
        </div>
        {productId && (
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">{t("f_product")}</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-1 pl-3 pr-1 font-medium">
              <span className="break-words">{productName}</span>
              <button type="button" onClick={clearProduct} aria-label={t("f_product_clear")} className="grid h-6 w-6 place-items-center rounded-full hover:bg-primary/20"><X className="h-3.5 w-3.5" /></button>
            </span>
          </p>
        )}
      </div>

      {isLoading ? (
        <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>
      ) : error ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{t("load_error")}</p>
      ) : !data?.rows.length ? (
        <p className="rounded-[18px] border border-dashed p-10 text-center text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className={cn("divide-y rounded-[18px] border bg-card transition-opacity", isFetching && "opacity-60")}>
          {data.rows.map((m) => <MovementRow key={m.id} m={m} t={t} />)}
        </ul>
      )}
      <AdminPager page={page} pages={pages} total={total} from={from} to={to} onPage={setPage} />
    </div>
  );
}

/* ---------- bloco da página de números do produto ---------- */

export function ProductStockHistory({ productId }: { productId: string }) {
  const { t } = useMessages(adminStockHistoryMessages);
  const { t: tb } = useMessages(adminBarcodeStockMessages);
  const labelsOn = useFeature("barcode_labels");
  const { data, isLoading } = useStockMovements({ since: null, reasons: null, q: "", productId, page: 1, pageSize: 8 });
  // Início fixo enquanto o bloco está aberto (uma data nova a cada desenho pediria os dados sem parar).
  const since30 = useMemo(() => periodSince("30d"), []);
  const { data: summary = [] } = useStockSummary(since30, productId);
  const tot = summaryTotals(summary);
  const base = `${adminHref.section("stock-history")}&produto=${encodeURIComponent(productId)}`;
  return (
    <AdminPanel
      title={t("product_block")}
      icon={History}
      actions={<>
        <Button size="sm" variant="outline" asChild><Link to={`${base}&ajustar=1`}><SlidersHorizontal className="mr-1.5 h-4 w-4" strokeWidth={1.8} />{t("adjust")}</Link></Button>
        {labelsOn && <Button size="sm" variant="outline" asChild><Link to={labelsHref({ product: productId })}><Printer className="mr-1.5 h-4 w-4" strokeWidth={1.8} />{tb("print_labels")}</Link></Button>}
        <Button size="sm" variant="ghost" asChild><Link to={base}>{t("see_all")}<ChevronRight className="ml-1 h-4 w-4" /></Link></Button>
      </>}
    >
      <p className="mb-2 text-sm text-muted-foreground">{t("product_block_30d", { in: tot.unitsIn, out: tot.unitsOut })}</p>
      {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : !data?.rows.length ? (
        <p className="text-sm text-muted-foreground">{t("product_empty")}</p>
      ) : (
        <ul className="-mx-3 divide-y sm:-mx-4">{data.rows.map((m) => <MovementRow key={m.id} m={m} t={t} showProduct={false} />)}</ul>
      )}
    </AdminPanel>
  );
}
