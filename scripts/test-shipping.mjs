// Auto-teste do frete por transportadora. Correr: node --experimental-strip-types scripts/test-shipping.mjs
// Regras puras (_shared/shipping/rules.ts) e a cotação completa (quote.ts) com uma base de dados falsa
// e as respostas do Melhor Envio e do Sendcloud simuladas.
import assert from "node:assert/strict";
import * as R from "../supabase/functions/_shared/shipping/rules.ts";
import { quoteShipping } from "../supabase/functions/_shared/shipping/quote.ts";
import { findQuote } from "../supabase/functions/_shared/shipping/providers.ts";

// ── Códigos postais e zonas ─────────────────────────────────────────────────
assert.equal(R.normPostal("01310-100"), "01310100");
assert.ok(R.postalMatches("9000..9399", "9004-521"), "Funchal na faixa da Madeira");
assert.ok(!R.postalMatches("9000..9399", "9500-123"), "Ponta Delgada fora da Madeira");
assert.ok(R.postalMatches("9500..9999", "9500-123"));
assert.ok(R.postalMatches("07", "07001"), "prefixo Baleares");
assert.ok(!R.postalMatches("07", "28001"));
assert.ok(R.postalMatches("01000000..19999999", "04538-133"), "CEP de São Paulo capital/estado");
assert.ok(!R.postalMatches("9000..9399", ""), "sem código não casa");

const Z = (id, countries, extra = {}) => ({ id, name: id, countries, regions: [], postal_codes: [], currency: "EUR", display_order: 0, is_active: true, ...extra });
const zones = [
  Z("pt", ["PT"], { display_order: 1 }),
  Z("madeira", ["PT"], { postal_codes: ["9000..9399"], display_order: 2 }),
  Z("eu", ["ES", "FR", "DE"], { display_order: 3 }),
  Z("world", ["*"], { currency: "USD", display_order: 9 }),
  Z("sp", ["BR"], { regions: ["SP"], currency: "BRL" }),
  Z("br", ["BR"], { currency: "BRL" }),
];
assert.equal(R.regionFor(zones, { country: "PT", postal_code: "1000-001" }).id, "pt");
assert.equal(R.regionFor(zones, { country: "PT", postal_code: "9004-521" }).id, "madeira", "código postal é mais específico que o país");
assert.equal(R.regionFor(zones, { country: "es", postal_code: "28001" }).id, "eu", "país em minúsculas");
assert.equal(R.regionFor(zones, { country: "JP" }).id, "world", "resto do mundo");
assert.equal(R.regionFor(zones, { country: "BR", region: "sp" }).id, "sp", "estado (sem diferença de maiúsculas)");
assert.equal(R.regionFor(zones, { country: "BR", region: "RJ" }).id, "br");
assert.equal(R.regionFor(zones.filter((z) => z.id !== "world"), { country: "JP" }), null, "sem zona: não entrega");
assert.equal(R.regionFor([Z("a", ["PT"], { is_active: false })], { country: "PT" }), null, "zona desligada não conta");
assert.equal(R.regionFor([Z("açores", ["PT"], { regions: ["Açores"] })], { country: "PT", region: "acores" }).id, "açores", "acentos ignorados");

// ── Peso cobrado e faixas ───────────────────────────────────────────────────
const lines = [{ quantity: 2, weightKg: 0.3, lengthCm: 30, widthCm: 20, heightCm: 10 }, { quantity: 1, weightKg: 1.2 }];
assert.equal(R.chargeableWeight(lines, null), 1.8);
assert.equal(R.chargeableWeight(lines, 5000), 3.6, "volumétrico 30x20x10/5000 = 1,2 kg por unidade");
const rates = [
  { service_id: "s", region_id: "pt", min_weight_kg: 0, max_weight_kg: 1, price_cents: 450, extra_kg_cents: 0, days_min: 1, days_max: 2, free_from_cents: null },
  { service_id: "s", region_id: "pt", min_weight_kg: 1, max_weight_kg: 5, price_cents: 600, extra_kg_cents: 0, days_min: 1, days_max: 3, free_from_cents: null },
  { service_id: "s", region_id: "pt", min_weight_kg: 5, max_weight_kg: null, price_cents: 900, extra_kg_cents: 100, days_min: 2, days_max: 4, free_from_cents: null },
];
assert.equal(R.bandFor(rates, 0.5).price_cents, 450);
assert.equal(R.bandFor(rates, 1).price_cents, 600, "no limite vale a faixa de cima");
assert.equal(R.bandFor(rates, 30).price_cents, 900);
assert.equal(R.bandPrice(R.bandFor(rates, 7.2), 7.2), 900 + 3 * 100, "kg extra por fração");
assert.equal(R.bandFor(rates.slice(0, 2), 6), null, "acima da última faixa: indisponível");

// ── Câmbio e classes ────────────────────────────────────────────────────────
const digits = (c) => (c === "JPY" ? 0 : 2);
assert.equal(R.convertCents(1000, "EUR", "EUR", {}, "BRL", digits), 1000);
assert.equal(R.convertCents(1000, "EUR", "BRL", { EUR: 0.2 }, "BRL", digits), 5000, "10 EUR = 50 BRL com 1 BRL = 0,2 EUR");
assert.equal(R.convertCents(1000, "USD", "BRL", { EUR: 0.2 }, "BRL", digits), null, "sem taxa: null");
assert.equal(R.blockedClass([{ shippingClass: "Bebida-alcoolica" }], ["bebida-alcoolica"]), "Bebida-alcoolica");
assert.equal(R.blockedClass([{ shippingClass: null }], ["refrigerado"]), null);

assert.equal(findQuote([{ code: "ctt:standard", priceCents: 500 }, { code: "ctt:express", priceCents: 300 }], "ctt:").code, "ctt:express", "prefixo: o mais barato");
assert.equal(findQuote([{ code: "1", priceCents: 500 }], "2"), null);

// ── Cotação completa com base falsa ─────────────────────────────────────────
function fakeDb(tables) {
  return {
    rpc(name, args) {
      return Promise.resolve({ data: name === "feature_enabled" ? (tables.features?.[args._key] ?? args._default) : null, error: null });
    },
    from(name) {
      let rows = [...(tables[name] ?? [])];
      let head = false;
      const b = {
        select(_cols, opts) { head = !!opts?.head; return b; },
        eq(col, v) { rows = rows.filter((r) => r[col] === v); return b; },
        in(col, vs) { rows = rows.filter((r) => vs.includes(r[col])); return b; },
        order() { return b; },
        maybeSingle() { return Promise.resolve({ data: rows[0] ?? null, error: null }); },
        then(res, rej) { return Promise.resolve(head ? { count: rows.length, error: null } : { data: rows, error: null }).then(res, rej); },
      };
      return b;
    },
  };
}
const svc = (id, extra = {}) => ({ id, carrier: "ctt", name: id, name_i18n: {}, description_i18n: {}, calc_mode: "table", api_provider: null, api_service_code: null,
  ships_from: null, handling_days: 0, allow_free_shipping: true, max_weight_kg: null, volumetric_divisor: null, excluded_classes: [], is_active: true, display_order: 0, ...extra });
const tables = {
  shipping_services: [
    svc("normal", { handling_days: 1 }),
    svc("expresso", { allow_free_shipping: false }),
    svc("frio", { excluded_classes: ["refrigerado"] }),
    svc("leve", { max_weight_kg: 1 }),
    svc("melhor", { carrier: "correios", calc_mode: "api", api_provider: "melhor_envio", api_service_code: "1" }),
    svc("send", { carrier: "dhl", calc_mode: "api", api_provider: "sendcloud", api_service_code: "dhl_express:" }),
    svc("off", { is_active: false }),
  ],
  shipping_regions: [Z("pt", ["PT"]), Z("br", ["BR"], { currency: "BRL" }), Z("world", ["*"], { currency: "USD" })],
  shipping_service_rates: [
    { service_id: "normal", region_id: "pt", min_weight_kg: 0, max_weight_kg: null, price_cents: 450, extra_kg_cents: 80, days_min: 1, days_max: 3, free_from_cents: null },
    { service_id: "expresso", region_id: "pt", min_weight_kg: 0, max_weight_kg: null, price_cents: 990, extra_kg_cents: 0, days_min: 1, days_max: 1, free_from_cents: null },
    { service_id: "frio", region_id: "pt", min_weight_kg: 0, max_weight_kg: null, price_cents: 300, extra_kg_cents: 0, days_min: 1, days_max: 1, free_from_cents: null },
    { service_id: "leve", region_id: "pt", min_weight_kg: 0, max_weight_kg: null, price_cents: 200, extra_kg_cents: 0, days_min: 2, days_max: 2, free_from_cents: 2000 },
    { service_id: "melhor", region_id: "br", min_weight_kg: 0, max_weight_kg: null, price_cents: 2500, extra_kg_cents: 0, days_min: 5, days_max: 9, free_from_cents: null },
    { service_id: "normal", region_id: "world", min_weight_kg: 0, max_weight_kg: null, price_cents: 2000, extra_kg_cents: 0, days_min: 7, days_max: 15, free_from_cents: null },
  ],
  products: [
    { id: "vaso", weight: 0.4, dimensions: null, shipping_class: null },
    { id: "queijo", weight: 1, dimensions: { length: 20, width: 15, height: 10 }, shipping_class: "refrigerado" },
    { id: "caixa", weight: 0.5, dimensions: { length: 40, width: 30, height: 25 }, shipping_class: null },
    { id: "ebook", weight: 5, dimensions: null, shipping_class: null },
  ],
  product_digital: [{ product_id: "ebook", is_active: true, ships: false }],
  // Moeda base da loja: EUR (1 EUR = 5 BRL = 1,25 USD). Pedidos e cotações saem nesta moeda.
  store_settings: [{ key: "currency_settings", value: { default: "EUR", rates: { BRL: 5, USD: 1.25 } } }],
  integration_credentials: [],
};
const PT = { code: "PT", currency: "EUR", freeShippingFromCents: 5000 };
const ids = (r) => r.options.map((o) => o.service_id);

// Portugal, 2 vasos (0,8 kg): tabela, kg extra, preparação somada, frete grátis por faixa, classes e peso.
let r = await quoteShipping(fakeDb(tables), { country: PT, address: { postal_code: "1000-001" }, items: [{ product_id: "vaso", quantity: 2, unitNet: 10 }] });
assert.equal(r.region, "pt");
assert.deepEqual(ids(r), ["leve", "frio", "normal", "expresso"], "ordenado do mais barato; formas automáticas sem conta e sem tabela ficam de fora");
const normal = r.options.find((o) => o.service_id === "normal");
assert.equal(normal.price_cents, 450 + 80, "0,8 kg: um kg (fração) acima do \"de\" = 0");
assert.deepEqual([normal.days_min, normal.days_max], [2, 4], "1 dia de preparação somado");
r = await quoteShipping(fakeDb(tables), { country: PT, address: { postal_code: "1000-001" }, items: [{ product_id: "vaso", quantity: 5, unitNet: 5 }] });
assert.equal(r.options.find((o) => o.service_id === "normal").price_cents, 450 + 2 * 80, "2 kg: dois kg extra");
assert.ok(!ids(r).includes("leve"), "acima do peso máximo");
assert.ok(r.options.find((o) => o.service_id === "normal") && !r.options.find((o) => o.service_id === "normal").free);
// 60 EUR de compra: grátis pelo país, menos no expresso.
r = await quoteShipping(fakeDb(tables), { country: PT, address: { postal_code: "1000-001" }, items: [{ product_id: "vaso", quantity: 2, unitNet: 30 }] });
assert.equal(r.options.find((o) => o.service_id === "normal").price_cents, 0);
assert.equal(r.options.find((o) => o.service_id === "leve").free, true);
assert.equal(r.options.find((o) => o.service_id === "expresso").price_cents, 990, "expresso fora do frete grátis");
// Produto refrigerado: a forma "frio" recusa.
r = await quoteShipping(fakeDb(tables), { country: PT, address: { postal_code: "1000-001" }, items: [{ product_id: "queijo", quantity: 1, unitNet: 10 }] });
assert.ok(!ids(r).includes("frio"));
assert.deepEqual(r.unavailable.find((u) => u.service_id === "frio"), { service_id: "frio", reason: "class" });
// Peso volumétrico com as medidas do produto: 40x30x25/6000 = 5 kg numa forma de envio com divisor 6000.
const vol = { ...tables, shipping_services: [svc("vol", { volumetric_divisor: 6000 })], shipping_service_rates: [
  { service_id: "vol", region_id: "pt", min_weight_kg: 0, max_weight_kg: 2, price_cents: 500, extra_kg_cents: 0, days_min: 1, days_max: 2, free_from_cents: null },
  { service_id: "vol", region_id: "pt", min_weight_kg: 2, max_weight_kg: null, price_cents: 1200, extra_kg_cents: 0, days_min: 1, days_max: 2, free_from_cents: null },
] };
r = await quoteShipping(fakeDb(vol), { country: PT, address: { postal_code: "1000-001" }, items: [{ product_id: "caixa", quantity: 1, unitNet: 10 }] });
assert.equal(r.options[0].price_cents, 1200, "cobra pelo volume, não pelos 0,5 kg");
// Japão: zona resto do mundo em USD, convertida para a moeda base (EUR): 20 USD = 16 EUR.
r = await quoteShipping(fakeDb(tables), { country: { code: "JP", currency: "EUR", freeShippingFromCents: null }, address: { postal_code: "100-0001" }, items: [{ product_id: "vaso", quantity: 1, unitNet: 10 }] });
assert.equal(r.region, "world");
assert.equal(r.options.find((o) => o.service_id === "normal").price_cents, 1600);
// Simulação do Admin com peso e valor dados.
r = await quoteShipping(fakeDb(tables), { country: PT, address: {}, items: [], simulate: { weightKg: 3, subtotal: 10 } });
assert.equal(r.options.find((o) => o.service_id === "normal").price_cents, 450 + 3 * 80);
// Uma forma de envio pedida pelo create-order.
r = await quoteShipping(fakeDb(tables), { country: PT, address: { postal_code: "1000-001" }, items: [{ product_id: "vaso", quantity: 1, unitNet: 10 }], serviceId: "expresso" });
assert.deepEqual(ids(r), ["expresso"]);

// Brasil com Melhor Envio: conta ligada = preço da cotação; conta falhando = tabela.
const BR = { code: "BR", currency: "BRL", freeShippingFromCents: 29900 };
const withMe = { ...tables, integration_credentials: [
  { provider: "melhor_envio", environment: "demo", is_active: true, credentials: { token: "t" }, public_config: { from_postal_code: "01310-100" } },
  { provider: "sendcloud", environment: "production", is_active: true, credentials: { public_key: "a", secret_key: "b" }, public_config: { from_postal_code: "1000-001" } },
] };
const realFetch = globalThis.fetch;
const calls = [];
globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), body: JSON.parse(init.body), headers: init.headers });
  if (String(url).includes("melhorenvio")) {
    return new Response(JSON.stringify([
      { id: 1, name: "PAC", price: "31.20", custom_price: "29.90", currency: "R$", delivery_time: 8, custom_delivery_time: 9, delivery_range: { min: 6, max: 8 }, custom_delivery_range: { min: 7, max: 9 }, company: { name: "Correios" } },
      { id: 2, name: "SEDEX", error: "Serviço indisponível para o trecho." },
    ]), { status: 200 });
  }
  return new Response(JSON.stringify({ data: [
    { code: "dhl_express:worldwide", carrier: { code: "dhl_express" }, quotes: [{ price: { total: { value: "48.00", currency: "EUR" } }, lead_time: 72 }] },
  ] }), { status: 200 });
};
r = await quoteShipping(fakeDb(withMe), { country: BR, address: { postal_code: "04538-133" }, items: [{ product_id: "vaso", quantity: 1, unitNet: 17.98 }] });
assert.equal(r.currency, "EUR", "valores na moeda base da loja");
const me = r.options.find((o) => o.service_id === "melhor");
assert.equal(me.source, "api");
assert.equal(me.price_cents, 598, "custom_price do Melhor Envio: R$ 29,90 = 5,98 EUR");
assert.deepEqual([me.days_min, me.days_max], [7, 9]);
const meCall = calls.find((c) => c.url.includes("melhorenvio"));
assert.equal(meCall.url, "https://sandbox.melhorenvio.com.br/api/v2/me/shipment/calculate", "ambiente demo = sandbox");
assert.equal(meCall.body.to.postal_code, "04538133");
assert.equal(meCall.body.products[0].insurance_value, 89.9, "valor declarado em reais (17,98 EUR)");
assert.equal(meCall.headers.Authorization, "Bearer t");
const sc = r.options.find((o) => o.service_id === "send");
assert.equal(sc.price_cents, 4800, "48 EUR");
assert.deepEqual([sc.days_min, sc.days_max], [3, 3], "72 horas = 3 dias");
globalThis.fetch = async () => new Response("erro", { status: 500 });
r = await quoteShipping(fakeDb(withMe), { country: BR, address: { postal_code: "04538-133" }, items: [{ product_id: "vaso", quantity: 1, unitNet: 17.98 }] });
assert.equal(r.options.find((o) => o.service_id === "melhor").source, "table", "cotação falhou: tabela");
assert.equal(r.options.find((o) => o.service_id === "melhor").price_cents, 500, "R$ 25,00 da tabela = 5 EUR");
// Frete grátis do Brasil (R$ 299 = 59,80 EUR): 60 EUR de compra já leva.
r = await quoteShipping(fakeDb(withMe), { country: BR, address: { postal_code: "04538-133" }, items: [{ product_id: "vaso", quantity: 1, unitNet: 60 }] });
assert.equal(r.options.find((o) => o.service_id === "melhor").free, true);
assert.ok(!ids(r).includes("send"), "sem cotação e sem tabela: fora");
globalThis.fetch = realFetch;

// ── Restrição por produto e forma de calcular o preço ───────────────────────
assert.equal(R.blockedProduct([{ id: "a" }, { id: "b" }], ["b"]), "b");
assert.equal(R.blockedProduct([{ id: "a" }], []), null);
assert.equal(R.rateMeasure("items", { weightKg: 2, items: 3, subtotal: 50 }), 3);
assert.equal(R.rateMeasure("subtotal", { weightKg: 2, items: 3, subtotal: 50 }), 50);
assert.equal(R.rateMeasure("flat", { weightKg: 2, items: 3, subtotal: 50 }), 0);
assert.equal(R.rateMeasure(undefined, { weightKg: 2, items: 3, subtotal: 50 }), 2, "sem base = peso, como antes");
assert.equal(R.ratePrice({ price_cents: 500, extra_kg_cents: 100, min_weight_kg: 0 }, 3, "items"), 800, "3 itens: 3 acima do 0");
assert.equal(R.ratePrice({ price_cents: 500, extra_kg_cents: 100, min_weight_kg: 0 }, 70, "subtotal"), 500, "valor: sem extra");
assert.equal(R.withFees(1000, { fee_cents: 200, fee_percent: 1.5 }, 10000), 1350, "taxa fixa + 1,5% de 100,00");
assert.equal(R.withFees(300, { min_price_cents: 900 }, 0), 900, "preço mínimo");
const rules = {
  ...tables,
  shipping_services: [
    svc("correios", { carrier: "correios", excluded_products: ["caixa"] }),
    svc("tnt", { carrier: "tnt" }),
    svc("itens", { rate_basis: "items" }),
    svc("valor", { rate_basis: "subtotal" }),
    svc("fixo", { rate_basis: "flat", fee_cents: 100, fee_percent: 2, min_price_cents: 0 }),
  ],
  shipping_service_rates: [
    { service_id: "correios", region_id: "pt", min_weight_kg: 0, max_weight_kg: null, price_cents: 400, extra_kg_cents: 0, days_min: 1, days_max: 2, free_from_cents: null },
    { service_id: "tnt", region_id: "pt", min_weight_kg: 0, max_weight_kg: null, price_cents: 1500, extra_kg_cents: 0, days_min: 1, days_max: 1, free_from_cents: null },
    { service_id: "itens", region_id: "pt", min_weight_kg: 0, max_weight_kg: 1, price_cents: 300, extra_kg_cents: 0, days_min: 2, days_max: 3, free_from_cents: null },
    { service_id: "itens", region_id: "pt", min_weight_kg: 1, max_weight_kg: null, price_cents: 300, extra_kg_cents: 150, days_min: 2, days_max: 3, free_from_cents: null },
    { service_id: "valor", region_id: "pt", min_weight_kg: 0, max_weight_kg: 30, price_cents: 700, extra_kg_cents: 999, days_min: 2, days_max: 3, free_from_cents: null },
    { service_id: "valor", region_id: "pt", min_weight_kg: 30, max_weight_kg: null, price_cents: 200, extra_kg_cents: 999, days_min: 2, days_max: 3, free_from_cents: null },
    { service_id: "fixo", region_id: "pt", min_weight_kg: 0, max_weight_kg: null, price_cents: 500, extra_kg_cents: 0, days_min: 2, days_max: 3, free_from_cents: null },
  ],
};
const NOFREE = { code: "PT", currency: "EUR", freeShippingFromCents: null };
const price = (res, id) => res.options.find((o) => o.service_id === id)?.price_cents;
// Caixa grande: os Correios não levam, a TNT sim.
r = await quoteShipping(fakeDb(rules), { country: NOFREE, address: { postal_code: "1000-001" }, items: [{ product_id: "caixa", quantity: 1, unitNet: 10 }, { product_id: "vaso", quantity: 1, unitNet: 10 }] });
assert.ok(!ids(r).includes("correios"));
assert.deepEqual(r.unavailable.find((u) => u.service_id === "correios"), { service_id: "correios", reason: "product" });
assert.equal(price(r, "tnt"), 1500);
// Por itens: 2 itens = faixa "de 1" + 1 item extra.
assert.equal(price(r, "itens"), 300 + 150);
// Por valor: 20,00 EUR cai na faixa até 30 (sem extra por unidade).
assert.equal(price(r, "valor"), 700);
// Preço único + 1,00 de taxa + 2% de 20,00 = 5,00 + 1,00 + 0,40.
assert.equal(price(r, "fixo"), 640);
// Só o vaso: os Correios voltam; 40 EUR passa para a faixa barata do "valor".
r = await quoteShipping(fakeDb(rules), { country: NOFREE, address: { postal_code: "1000-001" }, items: [{ product_id: "vaso", quantity: 4, unitNet: 10 }] });
assert.ok(ids(r).includes("correios"));
assert.equal(price(r, "valor"), 200);
assert.equal(price(r, "itens"), 300 + 3 * 150);
// Simulação com produto escolhido e quantidade.
r = await quoteShipping(fakeDb(rules), { country: NOFREE, address: {}, items: [], simulate: { weightKg: 1, subtotal: 10, items: 3, productId: "caixa" } });
assert.ok(!ids(r).includes("correios"), "a simulação respeita a restrição do produto");
assert.equal(price(r, "itens"), 300 + 2 * 150);

// Produto digital sem entrega física (recurso digital_products): fora do pacote só com o recurso ligado.
const twoVases = await quoteShipping(fakeDb(tables), { country: PT, address: { postal_code: "1000-001" }, items: [{ product_id: "vaso", quantity: 2, unitNet: 10 }] });
r = await quoteShipping(fakeDb({ ...tables, features: { digital_products: true } }), { country: PT, address: { postal_code: "1000-001" }, items: [{ product_id: "vaso", quantity: 2, unitNet: 10 }, { product_id: "ebook", quantity: 1, unitNet: 30 }] });
assert.equal(r.weight_kg, twoVases.weight_kg, "o e-book não pesa");
assert.deepEqual(r.options.map((o) => o.price_cents), twoVases.options.map((o) => o.price_cents), "nem muda o preço do frete");
r = await quoteShipping(fakeDb(tables), { country: PT, address: { postal_code: "1000-001" }, items: [{ product_id: "vaso", quantity: 2, unitNet: 10 }, { product_id: "ebook", quantity: 1, unitNet: 30 }] });
assert.ok(r.weight_kg > twoVases.weight_kg, "com o recurso desligado, o produto pesa como qualquer outro");

console.log("test-shipping: tudo certo");
