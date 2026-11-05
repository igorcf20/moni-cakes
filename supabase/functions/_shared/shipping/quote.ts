// Cotação de frete no servidor: lê zonas, formas de envio, tabelas e contas de frete e devolve as opções
// para um endereço e um carrinho. Usado pela função shipping-quote (o checkout mostra) e pelo create-order
// (grava o preço da opção escolhida). Regras puras em rules.ts; cotações automáticas em providers.ts.
// Moeda: os pedidos guardam valores na moeda base da loja (store_settings.currency_settings.default, como os
// preços dos produtos); o site converte para a moeda do país só para mostrar. Por isso tudo aqui (tabelas na
// moeda da zona, cotações na moeda da transportadora, frete grátis do país na moeda do país) é convertido
// para a moeda base com as taxas da loja; sem taxa para uma moeda, a opção fica de fora.
import {
  bandFor, blockedClass, blockedProduct, chargeableWeight, convertCents, rateMeasure, ratePrice, regionFor, withFees,
  type PackageLine, type Rate, type Region,
} from "./rules.ts";
import { findQuote, PROVIDERS, type ProviderQuote } from "./providers.ts";
import { digitalOnlyIds } from "../digitalProducts.ts";

type Sb = any;
export type QuoteCountry = { code: string; currency: string; freeShippingFromCents: number | null };
/** unitNet: preço unitário líquido na moeda base da loja. */
export type QuoteItem = { product_id: string; quantity: number; unitNet: number };
export type ShippingOption = {
  service_id: string; carrier: string; name: string; name_i18n: Record<string, string>;
  description_i18n: Record<string, string>;
  price_cents: number; currency: string; free: boolean;
  days_min: number | null; days_max: number | null;
  source: "table" | "api"; region: string | null;
};
export type QuoteResult = { currency: string; weight_kg: number; region: string | null; options: ShippingOption[]; unavailable: { service_id: string; reason: string }[] };

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const digits = (currency: string) => new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;

/** Há formas de envio ativas? Sem nenhuma, a loja continua com as formas de entrega antigas (delivery_methods). */
export async function hasShippingServices(sb: Sb): Promise<boolean> {
  const { count, error } = await sb.from("shipping_services").select("id", { count: "exact", head: true }).eq("is_active", true);
  return !error && (count ?? 0) > 0;
}

export async function quoteShipping(sb: Sb, opts: {
  country: QuoteCountry;
  address: { postal_code?: string | null; region?: string | null; city?: string | null };
  items: QuoteItem[];
  serviceId?: string | null;
  /** Simulação do Admin: peso, subtotal e quantidade de artigos dados em vez do carrinho. */
  simulate?: { weightKg: number; subtotal: number; items?: number; productId?: string | null } | null;
}): Promise<QuoteResult> {
  const { country, address } = opts;
  // Produtos digitais sem entrega física não entram no pacote (peso, valor e quantidade).
  if (!opts.simulate && opts.items.length) {
    const digital = await digitalOnlyIds(sb, opts.items.map((i) => String(i.product_id)));
    if (digital.size) opts = { ...opts, items: opts.items.filter((i) => !digital.has(String(i.product_id))) };
  }
  let svcQuery = sb.from("shipping_services").select("*").eq("is_active", true).order("display_order");
  if (opts.serviceId) svcQuery = svcQuery.eq("id", opts.serviceId);
  const [{ data: services, error: e1 }, { data: regions, error: e2 }, { data: fx }] = await Promise.all([
    svcQuery,
    sb.from("shipping_regions").select("*").eq("is_active", true).order("display_order"),
    sb.from("store_settings").select("value").eq("key", "currency_settings").maybeSingle(),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const region = regionFor((regions ?? []) as Region[], { country: country.code, region: address.region, postal_code: address.postal_code });

  // Artigos: peso, embalagem e classe de envio vêm do produto (nunca do navegador).
  const simProduct = opts.simulate?.productId ? String(opts.simulate.productId) : null;
  const ids = simProduct ? [simProduct] : [...new Set(opts.items.map((i) => String(i.product_id)))];
  const { data: products } = ids.length
    ? await sb.from("products").select("id,weight,dimensions,shipping_class").in("id", ids)
    : { data: [] as any[] };
  const byId = new Map((products ?? []).map((p: any) => [String(p.id), p]));
  const lines = opts.simulate
    ? [{ // simulação: um pacote com o peso dado; com produto escolhido, valem as restrições dele
      id: simProduct ?? "sim", quantity: 1, weightKg: Math.max(0, num(opts.simulate.weightKg)), unitValue: num(opts.simulate.subtotal),
      shippingClass: simProduct ? ((byId.get(simProduct) as any)?.shipping_class || null) : null,
    }]
    : opts.items.map((i) => {
      const p: any = byId.get(String(i.product_id)) ?? {};
      const box = p.dimensions && typeof p.dimensions === "object" ? p.dimensions : {}; // embalagem em cm (Admin > Produto)
      return {
        id: String(i.product_id), quantity: num(i.quantity), unitValue: num(i.unitNet),
        weightKg: num(p.weight) || 0.5,
        lengthCm: num(box.length) || null, widthCm: num(box.width) || null, heightCm: num(box.height) || null,
        shippingClass: p.shipping_class || null,
      };
    });
  const fxValue: any = fx?.value ?? {};
  const currency = String(fxValue.default || "BRL").toUpperCase(); // moeda base da loja
  const fxRates: Record<string, number> = fxValue.rates ?? {};
  const convert = (cents: number, from: string) => convertCents(cents, String(from).toUpperCase(), currency, fxRates, currency, digits);
  const subtotal = opts.simulate ? num(opts.simulate.subtotal) : opts.items.reduce((s, i) => s + num(i.unitNet) * num(i.quantity), 0);
  const subtotalCents = Math.round(subtotal * 10 ** digits(currency));
  const realWeight = chargeableWeight(lines as PackageLine[], null);
  const itemCount = opts.simulate ? Math.max(1, Math.round(num(opts.simulate.items) || 1)) : lines.reduce((n, l) => n + Math.max(0, num(l.quantity)), 0);

  const countryFree = country.freeShippingFromCents == null ? null : convert(country.freeShippingFromCents, country.currency);

  // Tabelas da zona do endereço para as formas de envio pedidas.
  const serviceIds = (services ?? []).map((s: any) => s.id);
  const { data: rates } = region && serviceIds.length
    ? await sb.from("shipping_service_rates").select("*").eq("region_id", region.id).in("service_id", serviceIds)
    : { data: [] as any[] };

  // Cotações automáticas: uma chamada por provedor (com todas as formas de envio dele).
  const providerNames: string[] = [...new Set<string>((services ?? []).filter((s: any) => s.calc_mode === "api" && s.api_provider).map((s: any) => String(s.api_provider)))];
  const providerQuotes = new Map<string, ProviderQuote[] | null>();
  if (providerNames.length && address.postal_code) {
    const { data: accounts } = await sb.from("integration_credentials").select("provider,environment,is_active,credentials,public_config").in("provider", providerNames);
    await Promise.all(providerNames.map(async (name) => {
      const acc: any = (accounts ?? []).find((a: any) => a.provider === name);
      const run = PROVIDERS[name];
      if (!acc?.is_active || !run) { providerQuotes.set(name, null); return; }
      try {
        const fromCountry = String((services ?? []).find((s: any) => s.api_provider === name && s.ships_from)?.ships_from ?? country.code);
        providerQuotes.set(name, await run({
          account: { environment: acc.environment, credentials: acc.credentials ?? {}, public_config: acc.public_config ?? {} },
          fromCountry, to: { country: country.code, postal_code: String(address.postal_code), city: address.city }, weightKg: realWeight,
          // Valor declarado (seguro) na moeda da conta: reais no Melhor Envio, euros no Sendcloud.
          lines: lines.map((l) => {
            const target = name === "melhor_envio" ? "BRL" : "EUR";
            const cents = convertCents(Math.round(l.unitValue * 10 ** digits(currency)), currency, target, fxRates, currency, digits);
            return { ...l, unitValue: cents == null ? l.unitValue : cents / 10 ** digits(target) };
          }) as any,
        }));
      } catch (e) {
        console.error(`shipping-quote ${name}:`, (e as Error)?.message ?? e);
        providerQuotes.set(name, null);
      }
    }));
  }

  const options: ShippingOption[] = [];
  const unavailable: QuoteResult["unavailable"] = [];
  for (const s of services ?? []) {
    const no = (reason: string) => unavailable.push({ service_id: s.id, reason });
    if (blockedProduct(lines, s.excluded_products)) { no("product"); continue; }
    if (blockedClass(lines as PackageLine[], s.excluded_classes)) { no("class"); continue; }
    const weight = chargeableWeight(lines as PackageLine[], s.volumetric_divisor);
    if (s.max_weight_kg != null && weight > num(s.max_weight_kg)) { no("weight"); continue; }

    let priceCents: number | null = null, daysMin: number | null = null, daysMax: number | null = null;
    let source: ShippingOption["source"] = "table";
    let freeFrom: number | null = null;

    if (s.calc_mode === "api" && s.api_provider) {
      const quote = findQuote(providerQuotes.get(String(s.api_provider)) ?? [], s.api_service_code);
      const converted = quote ? convert(quote.priceCents, quote.currency) : null;
      if (quote && converted != null) { priceCents = converted; daysMin = quote.daysMin; daysMax = quote.daysMax; source = "api"; }
    }
    if (priceCents == null) {
      if (!region) { no("region"); continue; }
      // A linha da tabela sai do peso, da quantidade de artigos, do valor dos artigos (na moeda da zona) ou é única.
      const zoneSubtotal = convertCents(subtotalCents, currency, String(region.currency).toUpperCase(), fxRates, currency, digits);
      if (s.rate_basis === "subtotal" && zoneSubtotal == null) { no("currency"); continue; }
      const measure = rateMeasure(s.rate_basis, {
        weightKg: weight, items: itemCount, subtotal: (zoneSubtotal ?? 0) / 10 ** digits(String(region.currency).toUpperCase()),
      });
      const band = bandFor(((rates ?? []) as Rate[]).filter((r) => r.service_id === s.id), measure);
      if (!band) { no(s.calc_mode === "api" ? "quote" : "rate"); continue; }
      const converted = convert(ratePrice(band, measure, s.rate_basis), region.currency);
      if (converted == null) { no("currency"); continue; }
      priceCents = converted;
      daysMin = band.days_min; daysMax = band.days_max;
      if (band.free_from_cents != null) freeFrom = convert(num(band.free_from_cents), region.currency);
    }

    const free = (freeFrom != null && subtotalCents >= freeFrom)
      || (s.allow_free_shipping && countryFree != null && subtotalCents >= countryFree);
    priceCents = withFees(priceCents, s, subtotalCents); // taxa fixa, percentagem do pedido e preço mínimo
    const handling = num(s.handling_days);
    options.push({
      service_id: s.id, carrier: s.carrier, name: s.name, name_i18n: s.name_i18n ?? {}, description_i18n: s.description_i18n ?? {},
      price_cents: free ? 0 : priceCents, currency, free: !!free,
      days_min: daysMin == null ? null : daysMin + handling, days_max: daysMax == null ? null : daysMax + handling,
      source, region: region?.name ?? null,
    });
  }
  options.sort((a, b) => a.price_cents - b.price_cents);
  return { currency, weight_kg: realWeight, region: region?.name ?? null, options, unavailable };
}
