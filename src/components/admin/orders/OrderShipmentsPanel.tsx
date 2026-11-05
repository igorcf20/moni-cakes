// =====================================================================================
// Bloco Remessas na página do pedido no Admin (recurso partial_shipments). Sem janelas:
//   lista    cada remessa com itens, estado, transportadora, rastreio e datas; editar, marcar entregue, excluir
//   form     painel na página (InlinePanel) com as quantidades que faltam enviar, estado, transportadora e rastreio
// Quantidades e estado do pedido conferidos no servidor (admin_save_shipment); contas em src/lib/shipments.ts.
// =====================================================================================
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, ExternalLink, Loader2, PackageCheck, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AdminPanel, ConfirmStrip, InlinePanel } from "@/components/admin/shell/AdminPageParts";
import { useMessages } from "@/i18n";
import { adminShipmentsMessages } from "@/i18n/adminShipments";
import { useDeleteShipment, useOrderShipments, useSaveShipment } from "@/hooks/useShipments";
import { CARRIERS, carrierInfo, carrierTrackingUrl } from "@/lib/carriers";
import {
  CLOSED_ORDER_STATUSES, draftErrors, remainingByItem, SHIPMENT_STATUSES, shipmentProgress, type Shipment, type ShipmentStatus,
} from "@/lib/shipments";
import { cn } from "@/lib/utils";

export type ShipmentLine = { id: string; quantity: number; label: string };
type Fmt = { date: (v: string | null | undefined) => string };
type ErrKey = "err_no_items" | "err_too_many" | "err_invalid_item" | "err_order_closed" | "err_feature_off" | "err_unknown";
const KNOWN_ERRORS = ["no_items", "too_many", "invalid_item", "order_closed", "feature_off"];
const errKey = (code: string): ErrKey => (KNOWN_ERRORS.includes(code) ? (`err_${code}` as ErrKey) : "err_unknown");

const STATUS_TONE: Record<ShipmentStatus, string> = {
  preparing: "border-amber-300 bg-amber-50 text-amber-800",
  shipped: "border-sky-300 bg-sky-50 text-sky-800",
  delivered: "border-emerald-300 bg-emerald-50 text-emerald-800",
};

/** Link de rastreio da remessa: o escrito, senão o da transportadora pelo código. */
const shipmentTrackingHref = (s: Pick<Shipment, "tracking_url" | "tracking_code" | "carrier">) =>
  s.tracking_url || (s.tracking_code ? carrierTrackingUrl(s.tracking_code, s.carrier) : null);

export default function OrderShipmentsPanel({
  orderId, orderStatus, lines, defaultCarrier, fmt, onChanged,
}: { orderId: string; orderStatus: string; lines: ShipmentLine[]; defaultCarrier?: string | null; fmt: Fmt; onChanged: () => void }) {
  const { t } = useMessages(adminShipmentsMessages);
  const { data: shipments = [], isLoading } = useOrderShipments(orderId);
  const save = useSaveShipment();
  const del = useDeleteShipment();
  const [editing, setEditing] = useState<Shipment | "new" | null>(null);
  const [removing, setRemoving] = useState<Shipment | null>(null);
  const closed = CLOSED_ORDER_STATUSES.includes(orderStatus);
  const progress = shipmentProgress(lines, shipments);
  const free = remainingByItem(lines, shipments);
  const anyFree = Object.values(free).some((n) => n > 0);
  const labelOf = (id: string) => lines.find((l) => l.id === id)?.label || t("product");

  const fail = (e: unknown) => {
    toast.error(t(errKey((e as Error).message)));
  };
  const markDelivered = async (s: Shipment) => {
    try {
      await save.mutateAsync({ orderId, shipmentId: s.id, items: null, status: "delivered", carrier: s.carrier, trackingCode: s.tracking_code, trackingUrl: s.tracking_url, note: s.note });
      toast.success(t("saved"));
      onChanged();
    } catch (e) { fail(e); }
  };
  const remove = async () => {
    if (!removing) return;
    try {
      await del.mutateAsync({ id: removing.id, orderId });
      toast.success(t("removed"));
      setRemoving(null);
      onChanged();
    } catch (e) { fail(e); }
  };

  return (
    <AdminPanel
      title={t("title")}
      icon={PackageCheck}
      actions={!closed && anyFree && !editing ? (
        <Button type="button" variant="outline" size="sm" onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" aria-hidden="true" />{t("add")}
        </Button>
      ) : undefined}
    >
      <p className="text-sm text-muted-foreground">{t("hint")}</p>

      {progress.total > 0 && (
        <div className="mt-3">
          <div className="flex h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <span className="bg-emerald-500 transition-all duration-200" style={{ width: `${(progress.delivered / progress.total) * 100}%` }} />
            <span className="bg-sky-500 transition-all duration-200" style={{ width: `${((progress.shipped - progress.delivered) / progress.total) * 100}%` }} />
          </div>
          <p className="mt-1.5 text-sm font-medium text-foreground tabular-nums">
            {t("progress", { shipped: progress.shipped, total: progress.total, delivered: progress.delivered })}
          </p>
        </div>
      )}

      {isLoading ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /></p>
      ) : shipments.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{closed ? t("closed") : t("empty")}</p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {shipments.map((s) => {
            const href = shipmentTrackingHref(s);
            const carrier = carrierInfo(s.carrier)?.name ?? s.carrier;
            return (
              <li key={s.id} className="rounded-[14px] border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{t("shipment", { n: s.number })}</span>
                    <span className={cn("rounded-full border px-2 py-0.5 text-xs font-semibold", STATUS_TONE[s.status])}>{t(`st_${s.status}`)}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {s.status !== "delivered" && (
                      <Button type="button" variant="outline" size="sm" disabled={save.isPending} onClick={() => void markDelivered(s)}>
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />{t("mark_delivered")}
                      </Button>
                    )}
                    <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(s)} aria-label={`${t("edit")} ${t("shipment", { n: s.number })}`}>
                      <Pencil className="h-4 w-4" aria-hidden="true" />{t("edit")}
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setRemoving(s)} aria-label={`${t("remove")} ${t("shipment", { n: s.number })}`}>
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
                <ul className="mt-2 space-y-0.5 text-sm">
                  {s.items.map((it) => <li key={it.order_item_id}>{t("item", { qty: it.quantity, name: labelOf(it.order_item_id) })}</li>)}
                </ul>
                <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {carrier && <span>{carrier}</span>}
                  {s.tracking_code && <span className="font-mono">{s.tracking_code}</span>}
                  {href && (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-brand-orange-text hover:underline">
                      {t("track")} <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                  )}
                  {s.shipped_at && <span>{t("shipped_on", { date: fmt.date(s.shipped_at) })}</span>}
                  {s.delivered_at && <span>{t("delivered_on", { date: fmt.date(s.delivered_at) })}</span>}
                </p>
                {s.note && <p className="mt-1 text-xs text-muted-foreground">{s.note}</p>}
                {removing?.id === s.id && (
                  <ConfirmStrip
                    open className="mt-3" title={t("confirm_remove", { n: s.number })} confirmLabel={t("remove")} busy={del.isPending}
                    onConfirm={() => void remove()} onCancel={() => setRemoving(null)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!closed && !anyFree && shipments.length > 0 && !editing && <p className="mt-3 text-xs text-muted-foreground">{t("all_assigned")}</p>}

      {editing && (
        <ShipmentForm
          key={editing === "new" ? "new" : editing.id}
          orderId={orderId}
          lines={lines}
          shipments={shipments}
          shipment={editing === "new" ? null : editing}
          defaultCarrier={defaultCarrier}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); onChanged(); }}
        />
      )}
    </AdminPanel>
  );
}

/* ---------- Formulário (nova remessa ou editar) ---------- */

function ShipmentForm({
  orderId, lines, shipments, shipment, defaultCarrier, onClose, onSaved,
}: {
  orderId: string; lines: ShipmentLine[]; shipments: Shipment[]; shipment: Shipment | null; defaultCarrier?: string | null;
  onClose: () => void; onSaved: () => void;
}) {
  const { t } = useMessages(adminShipmentsMessages);
  const save = useSaveShipment();
  const remaining = useMemo(() => remainingByItem(lines, shipments, shipment?.id), [lines, shipments, shipment?.id]);
  const [qty, setQty] = useState<Record<string, number>>(() => {
    const out: Record<string, number> = {};
    for (const l of lines) out[l.id] = shipment ? shipment.items.find((it) => it.order_item_id === l.id)?.quantity ?? 0 : remaining[l.id] ?? 0;
    return out;
  });
  const [status, setStatus] = useState<ShipmentStatus>(shipment?.status ?? "shipped");
  const known = (c: string | null | undefined) => !!c && CARRIERS.some((x) => x.id === c);
  const [carrier, setCarrier] = useState<string>(() => {
    const c = shipment ? shipment.carrier : defaultCarrier;
    return !c ? "none" : known(c) ? c : "other";
  });
  const [otherCarrier, setOtherCarrier] = useState(shipment?.carrier && !known(shipment.carrier) ? shipment.carrier : "");
  const [code, setCode] = useState(shipment?.tracking_code ?? "");
  const [url, setUrl] = useState(shipment?.tracking_url ?? "");
  const [note, setNote] = useState(shipment?.note ?? "");
  const visible = lines.filter((l) => (remaining[l.id] ?? 0) > 0 || (qty[l.id] ?? 0) > 0);
  const { items, error } = draftErrors(qty, remaining);

  const submit = async () => {
    if (error) { toast.error(t(errKey(error))); return; }
    try {
      await save.mutateAsync({
        orderId, shipmentId: shipment?.id ?? null, items, status,
        carrier: carrier === "none" ? null : carrier === "other" ? otherCarrier.trim() || null : carrier,
        trackingCode: code, trackingUrl: url, note,
      });
      toast.success(t("saved"));
      onSaved();
    } catch (e) {
      toast.error(t(errKey((e as Error).message)));
    }
  };

  return (
    <InlinePanel open className="mt-4" onClose={onClose} title={shipment ? t("edit_title", { n: shipment.number }) : t("new_title")} description={t("form_hint")}>
      <div className="space-y-4">
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium">{t("items")}</legend>
          {visible.map((l) => {
            const max = remaining[l.id] ?? 0;
            return (
              <div key={l.id} className="flex flex-wrap items-center gap-3 rounded-xl border p-2.5">
                <span className="min-w-0 flex-1 text-sm font-medium">{l.label}</span>
                <div className="flex items-center gap-2">
                  <Input
                    type="number" inputMode="numeric" min={0} max={max} value={String(qty[l.id] ?? 0)}
                    aria-label={l.label} className="h-10 w-20 text-center tabular-nums"
                    onChange={(e) => setQty((q) => ({ ...q, [l.id]: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))}
                  />
                  <span className="text-sm text-muted-foreground tabular-nums">{t("of_max", { max })}</span>
                  <Button type="button" variant="ghost" size="sm" disabled={qty[l.id] === max} onClick={() => setQty((q) => ({ ...q, [l.id]: max }))}>{t("all")}</Button>
                </div>
              </div>
            );
          })}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="sh-status">{t("status")}</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as ShipmentStatus)}>
              <SelectTrigger id="sh-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SHIPMENT_STATUSES.map((s) => <SelectItem key={s} value={s}>{t(`st_${s}`)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sh-carrier">{t("carrier")}</Label>
            <Select value={carrier} onValueChange={setCarrier}>
              <SelectTrigger id="sh-carrier"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("carrier_none")}</SelectItem>
                {CARRIERS.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                <SelectItem value="other">{t("carrier_other")}</SelectItem>
              </SelectContent>
            </Select>
            {carrier === "other" && <Input value={otherCarrier} maxLength={80} onChange={(e) => setOtherCarrier(e.target.value)} aria-label={t("carrier_other")} />}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sh-code">{t("tracking")}</Label>
            <Input id="sh-code" value={code} maxLength={200} onChange={(e) => setCode(e.target.value)} className="font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sh-url">{t("tracking_url")}</Label>
            <Input id="sh-url" type="url" value={url} maxLength={1000} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
            <p className="text-xs text-muted-foreground">{t("tracking_url_hint")}</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="sh-note">{t("note")}</Label>
          <Textarea id="sh-note" value={note} maxLength={1000} rows={2} onChange={(e) => setNote(e.target.value)} />
          <p className="text-xs text-muted-foreground">{t("note_hint")}</p>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>{t("cancel")}</Button>
          <Button type="button" onClick={() => void submit()} disabled={save.isPending || !!error}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{t("save")}
          </Button>
        </div>
      </div>
    </InlinePanel>
  );
}
