// Regras do frete, sem acesso à base de dados nem à rede (testadas por scripts/test-shipping.mjs).
//
// 1. Zona do endereço: cada endereço pertence a UMA zona, a mais específica que o aceita
//    (código postal > estado/distrito > país > '*' resto do mundo; empate: a primeira na ordem do Admin).
// 2. Peso cobrado: soma de cada artigo (quantidade x maior entre peso real e volumétrico da embalagem).
// 3. Preço da tabela: a faixa de peso da forma de envio nessa zona (preço + kg extra), grátis a partir de
//    um subtotal da faixa ou do frete grátis do país (se a forma de envio entra nele).
// Valores em centavos (unidades mínimas) com a moeda ao lado.

export type Region = {
  id: string; name: string; countries: string[]; regions: string[]; postal_codes: string[];
  currency: string; is_active?: boolean; display_order?: number;
};
export type Rate = {
  id?: string; service_id: string; region_id: string; min_weight_kg: number | string; max_weight_kg: number | string | null;
  price_cents: number | string; extra_kg_cents: number | string; days_min: number | null; days_max: number | null;
  free_from_cents: number | string | null;
};
export type Address = { country: string; region?: string | null; postal_code?: string | null };
export type PackageLine = {
  quantity: number; weightKg: number; lengthCm?: number | null; widthCm?: number | null; heightCm?: number | null;
  shippingClass?: string | null;
};

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const fold = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/** Código postal só com letras e números, em maiúsculas ("01310-100" -> "01310100"). */
export const normPostal = (s: unknown) => String(s ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");

/** "9000..9399" = faixa (compara os primeiros dígitos do código); outro texto = prefixo ("07", "SW1"). */
export function postalMatches(rule: string, postal: string): boolean {
  const code = normPostal(postal);
  if (!code) return false;
  const [fromRaw, toRaw] = String(rule).split("..");
  const from = normPostal(fromRaw);
  if (!from) return false;
  if (toRaw === undefined) return code.startsWith(from);
  const to = normPostal(toRaw);
  const head = code.slice(0, Math.max(from.length, to.length));
  return head.length >= from.length && head >= from && head <= to;
}

/** Quão bem a zona descreve o endereço (-1 = não serve). */
export function regionScore(region: Region, addr: Address): number {
  if (region.is_active === false) return -1;
  const country = String(addr.country ?? "").toUpperCase();
  const countries = (region.countries ?? []).map((c) => String(c).toUpperCase());
  let score: number;
  if (countries.includes(country)) score = 2;
  else if (countries.includes("*")) score = 1;
  else return -1;
  if (region.regions?.length) {
    const wanted = fold(addr.region);
    if (!wanted || !region.regions.some((r) => fold(r) === wanted)) return -1;
    score += 4;
  }
  if (region.postal_codes?.length) {
    if (!region.postal_codes.some((r) => postalMatches(r, String(addr.postal_code ?? "")))) return -1;
    score += 8;
  }
  return score;
}

/** A zona do endereço (a mais específica), ou null se a loja não entrega lá. */
export function regionFor(regions: Region[], addr: Address): Region | null {
  let best: Region | null = null, bestScore = -1, bestOrder = Infinity;
  for (const r of regions) {
    const s = regionScore(r, addr);
    const order = num(r.display_order);
    if (s > bestScore || (s === bestScore && s >= 0 && order < bestOrder)) { best = r; bestScore = s; bestOrder = order; }
  }
  return bestScore >= 0 ? best : null;
}

/** Peso cobrado (kg). divisor: cm³ por kg do peso volumétrico (ex.: 5000); sem divisor, só o peso real. */
export function chargeableWeight(lines: PackageLine[], divisor?: number | null): number {
  let total = 0;
  for (const l of lines) {
    const real = Math.max(0, num(l.weightKg));
    const vol = divisor && l.lengthCm && l.widthCm && l.heightCm ? (num(l.lengthCm) * num(l.widthCm) * num(l.heightCm)) / divisor : 0;
    total += Math.max(real, vol) * Math.max(0, num(l.quantity));
  }
  return Math.round(total * 1000) / 1000;
}

/** Faixa de peso que serve (a de peso mínimo mais alto entre as que aceitam o peso). */
export function bandFor(rates: Rate[], weightKg: number): Rate | null {
  const fits = rates.filter((r) => weightKg + 1e-9 >= num(r.min_weight_kg) && (r.max_weight_kg == null || r.max_weight_kg === "" || weightKg <= num(r.max_weight_kg) + 1e-9));
  fits.sort((a, b) => num(b.min_weight_kg) - num(a.min_weight_kg));
  return fits[0] ?? null;
}

/** Preço da faixa em centavos: preço + cada kg (ou fração) acima do mínimo x kg extra. */
export function bandPrice(rate: Rate, weightKg: number): number {
  const extraKg = Math.max(0, Math.ceil(weightKg - num(rate.min_weight_kg) - 1e-9));
  return Math.max(0, Math.round(num(rate.price_cents) + extraKg * num(rate.extra_kg_cents)));
}

/** Converte centavos entre moedas com as taxas da loja (1 moeda base = taxa[moeda]); null sem taxa. */
export function convertCents(cents: number, from: string, to: string, rates: Record<string, number>, base: string, digits: (c: string) => number): number | null {
  if (from === to) return cents;
  const rateOf = (c: string) => (c === base ? 1 : num(rates?.[c]));
  const rf = rateOf(from), rt = rateOf(to);
  if (!(rf > 0) || !(rt > 0)) return null;
  const value = cents / 10 ** digits(from);
  return Math.round((value / rf) * rt * 10 ** digits(to));
}

/** Uma classe de envio dos artigos que a forma de envio não leva (ou null). */
export function blockedClass(lines: PackageLine[], excluded: string[] | null | undefined): string | null {
  if (!excluded?.length) return null;
  const bad = new Set(excluded.map(fold));
  const hit = lines.find((l) => l.shippingClass && bad.has(fold(l.shippingClass)));
  return hit ? String(hit.shippingClass) : null;
}

/** Um produto do carrinho que a forma de envio não leva (ou null). */
export function blockedProduct(lines: { id?: string | null }[], excluded: string[] | null | undefined): string | null {
  if (!excluded?.length) return null;
  const bad = new Set(excluded.map(String));
  const hit = lines.find((l) => l.id != null && bad.has(String(l.id)));
  return hit ? String(hit.id) : null;
}

/** O que escolhe a linha da tabela: peso cobrado, quantidade de artigos, valor dos artigos ou preço único. */
export type RateBasis = "weight" | "items" | "subtotal" | "flat";
export const RATE_BASES: RateBasis[] = ["weight", "items", "subtotal", "flat"];

/** Valor procurado na tabela para cada base (subtotal em unidades da moeda da zona, ex.: 149.9). */
export function rateMeasure(basis: string | null | undefined, m: { weightKg: number; items: number; subtotal: number }): number {
  switch (basis) {
    case "items": return Math.max(0, num(m.items));
    case "subtotal": return Math.max(0, num(m.subtotal));
    case "flat": return 0;
    default: return Math.max(0, num(m.weightKg));
  }
}

/** Preço da linha conforme a base: só peso e itens somam o valor extra por unidade acima do mínimo. */
export function ratePrice(rate: Rate, measure: number, basis: string | null | undefined): number {
  if (basis === "subtotal" || basis === "flat") return Math.max(0, Math.round(num(rate.price_cents)));
  return bandPrice(rate, measure);
}

/** Taxas da forma de envio (moeda base): + taxa fixa + percentagem do valor dos artigos, com preço mínimo. */
export function withFees(cents: number, fees: { fee_cents?: unknown; fee_percent?: unknown; min_price_cents?: unknown }, subtotalCents: number): number {
  let total = Math.max(0, num(cents)) + Math.max(0, num(fees.fee_cents)) + Math.max(0, num(subtotalCents)) * Math.max(0, num(fees.fee_percent)) / 100;
  const min = fees.min_price_cents == null || fees.min_price_cents === "" ? null : num(fees.min_price_cents);
  if (min != null && total < min) total = min;
  return Math.round(total);
}
