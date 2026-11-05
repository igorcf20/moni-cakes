import { supabaseAdmin } from "./admin.ts";

// FIZ certified invoicing (Portugal), https://api.fiz.co (docs: /llms.txt, OpenAPI: /-json).
// Drafts are safe (nothing reaches the tax authority). Issuing is fiscal and irreversible: it only
// happens when an admin asks, or automatically when the store set auto_mode = "emitir".
type Sb = ReturnType<typeof supabaseAdmin>;
const API = "https://api.fiz.co";
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const round2 = (v: number) => Math.round(v * 100) / 100;

export type FizConfig = { apiKey: string; cae: string; seriesId?: string; autoMode: "" | "rascunho" | "emitir" };

export async function loadFizConfig(sb: Sb): Promise<FizConfig | null> {
  const { data } = await sb.from("integration_credentials").select("is_active,credentials").eq("provider", "fiz").maybeSingle();
  const c: any = data?.credentials ?? {};
  if (!data?.is_active || !c.api_key) return null;
  const mode = String(c.auto_mode ?? "").trim().toLowerCase();
  return { apiKey: c.api_key, cae: String(c.cae ?? "").trim(), seriesId: c.series_id || undefined, autoMode: mode === "emitir" ? "emitir" : mode === "rascunho" ? "rascunho" : "" };
}

async function fiz(cfg: FizConfig, path: string, init: RequestInit & { idempotencyKey?: string } = {}) {
  const headers: Record<string, string> = { "x-api-key": cfg.apiKey, "Content-Type": "application/json" };
  if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;
  const res = await fetch(`${API}${path}`, { ...init, headers });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = Array.isArray(body?.message) ? body.message.join("; ") : body?.message || body?.error || `HTTP ${res.status}`;
    throw new Error(`FIZ: ${msg}`);
  }
  return body;
}

export const fizCompany = (cfg: FizConfig) => fiz(cfg, "/company");

const VAT: Record<number, string> = { 23: "NORMAL", 13: "INTERMEDIATE", 6: "REDUCED" };
const PAYMENT: Record<string, string> = { viva: "other", mbway: "mbWay", multibanco: "multibanco", transfer: "bankTransfer", on_delivery: "cash" };

async function findOrCreateItem(cfg: FizConfig, name: string, unitPrice: number, vatRate: number, type: "PRODUCT" | "SERVICE") {
  const vat = VAT[Math.round(vatRate)];
  if (!vat) throw new Error(`Taxa de IVA ${vatRate}% sem correspondência na FIZ (isenções precisam de motivo).`);
  const q = new URLSearchParams({ name, unitPrice: String(unitPrice), vatRate: vat, limit: "1" });
  const found = await fiz(cfg, `/items?${q}`);
  const existing = (found?.data ?? found?.items ?? found ?? [])[0];
  if (existing?.id) return existing.id as string;
  const created = await fiz(cfg, "/items", {
    method: "POST",
    idempotencyKey: `item-${name}-${unitPrice}-${vat}`.slice(0, 200),
    body: JSON.stringify({ name: name.slice(0, 200), type, unitPrice, unitType: "UNIT", vatRate: vat, vatTerritory: "CONTINENTAL" }),
  });
  return created.id as string;
}

async function findOrCreateCustomer(cfg: FizConfig, c: { name: string; nif: string; email?: string; phone?: string; address?: string; city?: string; postalCode?: string }) {
  const found = await fiz(cfg, `/customers?${new URLSearchParams({ taxpayerNumber: c.nif, limit: "1" })}`);
  const existing = (found?.data ?? found?.customers ?? found ?? [])[0];
  if (existing?.id) return existing.id as string;
  const body: Record<string, string> = { name: c.name, taxpayerNumber: c.nif, country: "PT" };
  for (const k of ["email", "phone", "address", "city", "postalCode"] as const) if (c[k]) body[k] = String(c[k]);
  const created = await fiz(cfg, "/customers", { method: "POST", idempotencyKey: `customer-${c.nif}`, body: JSON.stringify(body) });
  return created.id as string;
}

/** Creates (once) the FIZ draft for an order and records it in order_invoices. */
export async function ensureDraft(sb: Sb, cfg: FizConfig, orderId: string) {
  const { data: existing } = await sb.from("order_invoices").select("*").eq("order_id", orderId).maybeSingle();
  if (existing?.invoice_id) return existing;
  if (!cfg.cae) throw new Error("Indique o CAE da empresa nas definições da FIZ.");

  const { data: order } = await sb.from("orders").select("id,user_id,guest_name,guest_email,guest_phone,billing_address,shipping_cost,discount_amount,payment_status,payment_method,paid_at,total").eq("id", orderId).maybeSingle();
  if (!order) throw new Error("Encomenda não encontrada.");
  const { data: lines } = await sb.from("order_items").select("product_id,quantity,price,design_data").eq("order_id", orderId);
  const ids = [...new Set((lines ?? []).map((l: any) => String(l.product_id)))];
  const { data: products } = await sb.from("products").select("id,name,vat_rate").in("id", ids);

  const billing: any = order.billing_address ?? {};
  let nif = String(billing.nif ?? "").replace(/\D/g, "");
  if (!nif && order.user_id) {
    const { data: profile } = await sb.from("user_profiles").select("tax_id").eq("user_id", order.user_id).maybeSingle();
    nif = String(profile?.tax_id ?? "").replace(/\D/g, "");
  }
  if (!/^\d{9}$/.test(nif)) throw new Error("A encomenda não tem NIF/NIPC válido.");

  const customerId = await findOrCreateCustomer(cfg, {
    name: order.guest_name || billing.name || "Cliente",
    nif,
    email: order.guest_email ?? undefined,
    phone: order.guest_phone ?? undefined,
    address: [billing.street, billing.number].filter(Boolean).join(", ") || undefined,
    city: billing.city ?? undefined,
    postalCode: billing.postal_code ?? billing.zip_code ?? undefined,
  });

  const items: { id: string; quantity: number }[] = [];
  for (const l of lines ?? []) {
    const p: any = (products ?? []).find((x: any) => String(x.id) === String(l.product_id));
    const custom = !!(l as any).design_data?.customization;
    const name = `${p?.name ?? "Artigo"}${custom ? " (personalizado)" : ""}`;
    items.push({ id: await findOrCreateItem(cfg, name, round2(num(l.price)), p?.vat_rate == null ? 23 : num(p.vat_rate), "PRODUCT"), quantity: num(l.quantity) });
  }
  if (num(order.shipping_cost) > 0) {
    items.push({ id: await findOrCreateItem(cfg, "Portes de envio", round2(num(order.shipping_cost)), 23, "SERVICE"), quantity: 1 });
  }

  const paid = order.payment_status === "paid";
  const payload: Record<string, unknown> = {
    type: paid ? "INVOICE_RECEIPT" : "INVOICE",
    cae: cfg.cae,
    customerId,
    items,
    notes: `Encomenda #${orderId.slice(0, 8).toUpperCase()}`,
  };
  if (cfg.seriesId) payload.seriesId = cfg.seriesId;
  if (num(order.discount_amount) > 0) payload.summary = { globalDiscountType: "AMOUNT", globalDiscountAmount: round2(num(order.discount_amount)) };
  if (paid) payload.payment = { method: PAYMENT[String(order.payment_method)] ?? "other", date: order.paid_at ?? new Date().toISOString() };

  const draft = await fiz(cfg, "/invoices", { method: "POST", idempotencyKey: `order-${orderId}-draft`, body: JSON.stringify(payload) });
  // Read it back for the totals FIZ calculated, so the admin can compare them with the order total.
  const full = await fiz(cfg, `/invoices/${draft.id}`).catch(() => draft);
  const row = {
    order_id: orderId, provider: "fiz", invoice_id: draft.id, status: full.status ?? "DRAFT",
    remote_updated_at: full.updatedAt ?? null, remote_total: num(full.summary?.totalToPay ?? full.summary?.total) || null, error: null,
  };
  await sb.from("order_invoices").upsert(row, { onConflict: "order_id" });
  return row;
}

/** Fiscal and irreversible: issues the order's draft. The idempotency key is stored before calling. */
export async function issueInvoice(sb: Sb, cfg: FizConfig, orderId: string) {
  const row: any = await ensureDraft(sb, cfg, orderId);
  if (row.number) return row;
  const current = await fiz(cfg, `/invoices/${row.invoice_id}`);
  const issueKey = row.issue_key || crypto.randomUUID();
  if (!row.issue_key) await sb.from("order_invoices").update({ issue_key: issueKey }).eq("order_id", orderId);
  const issued = await fiz(cfg, `/invoices/${row.invoice_id}/issue`, {
    method: "POST", idempotencyKey: issueKey, body: JSON.stringify({ expectedUpdatedAt: current.updatedAt }),
  });
  const update = { status: issued.status ?? "ISSUED", number: issued.number ?? issued.documentNumber ?? null, issued_at: new Date().toISOString(), error: null };
  await sb.from("order_invoices").update(update).eq("order_id", orderId);
  await sb.from("order_status_history").insert({ order_id: orderId, status: "invoice_issued", notes: `Fatura emitida na FIZ${update.number ? ` (${update.number})` : ""}.` });
  return { ...row, ...update };
}

export async function invoicePdfUrl(sb: Sb, cfg: FizConfig, orderId: string): Promise<string> {
  const { data: row } = await sb.from("order_invoices").select("invoice_id").eq("order_id", orderId).maybeSingle();
  if (!row?.invoice_id) throw new Error("Ainda não existe fatura para esta encomenda.");
  const pdf = await fiz(cfg, `/invoices/${row.invoice_id}/pdf`);
  return pdf.url;
}

/** Called when a payment is confirmed. Never throws: an invoicing problem must not affect the payment. */
export async function autoInvoiceOnPaid(sb: Sb, orderId: string) {
  try {
    const cfg = await loadFizConfig(sb);
    if (!cfg || !cfg.autoMode) return;
    if (cfg.autoMode === "emitir") await issueInvoice(sb, cfg, orderId);
    else await ensureDraft(sb, cfg, orderId);
  } catch (error) {
    console.error("FIZ auto invoice failed", orderId, error);
    await sb.from("order_invoices").upsert({ order_id: orderId, provider: "fiz", error: String((error as Error).message).slice(0, 500) }, { onConflict: "order_id" });
  }
}
