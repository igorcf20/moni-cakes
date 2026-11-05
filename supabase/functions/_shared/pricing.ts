import { supabaseAdmin } from "./admin.ts";
import { groupUnitPrice, normalizeGroupPricing, type GroupPricing } from "./customerGroups.ts";
import { normalizeSubscriptionSettings, renewalOpen, subscriptionUnit } from "./subscriptions.ts";
import { addDays as addRentalDays, normalizeRentalProduct, normalizeRentalSettings, rentalError, rentalPeriods } from "./rentals.ts";

// Server-side pricing of orders.
//
// The storefront computes prices in the browser. Here every line is priced again from the database,
// with the same rules the storefront uses:
//   - standard lines: quantity tier (or promo/base price) + colour and size surcharges
//     (mirrors useCart's itemPricing / utils/tierPricing.ts);
//   - customised lines: product price + colour and size surcharges + each area's method rule
//     (flat or per cm² with minimum) + material (fixed or per metre), as lib/customizationPricing.ts.
//   - customer groups (Admin > Grupos de clientes): the group's price list or discount for the buyer
//     (_shared/customerGroups.ts, same file as src/lib/customerGroups.ts).
//   - subscriptions (Admin > Assinaturas): % off a line with design_data.subscription (a plan of the product, or the
//     buyer's own subscription when its renewal is open, same quantity), _shared/subscriptions.ts.
//   - rentals (Admin > Aluguéis): a product with an active rental is sold only by dates (design_data.rental
//     {start, end}); the unit becomes price per period x periods, _shared/rentals.ts. Free units are checked by the
//     order_items_rental trigger when the order is written.
//   - B2B quotes (Admin > Orçamentos): a line with design_data.quote {id, item_id} is sold at the store's proposal
//     when the quote is the buyer's, sent or accepted, still valid, and product, colour, size and quantity match the
//     quoted item (orderId: an order re-checked later keeps the quote it used). Otherwise the order is refused.
// A line may cost MORE than expected (never blocked), but not less. If a colour or size cannot be
// identified, the cheapest option of that product is assumed, so a legitimate order is never refused.
// Used by create-order (to build the order) and viva-create-order (to re-check before payment).
type Sb = ReturnType<typeof supabaseAdmin>;

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const TOLERANCE = 0.02; // rounding of cents between browser and server
const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();
export const round2 = (v: number) => Math.round(v * 100) / 100;
export const SHIPPING_VAT_RATE = 23;

function effectiveBase(p: any, now = new Date()): number {
  const raw = num(p.price);
  if (!p.promo_active) return raw;
  const value = num(p.promo_value);
  if (value <= 0 || raw <= 0) return raw;
  const starts = p.promo_starts_at ? new Date(p.promo_starts_at) : null;
  const ends = p.promo_ends_at ? new Date(p.promo_ends_at) : null;
  if ((starts && starts > now) || (ends && ends <= now)) return raw;
  const discount = String(p.promo_type).toLowerCase() === "fixed" ? Math.min(raw, value) : Math.min(raw, raw * value / 100);
  return Math.max(0, raw - discount);
}

function materialAddon(m: any, widthCm: number, heightCm: number) {
  if (!m) return 0;
  if (m.pricing_mode !== "per_linear_meter") return Math.max(0, num(m.price_adjustment));
  const used = m.calculation_dimension === "width" ? widthCm : m.calculation_dimension === "longest_side" ? Math.max(widthCm, heightCm) : heightCm;
  return (Math.max(0, used) / 100) * Math.max(0, num(m.price_per_meter));
}

function areaAddon(rule: any, widthCm: number, heightCm: number) {
  if (rule?.pricing_mode === "per_cm2") {
    return Math.max(Math.max(0, widthCm) * Math.max(0, heightCm) * Math.max(0, num(rule.price_per_cm2)), Math.max(0, num(rule.min_price)));
  }
  return Math.max(0, num(rule?.base_price));
}

export type ItemInput = { product_id: unknown; quantity: unknown; price: unknown; design_data?: any };
/**
 * Kit discounts (as src/lib/kitPricing.ts): % off every unit of a kit's lines, only when the order holds
 * every product of an active kit in the kit's quantity. Fixed discounts become % of the kit list price.
 */
async function kitDiscounts(sb: Sb, items: ItemInput[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const kitIds = [...new Set(items.map((i) => i.design_data?.kit?.id).filter(Boolean).map(String))];
  if (!kitIds.length) return out;
  const { data: on } = await sb.rpc("feature_enabled", { _key: "kits", _default: true });
  if (!on) return out;
  const [{ data: kits }, { data: kitItems }] = await Promise.all([
    sb.from("kits").select("id,is_active,discount_type,discount_value,starts_at,ends_at").in("id", kitIds),
    sb.from("kit_items").select("kit_id,product_id,quantity").in("kit_id", kitIds),
  ]);
  const ids = [...new Set((kitItems ?? []).map((k: any) => String(k.product_id)))];
  const { data: listPrices } = ids.length ? await sb.from("products").select("id,price").in("id", ids) : { data: [] as any[] };
  for (const kit of kits ?? []) {
    // Fora do período (starts_at / ends_at) o kit não vale, como a política de leitura do site (kit_is_live).
    const now = Date.now();
    if (!kit.is_active || (kit.starts_at && Date.parse(kit.starts_at) > now) || (kit.ends_at && Date.parse(kit.ends_at) <= now)) continue;
    const parts = (kitItems ?? []).filter((k: any) => k.kit_id === kit.id);
    const complete = parts.length > 0 && parts.every((part: any) => items
      .filter((i) => String(i.design_data?.kit?.id ?? "") === kit.id && String(i.product_id) === String(part.product_id))
      .reduce((s, i) => s + num(i.quantity), 0) >= num(part.quantity));
    if (!complete) continue;
    const listTotal = parts.reduce((s: number, part: any) => s + num((listPrices ?? []).find((p: any) => String(p.id) === String(part.product_id))?.price) * num(part.quantity), 0);
    const value = Math.max(0, num(kit.discount_value));
    const pct = kit.discount_type === "percentage" ? Math.min(1, value / 100) : listTotal > 0 ? Math.min(1, value / listTotal) : 0;
    if (pct > 0) out.set(kit.id, pct);
  }
  return out;
}

/**
 * Subscription discount (%) per line: plan_id = active plan of the product; subscription_id = the buyer's own
 * subscription of that product, not cancelled, renewal open and same quantity. 0 when the feature is off.
 */
async function subscriptionDiscounts(sb: Sb, items: ItemInput[], userId: string | null | undefined): Promise<number[]> {
  const out = items.map(() => 0);
  const subs = items.map((i) => (i.design_data?.subscription && typeof i.design_data.subscription === "object" ? i.design_data.subscription : null));
  if (!subs.some(Boolean)) return out;
  const { data: on } = await sb.rpc("feature_enabled", { _key: "subscriptions", _default: false });
  if (!on) return out;
  const uuid = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
  const planIds = [...new Set(subs.map((s) => uuid(s?.plan_id)).filter(Boolean))] as string[];
  const subIds = [...new Set(subs.map((s) => uuid(s?.subscription_id)).filter(Boolean))] as string[];
  const [plans, own, rules] = await Promise.all([
    planIds.length ? sb.from("product_subscription_plans").select("id,product_id,discount_percent,is_active").in("id", planIds) : { data: [] as any[] },
    subIds.length && userId ? sb.from("subscriptions").select("id,user_id,product_id,quantity,discount_percent,status,next_date").in("id", subIds) : { data: [] as any[] },
    sb.from("store_settings").select("value").eq("key", "subscriptions").maybeSingle(),
  ]);
  const settings = normalizeSubscriptionSettings((rules as any)?.data?.value);
  const today = new Date().toISOString().slice(0, 10);
  items.forEach((item, idx) => {
    const sub = subs[idx];
    if (!sub) return;
    const pid = String(item.product_id);
    const plan = (plans.data ?? []).find((p: any) => p.id === sub.plan_id);
    if (plan) {
      if (plan.is_active && String(plan.product_id) === pid) out[idx] = num(plan.discount_percent);
      return;
    }
    const mine = (own.data ?? []).find((s: any) => s.id === sub.subscription_id);
    if (mine && mine.user_id === userId && String(mine.product_id) === pid && num(mine.quantity) === num(item.quantity)
      && renewalOpen({ status: mine.status, next_date: mine.next_date }, today, settings)) {
      out[idx] = num(mine.discount_percent);
    }
  });
  return out;
}

/**
 * Quoted unit price per line (null = not a quote line). A quote line that no longer matches fails the order, so the
 * buyer is told to refresh the cart instead of silently paying the list price.
 */
async function quoteUnits(sb: Sb, items: ItemInput[], userId: string | null | undefined, orderId: string | null | undefined): Promise<{ ok: true; units: (number | null)[] } | PricingFailure> {
  const units: (number | null)[] = items.map(() => null);
  const asked = items.map((i) => (i.design_data?.quote && typeof i.design_data.quote === "object" ? i.design_data.quote : null));
  if (!asked.some(Boolean)) return { ok: true, units };
  const fail: PricingFailure = { ok: false, reason: "Orçamento: a proposta venceu, já foi usada ou não confere com o carrinho." };
  const { data: on } = await sb.rpc("feature_enabled", { _key: "quotes", _default: false });
  if (!on || !userId) return fail;
  const uuid = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
  const quoteIds = [...new Set(asked.map((q) => uuid(q?.id)).filter(Boolean))] as string[];
  const itemIds = [...new Set(asked.map((q) => uuid(q?.item_id)).filter(Boolean))] as string[];
  if (!quoteIds.length || !itemIds.length) return fail;
  const [quotes, quoted] = await Promise.all([
    sb.from("quote_requests").select("id,user_id,status,valid_until,order_id").in("id", quoteIds),
    sb.from("quote_items").select("id,quote_id,product_id,variation_name,size_label,quantity,unit_price").in("id", itemIds),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  for (const [idx, q] of asked.entries()) {
    if (!q) continue;
    const quote = (quotes.data ?? []).find((r: any) => r.id === q.id);
    const item = (quoted.data ?? []).find((r: any) => r.id === q.item_id && r.quote_id === q.id);
    if (!quote || !item || quote.user_id !== userId || item.unit_price == null) return fail;
    const usable = (["sent", "accepted"].includes(quote.status) && !quote.order_id)
      || (quote.status === "ordered" && !!orderId && quote.order_id === orderId);
    if (!usable || (quote.valid_until && quote.valid_until < today && quote.status !== "ordered")) return fail;
    const design = items[idx].design_data ?? {};
    if (String(item.product_id) !== String(items[idx].product_id) || num(item.quantity) !== num(items[idx].quantity)
      || norm(item.variation_name) !== norm(design.variation) || norm(item.size_label) !== norm(design.size)) return fail;
    units[idx] = num(item.unit_price);
  }
  return { ok: true, units };
}

const RENTAL_REASON: Record<string, string> = {
  invalid_dates: "Aluguel: datas inválidas.",
  too_soon: "Aluguel: a data de início é cedo demais.",
  too_far: "Aluguel: a data escolhida está longe demais.",
  too_short: "Aluguel: o período é menor que o mínimo deste produto.",
  too_long: "Aluguel: o período é maior que o máximo deste produto.",
};

/**
 * Rental periods per line (1 for normal lines). A product with an active rental (feature on) needs dates; dates
 * must follow the product and store rules. With strict false (shipping estimate) bad dates count as 1 period.
 */
async function rentalPeriodsFor(sb: Sb, items: ItemInput[], strict: boolean): Promise<{ ok: true; periods: number[] } | PricingFailure> {
  const periods = items.map(() => 1);
  const asked = items.map((i) => (i.design_data?.rental && typeof i.design_data.rental === "object" ? i.design_data.rental : null));
  const productIds = [...new Set(items.map((i) => String(i.product_id)))];
  const [{ data: on }, configs, rules] = await Promise.all([
    sb.rpc("feature_enabled", { _key: "rentals", _default: false }),
    sb.from("product_rentals").select("*").in("product_id", productIds).eq("is_active", true),
    sb.from("store_settings").select("value").eq("key", "rentals").maybeSingle(),
  ]);
  if (!on) {
    if (strict && asked.some(Boolean)) return { ok: false, reason: "Aluguel: indisponível no momento." };
    return { ok: true, periods };
  }
  const byProduct = new Map((configs.data ?? []).map((r: any) => [String(r.product_id), normalizeRentalProduct(r)]));
  const settings = normalizeRentalSettings((rules as any)?.data?.value);
  // Um dia de tolerância: a data de hoje do cliente pode estar um dia atrás da data UTC do servidor.
  const today = addRentalDays(new Date().toISOString().slice(0, 10), -1);
  for (const [idx, item] of items.entries()) {
    const cfg = byProduct.get(String(item.product_id));
    const r = asked[idx];
    if (!cfg) {
      if (r && strict) return { ok: false, reason: "Aluguel: este produto não está disponível para alugar." };
      continue;
    }
    if (!r) {
      if (strict) return { ok: false, reason: "Aluguel: escolha as datas do aluguel." };
      continue;
    }
    const start = String(r.start ?? ""), end = String(r.end ?? "");
    const err = rentalError(start, end, cfg, settings, today);
    if (err && strict) return { ok: false, reason: RENTAL_REASON[err] };
    periods[idx] = Math.max(1, rentalPeriods(start, end, cfg.unit));
  }
  return { ok: true, periods };
}

export type PricedLine = { expectedUnit: number; price: number; quantity: number; vatRate: number; weightKg: number };
export type PricingFailure = { ok: false; reason: string };

/** Group and price list of the buyer (none when the feature is off, the group is off or there is no buyer). */
export async function groupPricingFor(sb: Sb, userId: string | null | undefined, productIds: string[]): Promise<GroupPricing> {
  if (!userId) return { group: null, prices: [] };
  const { data, error } = await sb.rpc("customer_group_pricing_for", { _user: userId, _product_ids: productIds });
  if (error) throw error;
  return normalizeGroupPricing(data);
}

/**
 * Prices every line from the database. Fails if any line is cheaper than the catalogue allows
 * (strict, the default); with { strict: false } (frete estimado) only the catalogue price matters.
 * userId: the buyer, for the customer group's prices.
 */
export async function priceItems(sb: Sb, items: ItemInput[], opts: { strict?: boolean; userId?: string | null; orderId?: string | null } = {}): Promise<{ ok: true; lines: PricedLine[] } | PricingFailure> {
  if (!items?.length) return { ok: false, reason: "Encomenda sem artigos." };

  const productIds = [...new Set(items.map((l) => String(l.product_id)))];
  const groupPricing = await groupPricingFor(sb, opts.userId, productIds);
  const [products, tiers, variations, sizes] = await Promise.all([
    sb.from("products").select("id,price,vat_rate,weight,is_active,promo_active,promo_type,promo_value,promo_starts_at,promo_ends_at").in("id", productIds),
    sb.from("product_volume_tiers").select("product_id,min_meters,price_per_meter").in("product_id", productIds),
    sb.from("product_variations").select("id,product_id,name,price_modifier").in("product_id", productIds),
    sb.from("product_sizes").select("id,product_id,size_label,price_modifier").in("product_id", productIds),
  ]);
  for (const r of [products, tiers, variations, sizes]) if (r.error) throw r.error;
  const variationIds = (variations.data ?? []).map((v: any) => v.id);
  const availability = variationIds.length
    ? await sb.from("product_variation_size_availability").select("variation_id,product_size_id,price_modifier").in("variation_id", variationIds)
    : { data: [] as any[], error: null };
  if (availability.error) throw availability.error;

  // Customisation rules for every area referenced by the order.
  const areaIds = [...new Set(items.flatMap((l) => Object.values(l.design_data?.customization?.areas ?? {}).map((a: any) => String(a?.areaId ?? ""))).filter(Boolean))];
  const [areas, techniques] = areaIds.length
    ? await Promise.all([
      sb.from("product_print_areas").select("id,product_id,pricing_mode,base_price,price_per_cm2,min_price,max_width_cm,max_height_cm").in("id", areaIds),
      sb.from("product_print_area_techniques").select("id,print_area_id,technique,pricing_mode,base_price,price_per_cm2,min_price").in("print_area_id", areaIds),
    ])
    : [{ data: [] as any[], error: null }, { data: [] as any[], error: null }];
  if (areas.error) throw areas.error;
  if (techniques.error) throw techniques.error;
  const techniqueIds = (techniques.data ?? []).map((t: any) => t.id);
  const materials = techniqueIds.length
    ? await sb.from("product_print_area_technique_materials").select("id,area_technique_id,pricing_mode,price_adjustment,price_per_meter,calculation_dimension").in("area_technique_id", techniqueIds)
    : { data: [] as any[], error: null };
  if (materials.error) throw materials.error;

  const productById = new Map((products.data ?? []).map((p: any) => [String(p.id), p]));
  const kitDiscount = await kitDiscounts(sb, items);
  const subDiscount = await subscriptionDiscounts(sb, items, opts.userId);
  const rental = await rentalPeriodsFor(sb, items, opts.strict !== false);
  if (!rental.ok) return rental;
  const quoted = await quoteUnits(sb, items, opts.userId, opts.orderId);
  if (!quoted.ok) return quoted;
  const minMod = (rows: any[]) => Math.min(0, ...rows.map((r) => num(r.price_modifier)));

  const lines: PricedLine[] = [];
  for (const [lineIdx, line] of items.entries()) {
    const pid = String(line.product_id);
    const product: any = productById.get(pid);
    if (!product || product.is_active === false) return { ok: false, reason: "Um dos artigos já não está disponível." };
    const qty = num(line.quantity);
    if (!Number.isInteger(qty) || qty <= 0 || qty > 100000) return { ok: false, reason: "Quantidade inválida." };
    const design = line.design_data ?? {};

    // Colour (variation) and size surcharges, identified by the names stored with the line.
    const productVariations = (variations.data ?? []).filter((v: any) => String(v.product_id) === pid);
    const productSizes = (sizes.data ?? []).filter((s: any) => String(s.product_id) === pid);
    const variation = productVariations.find((v: any) => norm(v.name) === norm(design.variation));
    const size = productSizes.find((s: any) => norm(s.size_label) === norm(design.size));
    const variationMod = variation ? num(variation.price_modifier) : minMod(productVariations);
    let sizeMod = size ? num(size.price_modifier) : minMod(productSizes);
    if (variation && size) {
      const pair = (availability.data ?? []).find((a: any) => a.variation_id === variation.id && a.product_size_id === size.id);
      if (pair && num(pair.price_modifier) !== 0) sizeMod = num(pair.price_modifier);
    }

    let unit: number;
    const custom = design.customization?.areas && typeof design.price === "number";
    if (custom) {
      // Customised lines start from the list price (no promo/tier), as the product page does.
      unit = num(product.price) + variationMod + sizeMod;
      for (const a of Object.values(design.customization.areas) as any[]) {
        const area = (areas.data ?? []).find((x: any) => x.id === a?.areaId);
        if (!area || String(area.product_id) !== pid) return { ok: false, reason: "Área de personalização inválida." };
        const w = Math.min(Math.max(0, num(a.widthCm)), num(area.max_width_cm) || Infinity);
        const h = Math.min(Math.max(0, num(a.heightCm)), num(area.max_height_cm) || Infinity);
        const tech = (techniques.data ?? []).find((t: any) => t.print_area_id === area.id && t.technique === a.technique);
        const material = tech && a.materialId ? (materials.data ?? []).find((m: any) => m.id === a.materialId && m.area_technique_id === tech.id) : null;
        unit += areaAddon(tech ?? area, w, h) + materialAddon(material, w, h);
      }
      unit = groupUnitPrice(groupPricing, { productId: pid, quantity: qty, base: unit, modifier: 0, customized: true }).unit;
    } else {
      const base = effectiveBase(product);
      const ratio = num(product.price) > 0 ? base / num(product.price) : 1;
      const applicable = (tiers.data ?? [])
        .filter((t: any) => String(t.product_id) === pid && qty + 1e-9 >= num(t.min_meters))
        .sort((a: any, b: any) => num(b.min_meters) - num(a.min_meters))[0];
      const tierBase = applicable ? num(applicable.price_per_meter) * ratio : base;
      unit = groupUnitPrice(groupPricing, { productId: pid, quantity: qty, base: tierBase, modifier: variationMod + sizeMod }).unit;
      const kitId = design.kit?.id ? String(design.kit.id) : null;
      if (kitId && kitDiscount.has(kitId)) unit *= 1 - kitDiscount.get(kitId)!;
    }
    if (subDiscount[lineIdx] > 0) unit = subscriptionUnit(unit, subDiscount[lineIdx]);
    unit *= rental.periods[lineIdx];
    // Proposta de orçamento aceite: o preço combinado substitui o de tabela.
    if (quoted.units[lineIdx] != null) unit = quoted.units[lineIdx]!;
    unit = Math.max(0, unit);

    if (opts.strict !== false && num(line.price) + TOLERANCE < unit) return { ok: false, reason: "Preço de um artigo abaixo do preço de tabela." };
    lines.push({
      expectedUnit: unit,
      price: num(line.price),
      quantity: qty,
      vatRate: product.vat_rate == null ? 23 : num(product.vat_rate),
      weightKg: num(product.weight) || 0.5,
    });
  }
  return { ok: true, lines };
}

// Portugal shipping zones, as in src/hooks/useShipping.tsx.
const DISTRICT_ZONE: Record<string, string> = {
  aveiro: "Continente", beja: "Continente", braga: "Continente", "bragança": "Continente", "castelo branco": "Continente",
  coimbra: "Continente", "évora": "Continente", faro: "Continente", guarda: "Continente", leiria: "Continente",
  lisboa: "Continente", portalegre: "Continente", porto: "Continente", "santarém": "Continente", "setúbal": "Continente",
  "viana do castelo": "Continente", "vila real": "Continente", viseu: "Continente", madeira: "Madeira", "açores": "Açores",
};
const FREE_FROM: Record<string, number> = { Continente: 50, Madeira: 75, "Açores": 75 };
const FALLBACK: Record<string, { base: number; perKg: number }> = {
  Continente: { base: 4.5, perKg: 0.8 }, Madeira: { base: 8.5, perKg: 1.5 }, "Açores": { base: 8.5, perKg: 1.5 },
};

/** Net shipping cost (without VAT), mirroring the checkout. */
export async function shippingFor(
  sb: Sb,
  opts: { deliveryMethodId: string | null; district: string | null; weightKg: number; subtotalNet: number },
): Promise<{ ok: true; cost: number } | PricingFailure> {
  if (!opts.deliveryMethodId) return { ok: false, reason: "Escolha a forma de entrega." };
  const { data: method } = await sb.from("delivery_methods").select("type,is_active,config").eq("id", opts.deliveryMethodId).maybeSingle();
  if (!method || method.is_active === false) return { ok: false, reason: "A forma de entrega escolhida já não está disponível." };
  if (method.type === "pickup") return { ok: true, cost: 0 };

  const cfg: any = method.config ?? {};
  if (cfg.shipping_mode === "flat_rate") return { ok: true, cost: num(cfg.flat_rate) + num(cfg.extra_cost) };

  const zone = DISTRICT_ZONE[norm(opts.district)];
  if (!zone) return { ok: false, reason: "Indique o distrito na morada de entrega." };
  if (zone !== "Continente") return { ok: false, reason: "Entregas nos Açores e na Madeira são feitas por orçamento. Contacte-nos." };
  if (opts.subtotalNet >= FREE_FROM[zone]) return { ok: true, cost: 0 };

  const { data: zones } = await sb.from("shipping_zones").select("id").eq("zone_name", zone).eq("is_active", true).limit(1);
  if (zones?.length) {
    const { data: rates } = await sb.from("shipping_rates").select("*").eq("zone_id", zones[0].id)
      .gte("max_weight", opts.weightKg).lte("min_weight", opts.weightKg).limit(1);
    if (rates?.length) {
      const r: any = rates[0];
      return { ok: true, cost: num(r.base_rate) + Math.max(0, opts.weightKg - num(r.min_weight)) * num(r.per_kg_rate) };
    }
  }
  const fb = FALLBACK[zone];
  return { ok: true, cost: fb.base + Math.max(0, opts.weightKg - 1) * fb.perKg };
}

/**
 * Discount the database will apply (trigger orders_secure_amounts). Both use the SQL function
 * public.coupon_quote (migration 20261006120000_coupon_rules.sql): active, start and end dates, total and
 * per-customer limits, first purchase only, minimum purchase, % or fixed value of the net subtotal with an
 * optional cap, never above the subtotal. Read-only here; the trigger consumes the coupon atomically.
 */
export async function couponDiscount(sb: Sb, code: string | null, subtotalNet: number, userId: string | null = null): Promise<{ ok: true; discount: number; code: string | null } | PricingFailure> {
  const clean = String(code ?? "").trim();
  if (!clean) return { ok: true, discount: 0, code: null };
  const { data, error } = await sb.rpc("coupon_quote", { _code: clean, _user: userId, _subtotal: round2(subtotalNet) });
  if (error) throw error;
  const q = Array.isArray(data) ? data[0] : data;
  if (!q?.code) return { ok: false, reason: "Cupom inválido, expirado, esgotado ou abaixo da compra mínima." };
  return { ok: true, discount: round2(num(q.discount)), code: q.code };
}

export type PricingCheck = { ok: true } | PricingFailure;

/** Re-check of an order already stored (used before opening a Viva payment). */
export async function checkOrderPricing(
  sb: Sb,
  order: { id: string; user_id?: string | null; total: unknown; subtotal_net?: unknown; discount_amount?: unknown; payment_discount?: unknown; shipping_cost?: unknown; delivery_method_id?: string | null },
): Promise<PricingCheck> {
  const { data: stored, error } = await sb.from("order_items").select("product_id,quantity,price,design_data").eq("order_id", order.id);
  if (error) throw error;
  const priced = await priceItems(sb, stored ?? [], { userId: order.user_id ?? null, orderId: order.id });
  if (!priced.ok) return priced;

  let expectedNet = 0, expectedVat = 0, linesNet = 0;
  for (const l of priced.lines) {
    expectedNet += l.expectedUnit * l.quantity;
    expectedVat += l.expectedUnit * l.quantity * (l.vatRate / 100);
    linesNet += l.price * l.quantity;
  }

  // Shipping: fixed-rate methods can be checked exactly.
  let shippingFloor = 0;
  if (order.delivery_method_id) {
    const { data: method } = await sb.from("delivery_methods").select("type,config").eq("id", order.delivery_method_id).maybeSingle();
    const cfg: any = method?.config ?? {};
    if (method?.type === "delivery" && cfg.shipping_mode === "flat_rate") {
      shippingFloor = (num(cfg.flat_rate) + num(cfg.extra_cost)) * (1 + SHIPPING_VAT_RATE / 100);
      if (num(order.shipping_cost) + TOLERANCE < num(cfg.flat_rate) + num(cfg.extra_cost)) {
        return { ok: false, reason: "Portes inferiores à tarifa configurada." };
      }
    }
  }

  // The database computes the coupon discount from subtotal_net (trigger orders_secure_amounts), so
  // subtotal_net cannot exceed what the lines are worth, otherwise the discount could be inflated.
  if (order.subtotal_net != null && num(order.subtotal_net) > Math.max(linesNet, expectedNet) + 0.05) {
    return { ok: false, reason: "O subtotal da encomenda é superior ao dos artigos." };
  }

  // total = lines + VAT + shipping (with VAT) - discount - payment discount. The coupon discount is validated in
  // the database; the payment discount (ex.: Pix) is written only by create-order and capped at 50% of the lines.
  const payDiscount = Math.min(num(order.payment_discount), (linesNet + expectedVat) * 0.5);
  const discount = num(order.discount_amount) + payDiscount;
  const total = num(order.total);
  const minimum = Math.max(linesNet, expectedNet) + expectedVat + shippingFloor - discount;
  if (total + 0.05 < minimum) return { ok: false, reason: "O total é inferior ao valor calculado da encomenda." };
  return { ok: true };
}
