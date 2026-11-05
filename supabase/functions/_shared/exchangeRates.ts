// =============================================================================================
// Moedas e câmbio (Admin > Configurações > Moedas e câmbio; atualização automática = recurso auto_exchange_rates).
// Regras puras sobre store_settings.currency_settings, o mesmo valor que o site usa para converter os preços
// (hooks/use-currency.ts: 1 moeda base = rate moeda; margem de câmbio em % sobre o valor convertido).
//   - taxas de referência do Banco Central Europeu (BCE): arquivo diário em euros, convertido para a moeda base;
//   - moedas fixadas à mão (manual) nunca são trocadas pela atualização automática;
//   - salto maior que maxChangePercent não é aplicado sozinho (o Admin vê e pode aplicar mesmo assim).
// Cópia IGUAL em supabase/functions/_shared/exchangeRates.ts (função update-exchange-rates); o teste compara as duas.
// Sem imports. Teste: node --experimental-strip-types scripts/test-exchange-rates.mjs
// =============================================================================================

export const ECB_DAILY_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';

/** Moedas publicadas pelo BCE (além do euro). Outras moedas só com taxa à mão. */
export const ECB_CURRENCIES = [
  'USD', 'JPY', 'BGN', 'CZK', 'DKK', 'GBP', 'HUF', 'PLN', 'RON', 'SEK', 'CHF', 'ISK', 'NOK', 'TRY', 'AUD', 'BRL', 'CAD',
  'CNY', 'HKD', 'IDR', 'ILS', 'INR', 'KRW', 'MXN', 'MYR', 'NZD', 'PHP', 'SGD', 'THB', 'ZAR',
];

export type RateSource = 'ecb' | 'manual';
export type RunStatus = 'ok' | 'partial' | 'error' | 'skipped';

export type CurrencySettings = {
  /** moeda base da loja (preços dos produtos) */
  default: string;
  /** moedas mostradas no Admin além das dos países ativos */
  available: string[];
  /** 1 moeda base = rates[código] */
  rates: Record<string, number>;
  /** margem de câmbio em % sobre o valor convertido */
  markup: number;
  /** moedas com taxa fixada à mão (a atualização automática não troca) */
  manual: string[];
  /** maior variação aceita sozinha numa atualização automática (%) */
  maxChangePercent: number;
  /** quem gravou as taxas por último (o histórico usa este valor) */
  rates_source: RateSource;
  /** última atualização automática ou pedida no Admin */
  last_run: string | null;
  last_status: RunStatus | null;
  /** data das taxas do BCE usadas */
  rate_date: string | null;
  /** moedas que ficaram por atualizar na última vez, com o motivo */
  last_skipped: RateSkip[];
};

export type RateSkip = { code: string; reason: 'manual' | 'jump' | 'missing'; rate?: number; changePercent?: number };

export const DEFAULT_MAX_CHANGE = 20;

const CODE_RE = /^[A-Z]{3}$/;
const codes = (v: unknown) => (Array.isArray(v) ? [...new Set(v.map((x) => String(x ?? '').trim().toUpperCase()).filter((c) => CODE_RE.test(c)))] : []);
const finite = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : NaN; };

export function normalizeCurrencySettings(raw: unknown): CurrencySettings {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const base = CODE_RE.test(String(o.default ?? '')) ? String(o.default) : 'BRL';
  const rates: Record<string, number> = {};
  if (o.rates && typeof o.rates === 'object' && !Array.isArray(o.rates)) {
    for (const [k, v] of Object.entries(o.rates as Record<string, unknown>)) {
      const n = finite(v);
      if (CODE_RE.test(k) && k !== base && n > 0) rates[k] = n;
    }
  }
  const markup = finite(o.markup);
  const max = finite(o.maxChangePercent);
  const skipped = Array.isArray(o.last_skipped)
    ? (o.last_skipped as RateSkip[]).filter((s) => s && CODE_RE.test(String(s.code)) && ['manual', 'jump', 'missing'].includes(s.reason)).slice(0, 60)
    : [];
  return {
    default: base,
    available: codes(o.available).filter((c) => c !== base),
    rates,
    markup: markup > 0 ? Math.min(markup, 50) : 0,
    manual: codes(o.manual).filter((c) => c !== base),
    maxChangePercent: max > 0 ? Math.min(max, 100) : DEFAULT_MAX_CHANGE,
    rates_source: o.rates_source === 'ecb' ? 'ecb' : 'manual',
    last_run: typeof o.last_run === 'string' ? o.last_run : typeof o.last_auto_update === 'string' ? o.last_auto_update : null,
    last_status: ['ok', 'partial', 'error', 'skipped'].includes(String(o.last_status)) ? (o.last_status as RunStatus) : null,
    rate_date: typeof o.rate_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.rate_date) ? o.rate_date : null,
    last_skipped: skipped,
  };
}

/** Moedas que a loja precisa: as dos países ativos, as já com taxa e as escolhidas, sem a base. */
export function wantedCurrencies(s: CurrencySettings, countryCurrencies: string[]): string[] {
  return [...new Set([...codes(countryCurrencies), ...Object.keys(s.rates), ...s.available])].filter((c) => c !== s.default).sort();
}

/* ---------- BCE ---------- */

export type EcbRates = { date: string; rates: Record<string, number> };

/** Lê o XML diário do BCE (taxas em euros). O euro entra com 1. Formato inválido = null. */
export function parseEcbXml(xml: string): EcbRates | null {
  const date = /<Cube\s+time=["'](\d{4}-\d{2}-\d{2})["']/.exec(xml)?.[1];
  if (!date) return null;
  const rates: Record<string, number> = { EUR: 1 };
  const re = /<Cube\s+currency=["']([A-Z]{3})["']\s+rate=["']([0-9.]+)["']\s*\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const n = Number(m[2]);
    if (Number.isFinite(n) && n > 0) rates[m[1]] = n;
  }
  return Object.keys(rates).length > 1 ? { date, rates } : null;
}

/** Arredonda a 6 algarismos significativos (as taxas do BCE têm 4 a 6). */
export function roundRate(v: number): number {
  if (!(v > 0)) return 0;
  return Number(v.toPrecision(6));
}

/** Taxa 1 base = x moeda, a partir das taxas em euros. null = o BCE não publica uma das duas. */
export function crossRate(ecb: EcbRates, base: string, code: string): number | null {
  const b = ecb.rates[base];
  const c = ecb.rates[code];
  if (!b || !c) return null;
  return roundRate(c / b);
}

/** Variação em % entre a taxa antiga e a nova (sem taxa antiga = 0). */
export const changePercent = (oldRate: number | undefined, next: number) =>
  oldRate && oldRate > 0 ? Math.abs((next - oldRate) / oldRate) * 100 : 0;

/**
 * Aplica as taxas do BCE às moedas pedidas: fixadas à mão ficam, moedas que o BCE não publica ficam, e saltos
 * maiores que maxChangePercent só entram com force (pedido do Admin depois de ver o aviso).
 */
export function applyEcbRates(s: CurrencySettings, ecb: EcbRates, wanted: string[], opts: { force?: boolean; now?: Date } = {}):
  { settings: CurrencySettings; changed: { code: string; from: number | null; to: number }[]; skipped: RateSkip[] } {
  const rates = { ...s.rates };
  const changed: { code: string; from: number | null; to: number }[] = [];
  const skipped: RateSkip[] = [];
  for (const code of wanted) {
    if (code === s.default) continue;
    if (s.manual.includes(code)) { skipped.push({ code, reason: 'manual' }); continue; }
    const next = crossRate(ecb, s.default, code);
    if (next == null) { skipped.push({ code, reason: 'missing' }); continue; }
    const pct = changePercent(s.rates[code], next);
    if (!opts.force && pct > s.maxChangePercent) {
      skipped.push({ code, reason: 'jump', rate: next, changePercent: Math.round(pct * 10) / 10 });
      continue;
    }
    if (s.rates[code] !== next) changed.push({ code, from: s.rates[code] ?? null, to: next });
    rates[code] = next;
  }
  const failed = skipped.some((x) => x.reason !== 'manual');
  return {
    settings: {
      ...s, rates, rates_source: 'ecb', last_run: (opts.now ?? new Date()).toISOString(),
      last_status: failed ? 'partial' : 'ok', rate_date: ecb.date, last_skipped: skipped,
    },
    changed,
    skipped,
  };
}

/** Valor convertido como o site mostra (com a margem de câmbio). null = sem taxa (o site fica na moeda base). */
export function convertAmount(s: CurrencySettings, amount: number, code: string): number | null {
  if (code === s.default) return amount;
  const rate = s.rates[code];
  if (!rate) return null;
  return amount * rate * (1 + s.markup / 100);
}
