import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/admin.ts";
import { couponDiscount, priceItems, round2, shippingFor } from "../_shared/pricing.ts";
import { lineTaxRate, loadCountry, shippingTaxRate } from "../_shared/countries.ts";
import { cleanTaxId, isValidTaxId, taxIdType } from "../_shared/taxId.ts";
import { quoteShipping } from "../_shared/shipping/quote.ts";
import { digitalOnlyIds } from "../_shared/digitalProducts.ts";
import { stockProblems } from "../_shared/cartStock.ts";
import { methodBlock, paymentDiscount } from "../_shared/payments/methods.ts";
import { normalizeRewardSettings, redeemPoints } from "../_shared/rewardPoints.ts";
import { answerLines, fieldsFor, localText, normalizeField } from "../_shared/checkoutFields.ts";
import { cartLeadTime, estimateDelivery, normalizeDeliverySettings, type DeliveryEstimate } from "../_shared/deliveryDates.ts";

// Creates the customer's order on the server. Every amount (lines, VAT, shipping, coupon, total) is
// recalculated from the database; the browser only says what is being bought and where it goes.
// The insert runs through create_order_server, which applies the same database rules as a customer
// order (coupon consumed atomically, stock reserved, status forced to pending).
//
// Body: { order: { country_code, shipping_address, billing_address, coupon_code, payment_method,
//                  delivery_method_id | shipping_service_id, gift_card_code, reward_points, notes,
//                  checkout_fields: { <id do campo>: true | "<id da opção>" | "<texto>" } }, items: [{ product_id, quantity, price, design_data }] }
// country_code (ISO, ex. BR) escolhe as regras do país (tabela countries): imposto e documento fiscal.
// shipping_service_id: forma de envio (Admin > Frete e transportadoras), cotada de novo aqui com o endereço;
// sem ela, delivery_method_id (retirada na loja ou as formas de entrega antigas).
const fail = (message: string, status = 409) => jsonResponse({ error: message, message }, status);
const STOCK_MESSAGE = "Stock insuficiente para um dos artigos. Reduza a quantidade ou remova o artigo do carrinho.";
// Database exceptions written for customers (stock, coupon, session) can be shown as they are.
const CUSTOMER_ERROR = /^(Stock insuficiente|Cupom|Sessão expirada|Encomenda sem artigos|Vale-presente|Pontos|Campos do pedido|Aluguel)/;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  if (Number(req.headers.get("content-length") || 0) > 512_000) return fail("Pedido demasiado grande.", 413);

  try {
    const sb = supabaseAdmin();
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return fail("Sessão expirada. Inicie sessão novamente.", 401);
    const { data: auth, error: authError } = await sb.auth.getUser(token);
    if (authError || !auth?.user) return fail("Sessão expirada. Inicie sessão novamente.", 401);
    const user = auth.user;

    const body = await req.json().catch(() => null);
    const order = body?.order ?? {};
    const items: any[] = Array.isArray(body?.items) ? body.items : [];
    if (!items.length || items.length > 200) return fail("Encomenda sem artigos.");

    // Invoice data comes from the profile, never from the request.
    const rawAddress = order.shipping_address && typeof order.shipping_address === "object" ? order.shipping_address : {};
    const country = await loadCountry(sb, order.country_code ?? rawAddress.country_code ?? null);
    if (!country) return fail("Ainda não entregamos neste país.", 422);

    const { data: profile } = await sb.from("user_profiles").select("full_name,phone,tax_id,tax_id_country").eq("user_id", user.id).maybeSingle();
    const taxId = cleanTaxId(String(profile?.tax_id ?? ""));
    // Perfis antigos (sem país no documento) vêm da loja de Portugal.
    const taxIdCountry = String(profile?.tax_id_country ?? (taxId ? "PT" : "")).toUpperCase();
    const taxIdOk = !country.taxIdRequired || (taxIdCountry === country.code && isValidTaxId(country.taxIdKind, taxId));
    if (!profile?.full_name?.trim() || !String(profile?.phone ?? "").trim() || !taxIdOk) {
      return fail("Complete o seu perfil (nome, telefone e documento fiscal do país de entrega) antes de finalizar o pedido.", 422);
    }

    // Payment method must be one the store has switched on (country and order value are checked below).
    const { data: payment } = await sb.from("payment_config").select("type,is_active,countries,discount_percent,min_total,max_total")
      .eq("type", String(order.payment_method ?? "")).eq("is_active", true).maybeSingle();
    if (!payment) return fail("Escolha um método de pagamento disponível.");
    if (methodBlock(payment, country.code, 0) === "country") return fail("Este meio de pagamento não está disponível no país de entrega. Escolha outro.");

    const cleanItems = items.map((i) => ({
      product_id: String(i?.product_id ?? ""),
      quantity: Number(i?.quantity),
      price: Math.round(Number(i?.price) * 100) / 100,
      design_data: i?.design_data && typeof i.design_data === "object" ? i.design_data : null,
    }));
    const priced = await priceItems(sb, cleanItems, { userId: user.id });
    if (!priced.ok) return fail(`${priced.reason} Atualize o carrinho e tente novamente.`);

    // Estoque de agora (o item pode ter esgotado depois de entrar no carrinho). O trigger da linha volta a conferir
    // na gravação; aqui o site recebe o código estável e quais linhas ajustar.
    // Com a reserva no carrinho ligada, as unidades reservadas por outros clientes não contam; as do comprador sim.
    const { data: stock, error: stockError } = await sb.rpc("cart_stock_check_for", {
      _items: cleanItems.map((i) => ({ product_id: i.product_id, quantity: i.quantity, design_data: i.design_data })),
      _user_id: user.id,
    });
    if (stockError) console.error("create-order stock check", stockError);
    const shortages = Array.isArray(stock?.lines) ? stockProblems(cleanItems, stock.lines) : [];
    if (shortages.length) {
      return jsonResponse({ error: STOCK_MESSAGE, message: STOCK_MESSAGE, code: "out_of_stock",
        items: shortages.map((s) => ({ index: s.index, product_id: cleanItems[s.index].product_id, available: s.available })) }, 409);
    }

    // Imposto pela regra do país (no Brasil o preço já é final: taxa 0).
    const taxRate = lineTaxRate(country);
    const subtotalNet = round2(priced.lines.reduce((s, l) => s + l.price * l.quantity, 0));
    const vatTotal = round2(subtotalNet * (taxRate / 100));
    // Produtos digitais sem entrega física (recurso digital_products): sem peso e, se só houver eles, sem frete.
    const digitalIds = await digitalOnlyIds(sb, cleanItems.map((i) => i.product_id));
    const digitalOnly = digitalIds.size > 0 && cleanItems.every((i) => digitalIds.has(i.product_id));
    const weightKg = priced.lines.reduce((s, l, idx) => s + (digitalIds.has(cleanItems[idx].product_id) ? 0 : l.weightKg * l.quantity), 0);

    const shippingAddress = { ...rawAddress, country_code: country.code };
    const serviceId = order.shipping_service_id ? String(order.shipping_service_id) : null;
    let shippingNet: number;
    let shippingDetails: Record<string, unknown> | null = null;
    if (digitalOnly) {
      shippingNet = 0;
      shippingDetails = { digital: true };
    } else if (serviceId) {
      const quote = await quoteShipping(sb, {
        country: { code: country.code, currency: country.currency, freeShippingFromCents: country.freeShippingFromCents },
        address: { postal_code: shippingAddress.postal_code ?? null, region: shippingAddress.district ?? shippingAddress.state ?? null, city: shippingAddress.city ?? null },
        items: priced.lines.map((l, idx) => ({ product_id: cleanItems[idx].product_id, quantity: l.quantity, unitNet: l.price })),
        serviceId,
      });
      const option = quote.options.find((o) => o.service_id === serviceId);
      if (!option) return fail("A forma de envio escolhida não atende este endereço. Escolha outra.");
      // Moeda base da loja, como os preços dos produtos e os totais do pedido.
      shippingNet = round2(option.price_cents / 10 ** (new Intl.NumberFormat("en", { style: "currency", currency: option.currency }).resolvedOptions().maximumFractionDigits ?? 2));
      shippingDetails = {
        carrier: option.carrier, name: option.name, region: option.region, source: option.source, free: option.free,
        days_min: option.days_min, days_max: option.days_max, weight_kg: quote.weight_kg, currency: option.currency,
      };
    } else {
      const shipping = await shippingFor(sb, {
        deliveryMethodId: order.delivery_method_id ? String(order.delivery_method_id) : null,
        district: shippingAddress.district ?? shippingAddress.state ?? null,
        weightKg,
        subtotalNet,
      });
      if (!shipping.ok) return fail(shipping.reason);
      shippingNet = round2(shipping.cost);
    }
    const shippingGross = round2(shippingNet * (1 + shippingTaxRate(country) / 100));

    const coupon = await couponDiscount(sb, order.coupon_code ?? null, subtotalNet, user.id);
    if (!coupon.ok) return fail(coupon.reason);

    // Campos extra do checkout (Admin > Campos do checkout): obrigatórios conferidos e preços somados aqui, com o
    // imposto do país por cima (como os produtos). Com o recurso desligado, as respostas são ignoradas.
    let extrasLines: ReturnType<typeof answerLines>["lines"] = [];
    let extrasNet = 0;
    const { data: fieldsOn } = await sb.rpc("feature_enabled", { _key: "checkout_fields", _default: true });
    if (fieldsOn) {
      const { data: fieldRows } = await sb.from("checkout_fields").select("*").eq("is_active", true);
      const fields = fieldsFor((fieldRows ?? []).map(normalizeField), country.code);
      const answered = answerLines(fields, order.checkout_fields);
      if (answered.errors.length) {
        const f = fields.find((x) => x.id === answered.errors[0].field_id);
        return fail(`Campos do pedido: confira "${f ? localText(f.label_i18n, "pt-BR", f.name) : ""}".`, 422);
      }
      extrasLines = answered.lines;
      extrasNet = answered.total;
    }
    const extrasVat = round2(extrasNet * (taxRate / 100));

    const totalBeforePayment = round2(subtotalNet + vatTotal + shippingGross + extrasNet + extrasVat - coupon.discount);
    // Valor mínimo / máximo do meio de pagamento e desconto do meio (ex.: Pix), sobre os produtos e nunca sobre o frete.
    const block = methodBlock(payment, country.code, totalBeforePayment);
    if (block === "min" || block === "max") return fail("Este meio de pagamento não aceita o valor deste pedido. Escolha outro.");
    const payDiscount = paymentDiscount(payment, round2(subtotalNet + vatTotal - coupon.discount));
    const totalBeforePoints = round2(totalBeforePayment - payDiscount);
    // Pontos (Admin > Pontos): o cliente diz quantos quer usar; o servidor confere saldo, mínimo e máximo do pedido.
    let pointsUsed = 0;
    let pointsAmount = 0;
    const wantPoints = Math.floor(Number(order.reward_points) || 0);
    if (wantPoints > 0) {
      const [{ data: flags }, { data: rules }, { data: balance }] = await Promise.all([
        sb.rpc("feature_enabled", { _key: "reward_points", _default: false }),
        sb.from("store_settings").select("value").eq("key", "reward_points").maybeSingle(),
        sb.rpc("reward_points_balance_for", { _user_id: user.id }),
      ]);
      if (!flags) return fail("Pontos: indisponíveis nesta loja.");
      const redeem = redeemPoints(wantPoints, Number(balance) || 0, round2(subtotalNet + vatTotal - coupon.discount - payDiscount),
        totalBeforePoints, normalizeRewardSettings(rules?.value));
      if (!redeem.ok) return fail("Pontos: saldo insuficiente ou abaixo do mínimo para usar.");
      pointsUsed = redeem.points;
      pointsAmount = redeem.amount;
    }
    const totalBeforeGift = round2(totalBeforePoints - pointsAmount);
    // Vale-presente (Admin > Vales-presente): desconta do total o saldo disponível, até zerar o pedido.
    const giftCode = String(order.gift_card_code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    let giftAmount = 0;
    if (giftCode) {
      const { data: gift } = await sb.from("gift_cards").select("balance,is_active,expires_at").eq("code", giftCode).maybeSingle();
      if (!gift || !gift.is_active || (gift.expires_at && new Date(gift.expires_at) < new Date()) || Number(gift.balance) <= 0) {
        return fail("Vale-presente: inválido, expirado ou sem saldo.");
      }
      giftAmount = round2(Math.min(Number(gift.balance), totalBeforeGift));
    }
    const total = round2(totalBeforeGift - giftAmount);
    const { data: products } = await sb.from("products").select("id,customizable").in("id", [...new Set(cleanItems.map((i) => i.product_id))]);

    // Prazos e entrega (Admin > Prazos e entrega): enviar até e chega entre, com o produto mais demorado do carrinho e
    // os dias da forma de envio. Só informativo: não muda valores.
    let estimate: DeliveryEstimate | null = null;
    const { data: datesOn } = await sb.rpc("feature_enabled", { _key: "delivery_dates", _default: false });
    if (datesOn && !digitalOnly) {
      const [{ data: rules }, { data: leadRows }] = await Promise.all([
        sb.from("store_settings").select("value").eq("key", "delivery_dates").maybeSingle(),
        sb.from("products").select("id,lead_time_min_days,lead_time_max_days,technical_specs,specifications")
          .in("id", [...new Set(cleanItems.map((i) => i.product_id))]),
      ]);
      const rulesOk = normalizeDeliverySettings(rules?.value);
      const days = (v: unknown) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));
      const transit = shippingDetails ? { min: days(shippingDetails.days_min), max: days(shippingDetails.days_max) } : null;
      estimate = estimateDelivery(new Date(), cartLeadTime(leadRows ?? [], rulesOk), transit, rulesOk, country.code);
    }
    const customizable = cleanItems.some((i) =>
      !!i.design_data?.customization || !!i.design_data?.cartItemKey || Array.isArray(i.design_data?.planos)
      || (products ?? []).some((p: any) => p.id === i.product_id && p.customizable === true));

    const payload = {
      guest_email: user.email ?? null,
      guest_name: String(profile.full_name).trim(),
      guest_phone: String(profile.phone).trim(),
      total,
      subtotal_net: subtotalNet,
      vat_total: vatTotal,
      shipping_address: shippingAddress,
      billing_address: {
        ...(order.billing_address && typeof order.billing_address === "object" ? order.billing_address : shippingAddress),
        tax_id: taxId || null, tax_id_type: taxId ? taxIdType(country.taxIdKind, taxId) : null, tax_id_country: taxId ? taxIdCountry : null,
        // campo antigo, lido pela faturação de Portugal (FIZ)
        ...(country.taxIdKind === "pt_nif" ? { nif: taxId } : {}),
      },
      shipping_cost: shippingNet,
      coupon_code: coupon.code,
      discount_amount: coupon.discount,
      payment_method: payment.type,
      delivery_method_id: serviceId || digitalOnly ? null : order.delivery_method_id ?? null,
      notes: String(order.notes ?? "").slice(0, 2000) || null,
      has_customizable_items: customizable,
      terms_accepted_at: new Date().toISOString(),
    };

    const { data: created, error } = await sb.rpc("create_order_with_benefits", {
      _user_id: user.id, _order: payload, _items: cleanItems, _gift_code: giftCode || null, _gift_amount: giftAmount,
      _points: pointsUsed, _points_amount: pointsAmount,
    });
    if (error) {
      const message = String(error.message ?? "");
      // Esgotou entre a verificação acima e a gravação: o mesmo código estável.
      if (message.startsWith("Stock insuficiente")) return jsonResponse({ error: STOCK_MESSAGE, message: STOCK_MESSAGE, code: "out_of_stock", items: [] }, 409);
      if (CUSTOMER_ERROR.test(message)) return fail(message);
      console.error("create-order insert failed", error);
      return jsonResponse({ error: "Erro ao processar a encomenda. Tente novamente." }, 500);
    }
    // Forma de envio escolhida e desconto do pagamento (colunas fora do create_order_checkout): gravados logo a
    // seguir, pelo servidor (o total já os inclui).
    const extra: Record<string, unknown> = {};
    if (serviceId && !digitalOnly) Object.assign(extra, { shipping_service_id: serviceId, shipping_details: shippingDetails });
    if (payDiscount > 0) extra.payment_discount = payDiscount;
    if (extrasLines.length) Object.assign(extra, { checkout_fields: extrasLines, extras_amount: extrasNet, extras_vat: extrasVat });
    if (estimate) {
      Object.assign(extra, { estimated_ship_by: estimate.ship_by, estimated_delivery_from: estimate.deliver_from, estimated_delivery_to: estimate.deliver_to });
    }
    // Afiliado do link (?ref=): o código vem do navegador; vale só se o parceiro estiver ativo, o recurso ligado e
    // não for o próprio comprador (affiliate_for_order). A comissão nasce no banco quando o pedido fica pago.
    const affiliateCode = typeof body?.affiliate_code === "string" ? body.affiliate_code.trim().toLowerCase().slice(0, 40) : "";
    if (affiliateCode && /^[a-z0-9-]{3,40}$/.test(affiliateCode)) {
      const { data: affiliateId } = await sb.rpc("affiliate_for_order", { _code: affiliateCode, _buyer: user.id });
      if (affiliateId) extra.affiliate_id = affiliateId;
    }
    if (Object.keys(extra).length && created?.id) {
      const { error: extraError } = await sb.from("orders").update(extra).eq("id", created.id);
      if (extraError) console.error("create-order extra columns", extraError);
      else Object.assign(created, extra);
    }
    return jsonResponse({ order: created });
  } catch (error) {
    console.error("create-order error", error);
    return jsonResponse({ error: "Erro ao processar a encomenda. Tente novamente." }, 500);
  }
});
