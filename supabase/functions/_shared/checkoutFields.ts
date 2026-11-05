// =====================================================================================
// Campos extra no checkout (recurso checkout_fields; Admin > Vendas > Campos do checkout). Regras e contas.
// Este ficheiro é igual a supabase/functions/_shared/checkoutFields.ts (o teste scripts/test-checkout-fields.mjs
// confere): o site mostra e avisa o que falta, o create-order valida de novo e soma o preço no servidor.
//   Tipos     checkbox (caixa de marcar, preço quando marcada), select (lista, preço por opção),
//             text e textarea (texto curto ou longo, preço quando preenchido)
//   Preços    na moeda base da loja, sem imposto (como os produtos); o imposto do país soma por cima
//   Pedido    orders.checkout_fields (o que o cliente respondeu, com os textos da época) e orders.extras_amount
// Sem imports.
// =====================================================================================

export type FieldKind = 'checkbox' | 'select' | 'text' | 'textarea';
export const FIELD_KINDS: FieldKind[] = ['checkbox', 'select', 'text', 'textarea'];

export type I18nText = Record<string, string>;
export type FieldOption = { id: string; label_i18n: I18nText; price: number };

export type CheckoutField = {
  id: string;
  /** Nome interno (Admin e pedido); o cliente vê label_i18n. */
  name: string;
  kind: FieldKind;
  label_i18n: I18nText;
  help_i18n: I18nText;
  options: FieldOption[];
  /** Preço da caixa marcada ou do texto preenchido. */
  price: number;
  required: boolean;
  max_length: number;
  /** Países onde aparece (vazio = todos). */
  countries: string[];
  is_active: boolean;
  display_order: number;
};

export type Answers = Record<string, string | boolean>;

/** Uma resposta guardada no pedido (textos da época, para o pedido não mudar se o campo mudar depois). */
export type AnswerLine = {
  field_id: string;
  name: string;
  kind: FieldKind;
  label: I18nText;
  value: string | boolean;
  option_label?: I18nText;
  price: number;
};

export type FieldError = { field_id: string; code: 'required' | 'invalid_option' | 'too_long' };

export const MAX_FIELD_PRICE = 100000;
export const MAX_OPTIONS = 30;
export const DEFAULT_MAX_LENGTH = 200;

const round2 = (n: number) => Math.round(n * 100) / 100;
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const price = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.min(round2(n), MAX_FIELD_PRICE) : 0;
};

function i18n(v: unknown): I18nText {
  const out: I18nText = {};
  for (const [k, s] of Object.entries(obj(v))) if (typeof s === 'string' && s.trim()) out[k] = s.trim();
  return out;
}

/** Texto no idioma pedido; senão pt-BR, senão o primeiro que houver, senão o texto de reserva. */
export function localText(t: I18nText | null | undefined, locale: string, fallback = ''): string {
  const m = t ?? {};
  return m[locale] || m[locale.split('-')[0]] || m['pt-BR'] || Object.values(m).find(Boolean) || fallback;
}

/** Linha da base (ou do Admin) em formato seguro. */
export function normalizeField(row: unknown): CheckoutField {
  const r = obj(row);
  const kind = FIELD_KINDS.includes(r.kind as FieldKind) ? (r.kind as FieldKind) : 'checkbox';
  const options = (Array.isArray(r.options) ? r.options : []).slice(0, MAX_OPTIONS).map((o, i) => {
    const x = obj(o);
    return { id: String(x.id ?? `op${i + 1}`).slice(0, 40), label_i18n: i18n(x.label_i18n), price: price(x.price) };
  });
  const ml = Math.floor(Number(r.max_length));
  return {
    id: String(r.id ?? ''),
    name: String(r.name ?? '').trim(),
    kind,
    label_i18n: i18n(r.label_i18n),
    help_i18n: i18n(r.help_i18n),
    options: kind === 'select' ? options : [],
    price: kind === 'select' ? 0 : price(r.price),
    required: r.required === true,
    max_length: Number.isFinite(ml) && ml >= 1 ? Math.min(ml, 1000) : DEFAULT_MAX_LENGTH,
    countries: (Array.isArray(r.countries) ? r.countries : []).map((c) => String(c).toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c)),
    is_active: r.is_active !== false,
    display_order: Number(r.display_order) || 0,
  };
}

/** Campos que o cliente deste país vê, pela ordem do Admin. */
export function fieldsFor(fields: CheckoutField[], countryCode: string): CheckoutField[] {
  const cc = String(countryCode || '').toUpperCase();
  return fields
    .filter((f) => f.is_active && (f.countries.length === 0 || f.countries.includes(cc)))
    .sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name));
}

/** Valida as respostas e soma o preço. Respostas de campos que não existem são ignoradas. */
export function answerLines(fields: CheckoutField[], answers: unknown): { lines: AnswerLine[]; total: number; errors: FieldError[] } {
  const a = obj(answers);
  const lines: AnswerLine[] = [];
  const errors: FieldError[] = [];
  for (const f of fields) {
    const raw = a[f.id];
    const base = { field_id: f.id, name: f.name, kind: f.kind, label: f.label_i18n };
    if (f.kind === 'checkbox') {
      if (raw === true) lines.push({ ...base, value: true, price: f.price });
      else if (f.required) errors.push({ field_id: f.id, code: 'required' });
    } else if (f.kind === 'select') {
      const id = typeof raw === 'string' ? raw : '';
      if (!id) { if (f.required) errors.push({ field_id: f.id, code: 'required' }); continue; }
      const op = f.options.find((o) => o.id === id);
      if (!op) { errors.push({ field_id: f.id, code: 'invalid_option' }); continue; }
      lines.push({ ...base, value: op.id, option_label: op.label_i18n, price: op.price });
    } else {
      const text = typeof raw === 'string' ? raw.trim() : '';
      if (!text) { if (f.required) errors.push({ field_id: f.id, code: 'required' }); continue; }
      if (text.length > f.max_length) { errors.push({ field_id: f.id, code: 'too_long' }); continue; }
      lines.push({ ...base, value: text, price: f.price });
    }
  }
  return { lines, total: round2(lines.reduce((s, l) => s + l.price, 0)), errors };
}

/** Texto da resposta para mostrar (pedido no Admin, na conta e no resumo). */
export function answerText(line: AnswerLine, locale: string, yes: string): string {
  if (line.kind === 'checkbox') return yes;
  if (line.kind === 'select') return localText(line.option_label, locale, String(line.value));
  return String(line.value);
}

/** Respostas guardadas num pedido (antigos ou com lixo ficam vazios). */
export function orderAnswerLines(v: unknown): AnswerLine[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => x && typeof x === 'object' && typeof (x as AnswerLine).field_id === 'string').map((x) => {
    const l = x as AnswerLine;
    return { ...l, label: i18n(l.label), option_label: l.option_label ? i18n(l.option_label) : undefined, price: price(l.price) };
  });
}

/** Problemas do formulário do Admin antes de gravar (códigos para textos). */
export function fieldInputErrors(f: CheckoutField): Array<'name' | 'label' | 'options' | 'option_label' | 'price' | 'max_length'> {
  const out: Array<'name' | 'label' | 'options' | 'option_label' | 'price' | 'max_length'> = [];
  if (!f.name || f.name.length > 80) out.push('name');
  if (Object.keys(f.label_i18n).length === 0) out.push('label');
  if (f.kind === 'select') {
    if (f.options.length === 0) out.push('options');
    else if (f.options.some((o) => Object.keys(o.label_i18n).length === 0)) out.push('option_label');
  }
  if (f.price < 0 || f.price > MAX_FIELD_PRICE) out.push('price');
  if (f.max_length < 1 || f.max_length > 1000) out.push('max_length');
  return out;
}
