// Rastreio: o código guardado no pedido pode ser um link completo ou um código da transportadora.
// O link é escolhido pela transportadora (explícita, pelo formato do código ou pelo shippingProvider do país);
// sem transportadora conhecida não há link (as páginas mostram só o código para copiar).
import { FALLBACK_COUNTRIES, getCountry } from "@/lib/countries";
import { carrierInfo, carrierTrackingUrl } from "@/lib/carriers";

export type TrackingCarrierId = "ctt" | "correios";

type CarrierDef = { name: string; accepts: (code: string) => boolean; url: (code: string) => string };

const CARRIERS: Record<TrackingCarrierId, CarrierDef> = {
  // CTT (Portugal): a pesquisa aceita qualquer formato de código.
  ctt: {
    name: "CTT",
    accepts: (c) => c.length > 0,
    url: (c) => `https://www.ctt.pt/feapl_2/app/open/objectSearch/objectSearch.jspx?objects=${encodeURIComponent(c)}`,
  },
  // Correios (Brasil): só objetos no formato AA123456789BR.
  correios: {
    name: "Correios",
    accepts: (c) => /^[A-Z]{2}\d{9}BR$/.test(c),
    url: (c) => `https://rastreamento.correios.com.br/app/index.php?objetos=${encodeURIComponent(c)}`,
  },
};

// Código postal internacional (UPU S10, ex.: RR123456789PT): os dois últimos caracteres dizem o operador de origem.
const S10 = /^[A-Z]{2}\d{9}([A-Z]{2})$/;
const S10_POST: Record<string, TrackingCarrierId> = { BR: "correios", PT: "ctt" };

type CountryLike = { code: string; shippingProvider?: string | null };

export type TrackingOptions = {
  /** País do pedido (código ISO ou objeto do país); sem ele vale o país atual da loja. */
  country?: string | CountryLike | null;
  /** Transportadora do envio (ex.: "ctt", "correios"); tem prioridade sobre o país. */
  carrier?: string | null;
  /** Link de rastreio da forma de envio do pedido, com {code} (Admin > Frete e transportadoras). */
  template?: string | null;
};

const isCarrier = (id: string | null | undefined): id is TrackingCarrierId =>
  !!id && Object.prototype.hasOwnProperty.call(CARRIERS, id);

function countryFrom(c: TrackingOptions["country"]): CountryLike | null {
  if (c && typeof c === "object") return c;
  const current = getCountry();
  if (typeof c === "string" && c.trim()) {
    const code = c.trim().toUpperCase();
    if (current?.code === code) return current;
    return FALLBACK_COUNTRIES.find((f) => f.code === code) ?? { code, shippingProvider: null };
  }
  return current ?? null;
}

/** Código sem espaços e em maiúsculas, como as transportadoras o pesquisam. */
const normalizeCode = (value: string) => value.replace(/\s+/g, "").toUpperCase();

/** Transportadora com rastreio público para este código (ou null se não houver nenhuma conhecida). */
export function trackingCarrier(
  value: string | null | undefined,
  options: TrackingOptions = {},
): { id: string; name: string; url: string } | null {
  const v = (value || "").trim();
  if (!v || isTrackingUrl(v)) return null;
  const code = normalizeCode(v);
  // Forma de envio do pedido: link próprio do serviço ou o da transportadora do catálogo (src/lib/carriers.ts).
  const chosen = options.carrier?.trim().toLowerCase();
  if (!isCarrier(chosen) && (options.template || carrierInfo(chosen)?.tracking)) {
    const url = carrierTrackingUrl(code, chosen, options.template);
    if (url) return { id: chosen || "custom", name: carrierInfo(chosen)?.name ?? "", url };
  }
  const s10 = S10.exec(code);
  const provider = countryFrom(options.country)?.shippingProvider?.toLowerCase();
  const candidates = [options.carrier?.trim().toLowerCase(), s10 ? S10_POST[s10[1]] : null, provider];
  for (const id of candidates) {
    if (isCarrier(id) && CARRIERS[id].accepts(code)) return { id, name: CARRIERS[id].name, url: CARRIERS[id].url(code) };
  }
  return null;
}

/**
 * Link de rastreio: um link completo volta como está; um código vira o link da transportadora
 * (ver trackingCarrier). Sem código ou sem transportadora conhecida devolve null.
 */
export function resolveTrackingUrl(value: string | null | undefined, options: TrackingOptions = {}): string | null {
  const v = (value || "").trim();
  if (!v) return null;
  if (isTrackingUrl(v)) return v;
  return trackingCarrier(v, options)?.url ?? null;
}

export function isTrackingUrl(value: string | null | undefined): boolean {
  return /^https?:\/\//i.test((value || "").trim());
}

export function formatTrackingDisplay(value: string | null | undefined, maxLen = 40): string {
  const v = (value || "").trim();
  if (!v) return "";
  if (!isTrackingUrl(v)) return v;
  return v.length > maxLen ? v.slice(0, maxLen - 1) + "…" : v;
}
