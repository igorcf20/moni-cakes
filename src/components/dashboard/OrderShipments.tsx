// Remessas de um pedido na conta do cliente (recurso partial_shipments): cada parte com itens, estado, rastreio e datas.
// Some quando o pedido não tem remessas. Leitura pela RLS (só os pedidos do próprio cliente).
import { ExternalLink, PackageCheck } from "lucide-react";
import { useMessages } from "@/i18n";
import { shipmentsMessages } from "@/i18n/shipments";
import { useFeature } from "@/hooks/useFeatures";
import { useOrderShipments } from "@/hooks/useShipments";
import { carrierInfo, carrierTrackingUrl } from "@/lib/carriers";
import { shipmentProgress, type OrderLine } from "@/lib/shipments";
import { cn } from "@/lib/utils";

const TONE = {
  preparing: "bg-amber-50 text-amber-800 border-amber-200",
  shipped: "bg-sky-50 text-sky-800 border-sky-200",
  delivered: "bg-emerald-50 text-emerald-800 border-emerald-200",
} as const;

export default function OrderShipments({ orderId, lines, className }: { orderId: string; lines: Array<OrderLine & { label: string }>; className?: string }) {
  const { t, locale } = useMessages(shipmentsMessages);
  const on = useFeature("partial_shipments");
  const { data: shipments = [] } = useOrderShipments(orderId, on);
  if (!on || shipments.length === 0) return null;
  const p = shipmentProgress(lines, shipments);
  const day = (v: string) => new Date(v).toLocaleDateString(locale, { day: "numeric", month: "short" });
  const label = (id: string) => lines.find((l) => l.id === id)?.label || t("product");

  return (
    <section className={cn("rounded-[16px] border border-brand-card-border bg-white p-4", className)}>
      <h4 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        <PackageCheck className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />{t("title")}
      </h4>
      <p className="mt-2 text-[14px] font-medium">
        {p.state === "delivered" ? t("progress_delivered") : p.state === "shipped" ? t("progress_done") : t("progress", { shipped: p.shipped, total: p.total })}
      </p>
      <ol className="mt-3 space-y-2.5">
        {shipments.map((s) => {
          const href = s.tracking_url || (s.tracking_code ? carrierTrackingUrl(s.tracking_code, s.carrier) : null);
          return (
            <li key={s.id} className="rounded-xl border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[14px] font-semibold">{t("shipment", { n: s.number })}</span>
                <span className={cn("rounded-full border px-2 py-0.5 text-xs font-semibold", TONE[s.status])}>{t(`st_${s.status}`)}</span>
              </div>
              <ul className="mt-1.5 text-[14px] text-foreground/90">
                {s.items.map((it) => <li key={it.order_item_id}>{t("item", { qty: it.quantity, name: label(it.order_item_id) })}</li>)}
              </ul>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {s.carrier && <span>{carrierInfo(s.carrier)?.name ?? s.carrier}</span>}
                {s.tracking_code && <span className="font-mono">{t("code", { code: s.tracking_code })}</span>}
                {s.delivered_at ? <span>{t("delivered_on", { date: day(s.delivered_at) })}</span> : s.shipped_at ? <span>{t("shipped_on", { date: day(s.shipped_at) })}</span> : null}
              </p>
              {s.note && <p className="mt-1 text-xs text-muted-foreground">{s.note}</p>}
              {href && (
                <a href={href} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-9 items-center gap-1 text-[14px] font-semibold text-brand-orange-text hover:underline">
                  {t("track")} <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
