// =====================================================================================
// Aba Pedidos da área do cliente: filtros (todos, em andamento, concluídos, cancelados) e busca pelo número
// ou produto, andamento de cada pedido (OrderProgress), avisos do que falta (pagamento, ficheiros, opções),
// detalhes, rastreio, cancelamento, avaliações, "Comprar de novo", atalho para a fatura (aba Faturas),
// "Devolver ou trocar" (aba Devoluções) e as mensagens que a loja deixou no pedido (OrderMessages).
// Admin > Aparência da loja > Área do cliente: itens em lista (nome, quantidade, preço) ou só fotos, e
// "Comprar tudo de novo" nos pedidos entregues (rebuyLines, src/lib/accountPage.ts).
// =====================================================================================
import { RentalChip } from "@/components/product/RentalChip";
import { PreorderChip } from "@/components/product/PreorderInfo";
import { orderLinePreorder } from "@/lib/preorders";
import { STORE_DEFAULTS } from "@/config/store";
import { giftCodeTail } from "@/lib/giftCards";
import { giftCardsMessages } from "@/i18n/giftCards";
import { rewardPointsMessages } from "@/i18n/rewardPoints";
import { checkoutFieldsMessages } from "@/i18n/checkoutFields";
import { deliveryDatesMessages } from "@/i18n/deliveryDates";
import { formatDay } from "@/lib/deliveryDates";
import OrderCheckoutFields from "@/components/checkout/OrderCheckoutFields";
import OrderShipments from "@/components/dashboard/OrderShipments";
import { useFeature } from "@/hooks/useFeatures";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import {
  Ban, CalendarCheck, ChevronDown, Clock, Copy, CreditCard, ExternalLink, ListChecks, Loader2, MapPin, Package, Receipt, RotateCcw, Search,
  Settings2, ShieldCheck, Star, Tag, Truck, Upload, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import CustomizationAreaFiles from "@/components/customizer/CustomizationAreaFiles";
import type { Order } from "@/hooks/useOrders";
import { useCurrency } from "@/hooks/use-currency";
import { useStoreInfo } from "@/hooks/useStoreInfo";
import { useQuickAdd } from "@/hooks/useQuickAdd";
import { useAuth } from "@/hooks/useAuth";
import { useMyReturns, useReturnSettings } from "@/hooks/useReturns";
import { returnsMessages } from "@/i18n/returns";
import { OPEN_RETURN_STATUSES, canRequestReturn } from "@/lib/returns";
import { useMessages } from "@/i18n";
import { accountMessages } from "@/i18n/account";
import { addressCountryCode } from "@/lib/addressFormats";
import { countryName, useCountry } from "@/lib/countries";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/utils/currency";
import { isTrackingUrl } from "@/utils/tracking";
import OrderDesignPreviews from "./OrderDesignPreviews";
import OrderMessages from "./OrderMessages";
import OrderPaymentDetails from "./OrderPaymentDetails";
import OrderProgress from "./OrderProgress";
import { addressLines, orderCode, paymentKey } from "./accountUtils";
import { useAccountPage } from "@/hooks/useAccountPage";
import { accountPageMessages } from "@/i18n/accountPage";
import { rebuyLines } from "@/lib/accountPage";
import { CartStockError } from "@/hooks/useCart";
import { EmptyState, ItemThumb, StatusBadge, btnPrimary, btnSecondary, btnSmall, cardCls, focusRing, labelCls } from "./ui";

interface OrderHistoryProps {
  orders: Order[];
  isLoading: boolean;
  /** abre a aba Faturas (comprovante e documento fiscal) */
  onInvoices?: () => void;
}

type Filter = "all" | "active" | "done" | "cancelled";
const CANCELLED = ["cancelled", "refunded"];
const filterOf = (status: string): Exclude<Filter, "all"> =>
  CANCELLED.includes(status) ? "cancelled" : DONE.includes(status) ? "done" : "active";

const DONE = ["delivered", "completed"];
const TRACKABLE = ["shipped", "delivered", "ready_for_pickup", "completed"];
// Meios pagos à mão, com dados em OrderPaymentDetails e envio de comprovante. Cartão e pagamentos online não entram.
// Pedidos pendentes que o cliente ainda paga (dados da loja ou pagamento online no provedor).
const MANUAL_PAYMENT = ["pix", "transfer", "mbway", "multibanco", "reference", "bizum", "mercado_pago", "stripe", "paypal"];

const OrderHistory = ({ orders, isLoading, onInvoices }: OrderHistoryProps) => {
  const { t, locale } = useMessages(accountMessages);
  const { currentCurrency, convert } = useCurrency();
  const { data: storeInfo } = useStoreInfo();
  const country = useCountry();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [cancelOrderId, setCancelOrderId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [submittingCancel, setSubmittingCancel] = useState(false);
  const queryClient = useQueryClient();
  const store = storeInfo?.name || STORE_DEFAULTS.name;
  const quickAdd = useQuickAdd();
  const [adding, setAdding] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const { t: tr } = useMessages(returnsMessages);
  const { t: tg } = useMessages(giftCardsMessages);
  const { t: tp } = useMessages(rewardPointsMessages);
  const { t: tcf } = useMessages(checkoutFieldsMessages);
  const { t: tdd } = useMessages(deliveryDatesMessages);
  const { t: ta } = useMessages(accountPageMessages);
  const layout = useAccountPage();
  const returnsOn = useFeature("returns");
  const messagesOn = useFeature("order_messages");
  const { user } = useAuth();
  const { data: returnSettings } = useReturnSettings();
  const { data: myReturns = [] } = useMyReturns(user?.id);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: orders.length, active: 0, done: 0, cancelled: 0 };
    for (const o of orders) c[filterOf(o.status)] += 1;
    return c;
  }, [orders]);
  const q = query.trim().toLowerCase();
  const shown = orders.filter((o) => {
    if (filter !== "all" && filterOf(o.status) !== filter) return false;
    if (!q) return true;
    if (orderCode(o.id).toLowerCase().includes(q.replace(/^#/, ""))) return true;
    return (o.order_items || []).some((it) => String(it.products?.name || it.design_data?.name || "").toLowerCase().includes(q));
  });

  // Produto do catálogo sem personalização: volta ao carrinho com as opções padrão; senão abre a página do produto.
  const buyAgain = async (productId: string, key: string) => {
    setAdding(key);
    try {
      await quickAdd(productId); // o carrinho já mostra a confirmação
    } catch {
      toast.error(t("ordAddError"));
    } finally {
      setAdding(null);
    }
  };

  // Pedido entregue: os itens do catálogo voltam ao carrinho com a mesma quantidade (o carrinho confere o estoque).
  const rebuyAll = async (order: Order) => {
    const items = order.order_items || [];
    const lines = rebuyLines(items);
    const skipped = items.filter((i) => rebuyLines([i]).length === 0).length;
    if (!lines.length) { toast.info(ta("rebuy_none")); return; }
    setAdding(`all-${order.id}`);
    let failed = 0;
    try {
      for (const l of lines) {
        try { await quickAdd(l.productId, l.quantity); } catch (e) { failed += 1; if (e instanceof CartStockError) continue; }
      }
      if (failed === lines.length) toast.error(ta("rebuy_error"));
      else toast.success(ta("rebuy_done"), skipped + failed > 0 ? { description: ta("rebuy_partial", { count: skipped + failed }) } : undefined);
    } finally {
      setAdding(null);
    }
  };
  const lineName = (item: NonNullable<Order["order_items"]>[number]) =>
    item.products?.name || (item as any).custom_name || item.design_data?.name || (item.product_id ? t("ordersProduct") : t("ordersCustomItem"));

  const money = (v: number | null | undefined) => formatPrice(convert(Number(v) || 0), currentCurrency);
  const date = (v: string, withTime = false) =>
    new Date(v).toLocaleDateString(locale, withTime ? { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "short", year: "numeric" });

  const submitCancellation = async () => {
    if (!cancelOrderId) return;
    setSubmittingCancel(true);
    try {
      const { error } = await (supabase as any).rpc("request_order_cancellation", { _order_id: cancelOrderId, _reason: cancelReason });
      if (error) throw error;
      // Aviso à loja e confirmação ao cliente, sem bloquear a resposta.
      try {
        const { notifyCancellationRequested } = await import("@/lib/notifyOrderEmail");
        notifyCancellationRequested(cancelOrderId, cancelReason).catch(() => {});
      } catch { /* e-mail opcional */ }
      toast.success(t("ordersCancelSent"));
      setCancelOrderId(null);
      setCancelReason("");
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    } catch (err) {
      console.error("request_order_cancellation failed", err);
      toast.error(storeInfo?.email ? t("ordersCancelErrorEmail", { email: storeInfo.email }) : t("ordersCancelError"), { duration: 8000 });
    } finally {
      setSubmittingCancel(false);
    }
  };

  const toggle = (id: string, open?: boolean) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      const willOpen = open ?? !next.has(id);
      if (willOpen) next.add(id); else next.delete(id);
      return next;
    });
  };

  const copy = (value: string) => {
    navigator.clipboard?.writeText(value).then(() => toast.success(t("copied")), () => {});
  };

  if (isLoading) {
    return (
      <div className="space-y-3" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className={cn(cardCls, "p-5")}>
            <div className="flex justify-between gap-4">
              <div className="space-y-2"><div className="skeleton h-5 w-40 rounded" /><div className="skeleton h-4 w-28 rounded" /></div>
              <div className="skeleton h-6 w-24 rounded" />
            </div>
            <div className="mt-4 flex gap-2">{[0, 1, 2].map((j) => <div key={j} className="skeleton h-14 w-14 rounded-[12px]" />)}</div>
          </div>
        ))}
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <EmptyState Icon={Package} title={t("ordersEmptyTitle")} text={t("ordersEmptyText")}>
        <Link to="/produtos" className={btnPrimary}>{t("exploreProducts")}</Link>
      </EmptyState>
    );
  }

  const FILTERS: { id: Filter; label: string }[] = [
    { id: "all", label: t("ordFilterAll") },
    { id: "active", label: t("ordFilterActive") },
    { id: "done", label: t("ordFilterDone") },
    { id: "cancelled", label: t("ordFilterCancelled") },
  ];

  return (
    <div className="space-y-3">
      {/* Filtros e busca */}
      <div className="flex flex-col gap-3 pb-1 sm:flex-row sm:items-center sm:justify-between">
        <div role="group" aria-label={t("ordFilterLabel")} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
          {FILTERS.filter((f) => f.id === "all" || counts[f.id] > 0).map((f) => {
            const on = filter === f.id;
            return (
              <button
                key={f.id} type="button" aria-pressed={on} onClick={() => setFilter(f.id)}
                className={cn(
                  "inline-flex min-h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-4 text-[14px] font-semibold transition-colors duration-150",
                  on ? "border-foreground bg-foreground text-background" : "border-border bg-white text-foreground hover:border-primary",
                  focusRing,
                )}
              >
                {f.label}
                <span className={cn("rounded-full px-1.5 text-[12px] tabular-nums", on ? "bg-white/20" : "bg-brand-alt text-brand-ink-soft")}>{counts[f.id]}</span>
              </button>
            );
          })}
        </div>
        <label className="relative block sm:w-72">
          <span className="sr-only">{t("ordSearch")}</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.8} aria-hidden="true" />
          <input
            type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("ordSearch")}
            className={cn("h-11 w-full rounded-[14px] border border-border bg-white pl-10 pr-3 text-[16px] md:text-[14px]", focusRing)}
          />
        </label>
      </div>

      {shown.length === 0 && (
        <div className={cn(cardCls, "p-8 text-center")} role="status">
          <p className="text-[15px] text-brand-ink-soft">{t("ordNoMatch")}</p>
          <button type="button" onClick={() => { setFilter("all"); setQuery(""); }} className={cn(btnSmall, "mt-4")}>{t("ordClearFilter")}</button>
        </div>
      )}

      {shown.map((order) => {
        const o = order as any;
        const isOpen = expanded.has(order.id);
        const items = order.order_items || [];
        const code = orderCode(order.id);
        const cStatus = o.cancellation_status as string | null;
        const cReason = o.cancellation_reason as string | null;
        // Pode pedir de novo o cancelamento sempre que o pedido volta a um estado pagável.
        const canRequestCancel = ["pending", "awaiting_payment", "paid"].includes(order.status) && cStatus !== "requested";
        const canTrack = !!order.tracking_number || TRACKABLE.includes(order.status);
        const isDone = DONE.includes(order.status);
        const awaitingPayment = order.status === "pending" && !order.files_pending && !order.requires_customer_config && MANUAL_PAYMENT.includes(order.payment_method || "");
        const pk = paymentKey(order.payment_method);
        const addr = order.shipping_address as any;
        const addrCountry = addr ? addressCountryCode(addr.country, country.code) : null;
        const detailsId = `order-details-${order.id}`;
        const openReturn = returnsOn && myReturns.some((r) => r.order_id === order.id && OPEN_RETURN_STATUSES.includes(r.status));
        const canReturn = returnsOn && !!returnSettings && canRequestReturn(order, returnSettings);

        const openPayment = () => {
          toggle(order.id, true);
          setTimeout(() => document.getElementById(`payment-details-${order.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 160);
        };

        return (
          <article key={order.id} className={cn(cardCls, "overflow-hidden")} aria-labelledby={`order-title-${order.id}`}>
            {order.requires_customer_config && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3 sm:px-5">
                <p className="flex items-start gap-2 text-[14px] font-medium text-amber-900">
                  <Settings2 className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />{t("ordersConfigNotice")}
                </p>
                <Link to={`/pedido/${order.id}/configurar`} className={cn(btnSmall, "border-amber-300")}>{t("ordersConfigCta")}</Link>
              </div>
            )}
            {order.files_pending && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3 sm:px-5" role="status">
                <p className="flex items-start gap-2 text-[14px] font-medium text-amber-900">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />{t("ordersFilesNotice")}
                </p>
                <Link to={`/pedido/${order.id}/sucesso`} className={cn(btnSmall, "border-amber-300")}>{t("ordersFilesCta")}</Link>
              </div>
            )}
            {awaitingPayment && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-primary/20 bg-accent px-4 py-3 sm:px-5">
                <p className="flex min-w-0 items-start gap-2 text-[14px] font-medium text-foreground">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={1.8} aria-hidden="true" />
                  {o.payment_proof_url ? t("ordersProofReceived") : t("ordersAwaitingPayment")}
                </p>
                {!o.payment_proof_url && (
                  <button type="button" onClick={openPayment} className={cn(btnPrimary, "min-h-11 px-4 text-[14px]")}>
                    <Upload className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />{t("ordersPayCta")}
                  </button>
                )}
              </div>
            )}

            <div className="p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 id={`order-title-${order.id}`} className="text-[17px] font-bold tracking-[-0.01em]">{t("orderCode", { code })}</h3>
                    <StatusBadge status={order.status} />
                  </div>
                  <p className="mt-1 text-[13px] text-muted-foreground">
                    {t("ordersPlaced", { date: date(order.created_at) })}
                    <span aria-hidden="true"> · </span>
                    {items.length === 1 ? t("items_one") : t("items_other", { count: items.length })}
                  </p>
                </div>
                <p className="text-[18px] font-bold tabular-nums">{money(order.total)}</p>
              </div>

              <OrderProgress order={order} className="mt-4" />

              {items.length > 0 && layout.order_items === "list" && (
                <ul className="mt-4 divide-y divide-brand-card-border rounded-[16px] border border-brand-card-border">
                  {items.slice(0, 3).map((item) => (
                    <li key={item.id} className="flex items-center gap-3 p-2.5 sm:px-3">
                      <ItemThumb src={item.products?.image || item.design_data?.image || null} alt="" Icon={Package} className="h-12 w-12" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-semibold leading-snug">{lineName(item)}</p>
                        <p className="mt-0.5 text-[13px] tabular-nums text-muted-foreground">{ta("each", { qty: item.quantity, price: money(item.price) })}</p>
                      </div>
                      <span className="whitespace-nowrap text-[14px] font-semibold tabular-nums">{money(item.price * item.quantity)}</span>
                    </li>
                  ))}
                  {items.length > 3 && (
                    <li>
                      <button type="button" onClick={() => toggle(order.id, true)} aria-controls={detailsId} className={cn("flex min-h-11 w-full items-center gap-1.5 rounded-b-[16px] px-3 text-left text-[13px] font-semibold text-brand-orange-text hover:bg-brand-alt", focusRing)}>
                        {items.length - 3 === 1 ? ta("more_items_one") : ta("more_items_other", { count: items.length - 3 })}
                        <ChevronDown className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                      </button>
                    </li>
                  )}
                </ul>
              )}
              {items.length > 0 && layout.order_items === "thumbs" && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {items.slice(0, 5).map((item) => (
                    <ItemThumb key={item.id} src={item.products?.image || item.design_data?.image || null} alt={item.products?.name || ""} Icon={Package} />
                  ))}
                  {items.length > 5 && (
                    <span className="grid h-14 w-14 place-items-center rounded-[12px] bg-brand-alt text-[12px] font-semibold text-brand-ink-soft">{t("ordersMoreItems", { count: items.length - 5 })}</span>
                  )}
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                {isDone && layout.order_buy_again && rebuyLines(items).length > 0 && (
                  <button type="button" onClick={() => rebuyAll(order)} disabled={adding === `all-${order.id}`} aria-busy={adding === `all-${order.id}` || undefined}
                    className={cn(btnSmall, "border-primary bg-primary text-primary-foreground hover:bg-primary-hover hover:text-primary-foreground")}>
                    {adding === `all-${order.id}` ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RotateCcw className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />}
                    {adding === `all-${order.id}` ? ta("rebuy_busy") : ta("rebuy")}
                  </button>
                )}
                <button type="button" onClick={() => toggle(order.id)} aria-expanded={isOpen} aria-controls={detailsId} className={btnSmall}>
                  {isOpen ? t("ordersHideDetails") : t("ordersDetails")}
                  <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", isOpen && "rotate-180")} strokeWidth={2} aria-hidden="true" />
                </button>
                {canTrack && (
                  <Link to={`/rastrear?pedido=${order.id}`} className={btnSmall}><Truck className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />{t("ordersTrack")}</Link>
                )}
                {isDone && (
                  <Link to={`/avaliar/pedido/${order.id}`} className={btnSmall}><Star className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />{t("ordersReview")}</Link>
                )}
                {onInvoices && !CANCELLED.includes(order.status) && (
                  <button type="button" onClick={onInvoices} className={btnSmall}><Receipt className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />{t("ordInvoice")}</button>
                )}
                {openReturn ? (
                  <Link to="/dashboard?tab=devolucoes" className={btnSmall}><RotateCcw className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />{tr("order_return_open")}</Link>
                ) : canReturn && (
                  <Link to={`/dashboard?tab=devolucoes&pedido=${order.id}`} className={btnSmall}><RotateCcw className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />{tr("order_return")}</Link>
                )}
                {canRequestCancel && (
                  <button type="button" onClick={() => { setCancelOrderId(order.id); setCancelReason(""); }} className={cn(btnSmall, "hover:border-destructive hover:text-destructive")}>
                    <Ban className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />{t("ordersCancel")}
                  </button>
                )}
              </div>
            </div>

            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  id={detailsId}
                  key="details"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden"
                >
                  <div className="space-y-5 border-t border-brand-card-border bg-background/60 p-4 sm:p-5">
                    {/* Itens */}
                    {items.length > 0 && (
                      <section>
                        <h4 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{t("ordersItems")}</h4>
                        <ul className="mt-3 space-y-2">
                          {items.map((item) => {
                            const dd: any = item.design_data || {};
                            const it = item as any;
                            const variation = dd?.variation?.name || dd?.variation_name || (typeof dd?.variation === "string" ? dd.variation : null);
                            const size = dd?.size?.name || dd?.size_label || (typeof dd?.size === "string" ? dd.size : null);
                            const color = dd?.color?.name || dd?.color_name || (typeof dd?.color === "string" ? dd.color : null);
                            const colorHex = dd?.color?.hex || dd?.color_hex || null;
                            const name = item.products?.name || it.custom_name || dd?.name || (item.product_id ? t("ordersProduct") : t("ordersCustomItem"));
                            return (
                              <li key={item.id} className="rounded-[16px] border border-brand-card-border bg-white p-3">
                                <div className="flex items-start gap-3">
                                  <ItemThumb src={item.products?.image || dd?.image || null} alt={name} Icon={Package} />
                                  <div className="min-w-0 flex-1">
                                    <p className="text-[15px] font-semibold leading-snug">{name}</p>
                                    <p className="mt-0.5 text-[13px] text-muted-foreground">{t("qty", { count: item.quantity })}</p>
                                    {it.custom_description && <p className="mt-1 text-[13px] text-brand-ink-soft">{it.custom_description}</p>}
                                    {(color || size || variation) && (
                                      <div className="mt-2 flex flex-wrap gap-1.5">
                                        {color && (
                                          <span className="inline-flex items-center gap-1.5 rounded-lg bg-brand-alt px-2 py-0.5 text-[12px] font-medium text-brand-ink-soft">
                                            {colorHex && <span className="h-2.5 w-2.5 rounded-full border border-black/10" style={{ backgroundColor: String(colorHex) }} aria-hidden="true" />}
                                            {t("ordersColor", { value: String(color) })}
                                          </span>
                                        )}
                                        {size && <span className="rounded-lg bg-brand-alt px-2 py-0.5 text-[12px] font-medium text-brand-ink-soft">{t("ordersSize", { value: String(size) })}</span>}
                                        {variation && variation !== color && <span className="rounded-lg bg-brand-alt px-2 py-0.5 text-[12px] font-medium text-brand-ink-soft">{String(variation)}</span>}
                                      </div>
                                    )}
                                    {dd?.rental && typeof dd.rental === "object" && <ul className="mt-2 flex flex-wrap gap-1.5"><RentalChip rental={dd.rental} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] leading-none" /></ul>}
                                    {orderLinePreorder(dd) && <p className="mt-2"><PreorderChip releaseDate={orderLinePreorder(dd)!.release_date} /></p>}
                                    <CustomizationAreaFiles areas={dd?.customization?.areas} compact />
                                    {item.product_id && !dd?.customization && !dd?.rental && (
                                      <button
                                        type="button" onClick={() => buyAgain(item.product_id!, item.id)} disabled={adding === item.id}
                                        className={cn("mr-3 mt-2 inline-flex min-h-10 items-center gap-1.5 rounded-[10px] text-[13px] font-semibold text-brand-orange-text hover:underline disabled:opacity-60", focusRing)}
                                      >
                                        {adding === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />}
                                        {t("ordBuyAgain")}
                                      </button>
                                    )}
                                    {isDone && item.product_id && (
                                      <Link to={`/avaliar/${order.id}/${item.product_id}`} className={cn("mt-2 inline-flex min-h-10 items-center gap-1.5 rounded-[10px] text-[13px] font-semibold text-brand-orange-text hover:underline", focusRing)}>
                                        <Star className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />{t("ordersReviewProduct")}
                                      </Link>
                                    )}
                                  </div>
                                  <span className="whitespace-nowrap text-[15px] font-semibold tabular-nums">{money(item.price * item.quantity)}</span>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </section>
                    )}

                    {messagesOn && <OrderMessages orderId={order.id} />}

                    <OrderDesignPreviews orderId={order.id} />

                    {order.status === "pending" && !order.files_pending && (
                      <div id={`payment-details-${order.id}`}>
                        <OrderPaymentDetails
                          orderId={order.id}
                          paymentMethod={order.payment_method || "pix"}
                          total={order.total}
                          guestEmail={o.guest_email || null}
                          paymentProofUrl={o.payment_proof_url || null}
                        />
                      </div>
                    )}

                    {/* Remessas (Envios parciais): só quando o pedido tem remessas */}
                    <OrderShipments
                      orderId={order.id}
                      lines={items.map((item: any) => ({ id: item.id, quantity: Number(item.quantity) || 0, label: item.products?.name || item.custom_name || item.design_data?.name || (item.product_id ? t("ordersProduct") : t("ordersCustomItem")) }))}
                    />

                    {/* Previsão (Prazos e entrega): gravada no pedido; some depois de entregue ou cancelado */}
                    {((order as any).estimated_delivery_to || (order as any).estimated_ship_by) && !["delivered", "cancelled", "refunded"].includes(order.status) && (
                      <p className="flex items-center gap-2 rounded-[16px] border border-emerald-200 bg-emerald-50 p-4 text-[14px] font-medium text-emerald-800">
                        <CalendarCheck className="h-4 w-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />
                        {(order as any).estimated_delivery_from && (order as any).estimated_delivery_to
                          ? tdd("arrives", { from: formatDay((order as any).estimated_delivery_from, locale, false), to: formatDay((order as any).estimated_delivery_to, locale, false) })
                          : tdd("order_ships_by", { date: formatDay((order as any).estimated_ship_by, locale) })}
                      </p>
                    )}

                    {/* Detalhes do pedido (campos extra do checkout) */}
                    <OrderCheckoutFields value={(order as any).checkout_fields} money={money} className="rounded-[16px] border border-brand-card-border bg-white p-4" />

                    {/* Resumo */}
                    <section className="rounded-[16px] border border-brand-card-border bg-white p-4">
                      <h4 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{t("ordersSummary")}</h4>
                      <dl className="mt-3 space-y-2 text-[14px]">
                        <div className="flex items-center justify-between gap-3">
                          <dt className="flex items-center gap-2 text-brand-ink-soft"><CreditCard className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />{t("ordersPayment")}</dt>
                          <dd className="text-right font-medium">{pk ? t(pk) : order.payment_method || t("notInformed")}</dd>
                        </div>
                        {order.shipping_cost != null && (
                          <div className="flex items-center justify-between gap-3">
                            <dt className="flex items-center gap-2 text-brand-ink-soft"><Truck className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />{t("ordersShipping")}</dt>
                            <dd className="font-medium tabular-nums">{Number(order.shipping_cost) > 0 ? money(order.shipping_cost) : t("ordersFreeShipping")}</dd>
                          </div>
                        )}
                        {Number((order as any).extras_amount || 0) > 0 && (
                          <div className="flex items-center justify-between gap-3">
                            <dt className="flex items-center gap-2 text-brand-ink-soft"><ListChecks className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />{tcf("summary")}</dt>
                            <dd className="font-medium tabular-nums">{money(Number((order as any).extras_amount) + Number((order as any).extras_vat || 0))}</dd>
                          </div>
                        )}
                        {order.coupon_code && (
                          <div className="flex items-center justify-between gap-3">
                            <dt className="flex items-center gap-2 text-emerald-700"><Tag className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />{t("ordersCoupon", { code: order.coupon_code })}</dt>
                            <dd className="font-medium tabular-nums text-emerald-700">-{money(order.discount_amount || 0)}</dd>
                          </div>
                        )}
                        {Number((order as any).reward_points_amount || 0) > 0 && (
                          <div className="flex items-center justify-between gap-3">
                            <dt className="flex items-center gap-2 text-emerald-700"><Tag className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />{tp("co_summary", { points: (order as any).reward_points_used })}</dt>
                            <dd className="font-medium tabular-nums text-emerald-700">-{money((order as any).reward_points_amount)}</dd>
                          </div>
                        )}
                        {Number((order as any).gift_card_amount || 0) > 0 && (
                          <div className="flex items-center justify-between gap-3">
                            <dt className="flex items-center gap-2 text-emerald-700"><Tag className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />{tg("summary", { tail: giftCodeTail(String((order as any).gift_card_code || "")) })}</dt>
                            <dd className="font-medium tabular-nums text-emerald-700">-{money((order as any).gift_card_amount)}</dd>
                          </div>
                        )}
                        <div className="flex items-center justify-between gap-3 border-t border-brand-card-border pt-2">
                          <dt className="font-semibold">{t("total")}</dt>
                          <dd className="text-[16px] font-bold tabular-nums">{money(order.total)}</dd>
                        </div>
                      </dl>
                    </section>

                    {/* Rastreio */}
                    {order.tracking_number && (
                      <section className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-primary/20 bg-accent p-4">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-white text-primary"><Truck className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" /></span>
                          <div className="min-w-0">
                            <p className="text-[13px] font-medium text-brand-ink-soft">{isTrackingUrl(order.tracking_number) ? t("ordersTrackingLink") : t("ordersTrackingCode")}</p>
                            <p className="break-all font-mono text-[14px] font-bold">{order.tracking_number}</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {isTrackingUrl(order.tracking_number) ? (
                            <a href={order.tracking_number} target="_blank" rel="noopener noreferrer" className={btnSmall}>
                              {t("ordersOpenCarrier")}<ExternalLink className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
                            </a>
                          ) : (
                            <button type="button" onClick={() => copy(order.tracking_number!)} className={btnSmall}>
                              <Copy className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />{t("copy")}
                            </button>
                          )}
                          <Link to={`/rastrear?pedido=${order.id}`} className={btnSmall}>{t("ordersSeeTracking")}</Link>
                        </div>
                      </section>
                    )}

                    {/* Endereço */}
                    {addr && (
                      <section className="flex items-start gap-3 rounded-[16px] border border-brand-card-border bg-white p-4">
                        <MapPin className="mt-0.5 h-[18px] w-[18px] shrink-0 text-brand-ink-soft" strokeWidth={1.8} aria-hidden="true" />
                        <div className="min-w-0">
                          <h4 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{t("ordersShippingAddress")}</h4>
                          <address className="mt-1.5 text-[14px] not-italic leading-relaxed">
                            {addressLines(addr, addrCountry ? countryName(addrCountry, locale) : null).map((l) => <span key={l} className="block">{l}</span>)}
                          </address>
                        </div>
                      </section>
                    )}

                    {/* Cancelamento */}
                    {cStatus === "requested" && (
                      <div className="rounded-[16px] border border-amber-200 bg-amber-50 p-4 text-[14px]" role="status">
                        <p className="flex items-center gap-2 font-semibold text-amber-900"><Ban className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />{t("ordersCancelReview")}</p>
                        {cReason && <p className="mt-1 text-amber-900/80">{t("ordersCancelReason", { reason: cReason })}</p>}
                        <p className="mt-1 text-[13px] text-amber-900/70">{t("ordersCancelMayRefuse")}</p>
                      </div>
                    )}
                    {cStatus === "refused" && (
                      <div className="rounded-[16px] border border-destructive/30 bg-destructive/5 p-4 text-[14px]">
                        <p className="flex items-center gap-2 font-semibold text-destructive"><XCircle className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />{t("ordersCancelRefused")}</p>
                        <p className="mt-1 text-brand-ink-soft">{t("ordersCancelRefusedText")}</p>
                      </div>
                    )}
                    {cStatus !== "requested" && cStatus !== "refused" && canRequestCancel && (
                      <p className="flex items-start gap-2 text-[13px] text-muted-foreground">
                        <Ban className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />{t("ordersCancelAsk")}
                      </p>
                    )}

                    {o.terms_accepted_at && o.has_customizable_items && (
                      <p className="flex items-start gap-2 text-[13px] text-muted-foreground">
                        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={1.8} aria-hidden="true" />
                        {t("ordersTermsAccepted", { date: date(o.terms_accepted_at, true) })}
                      </p>
                    )}

                    {isDone && (
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] bg-brand-alt p-4">
                        <p className="text-[14px] text-brand-ink-soft">{t("ordersReviewStore", { store })}</p>
                        <Link to="/deixar-avaliacao" className={btnSmall}><Star className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />{t("ordersReviewStoreCta")}</Link>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </article>
        );
      })}

      <Dialog open={!!cancelOrderId} onOpenChange={(open) => !open && setCancelOrderId(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-[20px] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[22px] font-bold tracking-[-0.02em]">{t("ordersCancelTitle")}</DialogTitle>
            <DialogDescription className="text-[15px] leading-relaxed text-brand-ink-soft">{t("ordersCancelText")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="cancel-reason" className={labelCls}>{t("ordersCancelReasonLabel")} <span className="font-normal text-muted-foreground">({t("optional")})</span></Label>
            <Textarea
              id="cancel-reason"
              placeholder={t("ordersCancelReasonPlaceholder")}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={4}
              className="rounded-[14px] border-border bg-white text-[16px] md:text-[15px]"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <button type="button" className={btnSecondary} onClick={() => setCancelOrderId(null)} disabled={submittingCancel}>{t("back")}</button>
            <button type="button" className={btnPrimary} onClick={submitCancellation} disabled={submittingCancel} aria-busy={submittingCancel || undefined}>
              {submittingCancel ? t("ordersCancelSending") : t("ordersCancelSend")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OrderHistory;
