// Pré-venda (recurso preorders): produto vendido antes de estar disponível, com data de lançamento e limite opcional.
// O banco decide (product_preorders, _preorder_info, trigger order_items_preorder_mark); aqui só regras de exibição e
// a validação do formulário do Admin.

export type I18nText = Record<string, string>;

/** Produto em pré-venda agora (RPC preorders_public). remaining null = sem limite. */
export type PublicPreorder = {
  product_id: string;
  release_date: string | null;
  max_units: number | null;
  remaining: number | null;
  note_i18n: I18nText;
};

/** Regras do produto no Admin (tabela product_preorders). */
export type ProductPreorder = {
  product_id: string;
  is_active: boolean;
  release_date: string | null;
  max_units: number | null;
  note_i18n: I18nText;
};

export const NOTE_MAX = 240;
export const MAX_UNITS = 1_000_000;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const cleanNote = (v: unknown): I18nText => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const out: I18nText = {};
  for (const [k, s] of Object.entries(v as Record<string, unknown>)) {
    if (!/^[a-z]{2}(-[A-Z]{2})?$/.test(k) || typeof s !== 'string') continue;
    const text = s.trim().slice(0, NOTE_MAX);
    if (text) out[k] = text;
  }
  return out;
};

const cleanDate = (v: unknown): string | null => {
  if (typeof v !== 'string' || !ISO_DATE.test(v)) return null;
  return Number.isNaN(Date.parse(`${v}T00:00:00Z`)) ? null : v;
};

const cleanUnits = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_UNITS) : null;
};

export function normalizePublicPreorder(row: unknown): PublicPreorder | null {
  const r = (row ?? {}) as Record<string, unknown>;
  if (!r.product_id) return null;
  const remaining = r.remaining === null || r.remaining === undefined ? null : Math.max(0, Math.floor(Number(r.remaining) || 0));
  return {
    product_id: String(r.product_id),
    release_date: cleanDate(r.release_date),
    max_units: cleanUnits(r.max_units),
    remaining,
    note_i18n: cleanNote(r.note_i18n),
  };
}

export function normalizeProductPreorder(row: unknown): ProductPreorder {
  const r = (row ?? {}) as Record<string, unknown>;
  return {
    product_id: String(r.product_id ?? ''),
    is_active: r.is_active !== false,
    release_date: cleanDate(r.release_date),
    max_units: cleanUnits(r.max_units),
    note_i18n: cleanNote(r.note_i18n),
  };
}

/** Texto no idioma pedido, senão no padrão (pt-BR), senão o primeiro que houver. */
export function preorderNote(note: I18nText | null | undefined, locale: string): string {
  if (!note) return '';
  return note[locale] || note['pt-BR'] || Object.values(note)[0] || '';
}

/** Hoje no formato AAAA-MM-DD (data local do aparelho). */
export function todayIso(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** Erros do formulário do Admin: data de lançamento tem de ser depois de hoje (na data a pré-venda acaba). */
export function preorderErrors(p: ProductPreorder, today = todayIso()): Array<'release_past'> {
  return p.is_active && p.release_date && p.release_date <= today ? ['release_past'] : [];
}

/** Data de lançamento por extenso no idioma (sem fuso: a data é um dia, não um instante). */
export function formatReleaseDate(date: string, locale: string, short = false): string {
  const d = new Date(`${date}T12:00:00Z`);
  const opts: Intl.DateTimeFormatOptions = short ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'long', year: 'numeric' };
  return new Intl.DateTimeFormat(locale, { ...opts, timeZone: 'UTC' }).format(d);
}

/** Pré-venda gravada na linha do pedido (design_data.preorder, posta pelo servidor). undefined = linha sem pré-venda. */
export function orderLinePreorder(design: unknown): { release_date: string | null } | undefined {
  const d = design && typeof design === 'object' ? (design as Record<string, unknown>).preorder : undefined;
  if (!d) return undefined;
  const date = typeof d === 'object' ? cleanDate((d as Record<string, unknown>).release_date) : null;
  return { release_date: date };
}
