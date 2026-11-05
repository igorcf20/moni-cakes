// =====================================================================================
// Produtos digitais (recurso digital_products; Admin > Vendas > Downloads e aba Digital do produto).
// Regras no banco (migration 20261007110000_digital_products.sql): o acesso nasce quando o pedido fica pago, cada
// download passa por digital_download_start (dono, prazo, limite) e o ficheiro só abre logo a seguir. Frete:
// supabase/functions/_shared/digitalProducts.ts. Aqui ficam os tipos e as contas que o site só mostra.
// =====================================================================================

export type ProductDigital = {
  product_id: string;
  is_active: boolean;
  /** Downloads por arquivo (null = sem limite). */
  download_limit: number | null;
  /** Dias de acesso depois do pagamento (null = sem prazo). */
  access_days: number | null;
  license_keys: boolean;
  /** Também tem entrega física (ex.: livro impresso com versão digital). */
  ships: boolean;
  instructions_i18n: Record<string, string>;
};

export const DIGITAL_ERRORS = ['feature_off', 'not_found', 'revoked', 'expired', 'limit_reached'] as const;
export type DigitalError = (typeof DIGITAL_ERRORS)[number] | 'unknown';
export const digitalErrorOf = (message: unknown): DigitalError =>
  DIGITAL_ERRORS.find((c) => String(message ?? '').includes(c)) ?? 'unknown';

/** Tamanho máximo de um arquivo enviado (bucket digital-files); maiores vão como link. */
export const DIGITAL_MAX_BYTES = 50 * 1024 * 1024;

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const optInt = (v: unknown, min: number, max: number): number | null => {
  if (v == null || v === '') return null;
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null;
};

export function normalizeProductDigital(raw: unknown): ProductDigital {
  const o = obj(raw);
  const ins = obj(o.instructions_i18n);
  return {
    product_id: String(o.product_id ?? ''),
    is_active: o.is_active !== false,
    download_limit: optInt(o.download_limit, 1, 1000),
    access_days: optInt(o.access_days, 1, 3650),
    license_keys: o.license_keys === true,
    ships: o.ships === true,
    instructions_i18n: Object.fromEntries(Object.entries(ins).filter(([, v]) => typeof v === 'string' && v.trim()).map(([k, v]) => [k, String(v).slice(0, 2000)])),
  };
}

export type GrantFile = { id: string; name: string; size_bytes: number | null; link: boolean; used: number };
export type GrantState = 'active' | 'expired' | 'revoked';

/** Estado do acesso: revogado (pedido cancelado ou Admin), vencido ou ativo. */
export function grantState(g: { status: string; expires_at: string | null }, now = new Date()): GrantState {
  if (g.status !== 'active') return 'revoked';
  if (g.expires_at && new Date(g.expires_at).getTime() < now.getTime()) return 'expired';
  return 'active';
}

/** Downloads que ainda restam num arquivo (null = sem limite). */
export const downloadsLeft = (limit: number | null, used: number): number | null =>
  limit == null ? null : Math.max(0, limit - Math.max(0, used));

/** Pode baixar este arquivo agora? */
export const canDownload = (g: { status: string; expires_at: string | null; download_limit: number | null }, f: { used: number }, now = new Date()) =>
  grantState(g, now) === 'active' && downloadsLeft(g.download_limit, f.used) !== 0;

/** Dias inteiros até o fim do acesso (0 no último dia; null sem prazo). */
export function daysLeft(expiresAt: string | null, now = new Date()): number | null {
  if (!expiresAt) return null;
  return Math.max(0, Math.floor((new Date(expiresAt).getTime() - now.getTime()) / 86_400_000));
}

/** "2,4 MB" pela locale. */
export function formatBytes(bytes: number | null | undefined, locale: string): string {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: i === 0 ? 0 : 1 }).format(v)} ${units[i]}`;
}

/** Chaves coladas no Admin: uma por linha, sem vazias nem repetidas. */
export function parseLicenseKeys(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const k = line.trim().slice(0, 500);
    if (k && !seen.has(k)) { seen.add(k); out.push(k); }
  }
  return out;
}

/** Nome seguro para o caminho no storage: <produto>/<aleatório>-<nome>. */
export function digitalStoragePath(productId: string, fileName: string, random: string): string {
  const base = String(fileName ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-').replace(/\.{2,}/g, '.').replace(/-*\.-*/g, '.').replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '').slice(-120) || 'arquivo';
  return `${productId}/${random}-${base}`;
}
