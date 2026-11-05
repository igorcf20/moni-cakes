import { supabase } from "@/integrations/supabase/client";
import { siteUrl } from "@/lib/siteUrl";

// Maps order status -> transactional template name.
// Returning null means: don't send anything for this transition.
const STATUS_TO_TEMPLATE: Record<string, string | null> = {
  pending: "order-created",
  paid: "order-paid",
  processing: "order-in-production",
  preparing: "order-in-production",
  in_production: "order-in-production",
  ready_for_pickup: "order-ready-pickup",
  shipped: "order-shipped",
  delivered: "order-delivered",
  cancelled: "order-cancelled",
  refunded: "order-refunded",
};

// Sem e-mail configurado no Admin, os avisos internos não são enviados.
const ADMIN_FALLBACK = "";

async function getAdminEmail(): Promise<string> {
  try {
    const { data } = await supabase
      .from("store_settings" as any)
      .select("value")
      .eq("key", "admin_notification_email")
      .maybeSingle();
    const v = (data as any)?.value;
    if (typeof v === "string" && v.includes("@")) return v;
    if (v && typeof v === "object" && typeof v.email === "string") return v.email;
  } catch (_) {}
  return ADMIN_FALLBACK;
}

async function loadOrderContext(orderId: string) {
  const { data: order } = await supabase
    .from("orders")
    .select("id, total, status, payment_method, tracking_number, shipping_address, user_id, guest_email, guest_name, guest_phone")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return null;

  let customerEmail = (order as any).guest_email as string | undefined;
  let customerName = (order as any).guest_name as string | undefined;
  let customerPhone = (order as any).guest_phone as string | undefined;
  if ((order as any).user_id) {
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("full_name, phone")
      .eq("user_id", (order as any).user_id)
      .maybeSingle();
    customerName = (profile as any)?.full_name || customerName;
    customerPhone = (profile as any)?.phone || customerPhone;
    if (!customerEmail) {
      try {
        const { data: au } = await supabase.auth.getUser();
        if (au?.user?.id === (order as any).user_id && au.user.email) {
          customerEmail = au.user.email;
        }
      } catch (_) {}
    }
  }
  const { data: items } = await supabase
    .from("order_items")
    .select("quantity, price, length_m, design_data, products:product_id(name)")
    .eq("order_id", orderId);

  const fmt = (v: number) =>
    new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(v || 0);

  return {
    order,
    customerEmail,
    customerName: customerName || "cliente",
    customerPhone,
    items: (items || []).map((it: any) => {
      const qty = Number(it.quantity) || 1;
      const unit = Number(it.price) || 0;
      const meters = Number(it.length_m) || 0;
      const lineTotal = meters > 0 ? unit * meters * qty : unit * qty;
      return {
        name: it?.products?.name || "Item",
        qty,
        total: fmt(lineTotal),
      };
    }),
    totalFormatted: fmt(Number((order as any).total) || 0),
    orderShort: orderId.slice(0, 8).toUpperCase(),
  };
}

const PAYMENT_LABEL: Record<string, string> = {
  mbway: "MB WAY",
  multibanco: "Multibanco / Referência",
  reference: "Referência Multibanco",
  transfer: "Transferência Bancária",
  viva: "Viva Wallet",
  on_delivery: "Pagamento na Entrega",
};

async function send(templateName: string, recipient: string, data: Record<string, unknown>, idempotencyKey?: string) {
  if (!recipient) return;
  try {
    const { error } = await supabase.functions.invoke("send-transactional-email", {
      body: { templateName, recipientEmail: recipient, templateData: data, idempotencyKey },
    });
    if (error) {
      console.error("send-transactional-email failed", templateName, recipient, error);
    }
  } catch (err) {
    console.error("Failed to send transactional email", templateName, err);
  }
}

const orderCreatedInFlight = new Set<string>();

/** Notify customer when their order status changes. */
export async function notifyOrderStatusChange(orderId: string, newStatus: string, opts?: { reason?: string }) {
  const tmpl = STATUS_TO_TEMPLATE[newStatus];
  if (!tmpl) return;
  const ctx = await loadOrderContext(orderId);
  if (!ctx?.customerEmail) return;

  const trackingNumber = (ctx.order as any).tracking_number as string | undefined;
  // Links dos e-mails com o endereço público da loja (VITE_SITE_URL), não o da pré-visualização.
  const origin = siteUrl();
  await send(tmpl, ctx.customerEmail, {
    customerName: ctx.customerName,
    orderShort: ctx.orderShort,
    total: ctx.totalFormatted,
    items: ctx.items,
    trackingCode: trackingNumber,
    trackingUrl: trackingNumber && /^https?:/i.test(trackingNumber) ? trackingNumber : undefined,
    carrier: "transportadora",
    reason: opts?.reason,
    refundNote: opts?.reason,
    paymentMethod: PAYMENT_LABEL[(ctx.order as any).payment_method as string] || (ctx.order as any).payment_method,
    reviewUrl: newStatus === "delivered"
      ? `${origin}/avaliar/pedido/${orderId}`
      : `${origin}/deixar-avaliacao`,
    reviewProductsUrl: `${origin}/avaliar/pedido/${orderId}`,
    reviewBrandUrl: `${origin}/deixar-avaliacao`,
  }, `order-status:${orderId}:${newStatus}:${ctx.customerEmail.toLowerCase()}`);

  if (newStatus === "cancelled") {
    const admin = await getAdminEmail();
    await send("admin-order-cancelled", admin, {
      orderShort: ctx.orderShort,
      customerName: ctx.customerName,
      total: ctx.totalFormatted,
      reason: opts?.reason,
    }, `admin-order-cancelled:${orderId}:${admin.toLowerCase()}`);
  }
}

/** Notify both customer and admin that an order was just created. */
export async function notifyOrderCreated(orderId: string) {
  if (orderCreatedInFlight.has(orderId)) return;
  orderCreatedInFlight.add(orderId);

  // Persistent dedupe: skip if already notified for this order.
  try {
    const { data: existing } = await supabase
      .from("orders")
      .select("notified_at")
      .eq("id", orderId)
      .maybeSingle();
    if ((existing as any)?.notified_at) {
      orderCreatedInFlight.delete(orderId);
      return;
    }
  } catch (_) {}

  const ctx = await loadOrderContext(orderId);
  if (!ctx) {
    orderCreatedInFlight.delete(orderId);
    return;
  }
  const paymentLabel = PAYMENT_LABEL[(ctx.order as any).payment_method as string] || (ctx.order as any).payment_method;

  if (ctx.customerEmail) {
    await send("order-created", ctx.customerEmail, {
      customerName: ctx.customerName,
      orderShort: ctx.orderShort,
      total: ctx.totalFormatted,
      items: ctx.items,
      paymentMethod: paymentLabel,
    }, `order-created:${orderId}:${ctx.customerEmail.toLowerCase()}`);
  }
  const admin = await getAdminEmail();
  await send("admin-new-order", admin, {
    orderShort: ctx.orderShort,
    customerName: ctx.customerName,
    customerEmail: ctx.customerEmail,
    customerPhone: ctx.customerPhone,
    total: ctx.totalFormatted,
    paymentMethod: paymentLabel,
    items: ctx.items,
  }, `admin-new-order:${orderId}:${admin.toLowerCase()}`);

  // Mark as notified to prevent duplicate sends from retries / OrderSuccess remounts.
  try {
    await supabase.from("orders").update({ notified_at: new Date().toISOString() } as any).eq("id", orderId);
  } catch (_) {}
  orderCreatedInFlight.delete(orderId);
}

/** Notify admin and customer that the customer just submitted a cancellation request. */
export async function notifyCancellationRequested(orderId: string, reason?: string) {
  const ctx = await loadOrderContext(orderId);
  if (!ctx) return;

  const admin = await getAdminEmail();
  await send("admin-cancellation-requested", admin, {
    orderShort: ctx.orderShort,
    customerName: ctx.customerName,
    customerEmail: ctx.customerEmail,
    customerPhone: ctx.customerPhone,
    total: ctx.totalFormatted,
    reason: reason || undefined,
  }, `admin-cancellation-requested:${orderId}:${admin.toLowerCase()}`);

  if (ctx.customerEmail) {
    await send("customer-cancellation-received", ctx.customerEmail, {
      customerName: ctx.customerName,
      orderShort: ctx.orderShort,
      total: ctx.totalFormatted,
      reason: reason || undefined,
    }, `customer-cancellation-received:${orderId}:${ctx.customerEmail.toLowerCase()}`);
  }
}

/** Notify the customer that the store refused their cancellation request. */
export async function notifyCancellationRefused(orderId: string, reason?: string) {
  const ctx = await loadOrderContext(orderId);
  if (!ctx?.customerEmail) return;
  await send("customer-cancellation-refused", ctx.customerEmail, {
    customerName: ctx.customerName,
    orderShort: ctx.orderShort,
    total: ctx.totalFormatted,
    reason: reason || undefined,
  }, `customer-cancellation-refused:${orderId}:${ctx.customerEmail.toLowerCase()}:${Date.now()}`);
}