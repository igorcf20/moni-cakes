// Página do pedido no Admin, bloco Documentos para imprimir: folha do pedido, etiqueta de envio e declaração de
// conteúdo (página de impressão de Admin > Impressão de pedidos) e quando cada um foi impresso pela última vez.
import { Link } from "react-router-dom";
import { CheckCircle2, Circle, FileText, Printer, ScrollText, Settings2, Sticker } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMessages } from "@/i18n";
import { orderPrintMessages, type OrderPrintKey } from "@/i18n/orderPrint";
import { useAdminFormat } from "@/hooks/useAdminList";
import { useOrderPrints } from "@/hooks/useOrderPrint";
import { PRINT_DOCS, type PrintDoc } from "@/lib/orderPrint";
import { adminHref } from "../shell/adminSections";
import { printHref } from "./printHref";

const ICON = { sheet: FileText, label: Sticker, declaration: ScrollText } as const;

export default function OrderPrintButtons({ orderId }: { orderId: string }) {
  const { t: tr } = useMessages(orderPrintMessages);
  const t = tr as (k: OrderPrintKey, v?: Record<string, string | number>) => string;
  const fmt = useAdminFormat();
  const { data: prints = [] } = useOrderPrints([orderId]);
  const last = (d: PrintDoc) => prints.find((p) => p.kind === d)?.printed_at ?? null;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {PRINT_DOCS.map((d) => {
          const Icon = ICON[d];
          return (
            <Button key={d} variant={d === "sheet" ? "default" : "outline"} size="sm" asChild>
              <Link to={printHref([orderId], d, "pedido")}><Icon className="h-4 w-4" aria-hidden="true" />{t(`doc_name_${d}` as OrderPrintKey)}</Link>
            </Button>
          );
        })}
      </div>
      <ul className="space-y-1 text-xs text-muted-foreground">
        {PRINT_DOCS.map((d) => {
          const at = last(d);
          const name = t(`doc_short_${d}` as OrderPrintKey);
          return (
            <li key={d} className="flex items-center gap-1.5">
              {at ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" /> : <Circle className="h-3.5 w-3.5" aria-hidden="true" />}
              {at ? t("op_printed", { doc: name, date: fmt.dateTime(at) }) : t("op_not_printed", { doc: name })}
            </li>
          );
        })}
      </ul>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1"><Printer className="h-3.5 w-3.5" aria-hidden="true" />{t("op_documents_hint")}</span>
        <Link to={`${adminHref.section("order-printing")}&aba=folha`} className="inline-flex items-center gap-1 text-brand-orange-text hover:underline">
          <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />{t("op_configure")}
        </Link>
      </p>
    </div>
  );
}
