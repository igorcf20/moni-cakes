// =============================================================================================
// PunchOut (recurso punchout, desligado por padrão). Público, sem JWT (verify_jwt = false em supabase/config.toml):
// quem chama é o sistema de compras da empresa ou o navegador do comprador. Endereço: <site>/functions/v1/punchout
//   cXML  POST text/xml (ou formulário cxml-urlencoded / cxml-base64)
//         PunchOutSetupRequest  confere o login (From + SharedSecret), cria a sessão e responde com a StartPage
//                               <site>/punchout/entrar?s=<token>; edit / inspect trazem o carrinho anterior
//         OrderRequest          pedido de compra: liga cada item ao carrinho devolvido (SupplierPartAuxiliaryID) ou ao
//                               código, recalcula os preços com os da empresa e cria o pedido (pagamento purchase_order)
//   OCI   GET ou POST com USERNAME, PASSWORD e HOOK_URL: cria a sessão e redireciona para a loja
//   Loja  POST JSON { action: "open" | "return" | "cancel", token, items? } (página /punchout/entrar e carrinho):
//         return calcula o carrinho no servidor (preços do grupo da conta da empresa) e devolve o endereço e os
//         campos que o navegador envia ao sistema de compras (cxml-urlencoded ou NEW_ITEM-...).
// Regras puras em _shared/punchout.ts; empresas em Admin > Vendas > PunchOut (tabela punchout_buyers).
// =============================================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/admin.ts";
import { priceItems, round2, type ItemInput } from "../_shared/pricing.ts";
import { lineTaxRate, loadCountry, shippingTaxRate } from "../_shared/countries.ts";
import { loadStoreBrand } from "../_shared/storeBrand.ts";
import { normalizeMoney } from "../_shared/productFeed.ts";
import {
  auxId, buyerLogin, cxmlResponse, cxmlTimestamp, lineDescription, newPayloadId, ociFields, ociLogin, orderMessage, parseAuxId, parseXml,
  readEnvelope, readOrderRequest, readSetupRequest, returnUrlAllowed, totalsDiffer, XML_MAX_BYTES, type MessageLine, type PartRef,
} from "../_shared/punchout.ts";

const SITE_URL = (Deno.env.get("SITE_URL") ?? "").trim().replace(/\/+$/, "");
const SITE_HOST = (() => { try { return new URL(SITE_URL).hostname; } catch { return "loja"; } })();
// deno-lint-ignore no-explicit-any
type Sb = any;
// deno-lint-ignore no-explicit-any
type Buyer = Record<string, any>;

/* ---------- Respostas ---------- */

const xmlResponse = (body: string, status = 200) =>
  new Response(body, { status, headers: { ...corsHeaders, "Content-Type": "text/xml; charset=utf-8" } });

const cxmlStatus = (code: number, text: string, message?: string, startPageUrl?: string) =>
  xmlResponse(cxmlResponse({ payloadId: newPayloadId(SITE_HOST), timestamp: cxmlTimestamp(), code, text, message, startPageUrl }));

const plain = (body: string, status: number) =>
  new Response(body, { status, headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" } });

/* ---------- Sessões ---------- */

const hex = (buf: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
const newToken = () => hex(crypto.getRandomValues(new Uint8Array(24)));
const hashToken = async (t: string) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)));
const startPage = (token: string) => `${SITE_URL}/punchout/entrar?s=${token}`;

async function createSession(sb: Sb, buyer: Buyer, o: {
  operation: string; cookie: string | null; returnUrl: string; extra?: Record<string, string>; contactName?: string; contactEmail?: string; items?: unknown[];
}): Promise<string> {
  const token = newToken();
  const { error } = await sb.from("punchout_sessions").insert({
    buyer_id: buyer.id, token_hash: await hashToken(token), protocol: buyer.protocol, operation: o.operation, buyer_cookie: o.cookie,
    return_url: o.returnUrl, return_extra: o.extra ?? {}, contact_name: o.contactName || null, contact_email: o.contactEmail || null,
    initial_items: o.items ?? [], expires_at: new Date(Date.now() + Number(buyer.session_minutes || 120) * 60_000).toISOString(),
  });
  if (error) throw error;
  return token;
}

async function sessionByToken(sb: Sb, token: unknown) {
  if (typeof token !== "string" || !/^[0-9a-f]{48}$/.test(token)) return null;
  const { data } = await sb.from("punchout_sessions").select("*, buyer:punchout_buyers(*)").eq("token_hash", await hashToken(token)).maybeSingle();
  if (!data?.buyer) return null;
  delete data.buyer.secret_hash;
  return data;
}

/** Itens de um carrinho anterior (edit / inspect / pedido de compra): pela linha guardada ou pelo código do item. */
async function resolveParts(sb: Sb, buyerId: string, parts: PartRef[]): Promise<{ items: ItemInput[]; missing: string[] }> {
  const items: ItemInput[] = [];
  const missing: string[] = [];
  const carts = new Map<string, unknown[] | null>();
  for (const p of parts) {
    const ref = parseAuxId(p.auxId);
    let line: { product_id: string; design_data: Record<string, unknown> } | null = null;
    if (ref) {
      if (!carts.has(ref.sessionId)) {
        const { data } = await sb.from("punchout_sessions").select("cart").eq("id", ref.sessionId).eq("buyer_id", buyerId).maybeSingle();
        carts.set(ref.sessionId, Array.isArray(data?.cart?.lines) ? data.cart.lines : null);
      }
      // deno-lint-ignore no-explicit-any
      const saved = carts.get(ref.sessionId)?.[ref.idx] as any;
      if (saved?.product_id) line = { product_id: String(saved.product_id), design_data: saved.design_data ?? {} };
    }
    if (!line && p.supplierPartId) {
      const { data } = await sb.rpc("punchout_product_by_sku", { _sku: p.supplierPartId });
      if (data?.product_id) line = { product_id: String(data.product_id), design_data: data.design_data ?? {} };
    }
    if (!line && /^[0-9a-f-]{36}$/i.test(p.supplierPartId)) {
      const { data } = await sb.from("products").select("id").eq("id", p.supplierPartId).maybeSingle();
      if (data?.id) line = { product_id: String(data.id), design_data: {} };
    }
    if (!line) { missing.push(p.supplierPartId || p.auxId); continue; }
    items.push({ product_id: line.product_id, quantity: Math.round(p.quantity), price: 0, design_data: line.design_data });
  }
  return { items, missing };
}

/* ---------- Carrinho com os preços da empresa ---------- */

type Priced = {
  lines: MessageLine[];
  saved: { product_id: string; quantity: number; design_data: Record<string, unknown>; unit: number; name: string; sku: string }[];
  subtotal: number; tax: number; total: number; currency: string; locale: string; taxLabel: string;
};

async function priceCart(sb: Sb, buyer: Buyer, sessionId: string, raw: unknown[]): Promise<{ ok: true; cart: Priced } | { ok: false; reason: string }> {
  // deno-lint-ignore no-explicit-any
  const items: ItemInput[] = raw.slice(0, 200).map((i: any) => ({
    product_id: String(i?.product_id ?? ""),
    quantity: Number(i?.quantity),
    price: 0,
    design_data: i?.design_data && typeof i.design_data === "object" && !Array.isArray(i.design_data) ? i.design_data : {},
  }));
  if (!items.length) return { ok: false, reason: "empty" };
  const priced = await priceItems(sb, items, { strict: false, userId: buyer.user_id ?? null });
  if (!priced.ok) return { ok: false, reason: "unavailable" };

  const ids = [...new Set(items.map((i) => String(i.product_id)))];
  const [{ data: products }, { data: skus }, { data: settings }, { data: countryRow }] = await Promise.all([
    sb.from("products").select("id,name,brand_id,lead_time_max_days").in("id", ids),
    sb.rpc("punchout_item_skus", { _items: items }),
    sb.from("store_settings").select("key,value").in("key", ["currency_settings", "features"]),
    sb.from("countries").select("default_locale").eq("code", buyer.country_code).maybeSingle(),
  ]);
  // deno-lint-ignore no-explicit-any
  const setting = (k: string) => (settings ?? []).find((r: any) => r.key === k)?.value ?? null;
  const brandIds = [...new Set((products ?? []).map((p: { brand_id: string | null }) => p.brand_id).filter(Boolean))];
  const brandsOn = setting("features")?.brands === true;
  const { data: brands } = brandsOn && brandIds.length ? await sb.from("brands").select("id,name").in("id", brandIds) : { data: [] };
  // deno-lint-ignore no-explicit-any
  const productById = new Map((products ?? []).map((p: any) => [String(p.id), p]));
  // deno-lint-ignore no-explicit-any
  const brandById = new Map((brands ?? []).map((b: any) => [String(b.id), String(b.name)]));

  const lines: MessageLine[] = [];
  const saved: Priced["saved"] = [];
  items.forEach((it, idx) => {
    // deno-lint-ignore no-explicit-any
    const p: any = productById.get(String(it.product_id)) ?? {};
    const unit = round2(priced.lines[idx].expectedUnit);
    const sku = String(skus?.[idx] ?? "") || String(it.product_id);
    const description = lineDescription(String(p.name ?? ""), it.design_data);
    lines.push({
      quantity: priced.lines[idx].quantity, supplierPartId: sku, auxId: auxId(sessionId, idx), unitPrice: unit, description, unit: "EA",
      unspsc: buyer.unspsc ?? null, brand: p.brand_id ? brandById.get(String(p.brand_id)) ?? null : null,
      leadTimeDays: p.lead_time_max_days == null ? null : Number(p.lead_time_max_days), productId: String(it.product_id),
    });
    saved.push({ product_id: String(it.product_id), quantity: priced.lines[idx].quantity, design_data: it.design_data ?? {}, unit, name: description, sku });
  });
  const country = await loadCountry(sb, buyer.country_code);
  const subtotal = round2(lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0));
  const tax = country ? round2(subtotal * lineTaxRate(country) / 100) : 0;
  return {
    ok: true,
    cart: {
      lines, saved, subtotal, tax, total: round2(subtotal + tax), currency: normalizeMoney(setting("currency_settings")).base,
      locale: countryRow?.default_locale ?? "pt-BR", taxLabel: country?.taxMode === "vat" ? `IVA ${lineTaxRate(country)}%` : "",
    },
  };
}

/* ---------- Navegador (página /punchout/entrar e carrinho) ---------- */

async function storeAction(sb: Sb, body: Record<string, unknown>): Promise<Response> {
  const fail = (code: string, status = 409) => jsonResponse({ error: code }, status);
  const s = await sessionByToken(sb, body.token);
  if (!s) return fail("invalid", 404);
  const buyer: Buyer = s.buyer;
  const expired = new Date(s.expires_at).getTime() < Date.now();
  if (body.action === "open") {
    if (!buyer.is_active) return fail("inactive", 403);
    if (s.status !== "open") return fail("used");
    if (expired) return fail("expired");
    if (!s.opened_at) await sb.from("punchout_sessions").update({ opened_at: new Date().toISOString() }).eq("id", s.id);
    return jsonResponse({
      buyer: buyer.name, protocol: s.protocol, operation: s.operation, test: s.test, expires_at: s.expires_at,
      contact: s.contact_name ?? null, items: s.initial_items ?? [],
    });
  }
  if (body.action !== "return" && body.action !== "cancel") return fail("action", 400);
  if (s.status !== "open") return fail("used");
  if (expired) return fail("expired");
  if (!buyer.is_active) return fail("inactive", 403);
  if (!s.test && (!s.return_url || !returnUrlAllowed(s.return_url, buyer.return_hosts ?? []))) return fail("return_url", 422);

  // Cancelar: volta ao sistema de compras com o carrinho vazio.
  const cancel = body.action === "cancel";
  if (!cancel && s.operation === "inspect") return fail("inspect", 409);
  let cart: Priced | null = null;
  if (!cancel) {
    const priced = await priceCart(sb, buyer, s.id, Array.isArray(body.items) ? body.items : []);
    if (!priced.ok) return fail(priced.reason, 422);
    cart = priced.cart;
  }
  const brand = await loadStoreBrand(sb);
  const lines = cart?.lines ?? [];
  const currency = cart?.currency ?? normalizeMoney((await sb.from("store_settings").select("value").eq("key", "currency_settings").maybeSingle()).data?.value).base;
  let fields: Record<string, string>;
  let message: string | null = null;
  if (s.protocol === "oci") {
    fields = ociFields(lines, currency, s.return_extra ?? {});
  } else {
    message = orderMessage({
      payloadId: newPayloadId(SITE_HOST), timestamp: cxmlTimestamp(), buyerCookie: s.buyer_cookie ?? "", locale: cart?.locale ?? "pt-BR", currency,
      buyer: { domain: buyer.cxml_domain, identity: buyer.cxml_identity }, store: { identity: SITE_HOST, name: brand.name },
      lines, total: cart?.subtotal ?? 0, tax: cart?.tax ?? 0, taxLabel: cart?.taxLabel ?? "", operationAllowed: "edit",
    });
    fields = { "cxml-urlencoded": message };
  }
  const { error } = await sb.from("punchout_sessions").update(cancel
    ? { status: "cancelled", returned_at: new Date().toISOString() }
    : { status: "returned", returned_at: new Date().toISOString(), cart: { lines: cart!.saved, subtotal: cart!.subtotal, tax: cart!.tax }, cart_total: cart!.total, currency })
    .eq("id", s.id).eq("status", "open");
  if (error) throw error;
  return jsonResponse({
    test: s.test, protocol: s.protocol, url: s.test ? null : s.return_url, fields: s.test ? null : fields, preview: s.test ? (message ?? fields) : null,
    summary: cart ? { lines: cart.saved.map((l) => ({ name: l.name, sku: l.sku, quantity: l.quantity, unit: l.unit })), subtotal: cart.subtotal, tax: cart.tax, total: cart.total, currency } : null,
  });
}

/* ---------- OCI ---------- */

async function ociSetup(sb: Sb, params: Record<string, string>): Promise<Response> {
  const login = ociLogin(params);
  if (!login) return plain("PunchOut OCI: USERNAME, PASSWORD e HOOK_URL são obrigatórios.", 400);
  const { data: buyer } = await sb.rpc("punchout_authenticate", { _protocol: "oci", _domain: null, _login: login.username, _secret: login.password });
  if (!buyer) return plain("PunchOut OCI: login inválido.", 401);
  if (!returnUrlAllowed(login.hookUrl, buyer.return_hosts ?? [])) return plain("PunchOut OCI: HOOK_URL não autorizado.", 403);
  const token = await createSession(sb, buyer, { operation: "create", cookie: null, returnUrl: login.hookUrl, extra: login.extra });
  return new Response(null, { status: 303, headers: { ...corsHeaders, Location: startPage(token), "Cache-Control": "no-store" } });
}

/* ---------- cXML ---------- */

async function cxml(sb: Sb, raw: string): Promise<Response> {
  let env;
  try { env = readEnvelope(parseXml(raw)); } catch { return cxmlStatus(400, "Bad Request", "XML inválido."); }
  if (!env.request) return cxmlStatus(400, "Bad Request", "Sem Request.");
  const login = buyerLogin(env);
  const { data: buyer } = login
    ? await sb.rpc("punchout_authenticate", { _protocol: "cxml", _domain: login.domain, _login: login.identity, _secret: login.secret })
    : { data: null };
  if (!buyer) return cxmlStatus(401, "Unauthorized", "Credencial inválida.");

  if (env.requestType === "PunchOutSetupRequest") {
    const setup = readSetupRequest(env.request);
    if (!setup.browserFormPost || !returnUrlAllowed(setup.browserFormPost, buyer.return_hosts ?? [])) {
      return cxmlStatus(400, "Bad Request", "BrowserFormPost ausente ou não autorizado.");
    }
    const prior = setup.operation === "create" ? { items: [] as ItemInput[] } : await resolveParts(sb, buyer.id, setup.items);
    const token = await createSession(sb, buyer, {
      operation: setup.operation, cookie: setup.buyerCookie, returnUrl: setup.browserFormPost,
      contactName: setup.contactName, contactEmail: setup.contactEmail, items: prior.items,
    });
    return cxmlStatus(200, "success", undefined, startPage(token));
  }
  if (env.requestType === "OrderRequest") return orderRequest(sb, buyer, env.request);
  return cxmlStatus(406, "Not Acceptable", `Pedido ${env.requestType ?? ""} não suportado.`);
}

// Mensagens de erro do banco que dizem o que falta (estoque, aluguel...): guardadas como motivo da recusa.
const ORDER_ERROR = /^(Stock insuficiente|Encomenda sem artigos|Aluguel)/;

async function orderRequest(sb: Sb, buyer: Buyer, req: Parameters<typeof readOrderRequest>[0]): Promise<Response> {
  const po = readOrderRequest(req);
  if (!po.orderId) return cxmlStatus(400, "Bad Request", "orderID ausente.");
  if (po.type !== "new") return cxmlStatus(406, "Not Acceptable", "Só pedidos novos (type=new).");
  const reject = async (reason: string, code = 406) => {
    await sb.from("punchout_orders").insert({ buyer_id: buyer.id, po_number: po.orderId, status: "rejected", reason: reason.slice(0, 300), po_total: po.total, currency: po.currency || null, lines: po.lines.length });
    return cxmlStatus(code, "Not Acceptable", reason);
  };

  const { data: existing } = await sb.from("punchout_orders").select("id").eq("buyer_id", buyer.id).eq("po_number", po.orderId).eq("status", "created").maybeSingle();
  if (existing) return cxmlStatus(200, "OK", "Pedido de compra já recebido.");
  if (!buyer.accept_orders) return reject("Esta empresa não envia pedidos de compra por aqui.");
  if (!buyer.user_id) return reject("Empresa sem conta de cliente ligada na loja.");

  const { data: cur } = await sb.from("store_settings").select("value").eq("key", "currency_settings").maybeSingle();
  const base = normalizeMoney(cur?.value).base;
  if ((po.currency && po.currency !== base) || po.lines.some((l) => l.currency && l.currency !== base)) return reject(`Moeda diferente da loja (${base}).`);
  if (!po.lines.length) return reject("Pedido sem itens.");
  if (po.lines.some((l) => !Number.isInteger(l.quantity) || l.quantity <= 0)) return reject("Quantidade inválida.");

  const resolved = await resolveParts(sb, buyer.id, po.lines);
  if (resolved.missing.length) return reject(`Item desconhecido: ${resolved.missing.slice(0, 3).join(", ")}.`);
  const priced = await priceItems(sb, resolved.items, { strict: false, userId: buyer.user_id });
  if (!priced.ok) return reject(priced.reason);

  const country = await loadCountry(sb, po.shipTo?.country || buyer.country_code);
  if (!country) return reject("Não entregamos no país do endereço de entrega.");
  const units = priced.lines.map((l) => round2(l.expectedUnit));
  const subtotal = round2(units.reduce((s, u, i) => s + u * priced.lines[i].quantity, 0));
  const vat = round2(subtotal * lineTaxRate(country) / 100);
  const shippingNet = round2(Number(buyer.shipping_fee) || 0);
  const shippingGross = round2(shippingNet * (1 + shippingTaxRate(country) / 100));
  const total = round2(subtotal + vat + shippingGross);

  const [{ data: profile }, { data: account }] = await Promise.all([
    sb.from("user_profiles").select("full_name,phone,tax_id,tax_id_country").eq("user_id", buyer.user_id).maybeSingle(),
    sb.auth.admin.getUserById(buyer.user_id),
  ]);
  const ship = po.shipTo;
  const shippingAddress = {
    name: ship?.deliverTo || ship?.name || buyer.name, company: ship?.name || buyer.name, street: ship?.street ?? "", city: ship?.city ?? "",
    district: ship?.state ?? "", postal_code: ship?.postalCode ?? "", country: country.code, country_code: country.code,
  };
  const taxId = String(profile?.tax_id ?? "") || null;
  const payload = {
    guest_email: ship?.email || account?.user?.email || null,
    guest_name: buyer.name,
    guest_phone: ship?.phone || profile?.phone || null,
    total, subtotal_net: subtotal, vat_total: vat,
    shipping_address: shippingAddress,
    billing_address: { ...shippingAddress, name: buyer.name, tax_id: taxId, tax_id_country: taxId ? String(profile?.tax_id_country ?? country.code) : null },
    shipping_cost: shippingNet, coupon_code: null, discount_amount: 0,
    payment_method: "purchase_order",
    notes: [`Pedido de compra ${po.orderId} (PunchOut, ${buyer.name})`, po.comments].filter(Boolean).join("\n").slice(0, 2000),
    has_customizable_items: false,
    terms_accepted_at: new Date().toISOString(),
  };
  const items = resolved.items.map((it, i) => ({ ...it, quantity: priced.lines[i].quantity, price: units[i] }));
  const { data: created, error } = await sb.rpc("create_order_with_benefits", {
    _user_id: buyer.user_id, _order: payload, _items: items, _gift_code: null, _gift_amount: 0, _points: 0, _points_amount: 0,
  });
  if (error) {
    const message = String(error.message ?? "");
    if (ORDER_ERROR.test(message)) return reject(message);
    console.error("punchout order failed", error);
    return cxmlStatus(500, "Internal Server Error", "Erro ao criar o pedido.");
  }
  const { error: logError } = await sb.from("punchout_orders").insert({
    buyer_id: buyer.id, po_number: po.orderId, order_id: created?.id ?? null, status: "created", po_total: po.total, store_total: total,
    currency: base, // O total do pedido de compra pode vir com ou sem imposto e frete: aviso só se não bater com nenhum.
    mismatch: [total, subtotal, round2(subtotal + vat)].every((v) => totalsDiffer(po.total, v)), lines: items.length,
  });
  if (logError) console.error("punchout order log", logError);
  return cxmlStatus(200, "OK");
}

/* ---------- Entrada ---------- */

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const sb = supabaseAdmin();
    const url = new URL(req.url);
    const query = Object.fromEntries(url.searchParams.entries());
    if (req.method === "GET") {
      if (Object.keys(query).some((k) => k.toUpperCase() === "USERNAME")) {
        const { data: on } = await sb.rpc("feature_enabled", { _key: "punchout", _default: false });
        return on ? ociSetup(sb, query) : plain("not_found", 404);
      }
      return plain("PunchOut", 200);
    }
    if (req.method !== "POST") return plain("method_not_allowed", 405);
    if (Number(req.headers.get("content-length") || 0) > XML_MAX_BYTES) return plain("too_large", 413);
    const raw = await req.text();
    if (raw.length > XML_MAX_BYTES) return plain("too_large", 413);
    const type = (req.headers.get("content-type") || "").toLowerCase();

    const { data: on } = await sb.rpc("feature_enabled", { _key: "punchout", _default: false });
    if (type.includes("application/json")) {
      if (!on) return jsonResponse({ error: "feature_off" }, 404);
      let body: Record<string, unknown> = {};
      try { body = JSON.parse(raw); } catch { return jsonResponse({ error: "json" }, 400); }
      return await storeAction(sb, body ?? {});
    }
    if (type.includes("application/x-www-form-urlencoded")) {
      const form = Object.fromEntries(new URLSearchParams(raw).entries());
      const xml = form["cxml-urlencoded"] ?? (form["cxml-base64"] ? new TextDecoder().decode(Uint8Array.from(atob(form["cxml-base64"]), (c) => c.charCodeAt(0))) : null);
      if (xml != null) return on ? await cxml(sb, xml) : cxmlStatus(403, "Forbidden", "PunchOut desligado nesta loja.");
      return on ? await ociSetup(sb, { ...query, ...form }) : plain("not_found", 404);
    }
    return on ? await cxml(sb, raw) : cxmlStatus(403, "Forbidden", "PunchOut desligado nesta loja.");
  } catch (error) {
    console.error("punchout error", error);
    return jsonResponse({ error: "server" }, 500);
  }
});
