// =====================================================================================
// Especificações e filtros (Admin > Especificações; tabelas da migration 20261006210000_product_specs.sql).
//   Textos      specText(nome_i18n, idioma): idioma pedido, senão pt-BR, senão o primeiro preenchido
//   URL         f_<característica>=<valor>,<valor>  (ex.: f_material=pla,petg); várias características = E, valores = OU
//   Listagem    specMatcher (produto passa nos filtros), specFacets (valores com contagem, sem contar o próprio filtro)
// Só funções puras, para o teste scripts/test-product-specs.mjs.
// =====================================================================================

export type SpecOption = {
  id: string;
  attribute_id: string;
  slug: string;
  label_i18n: Record<string, string>;
  color: string | null;
  sort_order: number;
};

export type SpecAttribute = {
  id: string;
  slug: string;
  name_i18n: Record<string, string>;
  unit: string | null;
  show_in_filters: boolean;
  show_on_product: boolean;
  sort_order: number;
  options: SpecOption[];
};

/** Características escolhidas na listagem: slug da característica -> slugs dos valores. */
export type SpecSelection = Record<string, string[]>;

/** Produto -> chaves "<característica>/<valor>" que ele tem. */
export type SpecIndex = Map<string, Set<string>>;

export const SPEC_PARAM = 'f_';
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,59}$/;

export function specText(map: Record<string, string> | null | undefined, locale: string, fallback = ''): string {
  const m = map ?? {};
  const pick = (k: string) => (typeof m[k] === 'string' && m[k].trim() ? m[k].trim() : '');
  return pick(locale) || pick('pt-BR') || Object.values(m).find((v) => typeof v === 'string' && v.trim())?.trim() || fallback;
}

/** "Tamanho da peça" -> "tamanho-da-peca" (para o endereço). */
export function specSlug(text: string, max = 40): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/g, '');
}

export const specKey = (attrSlug: string, optSlug: string) => `${attrSlug}/${optSlug}`;

export function parseSpecParams(sp: URLSearchParams): SpecSelection {
  const out: SpecSelection = {};
  sp.forEach((value, key) => {
    if (!key.startsWith(SPEC_PARAM)) return;
    const attr = key.slice(SPEC_PARAM.length);
    if (!SLUG_RE.test(attr)) return;
    const vals = [...new Set(value.split(',').map((s) => s.trim()).filter((s) => SLUG_RE.test(s)))];
    if (vals.length) out[attr] = vals;
  });
  return out;
}

export function writeSpecParams(next: URLSearchParams, sel: SpecSelection): URLSearchParams {
  [...next.keys()].filter((k) => k.startsWith(SPEC_PARAM)).forEach((k) => next.delete(k));
  Object.keys(sel).sort().forEach((attr) => { if (sel[attr]?.length) next.set(`${SPEC_PARAM}${attr}`, sel[attr].join(',')); });
  return next;
}

export const specCount = (sel: SpecSelection) => Object.values(sel).reduce((n, v) => n + v.length, 0);

/** Liga ou desliga um valor na seleção (devolve uma seleção nova). */
export function toggleSpec(sel: SpecSelection, attr: string, opt: string, on: boolean): SpecSelection {
  const cur = sel[attr] ?? [];
  const vals = on ? [...new Set([...cur, opt])] : cur.filter((v) => v !== opt);
  const next = { ...sel };
  if (vals.length) next[attr] = vals; else delete next[attr];
  return next;
}

/** O produto passa em todas as características escolhidas (ignorando `except`), tendo pelo menos um dos valores de cada. */
export function specMatcher(index: SpecIndex, sel: SpecSelection, except?: string) {
  const active = Object.entries(sel).filter(([attr, vals]) => attr !== except && vals.length);
  return (productId: string) => {
    if (!active.length) return true;
    const keys = index.get(productId);
    if (!keys) return false;
    return active.every(([attr, vals]) => vals.some((v) => keys.has(specKey(attr, v))));
  };
}

export type SpecFacet = {
  attribute: SpecAttribute;
  options: { option: SpecOption; count: number; checked: boolean }[];
};

/**
 * Filtros de característica para a listagem: só as marcadas "mostrar nos filtros" e só valores com produtos
 * (ou já escolhidos). A contagem de cada valor aplica os outros filtros de característica, não o próprio.
 */
export function specFacets(productIds: string[], index: SpecIndex, attributes: SpecAttribute[], sel: SpecSelection): SpecFacet[] {
  return attributes
    .filter((a) => a.show_in_filters)
    .map((attribute) => {
      const pass = specMatcher(index, sel, attribute.slug);
      const pool = productIds.filter(pass);
      const chosen = sel[attribute.slug] ?? [];
      const options = attribute.options
        .map((option) => {
          const key = specKey(attribute.slug, option.slug);
          return { option, count: pool.filter((id) => index.get(id)?.has(key)).length, checked: chosen.includes(option.slug) };
        })
        .filter((o) => o.count > 0 || o.checked);
      return { attribute, options };
    })
    .filter((f) => f.options.length > 0);
}

/** Índice produto -> chaves, a partir das linhas de product_spec_options e das características. */
export function buildSpecIndex(rows: { product_id: string; option_id: string }[], attributes: SpecAttribute[]): SpecIndex {
  const byOption = new Map<string, string>();
  for (const a of attributes) for (const o of a.options) byOption.set(o.id, specKey(a.slug, o.slug));
  const index: SpecIndex = new Map();
  for (const r of rows) {
    const key = byOption.get(r.option_id);
    if (!key) continue;
    let set = index.get(r.product_id);
    if (!set) { set = new Set(); index.set(r.product_id, set); }
    set.add(key);
  }
  return index;
}

/** Linhas da ficha do produto: característica e os valores do produto (só as marcadas "mostrar no produto"). */
export function productSpecRows(optionIds: string[], attributes: SpecAttribute[], locale: string): { label: string; value: string }[] {
  const ids = new Set(optionIds);
  return attributes
    .filter((a) => a.show_on_product)
    .map((a) => {
      const vals = a.options.filter((o) => ids.has(o.id)).map((o) => specText(o.label_i18n, locale, o.slug));
      const unit = a.unit?.trim() ? ` ${a.unit.trim()}` : '';
      return { label: specText(a.name_i18n, locale, a.slug), value: vals.length ? `${vals.join(', ')}${unit}` : '' };
    })
    .filter((r) => r.value);
}
