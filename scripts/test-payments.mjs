// Auto-teste dos meios de pagamento. Correr: node --experimental-strip-types scripts/test-payments.mjs
// Regras (país, valor mínimo e máximo, desconto) no servidor e no site (têm de dar o mesmo resultado) e os
// provedores online (Mercado Pago, Stripe, PayPal) com as respostas das APIs simuladas.
import assert from "node:assert/strict";
import * as S from "../supabase/functions/_shared/payments/methods.ts";
import { GATEWAYS, rejectPayment } from "../supabase/functions/_shared/payments/gateways.ts";

// lucide-react não é necessário aqui: a regra do site é a mesma função, copiada sem os ícones.
const { readFileSync } = await import("node:fs");
const clientSrc = readFileSync(new URL("../src/lib/paymentMethods.ts", import.meta.url), "utf8");
const bodyOf = (src, name) => {
  const start = src.indexOf(`export function ${name}(`);
  assert.ok(start >= 0, `${name} no ficheiro`);
  let depth = 0, i = src.indexOf("{", src.indexOf(")", start));
  for (let j = i; j < src.length; j++) {
    if (src[j] === "{") depth++;
    if (src[j] === "}" && --depth === 0) return src.slice(i, j + 1).replace(/\s+/g, " ");
  }
  return "";
};
assert.equal(bodyOf(clientSrc, "methodBlock"), bodyOf(readFileSync(new URL("../supabase/functions/_shared/payments/methods.ts", import.meta.url), "utf8"), "methodBlock"),
  "methodBlock do site igual ao do servidor");

// ── País, valor mínimo e máximo ──────────────────────────────────────────────
const pix = { type: "pix", is_active: true, countries: ["BR"], discount_percent: 5 };
assert.equal(S.methodBlock(pix, "BR", 100), null);
assert.equal(S.methodBlock(pix, "br", 100), null, "código em minúsculas");
assert.equal(S.methodBlock(pix, "PT", 100), "country");
assert.equal(S.methodBlock({ type: "paypal", countries: [] }, "JP", 10), null, "sem países = todos");
assert.equal(S.methodBlock({ type: "x", is_active: false }, "BR", 10), "inactive");
assert.equal(S.methodBlock({ type: "x", min_total: "50" }, "BR", 49.99), "min");
assert.equal(S.methodBlock({ type: "x", min_total: 50 }, "BR", 50), null);
assert.equal(S.methodBlock({ type: "x", max_total: 1000 }, "BR", 1000.01), "max");
assert.equal(S.methodBlock({ type: "x", max_total: 0 }, "BR", 99999), null, "máximo 0 = sem limite");

// ── Desconto (sobre os produtos, 0 a 50%) ───────────────────────────────────
assert.equal(S.paymentDiscount(pix, 200), 10);
assert.equal(S.paymentDiscount({ type: "x", discount_percent: "7.5" }, 99.9), 7.49);
assert.equal(S.paymentDiscount({ type: "x", discount_percent: 80 }, 100), 50, "máximo 50%");
assert.equal(S.paymentDiscount({ type: "x", discount_percent: -3 }, 100), 0);
assert.equal(S.paymentDiscount({ type: "x" }, 100), 0);
assert.equal(S.toMinor(12.345, "EUR"), 1235);
assert.equal(S.toMinor(1000, "JPY"), 1000, "iene sem casas decimais");
assert.ok(S.isGatewayMethod("stripe") && !S.isGatewayMethod("pix") && !S.isGatewayMethod("viva"));

// ── Provedores com a API simulada ───────────────────────────────────────────
const calls = [];
let replies = [];
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), init });
  const next = replies.shift();
  assert.ok(next, `resposta simulada para ${url}`);
  return new Response(JSON.stringify(next.body), { status: next.status ?? 200 });
};
const input = {
  orderId: "11111111-2222-3333-4444-555555555555", amountMinor: 15990, currency: "BRL", description: "Loja #11111111",
  storeName: "Minha Loja", email: "c@x.com", name: "Cliente", locale: "pt-BR",
  returnUrl: "https://loja.test/pedido/1/sucesso?pagamento=retorno", cancelUrl: "https://loja.test/pedido/1/sucesso?pagamento=cancelado",
  notifyUrl: "https://loja.test/functions/v1/payment-webhook?provider=x",
};
const session = { amount_cents: 15990, currency: "BRL" };

// Mercado Pago
const mpAcc = { environment: "demo", credentials: { access_token: "TEST-abc" }, public_config: { max_installments: "6" } };
assert.equal(GATEWAYS.mercado_pago.currency(mpAcc, "EUR"), "BRL", "Mercado Pago cobra na moeda da conta");
replies = [{ body: { id: "pref-1", init_point: "https://mp.test/checkout/pref-1" } }];
let created = await GATEWAYS.mercado_pago.create(mpAcc, input);
assert.equal(created.ref, "pref-1");
assert.equal(created.url, "https://mp.test/checkout/pref-1");
let sent = JSON.parse(calls.at(-1).init.body);
assert.equal(sent.items[0].unit_price, 159.9);
assert.equal(sent.external_reference, input.orderId);
assert.equal(sent.payment_methods.installments, 6);
assert.match(calls.at(-1).init.headers.Authorization, /^Bearer TEST-abc$/);

replies = [{ body: { results: [
  { id: 1, status: "rejected", external_reference: input.orderId, transaction_amount: 159.9, currency_id: "BRL" },
  { id: 2, status: "approved", external_reference: input.orderId, transaction_amount: 159.9, currency_id: "BRL" },
] } }];
let state = await GATEWAYS.mercado_pago.check(mpAcc, "pref-1", input.orderId);
assert.equal(state.status, "paid");
assert.equal(state.paymentId, "2");
assert.equal(rejectPayment(state, session, input.orderId), null, "pagamento aprovado cobre a sessão");
assert.equal(rejectPayment({ ...state, amountMinor: 15000 }, session, input.orderId), "amount_too_low");
assert.equal(rejectPayment({ ...state, currency: "USD" }, session, input.orderId), "currency_mismatch");
assert.equal(rejectPayment({ ...state, reference: "outro" }, session, input.orderId), "reference_mismatch");
assert.equal(rejectPayment({ ...state, status: "pending" }, session, input.orderId), "status_pending");
replies = [{ body: { results: [{ id: 3, status: "pending", external_reference: input.orderId, transaction_amount: 159.9, currency_id: "BRL" }] } }];
assert.equal((await GATEWAYS.mercado_pago.check(mpAcc, "pref-1", input.orderId)).status, "pending", "Pix ou boleto à espera");
replies = [{ body: { results: [] } }];
assert.equal(await GATEWAYS.mercado_pago.check(mpAcc, "pref-1", input.orderId), null, "sem pagamento ainda");

// Stripe
const stAcc = { environment: "demo", credentials: { secret_key: "sk_test_x" }, public_config: {} };
const eur = { ...input, currency: "EUR", amountMinor: 4250 };
replies = [{ body: { id: "cs_test_1", url: "https://checkout.stripe.test/c/cs_test_1" } }];
created = await GATEWAYS.stripe.create(stAcc, eur);
assert.equal(created.ref, "cs_test_1");
const form = new URLSearchParams(calls.at(-1).init.body);
assert.equal(form.get("line_items[0][price_data][unit_amount]"), "4250");
assert.equal(form.get("line_items[0][price_data][currency]"), "eur");
assert.equal(form.get("client_reference_id"), input.orderId);
assert.equal(form.get("mode"), "payment");
replies = [{ body: { id: "cs_test_1", status: "complete", payment_status: "paid", amount_total: 4250, currency: "eur", client_reference_id: input.orderId, payment_intent: "pi_1" } }];
state = await GATEWAYS.stripe.check(stAcc, "cs_test_1", input.orderId);
assert.equal(state.status, "paid");
assert.equal(rejectPayment(state, { amount_cents: 4250, currency: "EUR" }, input.orderId), null);
replies = [{ body: { id: "cs_test_1", status: "complete", payment_status: "unpaid", amount_total: 4250, currency: "eur", client_reference_id: input.orderId } }];
assert.equal((await GATEWAYS.stripe.check(stAcc, "cs_test_1", input.orderId)).status, "pending", "Multibanco à espera");
assert.equal(await GATEWAYS.stripe.check(stAcc, "../evil", input.orderId), null, "referência inválida nem chega à API");

// PayPal (aprovado no regresso: o servidor captura)
const ppAcc = { environment: "demo", credentials: { client_id: "id", client_secret: "sec" }, public_config: {} };
replies = [
  { body: { access_token: "tok" } },
  { body: { id: "5O190127TN364715T", status: "PAYER_ACTION_REQUIRED", links: [{ rel: "payer-action", href: "https://paypal.test/pay" }] } },
];
created = await GATEWAYS.paypal.create(ppAcc, eur);
assert.equal(created.url, "https://paypal.test/pay");
assert.ok(calls.at(-1).url.startsWith("https://api-m.sandbox.paypal.com/"), "ambiente de teste = sandbox");
assert.equal(JSON.parse(calls.at(-1).init.body).purchase_units[0].amount.value, "42.50");
replies = [
  { body: { access_token: "tok" } },
  { body: { id: "5O190127TN364715T", status: "APPROVED", purchase_units: [{ custom_id: input.orderId, amount: { currency_code: "EUR", value: "42.50" } }] } },
  { body: { id: "5O190127TN364715T", status: "COMPLETED", purchase_units: [{ custom_id: input.orderId, payments: { captures: [{ id: "CAP1", status: "COMPLETED", amount: { currency_code: "EUR", value: "42.50" } }] } }] } },
];
state = await GATEWAYS.paypal.check(ppAcc, "5O190127TN364715T", input.orderId);
assert.ok(calls.at(-1).url.endsWith("/capture"), "aprovado é capturado");
assert.equal(calls.at(-1).init.headers["PayPal-Request-Id"], "capture-5O190127TN364715T", "captura idempotente");
assert.equal(state.status, "paid");
assert.equal(state.paymentId, "CAP1");
assert.equal(rejectPayment(state, { amount_cents: 4250, currency: "EUR" }, input.orderId), null);

// Erro do provedor vira exceção (o servidor responde com um código estável e não marca nada como pago).
replies = [{ status: 401, body: { message: "invalid token" } }];
await assert.rejects(() => GATEWAYS.mercado_pago.create(mpAcc, input), /HTTP 401/);

console.log("test-payments: ok");
