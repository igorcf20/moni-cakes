// Self-check for supabase/functions/_shared/pricing.ts with an in-memory database.
// Run: node scripts/test-order-pricing.cjs
const { buildSync } = require("esbuild");
const path = require("path"); const os = require("os");
const out = path.join(os.tmpdir(), "brindesml-pricing.cjs");
buildSync({ entryPoints: [path.join(__dirname, "../supabase/functions/_shared/pricing.ts")], bundle: true, platform: "node", format: "cjs", external: ["./admin.ts"], outfile: out, logLevel: "silent" });
const assert = require("assert");
const { checkOrderPricing, shippingFor, couponDiscount } = require(out);
const db = {
  order_items: [], products: [{ id: "caneca", price: 9.9, vat_rate: 23 }, { id: "tshirt", price: 10, vat_rate: 23 }],
  product_volume_tiers: [{ product_id: "caneca", min_meters: 10, price_per_meter: 8 }],
  product_variations: [{ id: "v1", product_id: "tshirt", name: "Azul", price_modifier: 1 }],
  product_sizes: [{ id: "s1", product_id: "tshirt", size_label: "XL", price_modifier: 2 }],
  product_variation_size_availability: [],
  product_print_areas: [{ id: "a1", product_id: "caneca", pricing_mode: "flat", base_price: 3, max_width_cm: 20, max_height_cm: 8 }],
  product_print_area_techniques: [{ id: "t1", print_area_id: "a1", technique: "sublimacao", pricing_mode: "flat", base_price: 3 }],
  product_print_area_technique_materials: [], delivery_methods: [{ id: "d1", type: "delivery", is_active: true, config: { shipping_mode: "flat_rate", flat_rate: 4, extra_cost: 0 } }, { id: "d2", type: "delivery", is_active: true, config: {} }, { id: "p1", type: "pickup", is_active: true, config: {} }],
  shipping_zones: [], shipping_rates: [],
  kits: [{ id: "k1", is_active: true, discount_type: "percentage", discount_value: 10 }, { id: "k2", is_active: true, discount_type: "fixed", discount_value: 5.9 }],
  kit_items: [{ kit_id: "k1", product_id: "caneca", quantity: 1 }, { kit_id: "k1", product_id: "tshirt", quantity: 1 }, { kit_id: "k2", product_id: "caneca", quantity: 1 }, { kit_id: "k2", product_id: "tshirt", quantity: 1 }],
  coupons: [{ code: "BEMVINDO10", active: true, discount_type: "percentage", discount_value: 10, min_purchase: 0, max_uses: null, current_uses: 0 }, { code: "UMAVEZ", active: true, discount_type: "fixed", discount_value: 5, min_purchase: 0, max_uses: 1, current_uses: 1 }, { code: "TETO", active: true, discount_type: "percentage", discount_value: 50, max_discount: 20, min_purchase: 0, max_uses: null, current_uses: 0 }],
};
function q(table) {
  let rows = db[table] || []; const self = {
    select() { return self; }, eq(k, v) { rows = rows.filter(r => r[k] === v); return self; }, in(k, vs) { rows = rows.filter(r => vs.includes(r[k])); return self; },
    ilike(k, v) { rows = rows.filter(r => String(r[k]).toLowerCase() === String(v).toLowerCase()); return self; },
    gte(k, v) { rows = rows.filter(r => r[k] >= v); return self; }, lte(k, v) { rows = rows.filter(r => r[k] <= v); return self; }, limit() { return self; },
    maybeSingle() { return Promise.resolve({ data: rows[0] ?? null, error: null }); },
    then(res) { return Promise.resolve({ data: rows, error: null }).then(res); },
  }; return self;
}
// public.coupon_quote (SQL, migration 20261006120000_coupon_rules.sql) em versão mínima: as regras completas
// (datas, por cliente, primeira compra) são testadas na base; aqui só o caminho do pricing.ts.
const features = {};
const rpc = async (fn, args) => {
  // public.feature_enabled: o valor gravado ou o padrão (kits ligado por padrão).
  if (fn === "feature_enabled") return { data: features[args._key] ?? args._default, error: null };
  assert.equal(fn, "coupon_quote");
  const c = db.coupons.find(r => r.code.toLowerCase() === String(args._code).trim().toLowerCase());
  if (!c || !c.active || (c.max_uses != null && c.current_uses >= c.max_uses) || args._subtotal < (c.min_purchase || 0)) return { data: [], error: null };
  const raw = c.discount_type === "percentage" ? args._subtotal * c.discount_value / 100 : c.discount_value;
  return { data: [{ code: c.code, discount: Math.round(Math.max(0, Math.min(raw, c.max_discount ?? Infinity, args._subtotal)) * 100) / 100 }], error: null };
};
const sb = { from: q, rpc };
const run = async (items, order) => { db.order_items = items.map(i => ({ order_id: "o", ...i })); return checkOrderPricing(sb, { id: "o", discount_amount: 0, shipping_cost: 0, ...order }); };
(async () => {
  // 12 mugs at tier price 8: net 96, vat 22.08 -> 118.08
  assert.deepEqual(await run([{ product_id: "caneca", quantity: 12, price: 8, design_data: {} }], { total: 118.08 }), { ok: true });
  // tampered unit price
  assert.equal((await run([{ product_id: "caneca", quantity: 12, price: 1, design_data: {} }], { total: 14.76 })).ok, false);
  // tampered total only
  assert.equal((await run([{ product_id: "caneca", quantity: 12, price: 8, design_data: {} }], { total: 0.01 })).ok, false);
  // t-shirt Azul XL: 10+1+2 = 13 -> total 15.99
  assert.deepEqual(await run([{ product_id: "tshirt", quantity: 1, price: 13, design_data: { variation: "Azul", size: "XL" } }], { total: 15.99 }), { ok: true });
  assert.equal((await run([{ product_id: "tshirt", quantity: 1, price: 10, design_data: { variation: "Azul", size: "XL" } }], { total: 12.3 })).ok, false);
  // customised mug: 9.90 + 3 = 12.90
  const custom = { price: 12.9, customization: { areas: { front: { areaId: "a1", technique: "sublimacao", widthCm: 9, heightCm: 8 } } } };
  assert.deepEqual(await run([{ product_id: "caneca", quantity: 1, price: 12.9, design_data: custom }], { total: 15.87 }), { ok: true });
  assert.equal((await run([{ product_id: "caneca", quantity: 1, price: 9.9, design_data: custom }], { total: 12.18 })).ok, false);
  // flat-rate shipping 4 € (+VAT 4.92) required
  assert.deepEqual(await run([{ product_id: "caneca", quantity: 12, price: 8, design_data: {} }], { total: 123.0, shipping_cost: 4, delivery_method_id: "d1" }), { ok: true });
  assert.equal((await run([{ product_id: "caneca", quantity: 12, price: 8, design_data: {} }], { total: 118.08, shipping_cost: 0, delivery_method_id: "d1" })).ok, false);
  // coupon: the database stores the discount (10 % of the 96 net = 9.60) and subtotal_net must match the lines
  assert.deepEqual(await run([{ product_id: "caneca", quantity: 12, price: 8, design_data: {} }], { total: 108.48, subtotal_net: 96, discount_amount: 9.6 }), { ok: true });
  // a stored discount with a total below (lines + VAT - discount) is still refused
  assert.equal((await run([{ product_id: "caneca", quantity: 12, price: 8, design_data: {} }], { total: 50, subtotal_net: 96, discount_amount: 9.6 })).ok, false);
  // inflated subtotal_net (would inflate the coupon discount computed by the trigger)
  assert.equal((await run([{ product_id: "caneca", quantity: 12, price: 8, design_data: {} }], { total: 1, subtotal_net: 5000, discount_amount: 500 })).ok, false);
  // kits: 10% off when both products are present; fixed 5.90 on a 19.90 list = ~29.65%
  const kit = (id) => ({ kit: { id } });
  assert.deepEqual(await run([{ product_id: "caneca", quantity: 1, price: 8.91, design_data: kit("k1") }, { product_id: "tshirt", quantity: 1, price: 9, design_data: kit("k1") }], { total: 22.03 }), { ok: true });
  assert.equal((await run([{ product_id: "caneca", quantity: 1, price: 8.91, design_data: kit("k1") }], { total: 10.96 })).ok, false);
  assert.deepEqual(await run([{ product_id: "caneca", quantity: 1, price: 6.97, design_data: kit("k2") }, { product_id: "tshirt", quantity: 1, price: 7.04, design_data: kit("k2") }], { total: 17.24 }), { ok: true });
  // kit fora do período (ends_at no passado) ou recurso kits desligado: sem desconto
  const pair = [{ product_id: "caneca", quantity: 1, price: 8.91, design_data: kit("k1") }, { product_id: "tshirt", quantity: 1, price: 9, design_data: kit("k1") }];
  db.kits[0].ends_at = "2000-01-01T00:00:00Z";
  assert.equal((await run(pair, { total: 22.03 })).ok, false);
  delete db.kits[0].ends_at;
  features.kits = false;
  assert.equal((await run(pair, { total: 22.03 })).ok, false);
  delete features.kits;
  assert.deepEqual(await run(pair, { total: 22.03 }), { ok: true });
  // shipping (net, without VAT)
  assert.deepEqual(await shippingFor(sb, { deliveryMethodId: "p1", district: null, weightKg: 1, subtotalNet: 10 }), { ok: true, cost: 0 });
  assert.deepEqual(await shippingFor(sb, { deliveryMethodId: "d1", district: "Porto", weightKg: 1, subtotalNet: 10 }), { ok: true, cost: 4 });
  assert.deepEqual(await shippingFor(sb, { deliveryMethodId: "d2", district: "Lisboa", weightKg: 2, subtotalNet: 20 }), { ok: true, cost: 5.3 });
  assert.deepEqual(await shippingFor(sb, { deliveryMethodId: "d2", district: "Lisboa", weightKg: 2, subtotalNet: 60 }), { ok: true, cost: 0 });
  assert.equal((await shippingFor(sb, { deliveryMethodId: "d2", district: "Madeira", weightKg: 1, subtotalNet: 20 })).ok, false);
  // coupons
  assert.deepEqual(await couponDiscount(sb, "bemvindo10", 96), { ok: true, discount: 9.6, code: "BEMVINDO10" });
  assert.equal((await couponDiscount(sb, "UMAVEZ", 96)).ok, false);
  assert.deepEqual(await couponDiscount(sb, "", 96), { ok: true, discount: 0, code: null });
  assert.deepEqual(await couponDiscount(sb, "teto", 96, "u1"), { ok: true, discount: 20, code: "TETO" });
  console.log("pricing checks: all passed");
})().catch(e => { console.error(e); process.exit(1); });
