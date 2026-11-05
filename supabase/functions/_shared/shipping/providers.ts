// Cotação automática por contas de frete da loja (credenciais em integration_credentials, inseridas no
// Admin > Integrações, nunca no código). Cada provedor recebe o pacote e devolve preço e prazo por código
// de serviço; falha ou ausência de conta = a forma de envio usa a tabela de preços (se tiver).
//   melhor_envio  Brasil: Correios, Jadlog, Loggi, Azul Cargo, J&T... (cotação por produtos).
//   sendcloud     Europa: CTT, DPD, GLS, SEUR, MRW, Correos, DHL, UPS... (API v3 shipping-options).
import type { PackageLine } from "./rules.ts";

export type ProviderQuote = { code: string; priceCents: number; currency: string; daysMin: number | null; daysMax: number | null };
export type ProviderAccount = { environment: string; credentials: Record<string, string>; public_config: Record<string, any> };
export type ProviderRequest = {
  account: ProviderAccount;
  fromCountry: string;
  to: { country: string; postal_code: string; city?: string | null };
  lines: (PackageLine & { id: string; unitValue: number })[];
  weightKg: number;
};

const TIMEOUT_MS = 8000;
const DEFAULT_BOX = { length: 20, width: 15, height: 10 }; // embalagem assumida quando o produto não tem medidas
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const toCents = (v: unknown) => Math.round(num(v) * 100);

async function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", ...headers }, body: JSON.stringify(body), signal: ctrl.signal });
    if (!res.ok) throw new Error(`${new URL(url).host} respondeu ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ── Melhor Envio ──────────────────────────────────────────────────────────────
// Credenciais: token. Configuração pública: from_postal_code (CEP de origem), contact_email (User-Agent), api_base opcional.
async function melhorEnvio(req: ProviderRequest): Promise<ProviderQuote[]> {
  const { credentials, public_config: cfg, environment } = req.account;
  if (!credentials.token || !cfg.from_postal_code) throw new Error("Melhor Envio sem token ou CEP de origem");
  const base = cfg.api_base || (environment === "production" ? "https://www.melhorenvio.com.br" : "https://sandbox.melhorenvio.com.br");
  const data = await postJson(`${base}/api/v2/me/shipment/calculate`, {
    Authorization: `Bearer ${credentials.token}`,
    "User-Agent": `Loja (${cfg.contact_email || "contato@loja"})`,
  }, {
    from: { postal_code: String(cfg.from_postal_code).replace(/\D/g, "") },
    to: { postal_code: String(req.to.postal_code).replace(/\D/g, "") },
    products: req.lines.map((l) => ({
      id: l.id,
      width: num(l.widthCm) || DEFAULT_BOX.width,
      height: num(l.heightCm) || DEFAULT_BOX.height,
      length: num(l.lengthCm) || DEFAULT_BOX.length,
      weight: Math.max(0.01, num(l.weightKg)),
      insurance_value: Math.max(0, num(l.unitValue)),
      quantity: l.quantity,
    })),
    options: { receipt: false, own_hand: false },
  });
  if (!Array.isArray(data)) return [];
  return data.filter((s: any) => !s?.error && (s?.custom_price ?? s?.price) != null).map((s: any) => {
    const range = s.custom_delivery_range ?? s.delivery_range ?? {};
    const days = num(s.custom_delivery_time ?? s.delivery_time) || null;
    return {
      code: String(s.id),
      priceCents: toCents(s.custom_price ?? s.price),
      currency: "BRL", // o Melhor Envio cota sempre em reais (o campo currency vem como "R$")
      daysMin: num(range.min) || days,
      daysMax: num(range.max) || days,
    };
  });
}

// ── Sendcloud (API v3) ────────────────────────────────────────────────────────
// Credenciais: public_key e secret_key. Configuração pública: from_postal_code, from_country (padrão: país de origem).
async function sendcloud(req: ProviderRequest): Promise<ProviderQuote[]> {
  const { credentials, public_config: cfg } = req.account;
  if (!credentials.public_key || !credentials.secret_key) throw new Error("Sendcloud sem chaves");
  const biggest = req.lines.reduce((b, l) => (num(l.lengthCm) * num(l.widthCm) * num(l.heightCm) > b.length * b.width * b.height
    ? { length: num(l.lengthCm), width: num(l.widthCm), height: num(l.heightCm) } : b), DEFAULT_BOX);
  const data = await postJson("https://panel.sendcloud.sc/api/v3/shipping-options", {
    Authorization: `Basic ${btoa(`${credentials.public_key}:${credentials.secret_key}`)}`,
  }, {
    from_address: { country_code: String(cfg.from_country || req.fromCountry).toUpperCase(), postal_code: String(cfg.from_postal_code ?? "") || undefined },
    to_address: { country_code: req.to.country, postal_code: req.to.postal_code || undefined, city: req.to.city || undefined },
    parcels: [{
      weight: { value: String(Math.max(0.001, req.weightKg)), unit: "kg" },
      dimensions: { length: String(biggest.length), width: String(biggest.width), height: String(biggest.height), unit: "cm" },
    }],
    calculate_quotes: true,
  });
  const out: ProviderQuote[] = [];
  for (const o of data?.data ?? []) {
    const q = (o?.quotes ?? [])[0];
    const total = q?.price?.total;
    if (!o?.code || total?.value == null) continue;
    const hours = num(q.lead_time);
    const days = hours > 0 ? Math.ceil(hours / 24) : null;
    out.push({ code: String(o.code), priceCents: toCents(total.value), currency: String(total.currency || "EUR").toUpperCase(), daysMin: days, daysMax: days });
  }
  return out;
}

export const PROVIDERS: Record<string, (req: ProviderRequest) => Promise<ProviderQuote[]>> = {
  melhor_envio: melhorEnvio,
  sendcloud,
};

/** O código configurado no Admin aceita o código exato ou o início (ex.: "ctt:" = qualquer serviço CTT). */
export function findQuote(quotes: ProviderQuote[], code: string | null | undefined): ProviderQuote | null {
  const wanted = String(code ?? "").trim().toLowerCase();
  if (!wanted) return null;
  const exact = quotes.find((q) => q.code.toLowerCase() === wanted);
  if (exact) return exact;
  const prefixed = quotes.filter((q) => q.code.toLowerCase().startsWith(wanted)).sort((a, b) => a.priceCents - b.priceCents);
  return prefixed[0] ?? null;
}
