// Página de impressão (Admin > Impressão de pedidos, ?ver=imprimir&id=<ids>&doc=<sheet|label|declaration>[&de=pedido|pedidos][&auto=1]).
// Mostra a prévia do documento dos pedidos escolhidos, troca entre folha, etiqueta e declaração, imprime pelo navegador
// (iframe, sem janela nova) e regista a impressão (order_prints), o que tira o pedido da fila.
// auto=1 (impressão automática da fila): abre a impressão sozinha e volta à fila depois.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, Info, Loader2, Printer, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import AdminSubpage, { useAdminPage } from "../AdminSubpage";
import HelpTip from "../HelpTip";
import { adminHref } from "../shell/adminSections";
import PrintFrame, { type PrintFrameHandle } from "./PrintFrame";
import { useMessages } from "@/i18n";
import { orderPrintMessages, type OrderPrintKey } from "@/i18n/orderPrint";
import { useMarkPrinted, useOrderPrintSettings, usePrintContext, usePrintOrders } from "@/hooks/useOrderPrint";
import { PRINT_DOCS, renderPrintDocument, type PrintDoc } from "@/lib/orderPrint";
import { cn } from "@/lib/utils";

const TAB_OF: Record<PrintDoc, string> = { sheet: "folha", label: "etiqueta", declaration: "declaracao" };

export default function PrintPage() {
  const { t: tr } = useMessages(orderPrintMessages);
  const t = tr as (k: OrderPrintKey, v?: Record<string, string | number>) => string;
  const page = useAdminPage();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const ids = useMemo(() => (page.id ?? "").split(",").map((x) => x.trim()).filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 200), [page.id]);
  const doc: PrintDoc = (PRINT_DOCS as readonly string[]).includes(params.get("doc") ?? "") ? (params.get("doc") as PrintDoc) : "sheet";
  const from = params.get("de");
  const auto = params.get("auto") === "1";

  const { data: settings, isLoading: loadingSettings } = useOrderPrintSettings();
  const { orders, isLoading } = usePrintOrders(ids);
  const ctx = usePrintContext(settings);
  const mark = useMarkPrinted();
  const frame = useRef<PrintFrameHandle>(null);
  const [markAfter, setMarkAfter] = useState(true);
  useEffect(() => { if (settings) setMarkAfter(settings.queue.mark_on_print); }, [settings]);

  const html = useMemo(() => (settings && orders.length ? renderPrintDocument(doc, orders, settings, ctx) : ""), [doc, orders, settings, ctx]);

  const back = () => {
    if (from === "pedido" && ids[0]) navigate(adminHref.order(ids[0]));
    else if (from === "pedidos") navigate(adminHref.section("orders"));
    else page.close();
  };

  const doPrint = () => {
    const ok = frame.current?.print() ?? false;
    if (!ok) { toast.error(t("print_error")); return; }
    toast.success(t("print_done"));
    if (markAfter && settings) {
      mark.mutate({ ids: orders.map((o) => o.id), kind: doc, advance: settings.queue.advance_to_preparing }, {
        onSuccess: (r) => {
          toast.success(t("print_marked"));
          if (r.advanced) toast.success(t("print_advanced", { n: r.advanced }));
          if (auto) page.close();
        },
        onError: () => toast.error(t("save_error")),
      });
    } else if (auto) page.close();
  };

  // Impressão automática: abre a impressão quando a prévia termina de carregar (uma vez).
  const autoDone = useRef(false);
  const onReady = () => {
    if (!auto || autoDone.current) return;
    autoDone.current = true;
    window.setTimeout(doPrint, 400);
  };

  const setDoc = (d: PrintDoc) => {
    const next = new URLSearchParams(params);
    next.set("doc", d);
    next.delete("auto");
    setParams(next, { replace: true });
  };

  const paper = settings
    ? doc === "label" ? t(`size_${settings.label.size}` as OrderPrintKey) : doc === "sheet" ? t(`paper_${settings.sheet.paper}` as OrderPrintKey) : "A4"
    : "";
  const tip = doc === "sheet" ? t("print_tip_sheet", { paper }) : doc === "label" ? t("print_tip_label", { paper }) : t("print_tip_declaration");
  const noAddress = doc !== "sheet" ? orders.filter((o) => !o.pickup && !o.shipping).length : 0;
  const title = t("print_title", { doc: t(`doc_name_${doc}` as OrderPrintKey).toLowerCase() });

  return (
    <AdminSubpage
      title={title}
      subtitle={orders.length ? `${t("print_sub", { n: orders.length })} · ${orders.map((o) => `#${o.code}`).slice(0, 6).join(", ")}${orders.length > 6 ? "..." : ""}` : undefined}
      backLabel={t("print_back")}
      onBack={back}
      actions={
        <Button onClick={doPrint} disabled={!html} className="min-w-36">
          <Printer className="mr-1.5 h-4 w-4" aria-hidden="true" />{t("print_button")}
        </Button>
      }
    >
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("model_paper")}>
        {PRINT_DOCS.map((d) => (
          <button key={d} type="button" onClick={() => setDoc(d)} aria-pressed={doc === d}
            className={cn("inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-medium transition-colors duration-150",
              doc === d ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-foreground/30")}>
            {t(`doc_name_${d}` as OrderPrintKey)}
          </button>
        ))}
        <Link to={`${adminHref.section("order-printing")}&aba=${TAB_OF[doc]}`} className="ml-auto inline-flex min-h-10 items-center gap-1.5 text-sm text-brand-orange-text hover:underline">
          <Settings2 className="h-4 w-4" aria-hidden="true" />{t("print_model")}
        </Link>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          {isLoading || loadingSettings ? (
            <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{t("loading")}</p>
          ) : !orders.length ? (
            <p className="rounded-[18px] border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">{t("print_none")}</p>
          ) : (
            <PrintFrame ref={frame} html={html} title={title} onReady={onReady} />
          )}
        </div>
        <aside className="space-y-3 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-[18px] border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Label htmlFor="print-mark" className="flex items-center text-sm font-semibold">{t("print_mark")}<HelpTip label={t("help")} text={t("print_mark_d")} /></Label>
                <p className="text-xs text-muted-foreground">{t("print_mark_d")}</p>
              </div>
              <Switch id="print-mark" checked={markAfter} onCheckedChange={setMarkAfter} className="mt-0.5 shrink-0" />
            </div>
            <Button onClick={doPrint} disabled={!html} className="mt-4 w-full">
              {mark.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : <Printer className="mr-1.5 h-4 w-4" aria-hidden="true" />}{t("print_button")}
            </Button>
          </div>
          <p className="flex items-start gap-2 rounded-[14px] bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />{tip}
          </p>
          {noAddress > 0 && (
            <p className="flex items-start gap-2 rounded-[14px] bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />{t("print_without_address", { n: noAddress })}
            </p>
          )}
        </aside>
      </div>
    </AdminSubpage>
  );
}
