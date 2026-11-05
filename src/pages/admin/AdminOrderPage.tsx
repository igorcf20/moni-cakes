// =====================================================================================
// Página do pedido no Admin: /admin/pedidos/<id> (antes era uma linha que abria por baixo na lista, mais a
// janela Editar). Tudo o que se faz com um pedido fica aqui, numa página, dentro da moldura do painel:
//   cabeçalho      número, data, estados, voltar à lista
//   próximo passo  botão de um clique (Enviar abre o painel do rastreio na própria página)
//   coluna larga   itens e totais, arquivos de impressão, comprovante, cancelamento e reembolso, documento
//                  fiscal, fatura FIZ (só Portugal), notas e mensagens ao cliente (OrderNotesPanel), devoluções
//                  (OrderReturnsPanel), histórico e alterações no Admin (EntityActivity, recurso activity_log)
//   coluna lateral atualizar o pedido (estado, pagamento, rastreio, notas), cliente, entrega, documentos para
//                  imprimir (OrderPrintButtons, recurso order_printing), arquivar e apagar (com confirmação na página)
//   Editar itens  troca a lista de itens pelo OrderItemsEditor na própria página (antes do envio)
// Textos em src/i18n/adminPages.ts; blocos em src/i18n/adminOrderBlocks.ts; edição de itens em src/i18n/adminOrderForm.ts.
// =====================================================================================
import { RentalChip } from "@/components/product/RentalChip";
import { PreorderChip } from "@/components/product/PreorderInfo";
import { orderLinePreorder } from "@/lib/preorders";
import { useEffect, useState } from "react";
import { giftCodeTail } from "@/lib/giftCards";
import { giftCardsMessages } from "@/i18n/giftCards";
import { adminVariantsMessages } from "@/i18n/adminVariants";
import { rewardPointsMessages } from "@/i18n/rewardPoints";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Archive, ArchiveRestore, ClipboardList, ExternalLink, CalendarClock, History, ListChecks, Loader2, Mail, MapPin, Package, Phone, Printer,
  Pencil, Receipt, Save, Trash2, Truck, User,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { STORE_DEFAULTS } from "@/config/store";
import { useUpdateOrderStatus, orderStatusConfig, type Order } from "@/hooks/useOrders";
import {
  getOrderStatusStyle, getPaymentStatusStyle, orderStatusLabel, paymentMethodLabel, paymentStatusLabel,
} from "@/lib/orderStatusStyles";
import { addressCountryCode } from "@/lib/addressFormats";
import { resolveTrackingUrl, isTrackingUrl, trackingCarrier } from "@/utils/tracking";
import { useAdminFormat } from "@/hooks/useAdminList";
import { useAdminCustomers, useAdminOrder } from "@/hooks/useAdminRecords";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import AdminShell from "@/components/admin/shell/AdminShell";
import { AdminPageHeader, AdminPanel, InlineConfirm } from "@/components/admin/shell/AdminPageParts";
import { adminHref } from "@/components/admin/shell/adminSections";
import OrderNextStep from "@/components/admin/orders/OrderNextStep";
import OrderItemsEditor, { canEditOrderItems } from "@/components/admin/orders/OrderItemsEditor";
import OrderNotesPanel from "@/components/admin/orders/OrderNotesPanel";
import OrderReturnsPanel from "@/components/admin/orders/OrderReturnsPanel";
import OrderShipmentsPanel from "@/components/admin/orders/OrderShipmentsPanel";
import OrderWarehousesPanel from "@/components/admin/orders/OrderWarehousesPanel";
import { EntityActivity } from "@/components/admin/AdminActivityLog";
import { useFeature } from "@/hooks/useFeatures";
import { adminOrderFormMessages } from "@/i18n/adminOrderForm";
import { AdminOrderComplianceBlock, AdminOrderFiscalDocBlock, AdminOrderInvoiceBlock } from "@/components/admin/orders/OrderBlocks";
import OrderPrintButtons from "@/components/admin/orderPrint/OrderPrintButtons";
import PrintWorkOrder from "@/components/admin/PrintWorkOrder";
import OrderDesignsList from "@/components/admin/OrderDesignsList";
import AdminPaymentProof from "@/components/admin/AdminPaymentProof";
import AdminPaymentProofUpload from "@/components/admin/AdminPaymentProofUpload";
import CustomizationAreaFiles from "@/components/customizer/CustomizationAreaFiles";
import { useMessages } from "@/i18n";
import { adminPagesMessages } from "@/i18n/adminPages";
import { checkoutFieldsMessages } from "@/i18n/checkoutFields";
import { deliveryDatesMessages } from "@/i18n/deliveryDates";
import { formatDay, isLate, localNow } from "@/lib/deliveryDates";
import OrderCheckoutFields from "@/components/checkout/OrderCheckoutFields";

const PAYMENT_STATUSES = ["pending", "paid", "failed", "refunded"] as const;

export default function AdminOrderPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useMessages(adminPagesMessages);
  const fmt = useAdminFormat();
  const { data: order, isLoading, refetch } = useAdminOrder(id);

  const back = { to: adminHref.section("orders"), label: t("back_orders") };

  return (
    <AdminShell active="orders">
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-96 w-full" />
        </div>
      ) : !order ? (
        <>
          <AdminPageHeader back={back} title={t("order_not_found")} />
          <p className="text-muted-foreground">{t("order_not_found_hint")}</p>
        </>
      ) : (
        <OrderView
          order={order}
          fmt={fmt}
          startShipping={params.get("enviar") === "1"}
          onChanged={() => { void refetch(); void queryClient.invalidateQueries({ queryKey: ["admin-attention"] }); }}
          onDeleted={() => navigate(back.to)}
          back={back}
        />
      )}
    </AdminShell>
  );
}

function OrderView({
  order, fmt, startShipping, onChanged, onDeleted, back,
}: {
  order: Order & Record<string, any>;
  fmt: ReturnType<typeof useAdminFormat>;
  startShipping: boolean;
  onChanged: () => void;
  onDeleted: () => void;
  back: { to: string; label: string };
}) {
  const { t } = useMessages(adminPagesMessages);
  const { t: tf } = useMessages(adminOrderFormMessages);
  const [editingItems, setEditingItems] = useState(false);
  const activityOn = useFeature("activity_log");
  const shipmentsOn = useFeature("partial_shipments");
  const printingOn = useFeature("order_printing");
  const updateStatus = useUpdateOrderStatus();
  const short = order.id.slice(0, 8);

  // Cliente: perfil (conta) ou dados de convidado; e-mail da conta vem da RPC só de administradores.
  const { data: profile } = useQuery({
    queryKey: ["admin-order-profile", order.user_id],
    enabled: !!order.user_id,
    queryFn: async () => {
      const { data } = await supabase.from("user_profiles").select("user_id, full_name, phone, tax_id").eq("user_id", order.user_id!).maybeSingle();
      return data as any;
    },
  });
  const { data: customers = [] } = useAdminCustomers();
  const { data: storeSettings = [] } = useQuery({
    queryKey: ["storeSettings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("store_settings").select("*");
      if (error) throw error;
      return data;
    },
  });
  const { data: history = [] } = useQuery({
    queryKey: ["allOrders", "history", order.id],
    queryFn: async () => {
      const { data } = await supabase.from("order_status_history").select("id, status, notes, created_at").eq("order_id", order.id).order("created_at", { ascending: false });
      return (data || []) as { id: string; status: string; notes: string | null; created_at: string }[];
    },
  });

  const storeInfo = ((storeSettings as any[]).find((s) => s.key === "store_info")?.value as any) || {};
  const addr = (order.shipping_address as any) || null;
  const email = (order.user_id ? customers.find((c) => c.user_id === order.user_id)?.email : null) || order.guest_email || "";
  const name = profile?.full_name?.trim() || order.guest_name?.trim() || addr?.recipient_name || t("no_name");
  const phone = profile?.phone || order.guest_phone || "";
  const taxId = (order.billing_address as any)?.tax_id || (order.billing_address as any)?.nif || addr?.tax_id || addr?.nif || profile?.tax_id || "";
  const country = addressCountryCode(addr?.country_code || addr?.country, "");
  const wa = phone.replace(/\D/g, "").length >= 10 ? `https://wa.me/${phone.replace(/\D/g, "")}` : null;
  const forPrint = {
    ...order,
    guest_name: name,
    guest_phone: phone,
    shipping_address: addr ? { ...addr, name: addr.recipient_name || name } : addr,
  } as Order;

  // ---- Atualizar o pedido (no lugar da antiga janela Editar) ----
  const [status, setStatus] = useState(order.status);
  const [payment, setPayment] = useState(order.payment_status || "pending");
  const [tracking, setTracking] = useState(order.tracking_number || "");
  const [notes, setNotes] = useState(order.notes || "");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setStatus(order.status);
    setPayment(order.payment_status || "pending");
    setTracking(order.tracking_number || "");
    setNotes(order.notes || "");
  }, [order.status, order.payment_status, order.tracking_number, order.notes]);
  const dirty = status !== order.status || payment !== (order.payment_status || "pending") ||
    tracking !== (order.tracking_number || "") || notes !== (order.notes || "");

  const save = async () => {
    setSaving(true);
    try {
      // Rastreio e notas internas: gravados direto (as notas não vão para o cliente).
      if (tracking !== (order.tracking_number || "") || notes !== (order.notes || "")) {
        const { error } = await supabase.from("orders").update({ tracking_number: tracking.trim() || null, notes: notes.trim() || null }).eq("id", order.id);
        if (error) throw error;
      }
      if (status !== order.status) {
        await updateStatus.mutateAsync({ orderId: order.id, status, trackingNumber: tracking.trim() || undefined });
      }
      if (payment !== (order.payment_status || "pending")) {
        const { error } = await (supabase as any).rpc("admin_set_payment_status", { _order_id: order.id, _payment_status: payment, _note: null });
        if (error) throw error;
      }
      toast.success(t("order_saved"));
      onChanged();
    } catch (e: any) {
      toast.error(t("order_save_error"), { description: e?.message });
    } finally {
      setSaving(false);
    }
  };

  // ---- Arquivar e apagar ----
  const [busy, setBusy] = useState(false);
  const archive = async () => {
    setBusy(true);
    const { error } = await supabase.from("orders").update({ archived: !order.archived } as any).eq("id", order.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(order.archived ? t("order_restored") : t("order_archived"));
    onChanged();
  };
  const remove = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.functions.invoke("delete-order", { body: { order_ids: [order.id] } });
      if (error) throw error;
      toast.success(t("order_deleted"));
      onDeleted();
    } catch (e: any) {
      toast.error(e?.message || t("order_delete_error"));
    } finally {
      setBusy(false);
    }
  };

  // ---- Totais ----
  const items = (order.order_items || []) as any[];
  const itemsTotal = items.reduce((s, i) => s + Number(i.price) * Number(i.quantity), 0);
  const shipping = Number(order.shipping_cost || 0);
  const discount = Number(order.discount_amount || 0);
  const payDiscount = Number(order.payment_discount || 0);
  const { t: tg } = useMessages(giftCardsMessages);
  const { t: tp } = useMessages(rewardPointsMessages);
  const { t: tv } = useMessages(adminVariantsMessages);
  const { t: tcf } = useMessages(checkoutFieldsMessages);
  const { t: tdd } = useMessages(deliveryDatesMessages);
  // Prazos e entrega: "enviar até" gravado no pedido (create-order); atrasado se ainda não saiu.
  const shipBy: string | null = (order as any).estimated_ship_by ?? null;
  const today = localNow(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC").date;
  const late = isLate(shipBy, order.status, today);
  const arriveFrom: string | null = (order as any).estimated_delivery_from ?? null;
  const arriveTo: string | null = (order as any).estimated_delivery_to ?? null;
  // Campos extra do checkout (Admin > Campos do checkout): já estão no total, com o imposto à parte.
  const extrasNet = Number((order as any).extras_amount || 0);
  const extrasVat = Number((order as any).extras_vat || 0);
  const vat = (order.vat_total != null ? Number(order.vat_total) : 0) + extrasVat;
  const hasPrintFiles = !!order.has_customizable_items || items.some((i) => i.design_data?.customization || i.design_data?.planos);

  // Pedido com forma de envio (Admin > Frete e entrega): a transportadora dela manda no link de rastreio.
  const shipCarrier = order.shipping_details?.carrier ?? null;
  const shipName = order.shipping_details?.name || order.delivery_methods?.name || "";
  const trackingUrl = order.tracking_number ? resolveTrackingUrl(order.tracking_number, { country, carrier: shipCarrier }) : null;
  const carrier = order.tracking_number ? trackingCarrier(order.tracking_number, { country, carrier: shipCarrier }) : null;

  return (
    <>
      <AdminPageHeader
        back={back}
        title={t("order_title", { id: short })}
        subtitle={`${fmt.dateTime(order.created_at)} · ${paymentMethodLabel(order.payment_method, fmt.locale)}`}
        badges={
          <>
            <Badge className={`border ${getOrderStatusStyle(order.status).badge}`}>{orderStatusLabel(order.status, fmt.locale)}</Badge>
            <Badge className={`border ${getPaymentStatusStyle(order.payment_status || "pending").badge}`}>{paymentStatusLabel(order.payment_status || "pending", fmt.locale)}</Badge>
            {order.cancellation_status === "requested" && <Badge variant="outline" className="border-amber-500/60 bg-amber-50 text-amber-800">{t("flag_cancel")}</Badge>}
            {order.archived && <Badge variant="outline"><Archive className="h-3 w-3 mr-1" aria-hidden="true" />{t("flag_archived")}</Badge>}
            {shipBy && !["shipped", "delivered", "cancelled", "refunded"].includes(order.status) && (
              <Badge variant="outline" className={late ? "border-destructive/50 bg-destructive/10 text-destructive" : shipBy === today ? "border-amber-500/60 bg-amber-50 text-amber-800" : ""}>
                <CalendarClock className="mr-1 h-3 w-3" aria-hidden="true" />
                {late ? tdd("admin_late", { date: formatDay(shipBy, fmt.locale) }) : shipBy === today ? tdd("admin_today") : tdd("admin_ship_by", { date: formatDay(shipBy, fmt.locale) })}
              </Badge>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        {/* Coluna larga */}
        <div className="space-y-5 xl:col-span-2 min-w-0">
          <AdminPanel title={t("next_step")} icon={Truck}>
            <div className="flex flex-wrap items-center gap-3">
              <OrderNextStep order={order} mode="page" startShipping={startShipping} onDone={onChanged} className="min-h-10" />
              {!["pending", "awaiting_payment", "paid", "preparing", "shipped", "ready_for_pickup"].includes(order.status) || order.cancellation_status === "requested"
                ? <p className="text-sm text-muted-foreground">{order.cancellation_status === "requested" ? t("next_step_cancel") : t("next_step_none")}</p>
                : <p className="text-sm text-muted-foreground">{t("next_step_hint")}</p>}
            </div>
            {arriveFrom && arriveTo && !["delivered", "cancelled", "refunded"].includes(order.status) && (
              <p className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
                <CalendarClock className="h-4 w-4 shrink-0" aria-hidden="true" />
                {tdd("admin_arrives", { from: formatDay(arriveFrom, fmt.locale, false), to: formatDay(arriveTo, fmt.locale, false) })}
              </p>
            )}
          </AdminPanel>

          <AdminPanel
            title={t("items_title", { n: items.length })}
            icon={Package}
            actions={!editingItems && canEditOrderItems(order as any) ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setEditingItems(true)}>
                <Pencil className="h-4 w-4" aria-hidden="true" />{tf("edit_items")}
              </Button>
            ) : undefined}
          >
            {editingItems ? (
              <OrderItemsEditor order={order} onCancel={() => setEditingItems(false)} onSaved={() => { setEditingItems(false); onChanged(); }} />
            ) : (<>
            <ul className="divide-y rounded-[14px] border">
              {items.map((item) => {
                const label = item.products?.name || item.custom_name || item.design_data?.product_name || t("product");
                return (
                  <li key={item.id} className="flex items-start gap-3 p-3">
                    {item.products?.image
                      ? <img src={item.products.image} alt="" className="h-14 w-14 shrink-0 rounded-xl border object-cover bg-muted" />
                      : <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl border bg-muted"><Package className="h-5 w-5 text-muted-foreground" aria-hidden="true" /></span>}
                    <div className="min-w-0 flex-1">
                      {item.product_id
                        ? <Link to={adminHref.product(item.product_id)} className="font-medium text-foreground hover:underline">{label}</Link>
                        : <p className="font-medium text-foreground">{label}</p>}
                      {(() => {
                        // Cor e tamanho escolhidos e o código vendido (order_items.sku, gravado pelo servidor).
                        const opts = [item.design_data?.variation, typeof item.design_data?.size === "string" ? item.design_data.size : null]
                          .filter((v) => typeof v === "string" && v.trim()).join(" / ");
                        if (!opts && !item.sku) return null;
                        return (
                          <p className="text-sm text-muted-foreground">
                            {opts}
                            {opts && item.sku ? " · " : ""}
                            {item.sku && <>{tv("csv_sku")}: <span className="font-mono">{item.sku}</span></>}
                          </p>
                        );
                      })()}
                      <p className="text-sm text-muted-foreground tabular-nums">{t("qty_price", { n: item.quantity, price: fmt.money(item.price) })}</p>
                      {item.design_data?.rental && typeof item.design_data.rental === "object" && <ul className="mt-1 flex flex-wrap gap-1.5"><RentalChip rental={item.design_data.rental} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] leading-none" /></ul>}
                      {orderLinePreorder(item.design_data) && <p className="mt-1"><PreorderChip releaseDate={orderLinePreorder(item.design_data)!.release_date} /></p>}
                      <CustomizationAreaFiles areas={item.design_data?.customization?.areas} compact />
                    </div>
                    <span className="font-semibold tabular-nums whitespace-nowrap">{fmt.money(Number(item.price) * Number(item.quantity))}</span>
                  </li>
                );
              })}
            </ul>
            <dl className="mt-4 ml-auto max-w-sm space-y-1.5 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-muted-foreground">{t("subtotal")}</dt><dd className="tabular-nums">{fmt.money(itemsTotal)}</dd></div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{t("shipping")}{shipName ? ` (${shipName})` : ""}</dt>
                <dd className="tabular-nums">{shipping ? fmt.money(shipping) : t("free")}</dd>
              </div>
              {extrasNet > 0 && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{tcf("summary")}</dt>
                  <dd className="tabular-nums">{fmt.money(extrasNet)}</dd>
                </div>
              )}
              {discount > 0 && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{t("discount")}{order.coupon_code ? ` (${order.coupon_code})` : ""}</dt>
                  <dd className="tabular-nums">-{fmt.money(discount)}</dd>
                </div>
              )}
              {payDiscount > 0 && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{t("payment_discount")}</dt>
                  <dd className="tabular-nums">-{fmt.money(payDiscount)}</dd>
                </div>
              )}
              {Number(order.reward_points_amount || 0) > 0 && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{tp("co_summary", { points: order.reward_points_used })}</dt>
                  <dd className="tabular-nums">-{fmt.money(order.reward_points_amount)}</dd>
                </div>
              )}
              {Number(order.gift_card_amount || 0) > 0 && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{tg("summary", { tail: giftCodeTail(String(order.gift_card_code || "")) })}</dt>
                  <dd className="tabular-nums">-{fmt.money(order.gift_card_amount)}</dd>
                </div>
              )}
              {vat > 0 && <div className="flex justify-between gap-4"><dt className="text-muted-foreground">{t("taxes_included")}</dt><dd className="tabular-nums">{fmt.money(vat)}</dd></div>}
              <div className="flex justify-between gap-4 border-t pt-2 text-base font-bold"><dt>{t("total")}</dt><dd className="tabular-nums">{fmt.money(order.total)}</dd></div>
            </dl>
            </>)}
          </AdminPanel>

          {/* Remessas (Envios parciais): o pedido sai em várias partes, cada uma com rastreio */}
          {shipmentsOn && (
            <OrderShipmentsPanel
              orderId={order.id}
              orderStatus={order.status}
              lines={items.map((item) => ({ id: item.id, quantity: Number(item.quantity) || 0, label: item.products?.name || item.custom_name || item.design_data?.product_name || t("product") }))}
              defaultCarrier={shipCarrier}
              fmt={fmt}
              onChanged={onChanged}
            />
          )}

          {/* Armazéns (Vários armazéns): de onde saiu cada item */}
          <OrderWarehousesPanel orderId={order.id} />

          {Array.isArray((order as any).checkout_fields) && (order as any).checkout_fields.length > 0 && (
            <AdminPanel title={tcf("order_title")} icon={ListChecks}>
              <OrderCheckoutFields value={(order as any).checkout_fields} money={fmt.money} title={false} />
            </AdminPanel>
          )}

          {hasPrintFiles && (
            <AdminPanel title={t("print_files")} icon={Printer}>
              <OrderDesignsList orderId={order.id} items={items} />
            </AdminPanel>
          )}

          {/* Comprovante: só quando há um ou quando o pagamento ainda não foi confirmado */}
          {(order.payment_proof_url || order.payment_status !== "paid") && (
            <AdminPanel title={t("payment_proof")} icon={Receipt}>
              <AdminPaymentProof path={order.payment_proof_url} uploadedAt={order.payment_proof_uploaded_at} note={order.payment_proof_note} />
              {!order.payment_proof_url && <AdminPaymentProofUpload orderId={order.id} />}
            </AdminPanel>
          )}

          <OrderNotesPanel orderId={order.id} hasAccount={!!order.user_id} />

          <OrderReturnsPanel orderId={order.id} />

          {activityOn && <EntityActivity refId={order.id} />}

          <AdminPanel title={t("cancel_refund")} icon={ClipboardList}>
            <AdminOrderComplianceBlock order={order} onRefresh={onChanged} />
          </AdminPanel>

          <AdminPanel title={t("fiscal")} icon={Receipt}>
            <div className="space-y-4">
              <AdminOrderFiscalDocBlock order={order} />
              {country === "PT" && <AdminOrderInvoiceBlock order={order} />}
            </div>
          </AdminPanel>

          <AdminPanel title={t("history")} icon={History}>
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("history_empty")}</p>
            ) : (
              <ol className="space-y-3">
                {history.map((h) => (
                  <li key={h.id} className="flex gap-3">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{orderStatusLabel(h.status, fmt.locale)}</p>
                      <p className="text-xs text-muted-foreground">{fmt.dateTime(h.created_at)}</p>
                      {h.notes && <p className="mt-0.5 text-sm text-muted-foreground break-words">{h.notes}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </AdminPanel>
        </div>

        {/* Coluna lateral */}
        <div className="space-y-5 min-w-0">
          <AdminPanel title={t("update_title")} icon={Save}>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="order-status">{t("order_status")}</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger id="order-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.keys(orderStatusConfig).map((k) => <SelectItem key={k} value={k}>{orderStatusLabel(k, fmt.locale)}</SelectItem>)}
                  </SelectContent>
                </Select>
                {status === "shipped" && status !== order.status && order.has_customizable_items && (
                  <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">{t("shipped_files_warning")}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="order-payment">{t("payment_status")}</Label>
                <Select value={payment} onValueChange={setPayment}>
                  <SelectTrigger id="order-payment"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_STATUSES.map((k) => <SelectItem key={k} value={k}>{paymentStatusLabel(k, fmt.locale)}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{t("payment_status_hint")}</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="order-tracking">{t("tracking")}</Label>
                <Input id="order-tracking" value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder={t("tracking_ph")} className="text-base md:text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="order-notes">{t("internal_notes")}</Label>
                <Textarea id="order-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("internal_notes_ph")} rows={3} className="text-base md:text-sm" />
                <p className="text-xs text-muted-foreground">{t("internal_notes_hint")}</p>
              </div>
              <Button className="w-full" onClick={save} disabled={!dirty || saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                {t("save_changes")}
              </Button>
            </div>
          </AdminPanel>

          <AdminPanel
            title={t("customer")}
            icon={User}
            actions={order.user_id ? <Button asChild variant="outline" size="sm"><Link to={adminHref.customer(order.user_id)}>{t("open_customer")}</Link></Button> : undefined}
          >
            <p className="font-medium text-foreground">{name}</p>
            {!order.user_id && <p className="text-xs text-muted-foreground">{t("guest")}</p>}
            <div className="mt-2 space-y-1.5 text-sm">
              {email && <a href={`mailto:${email}`} className="flex items-center gap-2 text-muted-foreground hover:text-foreground break-all"><Mail className="h-4 w-4 shrink-0" aria-hidden="true" />{email}</a>}
              {phone && (
                <p className="flex flex-wrap items-center gap-2 text-muted-foreground">
                  <Phone className="h-4 w-4 shrink-0" aria-hidden="true" />{phone}
                  {wa && <a href={wa} target="_blank" rel="noreferrer" className="font-semibold text-brand-orange-text hover:underline">WhatsApp</a>}
                </p>
              )}
              {taxId && <p className="text-muted-foreground">{t("tax_doc")}: <span className="text-foreground tabular-nums">{taxId}</span></p>}
            </div>
          </AdminPanel>

          <AdminPanel title={t("delivery")} icon={MapPin}>
            {addr ? (
              <address className="not-italic text-sm leading-relaxed text-muted-foreground">
                <span className="block font-medium text-foreground">{addr.recipient_name || name}</span>
                {addr.street}{addr.number ? `, ${addr.number}` : ""}{addr.complement ? `, ${addr.complement}` : ""}<br />
                {addr.parish ? `${addr.parish}, ` : ""}{addr.city}{addr.district || addr.state ? `, ${addr.district || addr.state}` : ""}<br />
                {addr.postal_code || addr.zip_code}{country ? ` · ${country}` : ""}
              </address>
            ) : <p className="text-sm text-muted-foreground">{t("no_address")}</p>}
            <div className="mt-4 border-t pt-3 text-sm">
              <p className="font-medium text-foreground">{t("tracking")}</p>
              {order.tracking_number ? (
                <>
                  <p className="mt-1 break-all rounded-lg bg-muted px-2 py-1 font-mono text-xs">{order.tracking_number}</p>
                  {trackingUrl && (
                    <a href={trackingUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-brand-orange-text hover:underline">
                      {isTrackingUrl(order.tracking_number) ? t("open_tracking") : t("track_on", { carrier: carrier?.name ?? "" })} <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    </a>
                  )}
                </>
              ) : <p className="text-muted-foreground">{t("no_tracking")}</p>}
              {order.shipped_at && <p className="mt-2 text-muted-foreground">{t("shipped_at", { date: fmt.dateTime(order.shipped_at) })}</p>}
              {order.delivered_at && <p className="text-muted-foreground">{t("delivered_at", { date: fmt.dateTime(order.delivered_at) })}</p>}
            </div>
          </AdminPanel>

          {(printingOn || hasPrintFiles) && (
            <AdminPanel title={t("documents")} icon={Printer}>
              <div className="space-y-3">
                {printingOn && <OrderPrintButtons orderId={order.id} />}
                {/* Ordem de serviço dos arquivos de impressão (personalização), só quando o pedido os tem */}
                {hasPrintFiles && (
                  <PrintWorkOrder
                    order={forPrint}
                    storeName={storeInfo.name || STORE_DEFAULTS.name}
                    storeAddress={storeInfo.address || ""}
                    storePhone={storeInfo.phone || ""}
                    storeEmail={storeInfo.email || ""}
                  />
                )}
              </div>
            </AdminPanel>
          )}

          <AdminPanel title={t("more_actions")}>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={archive} disabled={busy}>
                {order.archived ? <ArchiveRestore className="h-4 w-4" aria-hidden="true" /> : <Archive className="h-4 w-4" aria-hidden="true" />}
                {order.archived ? t("restore") : t("archive")}
              </Button>
              <InlineConfirm
                label={t("delete_order")}
                icon={Trash2}
                variant="ghost"
                className="text-destructive hover:text-destructive"
                title={t("delete_order_q", { id: short })}
                description={t("delete_order_text")}
                confirmLabel={t("delete_forever")}
                busy={busy}
                onConfirm={remove}
              />
            </div>
          </AdminPanel>
        </div>
      </div>
    </>
  );
}
